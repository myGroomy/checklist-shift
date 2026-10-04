import { Hono } from "hono";
import { REGISTRY_HEADERS, UserCreate, UserPatch, UsernameOk, newId, toApiError } from "@checklist-shift/shared";
import { registryId } from "../lib/env.js";
import { SheetRepo } from "../lib/repo.js";
import { valuesGet } from "../lib/sheets.js";
import { auditAppend } from "../lib/audit.js";
import { hashPin, isWeakPin, pinFormatOk, verifyPin } from "../lib/pin.js";
import { getIntSetting } from "../lib/settings.js";
import { withLock } from "../lib/lock.js";
import { resetPinFail, revokeAllSessions } from "../lib/session.js";
import { adminOnly, requireAuth, type AuthContext, type AuthEnv, type Principal } from "../lib/authz.js"
import { nowIso } from "@checklist-shift/shared";

const adminUsers = new Hono<AuthEnv>();

function usersRepo(): SheetRepo {
  const id = registryId();
  if (!id) throw new Error("env registry belum lengkap");
  return new SheetRepo(id, "Users", REGISTRY_HEADERS["Users"]);
}

// Aksi sensitif (ADM-SEC-01): alasan wajib + konfirmasi PIN pemohon.
async function sensitiveGuard(c: AuthContext, p: Principal): Promise<{ alasan: string } | Response> {
  const body = (await c.req.json().catch(() => ({}))) as { alasan?: string; pin?: string };
  const alasan = String(body.alasan ?? "").trim();
  const pin = String(body.pin ?? "");
  if (!alasan) {
    return c.json(toApiError("alasan_wajib", "Tulis alasan tindakan ini."), 400);
  }
  const me = await usersRepo().get(p.userId);
  if (!me || !(await verifyPin(pin, me["pin_hash"]))) {
    return c.json(toApiError("pin_salah", "Konfirmasi PIN salah."), 401);
  }
  return { alasan };
}

async function audit(actor: string, action: string, objectId: string, reason: string): Promise<void> {
  const reg = registryId() as string;
  await auditAppend(reg, "AuditLog_Global", nowIso(), {
    actor_id: actor, action, object_type: "user", object_id: objectId, reason,
  });
}

adminUsers.use(requireAuth, adminOnly);

adminUsers.post("/:id/reset-pin", async (c) => {
  const p = c.get("principal");
  const g = await sensitiveGuard(c, p);
  if (g instanceof Response) return g;
  const body = (await c.req.json().catch(() => ({}))) as { pin_baru?: string };
  const baru = String(body.pin_baru ?? "");
  if (!pinFormatOk(baru)) return c.json(toApiError("pin_salah", "PIN harus 6 angka."), 400);
  const id = c.req.param("id");
  const target = await usersRepo().get(id);
  if (!target) return c.json(toApiError("tidak_ada", "Akun tidak ditemukan."), 404);
  await usersRepo().update(id, {
    pin_hash: await hashPin(baru), must_change_pin: "TRUE", updated_at: nowIso(),
  });
  await resetPinFail(id).catch(() => undefined);
  const days = await getIntSetting("session_days", 30);
  await revokeAllSessions(id, days).catch(() => undefined);
  await audit(p.userId, "akun.reset_pin", id, g.alasan);
  return c.json({ ok: true });
});

adminUsers.post("/:id/buka-kunci", async (c) => {
  const p = c.get("principal");
  const g = await sensitiveGuard(c, p);
  if (g instanceof Response) return g;
  const id = c.req.param("id");
  const target = await usersRepo().get(id);
  if (!target) return c.json(toApiError("tidak_ada", "Akun tidak ditemukan."), 404);
  await usersRepo().update(id, { locked_until: "", updated_at: nowIso() });
  await resetPinFail(id).catch(() => undefined);
  await audit(p.userId, "akun.buka_kunci", id, g.alasan);
  return c.json({ ok: true });
});

adminUsers.post("/:id/paksa-logout", async (c) => {
  const p = c.get("principal");
  const g = await sensitiveGuard(c, p);
  if (g instanceof Response) return g;
  const id = c.req.param("id");
  const days = await getIntSetting("session_days", 30);
  await revokeAllSessions(id, days);
  await audit(p.userId, "akun.paksa_logout", id, g.alasan);
  return c.json({ ok: true });
});

