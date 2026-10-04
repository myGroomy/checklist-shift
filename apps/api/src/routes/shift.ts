import { Hono } from "hono";
import { z } from "zod";
import { toApiError } from "@checklist-shift/shared";
import { requireAuth, type AuthEnv } from "../lib/authz.js";
import {
  ShiftSudahAda,
  bacaShift,
  bukaShift,
  daftarBerjalan,
  gabungShift,
  namaPengguna,
  sayaBertugas,
} from "../lib/shift.js";

// Siklus shift (Fase 4). Tidak di-mount ke index.ts (milik agen lain).
const shift = new Hono<AuthEnv>();

const BukaBody = z.object({
  branch_id: z.string().min(1),
  shift_definition_id: z.string().min(1),
  is_test: z.boolean().optional(),
});

const CabangBody = z.object({ branch_id: z.string().min(1) });

function diLuarAkses(role: string, cabang: string[], branchId: string): boolean {
  return role !== "admin" && !cabang.includes(branchId);
}

function pesanGalat(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (m.includes("tidak ditemukan") || m.includes("tidak aktif") || m.includes("tidak berjalan")) return m;
  if (m.includes("fail closed") || m.includes("redis")) return "Layanan pengunci belum siap. Coba lagi sebentar.";
  return "Gagal memproses. Coba lagi sebentar.";
}

shift.post("/buka", requireAuth, async (c) => {
  const p = c.get("principal");
  const parsed = BukaBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(toApiError("masukan_salah", "Cabang dan shift wajib dipilih."), 400);
  const { branch_id: branchId, shift_definition_id: defId } = parsed.data;
  const isTest = parsed.data.is_test === true;
  if (diLuarAkses(p.role, p.branches, branchId)) {
    return c.json(toApiError("di_luar_akses", "Di luar cabang aksesmu."), 403);
  }
  if (isTest && p.role !== "admin") {
    return c.json(toApiError("khusus_admin", "Mode uji coba khusus admin."), 403);
  }
  try {
    const r = await bukaShift({ branchId, shiftDefId: defId, userId: p.userId, isTest });
    return c.json({
      ok: true,
      bergabung: false,
      shift_id: r.shiftId,
      shift_date: r.shiftDate,
      di_luar_jam: r.openedOutsideHours,
      pesan: r.openedOutsideHours ? "Shift dibuka di luar jam shift." : "Shift dibuka.",
    });
  } catch (e) {
    if (e instanceof ShiftSudahAda) {
      // BR-01: yang kalah otomatis bergabung (PRD kasus tepi).
      const g = await gabungShift({ branchId, shiftId: e.shiftId, userId: p.userId }).catch(() => ({ sudah: true }));
      void g;
      return c.json({
        ok: true,
        bergabung: true,
        shift_id: e.shiftId,
        pesan: "Shift sudah dibuka. Kamu bergabung.",
      });
    }
    const m = e instanceof Error ? e.message : "";
    if (m.startsWith("lock sibuk")) {
      return c.json(toApiError("shift_sibuk", "Shift sedang dibuka. Coba lagi sebentar."), 409);
    }
    return c.json(toApiError("buka_gagal", pesanGalat(e)), 400);
  }
});

shift.post("/:id/gabung", requireAuth, async (c) => {
  const p = c.get("principal");
  const parsed = CabangBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(toApiError("masukan_salah", "Cabang wajib diisi."), 400);
  const branchId = parsed.data.branch_id;
  if (diLuarAkses(p.role, p.branches, branchId)) {
    return c.json(toApiError("di_luar_akses", "Di luar cabang aksesmu."), 403);
  }
  try {
    const sid = c.req.param("id") ?? "";
    if (!sid) return c.json(toApiError("masukan_salah", "Shift wajib dipilih."), 400);
    const r = await gabungShift({ branchId, shiftId: sid, userId: p.userId });
    return c.json({ ok: true, sudah: r.sudah });
  } catch (e) {
    return c.json(toApiError("gabung_gagal", pesanGalat(e)), 400);
  }
});

shift.post("/:id/saya-bertugas", requireAuth, async (c) => {
  const p = c.get("principal");
  const parsed = CabangBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(toApiError("masukan_salah", "Cabang wajib diisi."), 400);
  const branchId = parsed.data.branch_id;
  if (diLuarAkses(p.role, p.branches, branchId)) {
    return c.json(toApiError("di_luar_akses", "Di luar cabang aksesmu."), 403);
  }
  try {
    const sid = c.req.param("id") ?? "";
    if (!sid) return c.json(toApiError("masukan_salah", "Shift wajib dipilih."), 400);
    const r = await sayaBertugas({ branchId, shiftId: sid, userId: p.userId });
    return c.json({ ok: true, sudah: r.sudah });
  } catch (e) {
    return c.json(toApiError("gagal", pesanGalat(e)), 400);
  }
});

// Daftarkan sebelum /:id agar tidak tertelan param.
shift.get("/berjalan", requireAuth, async (c) => {
  const p = c.get("principal");
  const branchId = c.req.query("branch_id") ?? "";
  if (!branchId) return c.json(toApiError("masukan_salah", "Cabang wajib dipilih."), 400);
  if (diLuarAkses(p.role, p.branches, branchId)) {
    return c.json(toApiError("di_luar_akses", "Di luar cabang aksesmu."), 403);
  }
  try {
    const uji = c.req.query("uji") === "1" && p.role === "admin";
    const list = await daftarBerjalan(branchId, uji);
    const out = [];
    for (const s of list) {
      const ring = await bacaShift(branchId, s.id).catch(() => null);
      out.push({
        ...s,
        pj_nama: await namaPengguna(s.pj_user_id),
        progress: ring?.progress ?? null,
      });
    }
    return c.json({ ok: true, shift: out });
  } catch (e) {
    return c.json(toApiError("gagal", pesanGalat(e)), 400);
  }
});

shift.get("/:id", requireAuth, async (c) => {
  const p = c.get("principal");
  const branchId = c.req.query("branch_id") ?? "";
  if (!branchId) return c.json(toApiError("masukan_salah", "Cabang wajib dipilih."), 400);
  if (diLuarAkses(p.role, p.branches, branchId)) {
    return c.json(toApiError("di_luar_akses", "Di luar cabang aksesmu."), 403);
  }
  try {
    const sid = c.req.param("id") ?? "";
    if (!sid) return c.json(toApiError("masukan_salah", "Shift wajib dipilih."), 400);
    const ring = await bacaShift(branchId, sid);
    return c.json({
      ok: true,
      shift: {
        id: ring.row["id"],
        shift_definition_id: ring.row["shift_definition_id"],
        shift_date: ring.row["shift_date"],
        status: ring.row["status"],
        pj_user_id: ring.row["pj_user_id"],
        pj_nama: await namaPengguna(ring.row["pj_user_id"]),
        opened_at: ring.row["opened_at"],
        opened_outside_hours: ring.row["opened_outside_hours"] === "TRUE",
        is_test: ring.row["is_test"] === "TRUE",
      },
      progress: ring.progress,
      peserta: ring.peserta,
    });
  } catch (e) {
    return c.json(toApiError("gagal", pesanGalat(e)), 400);
  }
});

export default shift;
