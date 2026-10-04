import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { Hono } from "hono";
import { z } from "zod";
import {
  BRANCH_TEMPLATE_HEADERS,
  REGISTRY_HEADERS,
  monthlyTabName,
  newId,
  nowIso,
  toApiError,
} from "@checklist-shift/shared";
import { registryId } from "../lib/env.js";
import { SheetRepo } from "../lib/repo.js";
import { ensureMonthlyTab } from "../lib/monthly.js";
import { withLock } from "../lib/lock.js";
import { auditAppend } from "../lib/audit.js";
import { verifyPin } from "../lib/pin.js";
import { getIntSetting } from "../lib/settings.js";
import {
  accessibleBranchIds,
  canonical,
  decodeSnapshot,
  entriesForShift,
  findShift,
  handoversForShift,
  incidentsForShift,
  isCloseError,
  metaSet,
  nextReportNumber,
  participantsForShift,
  readTabObjects,
  requiredPoints,
  tzParts,
} from "../lib/close.js";
import { adminOnly, requireAuth, type AuthEnv } from "../lib/authz.js";

// Operasi admin Fase 6 (PRD §7.8; skema §5.3-5.4, §10 resep 7).
// Semua rute: adminOnly + alasan + audit cabang. PIN wajib untuk tutup paksa,
// ganti PJ, void, buka kunci (ADM-SEC-01); buka atas nama dan addendum memakai
// alasan/note sebagai catatan (bukan aksi sensitif ADM-SEC-01).
// Mount di "/api". Endpoint status/tautkan incident TIDAK di sini — sudah ada
// di routes/incident.ts (dipakai-ulang, tidak diduplikat).

const app = new Hono<AuthEnv>();
// Tanpa app.use(): middleware ALL /api/* dari sub-app ikut menjerat rute app
// lain saat digabung via route("/api", ...) (terbukti: adminOnly memblokir
// GET /api/laporan milik report.ts). Auth dipasang per-rute.
const butuhAdmin = [requireAuth, adminOnly] as const;

function err(c: { json: (b: unknown, s?: number) => Response }, e: unknown): Response {
  if (isCloseError(e)) {
    return c.json(toApiError(e.code, e.message), e.status as 400);
  }
  console.error("[ops]", (e as Error).message);
  return c.json(toApiError("gagal", "Terjadi galat. Coba lagi."), 500);
}

function fail(status: number, code: string, message: string): never {
  throw Object.assign(new Error(message), { status, code, isCloseError: true });
}

const AlasanPin = z.object({
  alasan: z.string().trim().min(1, "Alasan wajib diisi.").max(5000),
  pin: z.string().regex(/^[0-9]{6}$/, "PIN harus 6 angka."),
});

async function cekPinAdmin(userId: string, pin: string): Promise<void> {
  const me = await new SheetRepo(
    registryId() as string, "Users", REGISTRY_HEADERS["Users"],
  ).get(userId);
  if (!me || me["is_active"] !== "TRUE" || me["role"] !== "admin") {
    throw Object.assign(new Error("Sesi berakhir. Masuk lagi."),
      { status: 401, code: "sesi_tidak_berlaku", isCloseError: true });
  }
  if (!(await verifyPin(pin, me["pin_hash"]))) {
    throw Object.assign(new Error("Konfirmasi PIN salah."),
      { status: 401, code: "pin_salah", isCloseError: true });
  }
}

function stripMeta(o: Record<string, string>): Record<string, string> {
  const c: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === "updated_at" || k === "version") continue;
    c[k] = v;
  }
  return c;
}

async function auditCabang(
  ss: string, tabMonth: string, at: string, entry: Parameters<typeof auditAppend>[3],
): Promise<void> {
  await ensureMonthlyTab(ss, "AuditLog", tabMonth);
  await auditAppend(ss, monthlyTabName("AuditLog", tabMonth), at, entry);
}