adminUsers.post("/:id/nonaktif", async (c) => {  const p = c.get("principal");
  const g = await sensitiveGuard(c, p);
  if (g instanceof Response) return g;
  const body = (await c.req.json().catch(() => ({}))) as { is_active?: boolean };
  const id = c.req.param("id");
  const target = await usersRepo().get(id);
  if (!target) return c.json(toApiError("tidak_ada", "Akun tidak ditemukan."), 404);
  const aktif = body.is_active !== false;
  if (!aktif && target["role"] === "admin") {
    // Admin terakhir dilindungi (ADM-AC-06).
    const all = await valuesGet(registryId() as string, "Users!A2:F10000");
    const adminAktif = all.filter((r) => r[4] === "admin" && r[5] === "TRUE").length;
    if (adminAktif <= 1) {
      return c.json(toApiError("admin_terakhir", "Admin aktif terakhir tidak boleh dinonaktifkan."), 400);
    }
  }
  await usersRepo().update(id, {
    is_active: aktif ? "TRUE" : "FALSE", updated_at: nowIso(),
  });
  if (!aktif) {
    const days = await getIntSetting("session_days", 30);
    await revokeAllSessions(id, days).catch(() => undefined);
  }
  await audit(p.userId, aktif ? "akun.aktifkan" : "akun.nonaktifkan", id, g.alasan);
  return c.json({ ok: true });
});

// Tanpa pin_hash: kolom paling sensitif, tidak pernah ke klien (§4.3).
function aman(r: Record<string, string>): Record<string, string> {
  const { pin_hash: _buang, ...rest } = r;
  void _buang;
  return rest;
}

async function cabangAktif(userId: string): Promise<string[]> {
  const reg = registryId() as string;
  const rows = await valuesGet(reg, "UserBranchAccess!A2:E10000");
  return rows.filter((r) => r[1] === userId && r[4] === "TRUE").map((r) => r[2]);
}

async function cabangAda(ids: string[]): Promise<boolean> {
  const reg = registryId() as string;
  const rows = await valuesGet(reg, "Branches!A2:A10000");
  const have = new Set(rows.map((r) => r[0]));
  return ids.every((id) => have.has(id));
}

// Buat akun (ADM-AC-01). Username unik di bawah lock (§7).
adminUsers.post("/", async (c) => {
  const p = c.get("principal");
  const parsed = UserCreate.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(toApiError("input_salah", "Data akun tidak valid."), 400);
  const b = parsed.data;
  const username = b.username.trim().toLowerCase();
  if (!UsernameOk(username)) {
    return c.json(toApiError("input_salah", "Username: huruf kecil/angka, tanpa spasi."), 400);
  }
  if (!pinFormatOk(b.pin)) return c.json(toApiError("pin_salah", "PIN harus 6 angka."), 400);
  if ((await getIntSetting("pin_block_weak", 1)) === 1 && isWeakPin(b.pin)) {
    return c.json(toApiError("pin_lemah", "PIN terlalu mudah ditebak. Pilih yang lain."), 400);
  }
  if (!(await cabangAda(b.cabang))) {
    return c.json(toApiError("input_salah", "Ada cabang yang tidak dikenal."), 400);
  }
  const id = newId();
  const now = nowIso();
  try {
    await withLock(`lock:user:${username}`, async () => {
      const reg = registryId() as string;
      const col = await valuesGet(reg, "Users!C2:C10000");
      if (col.some((r) => (r[0] ?? "").toLowerCase() === username)) {
        throw new Error("username sudah dipakai");
      }
      await usersRepo().append({
        id, name: b.name.trim(), username, pin_hash: await hashPin(b.pin),
        role: b.role, is_active: "TRUE", must_change_pin: "TRUE",
        locked_until: "", last_login_at: "", pin_changed_at: "",
        created_at: now, updated_at: now, version: "1",
      });
      const access = new SheetRepo(reg, "UserBranchAccess", REGISTRY_HEADERS["UserBranchAccess"]);
      for (const branchId of b.cabang) {
        await access.append({
          id: newId(), user_id: id, branch_id: branchId,
          granted_by: p.userId, is_active: "TRUE", created_at: now, updated_at: now,
        });
      }
    });
  } catch (e) {
    if ((e as Error).message.includes("sudah dipakai")) {
      return c.json(toApiError("username_dobel", "Username sudah dipakai."), 409);
    }
    if ((e as Error).message.includes("lock sibuk")) {
      return c.json(toApiError("sibuk", "Coba lagi sebentar."), 409);
    }
    return c.json(toApiError("gagal", "Pembuatan akun gagal."), 500);
  }
  await audit(p.userId, "akun.buat", id, `buat ${username} (${b.role})`);
  return c.json({ ok: true, id }, 201);
});

