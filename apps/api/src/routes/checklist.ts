import { Hono } from "hono";
import { z } from "zod";
import {
  MONTHLY_HEADERS,
  monthlyTabName,
  newId,
  nowIso,
  toApiError,
  wallTimeIn,
} from "@checklist-shift/shared";
import { requireAuth, type AuthEnv } from "../lib/authz.js";
import { valuesGet } from "../lib/sheets.js";
import { ensureMonthlyTab } from "../lib/monthly.js";
import { cacheGet, cacheSet } from "../lib/redis.js";
import { getIntSetting } from "../lib/settings.js";
import { withLock } from "../lib/lock.js";
import {
  bacaShiftRow,
  branchTimezone,
  hitungTiming,
  monthlyRepo,
  namaPengguna,
  pastikanPesertaAksi,
  readSnapshot,
  type SnapshotPoint,
} from "../lib/shift.js";

// Checklist bersama (Fase 4). Tidak di-mount ke index.ts (milik agen lain).
// Aturan tulis: hanya saat shift "berjalan". Baca boleh untuk status apa pun.
const checklist = new Hono<AuthEnv>();

const AksiBody = z.object({
  point_ref: z.string().min(1),
  action: z.enum(["selesai", "batal", "skip", "ubah_nilai"]),
  value: z.string().optional(),
  skip_reason: z.string().optional(),
  client_action_id: z.string().min(1),
  client_at: z.string().optional(),
});

function aksesDitolak(role: string, cabang: string[], branchId: string): boolean {
  return role !== "admin" && !cabang.includes(branchId);
}

// Normalisasi nilai per tipe input. Foto: nilai menyusul (fase foto belum ada).
function normalisasi(
  point: SnapshotPoint,
  value: string | undefined,
): { value: string; outOfRange: boolean } {
  switch (point.input_type) {
    case "centang":
      return { value: "TRUE", outOfRange: false };
    case "foto":
      return { value: "", outOfRange: false };
    case "teks": {
      const v = (value ?? "").trim();
      if (!v) throw new Error("Isi teks dulu.");
      return { value: v, outOfRange: false };
    }
    case "angka": {
      const v = (value ?? "").trim();
      const n = Number(v);
      if (!v || !Number.isFinite(n)) throw new Error("Isi angka yang benar.");
      const oor =
        (point.number_min !== null && n < point.number_min) ||
        (point.number_max !== null && n > point.number_max);
      return { value: v, outOfRange: oor };
    }
    case "ok_tidak_ok": {
      const v = (value ?? "").trim();
      if (v !== "OK" && v !== "TIDAK_OK") throw new Error("Pilih OK atau Tidak OK.");
      return { value: v, outOfRange: false };
    }
    default:
      throw new Error("Tipe butir tidak dikenal.");
  }
}