// POST /ops/shift/:id/tutup-paksa — syarat BR-30 TIDAK berlaku. Laporan tetap
// dibuat + terkunci + ditandai; is_incomplete TRUE bila wajib belum selesai.
app.post("/ops/shift/:id/tutup-paksa", ...butuhAdmin, async (c) => {
  try {
    const p = c.get("principal");
    const parsed = AlasanPin.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json(toApiError("wajib_diisi", "Alasan dan konfirmasi PIN wajib diisi."), 400);
    }
    await cekPinAdmin(p.userId, parsed.data.pin);
    const shiftId = c.req.param("id") ?? "";
    const hasil = await withLock(`lock:close:${shiftId}`, async () => {
      const found = await findShift(shiftId, await accessibleBranchIds(p.role, p.branches));
      if (!found) fail(404, "shift_tidak_ada", "Shift tidak ditemukan.");
      const f = found as NonNullable<typeof found>;
      if (f.row["status"] !== "berjalan") {
        fail(409, "bukan_berjalan", "Hanya shift berjalan yang dapat ditutup paksa.");
      }
      const now = nowIso();
      const snap = await decodeSnapshot(f.spreadsheetId, f.row);
      const wajib = requiredPoints(snap);
      const entries = await entriesForShift(f.spreadsheetId, f.row["tab_month"], f.row["id"]);
      const byPoint = new Map(entries.map((e) => [e["point_ref"], e["state"]]));
      let done = 0;
      let skipped = 0;
      for (const pt of wajib) {
        const st = byPoint.get(pt.point_ref);
        if (st === "selesai") done++;
        else if (st === "skip") skipped++;
      }
      const incomplete = done + skipped < wajib.length;
      const hoRows = await handoversForShift(f.spreadsheetId, f.row["tab_month"], f.row["id"]);
      const handoverRow = hoRows[0] ?? null;
      const participants = await participantsForShift(f.spreadsheetId, f.row["id"]);
      const incidents = await incidentsForShift(f.spreadsheetId, f.row["id"]);
      const yyyymmdd = f.row["shift_date"].replaceAll("-", "");
      const reportNumber = await nextReportNumber(f.spreadsheetId, f.branchCode, yyyymmdd);
      const summary = {
        required_total: wajib.length,
        required_done: done,
        required_skipped: skipped,
        participants: participants.length,
        incidents: incidents.length,
        no_incident_confirmed: f.row["no_incident_confirmed"] === "TRUE",
        opened_outside_hours: f.row["opened_outside_hours"] === "TRUE",
        is_incomplete: incomplete,
        forced: true,
      };
      const content = canonical({
        shift: stripMeta(f.row),
        snapshot_hash: f.row["snapshot_hash"],
        entries: entries.map(stripMeta).sort((a, b) => String(a["point_ref"]).localeCompare(String(b["point_ref"]))),
        handover: handoverRow
          ? { values: handoverRow["values"], free_text: handoverRow["free_text"], photo_ids: handoverRow["photo_ids"], submitted_by: handoverRow["submitted_by"], submitted_at: handoverRow["submitted_at"] }
          : null,
        participants: participants
          .map((x) => ({ user_id: x["user_id"], first_action_at: x["first_action_at"], first_action_type: x["first_action_type"] }))
          .sort((a, b) => a.user_id.localeCompare(b.user_id)),
        incident_ids: incidents.map((r) => r["incident_id"]).sort(),
      });
      const contentHash = createHash("sha256").update(content).digest("hex");
      const rObj: Record<string, string> = {};
      for (const h of BRANCH_TEMPLATE_HEADERS["Reports"]) rObj[h] = "";
      rObj["id"] = newId();
      rObj["shift_instance_id"] = f.row["id"];
      rObj["report_number"] = reportNumber;
      rObj["generated_by"] = p.userId;
      rObj["generated_at"] = now;
      rObj["is_locked"] = "TRUE";
      rObj["summary_stats"] = JSON.stringify(summary);
      rObj["content_hash"] = contentHash;
      rObj["unlock_count"] = "0";
      rObj["created_at"] = now;
      rObj["updated_at"] = now;
      rObj["version"] = "1";
      await new SheetRepo(f.spreadsheetId, "Reports", BRANCH_TEMPLATE_HEADERS["Reports"]).append(rObj);
      await new SheetRepo(f.spreadsheetId, "ShiftInstances", BRANCH_TEMPLATE_HEADERS["ShiftInstances"]).update(f.row["id"], {
        status: "ditutup_paksa",
        closed_at: now,
        closed_by: p.userId,
        close_type: "paksa",
        force_close_reason: parsed.data.alasan,
        is_incomplete: incomplete ? "TRUE" : "FALSE",
        updated_at: now,
        version: String(Number(f.row["version"] || "1") + 1),
      });
      await metaSet(f.spreadsheetId, "last_closed_shift_id", f.row["id"]);
      await auditCabang(f.spreadsheetId, f.row["tab_month"], now, {
        actor_id: p.userId,
        action: "shift.tutup_paksa",
        object_type: "shift",
        object_id: f.row["id"],
        branch_id: f.branchId,
        shift_instance_id: f.row["id"],
        after: "ditutup_paksa",
        reason: parsed.data.alasan,
      });
      return { report: rObj, incomplete };
    });
    return c.json({
      ok: true,
      laporan: {
        id: hasil.report["id"],
        report_number: hasil.report["report_number"],
        content_hash: hasil.report["content_hash"],
        is_locked: hasil.report["is_locked"],
      },
      is_incomplete: hasil.incomplete,
    }, 201);
  } catch (e) {
    return err(c, e);
  }
});