// Daftar akun + akses cabang (ADM-AC-05 ringkas).
adminUsers.get("/", async (c) => {
  const reg = registryId() as string;
  const H = REGISTRY_HEADERS["Users"];
  const rows = await valuesGet(reg, "Users!A2:M10000");
  const access = await valuesGet(reg, "UserBranchAccess!A2:E10000");
  const byUser = new Map<string, string[]>();
  for (const r of access) {
    if (r[4] !== "TRUE") continue;
    const list = byUser.get(r[1]) ?? [];
    list.push(r[2]);
    byUser.set(r[1], list);
  }
  return c.json({
    akun: rows.filter((r) => r[0]).map((r) => {
      const obj = Object.fromEntries(H.map((h, i) => [h, r[i] ?? ""]));
      return { ...aman(obj), cabang: byUser.get(r[0]) ?? [] };
    }),
  });
});

// Detail akun + login terakhir (ADM-AC-05).
adminUsers.get("/:id", async (c) => {
  const id = c.req.param("id");
  const target = await usersRepo().get(id);
  if (!target || !target["id"]) return c.json(toApiError("tidak_ada", "Akun tidak ditemukan."), 404);
  return c.json({ akun: { ...aman(target), cabang: await cabangAktif(id) } });
});

// Ubah nama/peran/akses (ADM-AC-02, ADM-SEC-01). Peran/akses = sensitif.
adminUsers.patch("/:id", async (c) => {
  const p = c.get("principal");
  const parsed = UserPatch.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(toApiError("input_salah", "Data akun tidak valid."), 400);
  const b = parsed.data;
  const id = c.req.param("id");
  const target = await usersRepo().get(id);
  if (!target || !target["id"]) return c.json(toApiError("tidak_ada", "Akun tidak ditemukan."), 404);

  const sensitif = b.role !== undefined || b.cabang !== undefined;
  let alasan = "";
  if (sensitif) {
    const g = await sensitiveGuard(c, p);
    if (g instanceof Response) return g;
    alasan = g.alasan;
  }
  if (b.cabang && !(await cabangAda(b.cabang))) {
    return c.json(toApiError("input_salah", "Ada cabang yang tidak dikenal."), 400);
  }
  if (b.role === "petugas" && target["role"] === "admin") {
    // Admin terakhir tidak boleh diturunkan (ADM-AC-06).
    const all = await valuesGet(registryId() as string, "Users!A2:F10000");
    const adminAktif = all.filter((r) => r[4] === "admin" && r[5] === "TRUE").length;
    if (adminAktif <= 1) {
      return c.json(toApiError("admin_terakhir", "Admin aktif terakhir tidak boleh diturunkan perannya."), 400);
    }
  }
  const patch: Record<string, string> = { updated_at: nowIso() };
  if (b.name !== undefined) patch["name"] = b.name.trim();
  if (b.role !== undefined) patch["role"] = b.role;
  const before: Record<string, string> = Object.fromEntries(
    Object.keys(patch).map((k) => [k, target[k] ?? ""]),
  );
  await usersRepo().update(id, patch);

  let aksesSesudah: string[] | undefined;
  if (b.cabang) {
    const reg = registryId() as string;
    const access = new SheetRepo(reg, "UserBranchAccess", REGISTRY_HEADERS["UserBranchAccess"]);
    const rows = await valuesGet(reg, "UserBranchAccess!A2:E10000");
    const mine = rows.filter((r) => r[1] === id);
    const now = nowIso();
    for (const r of mine) {
      const harusAktif = b.cabang.includes(r[2]);
      const kiniAktif = r[4] === "TRUE";
      if (harusAktif === kiniAktif) continue;
      if (r[0]) await access.update(r[0], { is_active: harusAktif ? "TRUE" : "FALSE", updated_at: now });
    }
    const dikenal = new Set(mine.map((r) => r[2]));
    for (const branchId of b.cabang) {
      if (dikenal.has(branchId)) {
        const row = mine.find((r) => r[2] === branchId);
        if (row && row[4] !== "TRUE" && row[0]) continue; // sudah diaktifkan di atas
        if (row && row[4] === "TRUE") continue;
      }
      if (!dikenal.has(branchId)) {
        await access.append({
          id: newId(), user_id: id, branch_id: branchId,
          granted_by: p.userId, is_active: "TRUE", created_at: now, updated_at: now,
        });
      }
    }
    aksesSesudah = b.cabang;
  }
  const reg = registryId() as string;
  await auditAppend(reg, "AuditLog_Global", nowIso(), {
    actor_id: p.userId, action: "akun.ubah", object_type: "user", object_id: id,
    before: JSON.stringify(before),
    after: JSON.stringify({ ...patch, ...(aksesSesudah ? { cabang: aksesSesudah } : {}) }),
    reason: alasan || undefined,
  });
  return c.json({ ok: true });
});

export default adminUsers;
