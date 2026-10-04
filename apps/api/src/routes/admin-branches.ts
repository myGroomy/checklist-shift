import { Hono } from "hono";
import {
  BRANCH_TEMPLATE_HEADERS,
  BranchCreate,
  BranchPatch,
  CodeOk,
  REGISTRY_HEADERS,
  newId,
  nowIso,
  toApiError,
} from "@checklist-shift/shared";
import { registryId } from "../lib/env.js";
import { SheetRepo } from "../lib/repo.js";
import { sheetsClient, valuesAppend, valuesGet, valuesUpdate } from "../lib/sheets.js";
import { auditAppend } from "../lib/audit.js";
import { verifyPin } from "../lib/pin.js";
import { withLock } from "../lib/lock.js";
import { resolveBranch } from "../lib/branch.js";
import { copyBranchTemplate } from "../lib/copy.js";
import { auditCabang } from "./admin-config.js";
import { adminOnly, requireAuth, type AuthContext, type AuthEnv, type Principal } from "../lib/authz.js";

const adminBranches = new Hono<AuthEnv>();

function usersRepo(): SheetRepo {
  const id = registryId();
  if (!id) throw new Error("env registry belum lengkap");
  return new SheetRepo(id, "Users", REGISTRY_HEADERS["Users"]);
}

function branchesRepo(): SheetRepo {
  const id = registryId();
  if (!id) throw new Error("env registry belum lengkap");
  return new SheetRepo(id, "Branches", REGISTRY_HEADERS["Branches"]);
}

async function sensitiveGuard(c: AuthContext, p: Principal): Promise<{ alasan: string } | Response> {
  const body = (await c.req.json().catch(() => ({}))) as { alasan?: string; pin?: string };
  const alasan = String(body.alasan ?? "").trim();
  const pin = String(body.pin ?? "");
  if (!alasan) return c.json(toApiError("alasan_wajib", "Tulis alasan tindakan ini."), 400);
  const me = await usersRepo().get(p.userId);
  if (!me || !(await verifyPin(pin, me["pin_hash"]))) {
    return c.json(toApiError("pin_salah", "Konfirmasi PIN salah."), 401);
  }
  return { alasan };
}

async function auditGlobal(actor: string, action: string, objectId: string, before: string, after: string, reason?: string): Promise<void> {
  const reg = registryId() as string;
  await auditAppend(reg, "AuditLog_Global", nowIso(), {
    actor_id: actor, action, object_type: "cabang", object_id: objectId,
    before, after, reason,
  });
}

function tzOk(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("id-ID", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Lengkapi tab + header spreadsheet cabang seperti setup-cabang (aditif saja).
async function ensureBranchSpreadsheet(spreadsheetId: string): Promise<void> {
  const api = sheetsClient();
  const meta = await api.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  const have = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title));
  const all: Record<string, string[]> = { _meta: ["key", "value"], ...BRANCH_TEMPLATE_HEADERS };
  const missing = Object.entries(all).filter(([t]) => !have.has(t));
  if (missing.length > 0) {
    await api.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: missing.map(([title, header]) => ({
          addSheet: {
            properties: {
              title,
              gridProperties: { rowCount: 1000, columnCount: header.length, frozenRowCount: 1 },
            },
          },
        })),
      },
    });
  }
  for (const [title, header] of Object.entries(all)) {
    const rows = await valuesGet(spreadsheetId, `${title}!A1:Z1`);
    if ((rows[0] ?? []).length === 0) {
      await valuesUpdate(spreadsheetId, `${title}!A1`, [header]);
    }
  }
}

adminBranches.use(requireAuth, adminOnly);

// Daftar cabang (ADM-BR-01). Tanpa rahasia: Branches tidak menyimpan kredensial.
adminBranches.get("/", async (c) => {
  const rows = await valuesGet(registryId() as string, "Branches!A2:J10000");
  const H = REGISTRY_HEADERS["Branches"];
  return c.json({
    cabang: rows
      .filter((r) => r[0])
      .map((r) => Object.fromEntries(H.map((h, i) => [h, r[i] ?? ""]))),
  });
});