const GantiPjBody = z.object({
  petugas_baru_user_id: z.string().length(26, "petugas_baru_user_id tidak valid."),
  alasan: z.string().trim().min(1, "Alasan wajib diisi.").max(5000),
  pin: z.string().regex(/^[0-9]{6}$/, "PIN harus 6 angka."),
});

// POST /ops/shift/:id/ganti-pj — petugas baru wajib punya akses cabang
// (atau admin). Tercatat dari→ke. Notifikasi = Fase 8 (belum dikirim).
app.post("/ops/shift/:id/ganti-pj", ...butuhAdmin, async (c) => {
  try {
    const p = c.get("principal");
    const parsed = GantiPjBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json(toApiError("wajib_diisi", "Petugas baru, alasan, dan PIN wajib diisi."), 400);
    }
    await cekPinAdmin(p.userId, parsed.data.pin);
    const shiftId = c.req.param("id") ?? "";
    const hasil = await withLock(`lock:close:${shiftId}`, async () => {
      const found = await findShift(shiftId, await accessibleBranchIds(p.role, p.branches));
      if (!found) fail(404, "shift_tidak_ada", "Shift tidak ditemukan.");
      const f = found as NonNullable<typeof found>;
      if (f.row["status"] !== "berjalan") {
        fail(409, "bukan_berjalan", "PJ hanya dapat diganti pada shift berjalan.");
      }
      const target = await new SheetRepo(
        registryId() as string, "Users", REGISTRY_HEADERS["Users"],
      ).get(parsed.data.petugas_baru_user_id);
      if (!target || target["is_active"] !== "TRUE") {
        fail(404, "petugas_tidak_ada", "Petugas pengganti tidak ditemukan atau nonaktif.");
      }
      const akses = await readTabObjects(registryId() as string, "UserBranchAccess");
      const punya = target?.["role"] === "admin"
        || akses.some((r) => r["user_id"] === parsed.data.petugas_baru_user_id
          && r["branch_id"] === f.branchId && r["is_active"] === "TRUE");
      if (!punya) fail(403, "tanpa_akses_cabang", "Petugas pengganti tidak punya akses cabang ini.");
      const dari = f.row["pj_user_id"];
      const now = nowIso();
      await new SheetRepo(f.spreadsheetId, "ShiftInstances", BRANCH_TEMPLATE_HEADERS["ShiftInstances"]).update(f.row["id"], {
        pj_user_id: parsed.data.petugas_baru_user_id,
        updated_at: now,
        version: String(Number(f.row["version"] || "1") + 1),
      });
      await auditCabang(f.spreadsheetId, f.row["tab_month"], now, {
        actor_id: p.userId,
        action: "shift.ganti_pj",
        object_type: "shift",
        object_id: f.row["id"],
        branch_id: f.branchId,
        shift_instance_id: f.row["id"],
        before: dari,
        after: parsed.data.petugas_baru_user_id,
        reason: parsed.data.alasan,
      });
      return { dari, ke: parsed.data.petugas_baru_user_id };
    });
    return c.json({ ok: true, dari: hasil.dari, ke: hasil.ke });
  } catch (e) {
    return err(c, e);
  }
});

