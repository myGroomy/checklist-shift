import { Hono } from "hono";
import { z } from "zod";
import { BRANCH_TEMPLATE_HEADERS, REGISTRY_HEADERS, toApiError } from "@checklist-shift/shared";
import { registryId } from "../lib/env.js";
import { env } from "../lib/env.js";
import { SheetRepo } from "../lib/repo.js";
import { ensureMonthlyTab } from "../lib/monthly.js";
import { auditAppend } from "../lib/audit.js";
import { getSetting } from "../lib/settings.js";
import { monthlyTabName } from "@checklist-shift/shared";
import {
  accessibleBranchIds,
  decodeSnapshot,
  entriesForShift,
  findShift,
  handoversForShift,
  incidentsForShift,
  isCloseError,
  participantsForShift,
  readTabObjects,
} from "../lib/close.js";
import { requireAuth, type AuthEnv } from "../lib/authz.js";
import {
  buatShareToken,
  cabutShareToken,
  pesanBagikan,
  verifikasiShareToken,
} from "../lib/share.js";

// Berbagi laporan Fase 6 (PRD RP-06, ADM-RP-03; skema §4.7).
// Mount di "/api": POST /laporan/:shiftId/bagikan,
// DELETE /laporan/token/:id (keduanya butuh login),
// plus publikApp GET /publik/r/:token (TANPA auth).
// PENTING (komposisi Hono): tiap routes/* memakai app.use(requireAuth) yang
// saat digabung via route("/api", ...) menjadi middleware ALL /api/* dan ikut
// menjerat rute publik. Karena itu rute publik hidup di app TERPISAH
// (publikApp) yang WAJIB di-mount SEBELUM app ber-auth agar handler-nya
// berjalan lebih dulu. Detail laporan dipakai-ulang polanya dari
// routes/close.ts (tidak diduplikat di sana); endpoint detail auth tetap
// milik close.ts.

const app = new Hono<AuthEnv>();
const publikApp = new Hono();

function err(c: { json: (b: unknown, s?: number) => Response }, e: unknown): Response {
  if (isCloseError(e)) {
    return c.json(toApiError(e.code, e.message), e.status as 400);
  }
  console.error("[bagikan]", (e as Error).message);
  return c.json(toApiError("gagal", "Terjadi galat. Coba lagi."), 500);
}

function usersRepo(): SheetRepo {
  return new SheetRepo(registryId() as string, "Users", REGISTRY_HEADERS["Users"]);
}

async function namaUser(userId: string): Promise<string> {
  if (!userId) return "";
  const u = await usersRepo().get(userId).catch(() => null);
  return u?.["name"] ?? "";
}

// POST /laporan/:shiftId/bagikan — auth cabang; butuh laporan (shift sudah
// ditutup). Secret token hanya terlihat di respons ini.
app.post("/laporan/:shiftId/bagikan", requireAuth, async (c) => {
  try {
    const p = c.get("principal");
    const shiftId = c.req.param("shiftId") ?? "";
    const found = await findShift(shiftId, await accessibleBranchIds(p.role, p.branches));
    if (!found) return c.json(toApiError("tidak_ada", "Shift tidak ditemukan."), 404);
    if (p.role !== "admin" && !p.branches.includes(found.branchId)) {
      return c.json(toApiError("di_luar_akses", "Di luar cabang aksesmu."), 403);
    }
    const { spreadsheetId, row } = found;
    if (row["status"] === "berjalan") {
      return c.json(toApiError("belum_ditutup", "Shift belum ditutup, belum ada laporan."), 409);
    }
    const reports = await readTabObjects(spreadsheetId, "Reports");
    const report = reports.find((r) => r["shift_instance_id"] === shiftId) ?? null;
    if (!report) return c.json(toApiError("tidak_ada", "Laporan shift ini tidak ditemukan."), 404);

    const buat = await buatShareToken(found.branchId, report["id"], shiftId, p.userId);
    const base = env("PUBLIC_BASE_URL") ?? "";
    const tautan = base ? `${base.replace(/\/$/, "")}/r/${buat.token}` : `/r/${buat.token}`;
    const entries = await entriesForShift(spreadsheetId, row["tab_month"], shiftId);
    const selesai = entries.filter((e) => e["state"] === "selesai").length;
    const skip = entries.filter((e) => e["state"] === "skip").length;
    const incidents = await incidentsForShift(spreadsheetId, shiftId);
    const defName = await namaDefinisi(spreadsheetId, row["shift_definition_id"]);
    const wa = await pesanBagikan({
      cabang: await namaCabang(found.branchId),
      tanggal: row["shift_date"],
      shift: defName,
      pj: await namaUser(row["pj_user_id"]),
      ringkasan: `${selesai} selesai, ${skip} skip, ${incidents.length} incident`,
      tautan,
    });

    await ensureMonthlyTab(spreadsheetId, "AuditLog", row["tab_month"]);
    await auditAppend(spreadsheetId, monthlyTabName("AuditLog", row["tab_month"]), new Date().toISOString(), {
      actor_id: p.userId,
      action: "laporan.bagikan",
      object_type: "share_token",
      object_id: buat.id,
      branch_id: found.branchId,
      shift_instance_id: shiftId,
      after: report["id"],
    });
    return c.json({
      ok: true,
      token: { id: buat.id, token: buat.token, expires_at: buat.expires_at },
      tautan,
      pesan: wa.pesan,
      tautan_wa: wa.tautanWa,
    }, 201);
  } catch (e) {
    return err(c, e);
  }
});