checklist.get("/:shiftId", requireAuth, async (c) => {
  const p = c.get("principal");
  const branchId = c.req.query("branch_id") ?? "";
  if (!branchId) return c.json(toApiError("masukan_salah", "Cabang wajib dipilih."), 400);
  if (aksesDitolak(p.role, p.branches, branchId)) {
    return c.json(toApiError("di_luar_akses", "Di luar cabang aksesmu."), 403);
  }
  try {
    const sid = c.req.param("shiftId") ?? "";
    if (!sid) return c.json(toApiError("masukan_salah", "Shift wajib dipilih."), 400);
    const { ss, row } = await bacaShiftRow(branchId, sid);
    const snapshot = await readSnapshot(ss, row);
    await ensureMonthlyTab(ss, "Entries", row["tab_month"]).catch(() => undefined);
    const tab = monthlyTabName("Entries", row["tab_month"]);
    const header = MONTHLY_HEADERS["Entries"];
    const rows = await valuesGet(ss, `${tab}!A2:O100000`).catch(() => [] as string[][]);
    const byPoint = new Map<string, Record<string, string>>();
    for (const r of rows) {
      if (r[1] !== row["id"]) continue;
      byPoint.set(r[2] ?? "", Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
    }
    const pengisiIds = new Set<string>();
    for (const e of byPoint.values()) {
      if (e["completed_by"]) pengisiIds.add(e["completed_by"]);
    }
    const nama = new Map<string, string>();
    for (const uid of pengisiIds) nama.set(uid, await namaPengguna(uid));

    let wajibTotal = 0;
    let wajibSelesai = 0;
    const kategori = snapshot.categories.map((kat) => ({
      id: kat.id,
      nama: kat.name,
      butir: kat.points.map((pt) => {
        const e = byPoint.get(pt.point_ref);
        const state = e?.["state"] ?? "belum";
        if (pt.is_required) {
          wajibTotal++;
          if (state === "selesai" || state === "skip") wajibSelesai++;
        }
        return {
          point_ref: pt.point_ref,
          judul: pt.title,
          instruksi: pt.instruction,
          tipe: pt.input_type,
          wajib: pt.is_required,
          target_time: pt.target_time || null,
          toleransi_menit: pt.tolerance_minutes,
          rentang: pt.number_min !== null || pt.number_max !== null
            ? { min: pt.number_min, max: pt.number_max }
            : null,
          state,
          nilai: e?.["value"] || null,
          di_luar_rentang: (e?.["out_of_range"] ?? "FALSE") === "TRUE",
          pengisi: e?.["completed_by"] ? (nama.get(e["completed_by"]) ?? "") : null,
          diisi_pada: e?.["completed_at"] || null,
          label_waktu: e?.["timing_label"] || null,
          alasan_skip: e?.["skip_reason"] || null,
        };
      }),
    }));
    return c.json({
      ok: true,
      shift_id: row["id"],
      status: row["status"],
      kategori,
      progress: { wajib_total: wajibTotal, wajib_selesai: wajibSelesai },
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m.includes("tidak ditemukan")) return c.json(toApiError("tidak_ada", "Shift tidak ditemukan."), 404);
    return c.json(toApiError("gagal", "Gagal memuat checklist. Coba lagi sebentar."), 400);
  }
});

checklist.post("/:shiftId/aksi", requireAuth, async (c) => {
  const p = c.get("principal");
  const branchId = c.req.query("branch_id") ?? "";
  if (!branchId) return c.json(toApiError("masukan_salah", "Cabang wajib dipilih."), 400);
  if (aksesDitolak(p.role, p.branches, branchId)) {
    return c.json(toApiError("di_luar_akses", "Di luar cabang aksesmu."), 403);
  }
  const parsed = AksiBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(toApiError("masukan_salah", "Aksi tidak lengkap. Coba lagi."), 400);
  }
  const body = parsed.data;
  const shiftId = c.req.param("shiftId") ?? "";
  if (!shiftId) return c.json(toApiError("masukan_salah", "Shift wajib dipilih."), 400);

  // Idempotensi cepat: hasil retry dikembalikan tanpa proses ulang.
  const idemKey = `idem:${body.client_action_id}`;
  const idemHit = await cacheGet(idemKey);
  if (idemHit) {
    try {
      const saved = JSON.parse(idemHit) as { status: number; body: unknown };
      return c.json(saved.body, saved.status as 200);
    } catch {
      // Lanjut proses normal bila cache rusak.
    }
  }

  let ss: string;
  let row: Record<string, string>;
  try {
    const r = await bacaShiftRow(branchId, shiftId);
    ss = r.ss;
    row = r.row;
  } catch {
    return c.json(toApiError("tidak_ada", "Shift tidak ditemukan."), 404);
  }
  if (row["status"] !== "berjalan") {
    return c.json(toApiError("shift_terkunci", "Shift sudah ditutup. Tidak bisa diubah."), 409);
  }
  const month = row["tab_month"];
  const entriesTab = monthlyTabName("Entries", month);
  const logsTab = monthlyTabName("EntryLogs", month);

  const simpanIdem = async (status: number, payload: unknown): Promise<void> => {
    await cacheSet(idemKey, JSON.stringify({ status, body: payload }), 7 * 86400);
  };

  try {
    const hasil = await withLock(`lock:entry:${shiftId}:${body.point_ref}`, async () => {
      await ensureMonthlyTab(ss, "Entries", month);
      await ensureMonthlyTab(ss, "EntryLogs", month);
      const erepo = monthlyRepo(ss, "Entries", month);
      const lrepo = monthlyRepo(ss, "EntryLogs", month);

      // Idempotensi lambat (Redis kosong): cek kolom client_action_id di EntryLogs.
      const cidCol = await valuesGet(ss, `${logsTab}!M2:M100000`).catch(() => [] as string[][]);
      const idx = cidCol.findIndex((r) => r[0] === body.client_action_id);
      if (idx >= 0) {
        const prow = await valuesGet(ss, `${logsTab}!A${idx + 2}:P${idx + 2}`);
        const outcome = prow[0]?.[5] ?? "";
        const winner = prow[0]?.[7] ?? "";
        if (outcome === "ditolak_kalah") {
          const payload = toApiError("sudah_diselesaikan", `Sudah diselesaikan oleh ${await namaPengguna(winner)}.`);
          await simpanIdem(409, payload);
          return { status: 409 as const, payload };
        }
        const payload = { ok: true, diulang: true };
        await simpanIdem(200, payload);
        return { status: 200 as const, payload };
      }

      const snapshot = await readSnapshot(ss, row);
      let point: SnapshotPoint | null = null;
      for (const kat of snapshot.categories) {
        const hit = kat.points.find((q) => q.point_ref === body.point_ref);
        if (hit) {
          point = hit;
          break;
        }
      }
      if (!point) throw new Error("Butir tidak ada di shift ini.");
      const pt = point;

      const eheader = MONTHLY_HEADERS["Entries"];
      const erows = await valuesGet(ss, `${entriesTab}!A2:O100000`);
      const erow = erows.find((r) => r[1] === shiftId && r[2] === body.point_ref);
      const entry = erow
        ? Object.fromEntries(eheader.map((h, i) => [h, erow[i] ?? ""]))
        : null;
      const prevState = entry?.["state"] ?? "";
      const milikOrang = entry !== null && (prevState === "selesai" || prevState === "skip")
        && (entry["completed_by"] ?? "") !== p.userId;

      const tulisLog = async (o: {
        entryId: string; action: string; outcome: string; winner: string;
        prev: string; next: string; value: string; note: string; at: string;
      }): Promise<void> => {
        await lrepo.append({
          id: newId(),
          shift_instance_id: shiftId,
          entry_id: o.entryId,
          point_ref: body.point_ref,
          action: o.action,
          outcome: o.outcome,
          user_id: p.userId,
          winner_user_id: o.winner,
          prev_state: o.prev,
          new_state: o.next,
          value: o.value,
          note: o.note,
          client_action_id: body.client_action_id,
          client_at: body.client_at ?? "",
          at: o.at,
          created_at: o.at,
        });
      };

      const now = nowIso();
      const tz = await branchTimezone(branchId);
      const tolDefault = await getIntSetting("tolerance_default_minutes", 15);

      // BR-12: aksi pertama diterima; yang kalah mendapat "sudah diselesaikan oleh X".
      const kalah = async (winnerId: string, entryId: string): Promise<{ status: 409; payload: unknown }> => {
        await tulisLog({
          entryId, action: body.action, outcome: "ditolak_kalah", winner: winnerId,
          prev: prevState, next: prevState, value: "", note: "", at: now,
        });
        const payload = toApiError(
          "sudah_diselesaikan",
          `Sudah diselesaikan oleh ${await namaPengguna(winnerId)}.`,
        );
        await simpanIdem(409, payload);
        return { status: 409 as const, payload };
      };

      if (body.action === "batal") {
        if (!entry || prevState === "belum" || !prevState) throw new Error("Item belum diisi.");
        await erepo.update(entry["id"], {
          state: "belum",
          value: "",
          out_of_range: "FALSE",
          photo_ids: "",
          completed_by: "",
          completed_at: "",
          timing_label: "",
          timing_delta_minutes: "",
          skip_reason: "",
          updated_at: now,
          version: String(Number(entry["version"] ?? "1") + 1),
        });
        await tulisLog({
          entryId: entry["id"], action: "batal", outcome: "diterima", winner: "",
          prev: prevState, next: "belum", value: entry["value"] ?? "", note: "", at: now,
        });
        const payload = { ok: true, state: "belum" };
        await simpanIdem(200, payload);
        return { status: 200 as const, payload };
      }

      if (body.action === "skip") {
        const alasan = (body.skip_reason ?? "").trim();
        if (!alasan) throw new Error("Alasan skip wajib diisi.");
        if (milikOrang) return kalah(entry?.["completed_by"] ?? "", entry?.["id"] ?? "");
        const timing = pt.target_time
          ? hitungTiming(pt.target_time, pt.tolerance_minutes, tolDefault, wallTimeIn(tz))
          : null;
        if (entry) {
          await erepo.update(entry["id"], {
            state: "skip",
            value: "",
            out_of_range: "FALSE",
            completed_by: p.userId,
            completed_at: now,
            timing_label: timing?.label ?? "",
            timing_delta_minutes: timing ? String(timing.delta) : "",
            skip_reason: alasan,
            updated_at: now,
            version: String(Number(entry["version"] ?? "1") + 1),
          });
          await tulisLog({
            entryId: entry["id"], action: "skip", outcome: "diterima", winner: "",
            prev: prevState, next: "skip", value: "", note: alasan, at: now,
          });
          await pastikanPesertaAksi(ss, shiftId, p.userId, "skip");
          const payload = {
            ok: true, state: "skip",
            timing_label: timing?.label ?? null,
          };
          await simpanIdem(200, payload);
          return { status: 200 as const, payload };
        }
        const entryId = newId();
        await erepo.append({
          id: entryId,
          shift_instance_id: shiftId,
          point_ref: body.point_ref,
          state: "skip",
          value: "",
          out_of_range: "FALSE",
          photo_ids: "",
          completed_by: p.userId,
          completed_at: now,
          timing_label: timing?.label ?? "",
          timing_delta_minutes: timing ? String(timing.delta) : "",
          skip_reason: alasan,
          created_at: now,
          updated_at: now,
          version: "1",
        });
        await tulisLog({
          entryId, action: "skip", outcome: "diterima", winner: "",
          prev: "", next: "skip", value: "", note: alasan, at: now,
        });
        await pastikanPesertaAksi(ss, shiftId, p.userId, "skip");
        const payload = { ok: true, state: "skip", timing_label: timing?.label ?? null };
        await simpanIdem(200, payload);
        return { status: 200 as const, payload };
      }

      // selesai / ubah_nilai
      if (milikOrang) return kalah(entry?.["completed_by"] ?? "", entry?.["id"] ?? "");
      if (body.action === "ubah_nilai") {
        if (!entry || prevState !== "selesai") {
          throw new Error("Hanya nilai yang sudah selesai bisa diubah.");
        }
        if (pt.input_type === "centang" || pt.input_type === "foto") {
          throw new Error("Tidak ada nilai yang bisa diubah.");
        }
      }
      const norm = normalisasi(pt, body.value);
      const timing = pt.target_time
        ? hitungTiming(pt.target_time, pt.tolerance_minutes, tolDefault, wallTimeIn(tz))
        : null;
      const aksiLog = body.action === "ubah_nilai" || (entry && prevState === "selesai") ? "ubah_nilai" : "selesai";
      const tipePeserta = pt.input_type === "teks" || pt.input_type === "angka" ? "isi" : "centang";
      if (entry) {
        await erepo.update(entry["id"], {
          state: "selesai",
          value: norm.value,
          out_of_range: norm.outOfRange ? "TRUE" : "FALSE",
          completed_by: p.userId,
          completed_at: now,
          timing_label: timing?.label ?? "",
          timing_delta_minutes: timing ? String(timing.delta) : "",
          skip_reason: "",
          updated_at: now,
          version: String(Number(entry["version"] ?? "1") + 1),
        });
        await tulisLog({
          entryId: entry["id"], action: aksiLog, outcome: "diterima", winner: "",
          prev: prevState, next: "selesai", value: norm.value, note: "", at: now,
        });
        await pastikanPesertaAksi(ss, shiftId, p.userId, tipePeserta as "centang" | "isi");
        const payload = {
          ok: true, state: "selesai",
          timing_label: timing?.label ?? null,
          timing_delta_minutes: timing?.delta ?? null,
          di_luar_rentang: norm.outOfRange,
        };
        await simpanIdem(200, payload);
        return { status: 200 as const, payload };
      }
      const entryId = newId();
      await erepo.append({
        id: entryId,
        shift_instance_id: shiftId,
        point_ref: body.point_ref,
        state: "selesai",
        value: norm.value,
        out_of_range: norm.outOfRange ? "TRUE" : "FALSE",
        photo_ids: "",
        completed_by: p.userId,
        completed_at: now,
        timing_label: timing?.label ?? "",
        timing_delta_minutes: timing ? String(timing.delta) : "",
        skip_reason: "",
        created_at: now,
        updated_at: now,
        version: "1",
      });
      await tulisLog({
        entryId, action: aksiLog, outcome: "diterima", winner: "",
        prev: "", next: "selesai", value: norm.value, note: "", at: now,
      });
      await pastikanPesertaAksi(ss, shiftId, p.userId, tipePeserta as "centang" | "isi");
      const payload = {
        ok: true, state: "selesai",
        timing_label: timing?.label ?? null,
        timing_delta_minutes: timing?.delta ?? null,
        di_luar_rentang: norm.outOfRange,
      };
      await simpanIdem(200, payload);
      return { status: 200 as const, payload };
    });

    return c.json(hasil.payload, hasil.status as 200);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (m.startsWith("lock sibuk")) {
      return c.json(toApiError("sibuk", "Item sedang diproses. Coba lagi sebentar."), 409);
    }
    const umum = [
      "Butir tidak ada", "Item belum diisi", "Alasan skip wajib",
      "Isi teks dulu", "Isi angka yang benar", "Pilih OK atau Tidak OK",
      "Hanya nilai yang sudah selesai", "Tidak ada nilai yang bisa diubah",
      "Tipe butir tidak dikenal",
    ];
    if (umum.some((u) => m.includes(u))) return c.json(toApiError("aksi_ditolak", m), 400);
    if (m.includes("fail closed") || m.includes("redis")) {
      return c.json(toApiError("layanan_belum_siap", "Layanan pengunci belum siap."), 503);
    }
    return c.json(toApiError("gagal", "Gagal menyimpan aksi. Coba lagi sebentar."), 400);
  }
});

export default checklist;