const BukaAtasNamaBody = z.object({
  branch_id: z.string().length(26, "branch_id tidak valid."),
  shift_definition_id: z.string().length(26, "shift_definition_id tidak valid."),
  petugas_user_id: z.string().length(26, "petugas_user_id tidak valid."),
  alasan: z.string().trim().min(1, "Alasan wajib diisi.").max(5000),
});

function hariKe(tz: string, now: string): string {
  const pendek = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date(now));
  return ({ Sun: "7", Mon: "1", Tue: "2", Wed: "3", Thu: "4", Fri: "5", Sat: "6" } as Record<string, string>)[pendek] ?? "";
}

// POST /ops/shift/buka-atas-nama — opened_by=admin, pj=petugas. Snapshot
// dibangun dari template aktif (mandiri, tanpa lib Fase 4 agar tidak
// tergantung file agen paralel). BR-01 ditegakkan di bawah lock yang sama
// dengan pola shift (def|tanggal|is_test=FALSE).
app.post("/ops/shift/buka-atas-nama", ...butuhAdmin, async (c) => {
  try {
    const p = c.get("principal");
    const parsed = BukaAtasNamaBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json(toApiError("wajib_diisi", "Cabang, shift, petugas, dan alasan wajib diisi."), 400);
    }
    const body = parsed.data;
    const branch = await new SheetRepo(
      registryId() as string, "Branches", REGISTRY_HEADERS["Branches"],
    ).get(body.branch_id);
    if (!branch || branch["is_active"] !== "TRUE") {
      return c.json(toApiError("cabang_tidak_ada", "Cabang tidak ditemukan atau nonaktif."), 404);
    }
    const ss = branch["spreadsheet_id"];
    const tz = branch["timezone"] || "Asia/Jakarta";
    const now = nowIso();
    const { date: shiftDate, month } = tzParts(now, tz);
    const hasil = await withLock(`lock:shift:${body.branch_id}:${body.shift_definition_id}:${shiftDate}:FALSE`, async () => {
      const def = await new SheetRepo(ss, "ShiftDefinitions", BRANCH_TEMPLATE_HEADERS["ShiftDefinitions"]).get(body.shift_definition_id);
      if (!def || def["is_active"] !== "TRUE") {
        fail(404, "shift_tidak_ada", "Definisi shift tidak ditemukan atau nonaktif.");
      }
      const petugas = await new SheetRepo(
        registryId() as string, "Users", REGISTRY_HEADERS["Users"],
      ).get(body.petugas_user_id);
      if (!petugas || petugas["is_active"] !== "TRUE") {
        fail(404, "petugas_tidak_ada", "Petugas tidak ditemukan atau nonaktif.");
      }
      const akses = await readTabObjects(registryId() as string, "UserBranchAccess");
      const punya = petugas?.["role"] === "admin"
        || akses.some((r) => r["user_id"] === body.petugas_user_id
          && r["branch_id"] === body.branch_id && r["is_active"] === "TRUE");
      if (!punya) fail(403, "tanpa_akses_cabang", "Petugas tidak punya akses cabang ini.");
      const semua = await readTabObjects(ss, "ShiftInstances");
      const bentrok = semua.find((r) => r["shift_definition_id"] === body.shift_definition_id
        && r["shift_date"] === shiftDate && r["status"] !== "void" && r["is_test"] !== "TRUE");
      if (bentrok) fail(409, "shift_sudah_dibuka", "Shift ini sudah dibuka hari ini.");
      const d = def as Record<string, string>;
      const cats = (await readTabObjects(ss, "SopCategories"))
        .filter((r) => r["shift_definition_id"] === body.shift_definition_id && r["is_active"] === "TRUE")
        .sort((a, b) => Number(a["sort_order"]) - Number(b["sort_order"]));
      const catIds = new Set(cats.map((r) => r["id"]));
      const hari = hariKe(tz, now);
      const points = (await readTabObjects(ss, "ChecklistPoints"))
        .filter((r) => catIds.has(r["sop_category_id"]) && r["is_active"] === "TRUE"
          && (!r["active_days"] || r["active_days"].split(",").map((s) => s.trim()).includes(hari)))
        .sort((a, b) => Number(a["sort_order"]) - Number(b["sort_order"]));
      const byCat = new Map<string, Record<string, string>[]>();
      for (const pt of points) {
        const arr = byCat.get(pt["sop_category_id"]) ?? [];
        arr.push(pt);
        byCat.set(pt["sop_category_id"], arr);
      }
      const hfs = (await readTabObjects(ss, "HandoverFields"))
        .filter((r) => r["shift_definition_id"] === body.shift_definition_id && r["is_active"] === "TRUE")
        .sort((a, b) => Number(a["sort_order"]) - Number(b["sort_order"]));
      const toleranceDefault = await getIntSetting("tolerance_default_minutes", 15);
      const doc = {
        v: 1,
        shift: {
          id: d["id"], name: d["name"], start_time: d["start_time"],
          end_time: d["end_time"], crosses_midnight: d["crosses_midnight"] === "TRUE",
        },
        settings: { tolerance_default_minutes: toleranceDefault, timezone: tz },
        categories: cats.map((cat, i) => ({
          id: cat["id"], name: cat["name"], sort_order: i + 1,
          points: (byCat.get(cat["id"]) ?? []).map((pt, j) => ({
            point_ref: pt["id"], title: pt["title"], instruction: pt["instruction"] ?? "",
            input_type: pt["input_type"], is_required: pt["is_required"] === "TRUE",
            target_time: pt["target_time"] ?? "", tolerance_minutes: pt["tolerance_minutes"] ?? "",
            active_days: pt["active_days"] ?? "", number_min: pt["number_min"] ?? "",
            number_max: pt["number_max"] ?? "", sort_order: j + 1,
          })),
        })),
        handover_fields: hfs.map((f, i) => ({
          id: f["id"], label: f["label"], field_type: f["field_type"],
          options: f["options"] ?? "", is_required: f["is_required"] === "TRUE", sort_order: i + 1,
        })),
      };
      const json = JSON.stringify(doc);
      const snapHash = createHash("sha256").update(json, "utf8").digest("hex");
      const b64 = Buffer.from(gzipSync(json)).toString("base64");
      const shiftId = newId();
      let snapshot = b64;
      if (b64.length > 45000) {
        const CH = 45000;
        for (let i = 0; i * CH < b64.length; i++) {
          const obj: Record<string, string> = {};
          for (const h of BRANCH_TEMPLATE_HEADERS["Snapshots"]) obj[h] = "";
          obj["id"] = newId();
          obj["shift_instance_id"] = shiftId;
          obj["part_no"] = String(i);
          obj["chunk"] = b64.slice(i * CH, (i + 1) * CH);
          obj["created_at"] = now;
          await new SheetRepo(ss, "Snapshots", BRANCH_TEMPLATE_HEADERS["Snapshots"]).append(obj);
        }
        snapshot = `ref:${shiftId}`;
      }
      const si: Record<string, string> = {};
      for (const h of BRANCH_TEMPLATE_HEADERS["ShiftInstances"]) si[h] = "";
      si["id"] = shiftId;
      si["shift_definition_id"] = body.shift_definition_id;
      si["shift_date"] = shiftDate;
      si["tab_month"] = month;
      si["status"] = "berjalan";
      si["pj_user_id"] = body.petugas_user_id;
      si["opened_by"] = p.userId;
      si["opened_at"] = now;
      si["opened_outside_hours"] = "FALSE";
      si["is_incomplete"] = "FALSE";
      si["no_incident_confirmed"] = "FALSE";
      si["is_test"] = "FALSE";
      si["snapshot_encoding"] = "gzip_b64";
      si["template_snapshot"] = snapshot;
      si["snapshot_hash"] = snapHash;
      si["created_at"] = now;
      si["updated_at"] = now;
      si["version"] = "1";
      await new SheetRepo(ss, "ShiftInstances", BRANCH_TEMPLATE_HEADERS["ShiftInstances"]).append(si);
      const part: Record<string, string> = {};
      for (const h of BRANCH_TEMPLATE_HEADERS["Participants"]) part[h] = "";
      part["id"] = newId();
      part["shift_instance_id"] = shiftId;
      part["user_id"] = body.petugas_user_id;
      part["first_action_at"] = now;
      part["first_action_type"] = "buka_shift";
      part["created_at"] = now;
      await new SheetRepo(ss, "Participants", BRANCH_TEMPLATE_HEADERS["Participants"]).append(part);
      await auditCabang(ss, month, now, {
        actor_id: p.userId,
        action: "shift.buka_atas_nama",
        object_type: "shift",
        object_id: shiftId,
        branch_id: body.branch_id,
        shift_instance_id: shiftId,
        after: body.petugas_user_id,
        reason: body.alasan,
      });
      return { shiftId };
    });
    return c.json({ ok: true, shift: { id: hasil.shiftId } }, 201);
  } catch (e) {
    return err(c, e);
  }
});