// Daftarkan cabang baru hanya dari spreadsheet ID (§13.2).
adminBranches.post("/", async (c) => {
  const p = c.get("principal");
  const parsed = BranchCreate.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(toApiError("input_salah", "Data cabang tidak valid."), 400);
  const body = parsed.data;
  let code = (body.code ?? "").trim().toUpperCase();
  const tz = (body.timezone ?? "Asia/Jakarta").trim();
  if (!tzOk(tz)) return c.json(toApiError("input_salah", "Zona waktu tidak dikenal."), 400);
  if (code && !CodeOk(code)) {
    return c.json(toApiError("input_salah", "Kode cabang: huruf besar/angka tanpa spasi."), 400);
  }

  // Verifikasi akses baca ke spreadsheet (gagal = 400 umum, tanpa detail Google).
  let metaRows: string[][];
  try {
    await ensureBranchSpreadsheet(body.spreadsheet_id);
    metaRows = await valuesGet(body.spreadsheet_id, "_meta!A2:B100");
  } catch {
    return c.json(toApiError("sheet_tak_terbaca", "Spreadsheet tidak dapat diakses. Periksa ID dan akses service account."), 400);
  }
  const meta = new Map(metaRows.map((r) => [r[0] ?? "", r[1] ?? ""]));
  // Sheet boleh dipakai bersama beberapa baris cabang untuk uji (mis. TESTF3/TESTF4
  // menunjuk sheet uji yang sama). Bila _meta.branch_id sudah milik cabang lain,
  // pendaftaran diizinkan TANPA menimpa _meta dan dicatat sebagai berbagi.
  const pemilikLama = meta.get("branch_id") || "";
  const berbagi = Boolean(pemilikLama);

  const id = newId();
  const now = nowIso();
  if (!code) code = `CB${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const name = body.name?.trim() || `Cabang ${code}`;

  try {
    await withLock(`lock:branch:${code}`, async () => {
      const reg = registryId() as string;
      const codes = await valuesGet(reg, "Branches!C2:C10000");
      if (codes.some((r) => (r[0] ?? "").toUpperCase() === code)) {
        throw new Error("kode cabang sudah dipakai");
      }
      await branchesRepo().append({
        id, name, code, address: body.address?.trim() ?? "", timezone: tz,
        spreadsheet_id: body.spreadsheet_id, schema_version: "1",
        is_active: "TRUE", created_at: now, updated_at: now,
      });
    });
  } catch (e) {
    if ((e as Error).message.includes("sudah dipakai")) {
      return c.json(toApiError("kode_dobel", "Kode cabang sudah dipakai."), 409);
    }
    if ((e as Error).message.includes("lock sibuk")) {
      return c.json(toApiError("sibuk", "Coba lagi sebentar."), 409);
    }
    return c.json(toApiError("gagal", "Pendaftaran cabang gagal."), 500);
  }

  // Tulis _meta hanya bila belum ada pemilik; bila berbagi, _meta milik pemilik lama
  // tidak disentuh agar asosiasi cabang lama tidak rusak.
  if (!berbagi) {
    try {
      await valuesAppend(body.spreadsheet_id, "_meta!A:B", [
        ["branch_id", id],
        ["schema_version", "1"],
        ["created_at", now],
        ["last_migrated_at", now],
      ]);
    } catch {
      return c.json(toApiError("gagal", "Cabang tercatat tetapi _meta gagal ditulis. Hubungi pengelola sistem."), 500);
    }
  }
  await auditGlobal(p.userId, "cabang.daftar", id, "",
    JSON.stringify({ name, code, spreadsheet_id: body.spreadsheet_id, berbagi, pemilik_lama: pemilikLama || undefined }));
  return c.json({ ok: true, id, code, berbagi }, 201);
});

// Ubah nama/kode/alamat/timezone (ADM-BR-01).
adminBranches.patch("/:id", async (c) => {
  const p = c.get("principal");
  const parsed = BranchPatch.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(toApiError("input_salah", "Data cabang tidak valid."), 400);
  const body = parsed.data;
  const id = c.req.param("id");
  const cur = await branchesRepo().get(id);
  if (!cur || !cur["id"]) return c.json(toApiError("tidak_ada", "Cabang tidak ditemukan."), 404);

  const patch: Record<string, string> = {};
  if (body.name !== undefined) patch["name"] = body.name.trim();
  if (body.address !== undefined) patch["address"] = body.address.trim();
  if (body.timezone !== undefined) {
    const tz = body.timezone.trim();
    if (!tzOk(tz)) return c.json(toApiError("input_salah", "Zona waktu tidak dikenal."), 400);
    patch["timezone"] = tz;
  }
  if (body.code !== undefined) {
    const code = body.code.trim().toUpperCase();
    if (!CodeOk(code)) return c.json(toApiError("input_salah", "Kode cabang: huruf besar/angka tanpa spasi."), 400);
    if (code !== cur["code"]) {
      try {
        await withLock(`lock:branch:${code}`, async () => {
          const reg = registryId() as string;
          const rows = await valuesGet(reg, "Branches!A2:C10000");
          if (rows.some((r) => r[0] !== id && (r[2] ?? "").toUpperCase() === code)) {
            throw new Error("kode cabang sudah dipakai");
          }
          await branchesRepo().update(id, { code, updated_at: nowIso() });
        });
      } catch (e) {
        if ((e as Error).message.includes("sudah dipakai")) {
          return c.json(toApiError("kode_dobel", "Kode cabang sudah dipakai."), 409);
        }
        return c.json(toApiError("gagal", "Perubahan cabang gagal."), 500);
      }
      delete patch["code"];
    }
  }
  patch["updated_at"] = nowIso();
  const before = JSON.stringify({ name: cur["name"], code: cur["code"], address: cur["address"], timezone: cur["timezone"] });
  await branchesRepo().update(id, patch);
  await auditGlobal(p.userId, "cabang.ubah", id, before, JSON.stringify(patch));
  return c.json({ ok: true });
});

// Nonaktifkan/aktifkan kembali (ADM-BR-03, ADM-SEC-01). BR-40: baris tetap ada.
adminBranches.post("/:id/nonaktif", async (c) => {
  const p = c.get("principal");
  const g = await sensitiveGuard(c, p);
  if (g instanceof Response) return g;
  const body = (await c.req.json().catch(() => ({}))) as { is_active?: boolean };
  const aktif = body.is_active === true;
  const id = c.req.param("id");
  const cur = await branchesRepo().get(id);
  if (!cur || !cur["id"]) return c.json(toApiError("tidak_ada", "Cabang tidak ditemukan."), 404);
  await branchesRepo().update(id, { is_active: aktif ? "TRUE" : "FALSE", updated_at: nowIso() });
  await auditGlobal(p.userId, aktif ? "cabang.aktifkan" : "cabang.nonaktifkan", id,
    JSON.stringify({ is_active: cur["is_active"] }), JSON.stringify({ is_active: aktif ? "TRUE" : "FALSE" }), g.alasan);
  return c.json({ ok: true });
});

// Salin template dari cabang lain sebagai salinan mandiri (ADM-BR-02, ADM-SEC-01).
adminBranches.post("/:id/salin-dari-cabang", async (c) => {
  const p = c.get("principal");
  const g = await sensitiveGuard(c, p);
  if (g instanceof Response) return g;
  const rest = (await c.req.json().catch(() => ({}))) as { sumber_branch_id?: string };
  if (typeof rest.sumber_branch_id !== "string" || rest.sumber_branch_id.length !== 26) {
    return c.json(toApiError("input_salah", "ID cabang sumber tidak valid."), 400);
  }
  const id = c.req.param("id");
  const target = await branchesRepo().get(id);
  if (!target || !target["id"]) return c.json(toApiError("tidak_ada", "Cabang tidak ditemukan."), 404);
  const sumber = await branchesRepo().get(rest.sumber_branch_id);
  if (!sumber || !sumber["id"]) return c.json(toApiError("tidak_ada", "Cabang sumber tidak ditemukan."), 404);
  if (rest.sumber_branch_id === id) {
    return c.json(toApiError("input_salah", "Cabang sumber dan tujuan sama."), 400);
  }
  let hasil: { shift: number; kategori: number; point: number; field: number };
  try {
    await resolveBranch(rest.sumber_branch_id);
    await resolveBranch(id);
    hasil = await copyBranchTemplate(rest.sumber_branch_id, id);
  } catch {
    return c.json(toApiError("gagal", "Penyalinan template gagal."), 500);
  }
  await auditGlobal(p.userId, "cabang.salin", id, JSON.stringify({ sumber_branch_id: rest.sumber_branch_id }), JSON.stringify(hasil), g.alasan);
  const ss = target["spreadsheet_id"];
  if (ss) {
    await auditCabang(ss, id, {
      actor_id: p.userId, action: "template.salin_dari_cabang", object_type: "cabang",
      object_id: id, before: JSON.stringify({ sumber_branch_id: rest.sumber_branch_id }),
      after: JSON.stringify(hasil), reason: g.alasan,
    }).catch(() => undefined);
  }
  return c.json({ ok: true, ...hasil });
});

export default adminBranches;