async function namaCabang(branchId: string): Promise<string> {
  const r = await new SheetRepo(
    registryId() as string, "Branches", REGISTRY_HEADERS["Branches"],
  ).get(branchId).catch(() => null);
  return r?.["name"] ?? "";
}

async function namaDefinisi(ss: string, defId: string): Promise<string> {
  const rows = await readTabObjects(ss, "ShiftDefinitions").catch(() => []);
  return rows.find((r) => r["id"] === defId)?.["name"] ?? "";
}

const CabutBody = z.object({ alasan: z.string().trim().max(5000).optional().default("") });

// DELETE /laporan/token/:id — admin (alasan wajib) atau pembuat token.
app.delete("/laporan/token/:id", requireAuth, async (c) => {
  try {
    const p = c.get("principal");
    const id = c.req.param("id") ?? "";
    const parsed = CabutBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json(toApiError("wajib_diisi", "Permintaan tidak valid."), 400);
    const repo = new SheetRepo(registryId() as string, "ShareTokens", REGISTRY_HEADERS["ShareTokens"]);
    const row = await repo.get(id).catch(() => null);
    if (!row) return c.json(toApiError("tidak_ada", "Tautan laporan tidak ditemukan."), 404);
    const milikSendiri = row["created_by"] === p.userId;
    if (p.role !== "admin" && !milikSendiri) {
      return c.json(toApiError("di_luar_akses", "Hanya admin atau pembuat tautan yang dapat mencabut."), 403);
    }
    if (p.role === "admin" && !parsed.data.alasan.trim()) {
      return c.json(toApiError("alasan_wajib", "Alasan pencabutan wajib diisi."), 400);
    }
    const hasil = await cabutShareToken(id, p.userId);
    // Audit ke cabang laporan (bukan global) agar sejalan audit cabang lain.
    try {
      const branch = await new SheetRepo(
        registryId() as string, "Branches", REGISTRY_HEADERS["Branches"],
      ).get(row["branch_id"]).catch(() => null);
      const ss = branch?.["spreadsheet_id"] ?? "";
      if (ss) {
        const shift = await new SheetRepo(ss, "ShiftInstances", BRANCH_TEMPLATE_HEADERS["ShiftInstances"]).get(row["shift_instance_id"]).catch(() => null);
        const month = shift?.["tab_month"] ?? "";
        if (month) {
          await ensureMonthlyTab(ss, "AuditLog", month);
          await auditAppend(ss, monthlyTabName("AuditLog", month), new Date().toISOString(), {
            actor_id: p.userId,
            action: "laporan.cabut_token",
            object_type: "share_token",
            object_id: id,
            branch_id: row["branch_id"],
            shift_instance_id: row["shift_instance_id"],
            reason: parsed.data.alasan || undefined,
          });
        }
      }
    } catch {
      // Audit gagal tidak membatalkan pencabutan yang sudah tersimpan.
    }
    return c.json({ ok: true, revoked_at: hasil["revoked_at"] });
  } catch (e) {
    return err(c, e);
  }
});