// POST /ops/shift/:id/void — status void; laporan tak disentuh (tetap tampil
// apa adanya). Pengecualian statistik = Fase 8 (Summary/cron).
app.post("/ops/shift/:id/void", ...butuhAdmin, async (c) => {
  try {
    const p = c.get("principal");
    const parsed = AlasanPin.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json(toApiError("wajib_diisi", "Alasan dan konfirmasi PIN wajib diisi."), 400);
    }
    await cekPinAdmin(p.userId, parsed.data.pin);
    const shiftId = c.req.param("id") ?? "";
    await withLock(`lock:close:${shiftId}`, async () => {
      const found = await findShift(shiftId, await accessibleBranchIds(p.role, p.branches));
      if (!found) fail(404, "shift_tidak_ada", "Shift tidak ditemukan.");
      const f = found as NonNullable<typeof found>;
      if (f.row["status"] === "void") fail(409, "sudah_void", "Shift ini sudah void.");
      const now = nowIso();
      await new SheetRepo(f.spreadsheetId, "ShiftInstances", BRANCH_TEMPLATE_HEADERS["ShiftInstances"]).update(f.row["id"], {
        status: "void",
        void_reason: parsed.data.alasan,
        void_by: p.userId,
        void_at: now,
        updated_at: now,
        version: String(Number(f.row["version"] || "1") + 1),
      });
      await auditCabang(f.spreadsheetId, f.row["tab_month"], now, {
        actor_id: p.userId,
        action: "shift.void",
        object_type: "shift",
        object_id: f.row["id"],
        branch_id: f.branchId,
        shift_instance_id: f.row["id"],
        before: f.row["status"],
        after: "void",
        reason: parsed.data.alasan,
      });
    });
    return c.json({ ok: true });
  } catch (e) {
    return err(c, e);
  }
});

// Cari laporan lintas cabang (admin = semua cabang registry).
async function cariLaporan(
  reportId: string, branchIds: string[],
): Promise<{ branchId: string; ss: string; report: Record<string, string>; tabMonth: string } | null> {
  for (const branchId of branchIds) {
    const branch = await new SheetRepo(
      registryId() as string, "Branches", REGISTRY_HEADERS["Branches"],
    ).get(branchId).catch(() => null);
    const ss = branch?.["spreadsheet_id"] ?? "";
    if (!ss) continue;
    const report = await new SheetRepo(ss, "Reports", BRANCH_TEMPLATE_HEADERS["Reports"]).get(reportId).catch(() => null);
    if (!report) continue;
    const shift = await new SheetRepo(ss, "ShiftInstances", BRANCH_TEMPLATE_HEADERS["ShiftInstances"]).get(report["shift_instance_id"]).catch(() => null);
    const tabMonth = shift?.["tab_month"]
      || tzParts(nowIso(), branch?.["timezone"] || "Asia/Jakarta").month;
    return { branchId, ss, report, tabMonth };
  }
  return null;
}

const AddendumBody = z.object({
  note: z.string().trim().min(1, "Catatan addendum wajib diisi.").max(20000),
});

// POST /laporan/:reportId/addendum — append Addenda; isi asli utuh (BR-40).
app.post("/laporan/:reportId/addendum", ...butuhAdmin, async (c) => {
  try {
    const p = c.get("principal");
    const parsed = AddendumBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json(toApiError("wajib_diisi", "Catatan addendum wajib diisi."), 400);
    }
    const reportId = c.req.param("reportId") ?? "";
    const hit = await cariLaporan(reportId, await accessibleBranchIds(p.role, p.branches));
    if (!hit) return c.json(toApiError("tidak_ada", "Laporan tidak ditemukan."), 404);
    const now = nowIso();
    const obj: Record<string, string> = {};
    for (const h of BRANCH_TEMPLATE_HEADERS["Addenda"]) obj[h] = "";
    obj["id"] = newId();
    obj["report_id"] = reportId;
    obj["author_id"] = p.userId;
    obj["note"] = parsed.data.note;
    obj["created_at"] = now;
    await new SheetRepo(hit.ss, "Addenda", BRANCH_TEMPLATE_HEADERS["Addenda"]).append(obj);
    await auditCabang(hit.ss, hit.tabMonth, now, {
      actor_id: p.userId,
      action: "laporan.addendum",
      object_type: "report",
      object_id: reportId,
      branch_id: hit.branchId,
      shift_instance_id: hit.report["shift_instance_id"],
    });
    return c.json({ ok: true, addendum: { id: obj["id"] } }, 201);
  } catch (e) {
    return err(c, e);
  }
});