// Bentuk payload publik identik dengan GET /laporan/:shiftId di close.ts,
// ditambah penyaringan foto sesuai setting public_show_photos.
async function bangunLaporanPublik(
  ss: string,
  branchId: string,
  shiftRow: Record<string, string>,
  showPhotos: boolean,
): Promise<Record<string, unknown>> {
  const shiftId = shiftRow["id"];
  const reports = await readTabObjects(ss, "Reports");
  const report = reports.find((r) => r["shift_instance_id"] === shiftId) ?? null;
  const snap = await decodeSnapshot(ss, shiftRow);
  const entries = await entriesForShift(ss, shiftRow["tab_month"], shiftId);
  const byPoint = new Map(entries.map((e) => [e["point_ref"], e]));
  const checklist = snap.categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    items: cat.points.map((pt) => {
      const e = byPoint.get(pt.point_ref);
      return {
        point_ref: pt.point_ref,
        title: pt.title,
        is_required: pt.is_required,
        state: e?.["state"] ?? "belum",
        value: e?.["value"] ?? "",
        completed_by: e?.["completed_by"] ?? "",
        completed_at: e?.["completed_at"] ?? "",
        timing_label: e?.["timing_label"] ?? "",
        skip_reason: e?.["skip_reason"] ?? "",
      };
    }),
  }));
  const hoRows = await handoversForShift(ss, shiftRow["tab_month"], shiftId);
  const handover = hoRows[0]
    ? {
      values: hoRows[0]["values"],
      free_text: hoRows[0]["free_text"],
      photo_ids: showPhotos ? hoRows[0]["photo_ids"] : "[]",
      submitted_by: hoRows[0]["submitted_by"],
      submitted_at: hoRows[0]["submitted_at"],
    }
    : null;
  const incidentsIdx = await incidentsForShift(ss, shiftId);
  const parts = await participantsForShift(ss, shiftId);
  const kontribusi: { user_id: string; name: string; first_action_at: string; item_dicatat: number }[] = [];
  for (const pt of parts) {
    const dicatat = entries.filter((e) => e["completed_by"] === pt["user_id"]).length;
    kontribusi.push({
      user_id: pt["user_id"],
      name: await namaUser(pt["user_id"]),
      first_action_at: pt["first_action_at"],
      item_dicatat: dicatat,
    });
  }
  let addendum: Record<string, string>[] = [];
  try {
    const all = await readTabObjects(ss, "Addenda");
    if (report) addendum = all.filter((a) => a["report_id"] === report["id"]);
  } catch {
    addendum = [];
  }
  return {
    shift: {
      id: shiftRow["id"],
      branch_id: branchId,
      shift_definition_id: shiftRow["shift_definition_id"],
      shift_date: shiftRow["shift_date"],
      status: shiftRow["status"],
      pj_user_id: shiftRow["pj_user_id"],
      opened_at: shiftRow["opened_at"],
      closed_at: shiftRow["closed_at"],
      close_type: shiftRow["close_type"],
      is_incomplete: shiftRow["is_incomplete"],
      no_incident_confirmed: shiftRow["no_incident_confirmed"],
    },
    laporan: report
      ? {
        id: report["id"],
        report_number: report["report_number"],
        generated_by: report["generated_by"],
        generated_at: report["generated_at"],
        is_locked: report["is_locked"],
        summary_stats: report["summary_stats"],
        content_hash: report["content_hash"],
        unlock_count: report["unlock_count"],
      }
      : null,
    checklist,
    handover,
    incident_ids: incidentsIdx.map((r) => r["incident_id"]),
    kontribusi,
    addendum,
  };
}

// GET /publik/r/:token — TANPA auth. 404 bila tak dikenal/salah (tanpa bocor),
// 410 + pesan informasi bila kedaluwarsa/dicabut.
publikApp.get("/publik/r/:token", async (c) => {
  try {
    const { row } = await verifikasiShareToken(c.req.param("token") ?? "");
    const branch = await new SheetRepo(
      registryId() as string, "Branches", REGISTRY_HEADERS["Branches"],
    ).get(row["branch_id"]).catch(() => null);
    const ss = branch?.["spreadsheet_id"] ?? "";
    if (!ss) return c.json(toApiError("tidak_ada", "Tautan laporan tidak ditemukan."), 404);
    const shift = await new SheetRepo(ss, "ShiftInstances", BRANCH_TEMPLATE_HEADERS["ShiftInstances"]).get(row["shift_instance_id"]).catch(() => null);
    if (!shift) return c.json(toApiError("tidak_ada", "Tautan laporan tidak ditemukan."), 404);
    const show = (await getSetting("public_show_photos", "TRUE")) === "TRUE";
    return c.json(await bangunLaporanPublik(ss, row["branch_id"], shift, show));
  } catch (e) {
    return err(c, e);
  }
});

export { publikApp };
export default app;