// POST /laporan/:reportId/buka-kunci — darurat: is_locked=FALSE + unlock_count+1
// + audit. KEPUTUSAN DESAIN (terdokumentasi, bukan diam-diam): endpoint tulis
// tetap menolak karena cek status shift (assertBerjalan: status tetap
// ditutup/ditutup_paksa), bukan cek flag is_locked. Jadi buka kunci hanya
// menandai + memungkinkan addendum korektif lanjutan; tidak membuka tulis
// checklist/handover/laporan.
app.post("/laporan/:reportId/buka-kunci", ...butuhAdmin, async (c) => {
  try {
    const p = c.get("principal");
    const parsed = AlasanPin.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json(toApiError("wajib_diisi", "Alasan dan konfirmasi PIN wajib diisi."), 400);
    }
    await cekPinAdmin(p.userId, parsed.data.pin);
    const reportId = c.req.param("reportId") ?? "";
    const hit = await cariLaporan(reportId, await accessibleBranchIds(p.role, p.branches));
    if (!hit) return c.json(toApiError("tidak_ada", "Laporan tidak ditemukan."), 404);
    const now = nowIso();
    const unlockCount = Number(hit.report["unlock_count"] || "0") + 1;
    await new SheetRepo(hit.ss, "Reports", BRANCH_TEMPLATE_HEADERS["Reports"]).update(reportId, {
      is_locked: "FALSE",
      unlock_count: String(unlockCount),
      last_unlocked_at: now,
      last_unlocked_by: p.userId,
      updated_at: now,
      version: String(Number(hit.report["version"] || "1") + 1),
    });
    await auditCabang(hit.ss, hit.tabMonth, now, {
      actor_id: p.userId,
      action: "laporan.buka_kunci",
      object_type: "report",
      object_id: reportId,
      branch_id: hit.branchId,
      shift_instance_id: hit.report["shift_instance_id"],
      before: hit.report["is_locked"],
      after: "FALSE",
      reason: parsed.data.alasan,
    });
    return c.json({ ok: true, unlock_count: unlockCount, is_locked: false });
  } catch (e) {
    return err(c, e);
  }
});

export default app;
