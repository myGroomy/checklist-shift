import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import {
  BRANCH_TEMPLATE_HEADERS,
  MONTHLY_HEADERS,
  REGISTRY_HEADERS,
  monthlyTabName,
  newId,
  nowIso,
} from "@checklist-shift/shared";
import { registryId } from "./env.js";
import { SheetRepo } from "./repo.js";
import { ensureMonthlyTab } from "./monthly.js";
import { valuesAppend, valuesGet, valuesUpdate } from "./sheets.js";
import { withLock } from "./lock.js";
import { auditAppend } from "./audit.js";
import { verifyPin } from "./pin.js";

// Logika penutupan shift Fase 5 (BR-30 s/d BR-33, skema §5.3-5.5, §10-§11).
// Dipakai routes/close.ts dan routes/handover.ts. Setelah shift ditutup,
// semua tulis ke shift itu wajib ditolak (cek via assertBerjalan).

export interface CloseError extends Error {
  status: number;
  code: string;
  isCloseError: true;
}

export function fail(status: number, code: string, message: string): CloseError {
  const e = new Error(message) as CloseError;
  e.status = status;
  e.code = code;
  e.isCloseError = true;
  return e;
}

export function isCloseError(e: unknown): e is CloseError {
  return typeof e === "object" && e !== null && (e as { isCloseError?: unknown }).isCloseError === true;
}

export interface FoundShift {
  branchId: string;
  spreadsheetId: string;
  branchCode: string;
  timezone: string;
  row: Record<string, string>;
}

export interface SnapshotPoint {
  point_ref: string;
  title: string;
  is_required: boolean;
}

export interface SnapshotHandoverField {
  id: string;
  label: string;
  is_required: boolean;
}

export interface Snapshot {
  categories: { id: string; name: string; points: SnapshotPoint[] }[];
  handover_fields: SnapshotHandoverField[];
}

function branchRepo(): SheetRepo {
  const id = registryId();
  if (!id) throw new Error("env registry belum lengkap");
  return new SheetRepo(id, "Branches", REGISTRY_HEADERS["Branches"]);
}

function usersRepo(): SheetRepo {
  const id = registryId();
  if (!id) throw new Error("env registry belum lengkap");
  return new SheetRepo(id, "Users", REGISTRY_HEADERS["Users"]);
}

function shiftRepo(ss: string): SheetRepo {
  return new SheetRepo(ss, "ShiftInstances", BRANCH_TEMPLATE_HEADERS["ShiftInstances"]);
}

// YYYY-MM-DD dan YYYY-MM menurut zona waktu cabang (BR-02, waktu UTC disimpan).
export function tzParts(isoUtc: string, tz: string): { date: string; month: string } {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoUtc));
  return { date, month: date.slice(0, 7) };
}

// Baca seluruh tab menjadi objek per header baris 1 (baca by nama, §5).
export async function readTabObjects(ss: string, tab: string): Promise<Record<string, string>[]> {
  const rows = await valuesGet(ss, `${tab}!A1:Z100000`);
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).filter((r) => r.length > 0 && r[0] !== "").map((r) =>
    Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""]))
  );
}

// Cari shift di semua cabang yang dapat diakses (ShiftInstances tak punya branch_id;
// cabang tersirat dari spreadsheet, §5.2).
export async function findShift(shiftId: string, branchIds: string[]): Promise<FoundShift | null> {
  for (const branchId of branchIds) {
    let branch: Record<string, string> | null = null;
    try {
      branch = await branchRepo().get(branchId);
    } catch {
      continue;
    }
    const ss = branch?.["spreadsheet_id"];
    if (!ss) continue;
    let row: Record<string, string> | null = null;
    try {
      row = await shiftRepo(ss).get(shiftId);
    } catch {
      continue;
    }
    if (row) {
      return {
        branchId,
        spreadsheetId: ss,
        branchCode: branch?.["code"] ?? "",
        timezone: branch?.["timezone"] ?? "Asia/Jakarta",
        row,
      };
    }
  }
  return null;
}

// Daftar cabang yang boleh dipindai: admin = semua cabang registry.
export async function accessibleBranchIds(
  role: string,
  userBranches: string[],
): Promise<string[]> {
  if (role === "admin") {
    const rows = await valuesGet(registryId() as string, "Branches!A2:A10000");
    return rows.map((r) => r[0]).filter(Boolean);
  }
  return userBranches;
}

export function assertBerjalan(row: Record<string, string>): void {
  if (row["status"] !== "berjalan") {
    throw fail(409, "shift_terkunci", "Shift sudah ditutup. Data tidak dapat diubah; koreksi lewat addendum.");
  }
}

// Urai template_snapshot: gzip+base64 (§8), "ref:{id}" via tab Snapshots,
// atau JSON polos (toleransi baca; yang ditulis selalu gzip_b64).
export async function decodeSnapshot(ss: string, row: Record<string, string>): Promise<Snapshot> {
  let raw = row["template_snapshot"] ?? "";
  if (raw.startsWith("ref:")) {
    const snapId = raw.slice(4);
    const parts = await readTabObjects(ss, "Snapshots");
    raw = parts
      .filter((p) => p["shift_instance_id"] === snapId)
      .sort((a, b) => Number(a["part_no"]) - Number(b["part_no"]))
      .map((p) => p["chunk"])
      .join("");
  }
  let json = raw;
  if (row["snapshot_encoding"] === "gzip_b64" && raw && !raw.trim().startsWith("{")) {
    json = gunzipSync(Buffer.from(raw, "base64")).toString("utf-8");
  }
  let parsed: {
    categories?: { id?: string; name?: string; points?: { point_ref?: string; title?: string; is_required?: boolean }[] }[];
    handover_fields?: { id?: string; label?: string; is_required?: boolean }[];
  };
  try {
    parsed = JSON.parse(json) as typeof parsed;
  } catch {
    throw fail(500, "snapshot_rusak", "Snapshot shift tidak dapat dibaca.");
  }
  return {
    categories: (parsed.categories ?? []).map((c) => ({
      id: String(c.id ?? ""),
      name: String(c.name ?? ""),
      points: (c.points ?? []).map((p) => ({
        point_ref: String(p.point_ref ?? ""),
        title: String(p.title ?? ""),
        is_required: p.is_required === true,
      })),
    })),
    handover_fields: (parsed.handover_fields ?? []).map((f) => ({
      id: String(f.id ?? ""),
      label: String(f.label ?? ""),
      is_required: f.is_required === true,
    })),
  };
}

export function requiredPoints(snap: Snapshot): SnapshotPoint[] {
  return snap.categories.flatMap((c) => c.points).filter((p) => p.is_required);
}

export function requiredHandoverFields(snap: Snapshot): SnapshotHandoverField[] {
  return snap.handover_fields.filter((f) => f.is_required);
}

export async function entriesForShift(
  ss: string,
  tabMonth: string,
  shiftId: string,
): Promise<Record<string, string>[]> {
  const tab = monthlyTabName("Entries", tabMonth);
  const rows = await valuesGet(ss, `${tab}!A2:Z100000`).catch(() => [] as string[][]);
  if (rows.length === 0) return [];
  const header = MONTHLY_HEADERS["Entries"];
  return rows
    .filter((r) => r[1] === shiftId)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

export async function handoversForShift(
  ss: string,
  tabMonth: string,
  shiftId: string,
): Promise<Record<string, string>[]> {
  const tab = monthlyTabName("Handovers", tabMonth);
  const rows = await valuesGet(ss, `${tab}!A2:Z100000`).catch(() => [] as string[][]);
  if (rows.length === 0) return [];
  const header = MONTHLY_HEADERS["Handovers"];
  return rows
    .filter((r) => r[1] === shiftId)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

export async function participantsForShift(
  ss: string,
  shiftId: string,
): Promise<Record<string, string>[]> {
  const all = await readTabObjects(ss, "Participants");
  return all.filter((p) => p["shift_instance_id"] === shiftId);
}

// Incident yang tertaut ke shift saat ini (via IncidentIndex, §5.4).
export async function incidentsForShift(
  ss: string,
  shiftId: string,
): Promise<Record<string, string>[]> {
  const all = await readTabObjects(ss, "IncidentIndex");
  return all.filter((r) => r["shift_instance_id"] === shiftId);
}

export interface HandoverPayload {
  values: Record<string, string>;
  free_text?: string;
  photo_ids?: string[];
}

export interface CloseCheck {
  errors: string[];
  requiredTotal: number;
  requiredDone: number;
  requiredSkipped: number;
  incidentCount: number;
}

// Validasi BR-30 tanpa menulis: item wajib selesai/skip + handover wajib terisi
// + penegasan "tidak ada incident" (BR-33) bila nol incident tertaut.
export async function validateCloseable(
  found: FoundShift,
  handover: HandoverPayload | null,
): Promise<CloseCheck> {
  assertBerjalan(found.row);
  const { spreadsheetId, row } = found;
  const errors: string[] = [];
  const snap = await decodeSnapshot(spreadsheetId, row);
  const wajib = requiredPoints(snap);
  const entries = await entriesForShift(spreadsheetId, row["tab_month"], row["id"]);
  const byPoint = new Map(entries.map((e) => [e["point_ref"], e["state"]]));
  let done = 0;
  let skipped = 0;
  const kurang: string[] = [];
  for (const p of wajib) {
    const st = byPoint.get(p.point_ref);
    if (st === "selesai") done++;
    else if (st === "skip") skipped++;
    else kurang.push(p.title || p.point_ref);
  }
  if (kurang.length > 0) {
    errors.push(`Masih ada ${kurang.length} item wajib belum selesai: ${kurang.slice(0, 5).join("; ")}${kurang.length > 5 ? "…" : ""}`);
  }
  const ada = await handoversForShift(spreadsheetId, row["tab_month"], row["id"]);
  const values: Record<string, string> = handover?.values
    ?? (ada[0] ? (JSON.parse(ada[0]["values"] || "{}") as Record<string, string>) : {});
  if (!handover && ada.length === 0) {
    errors.push("Handover belum diisi.");
  } else {
    const kosong = requiredHandoverFields(snap).filter((f) => !String(values[f.id] ?? "").trim());
    if (kosong.length > 0) {
      errors.push(`Field handover wajib belum diisi: ${kosong.map((f) => f.label || f.id).join(", ")}`);
    }
  }
  const incidents = await incidentsForShift(spreadsheetId, row["id"]);
  return {
    errors,
    requiredTotal: wajib.length,
    requiredDone: done,
    requiredSkipped: skipped,
    incidentCount: incidents.length,
  };
}

// JSON kanonik: kunci objek diurut rekursif agar hash stabil (§11.3).
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => canonical(x)).join(",")}]`;
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

function stripMeta(o: Record<string, string>): Record<string, string> {
  const c: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === "updated_at" || k === "version") continue;
    c[k] = v;
  }
  return c;
}

// Nomor laporan {kodecabang}-{YYYYMMDD}-{nn}, nn urutan harian di bawah lock tutup.
export async function nextReportNumber(ss: string, code: string, yyyymmdd: string): Promise<string> {
  const prefix = `${code}-${yyyymmdd}-`;
  const all = await readTabObjects(ss, "Reports");
  let max = 0;
  for (const r of all) {
    const n = r["report_number"] ?? "";
    if (n.startsWith(prefix)) {
      const nn = Number(n.slice(prefix.length));
      if (Number.isFinite(nn) && nn > max) max = nn;
    }
  }
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}

export async function metaGet(ss: string, key: string): Promise<string | null> {
  const rows = await valuesGet(ss, "_meta!A2:B100");
  const hit = rows.find((r) => r[0] === key);
  return hit ? (hit[1] ?? "") : null;
}

export async function metaSet(ss: string, key: string, value: string): Promise<void> {
  const rows = await valuesGet(ss, "_meta!A2:B100");
  const idx = rows.findIndex((r) => r[0] === key);
  if (idx < 0) {
    await valuesAppend(ss, "_meta!A:B", [[key, value]]);
  } else {
    await valuesUpdate(ss, `_meta!B${idx + 2}`, [[value]]);
  }
}

// Referensi foto Fase 5: photo_ids diterima apa adanya, dicatat sebagai baris
// Photos_* status pending. Upload fisik + validasi tipe/ukuran BELUM terverifikasi
// (keputusan terbuka AGENTS §11) — jangan anggap sudah tervalidasi.
export async function appendPhotoRefs(
  ss: string,
  tabMonth: string,
  ownerType: "handover" | "incident",
  ownerId: string,
  photoIds: string[],
  shiftId: string,
  uploaderId: string,
): Promise<void> {
  if (photoIds.length === 0) return;
  const tab = await ensureMonthlyTab(ss, "Photos", tabMonth);
  const repo = new SheetRepo(ss, tab, MONTHLY_HEADERS["Photos"]);
  const now = nowIso();
  for (let i = 0; i < photoIds.length; i++) {
    const obj: Record<string, string> = {};
    for (const h of MONTHLY_HEADERS["Photos"]) obj[h] = "";
    obj["id"] = newId();
    obj["shift_instance_id"] = shiftId;
    obj["owner_type"] = ownerType;
    obj["owner_id"] = ownerId;
    obj["storage"] = "drive";
    obj["file_ref"] = photoIds[i];
    obj["sort_order"] = String(i);
    obj["status"] = "pending";
    obj["uploaded_by"] = uploaderId;
    obj["uploaded_at"] = now;
    obj["created_at"] = now;
    await repo.append(obj);
  }
}

export interface CloseOpts {
  shiftId: string;
  branchIds: string[];
  userId: string;
  pin: string;
  handover: HandoverPayload | null;
  noIncidentConfirmed: boolean;
}

export interface CloseResult {
  report: Record<string, string>;
  shift: Record<string, string>;
}

// Tutup shift (BR-30/BR-31): lock lock:close:{shiftId} -> baca -> validasi ->
// tulis (update ShiftInstances + append Handovers bila baru + append Reports +
// _meta.last_closed_shift_id) -> lepas lock. PIN salah -> 401 tanpa bocor.
export async function closeShift(opts: CloseOpts): Promise<CloseResult> {
  return withLock(`lock:close:${opts.shiftId}`, async () => {
    const found = await findShift(opts.shiftId, opts.branchIds);
    if (!found) throw fail(404, "shift_tidak_ada", "Shift tidak ditemukan.");
    const { spreadsheetId, row } = found;
    assertBerjalan(row);
    if (row["pj_user_id"] !== opts.userId) {
      throw fail(403, "bukan_pj", "Hanya PJ shift ini yang dapat menutup.");
    }
    const me = await usersRepo().get(opts.userId);
    if (!me || me["is_active"] !== "TRUE") throw fail(401, "sesi_tidak_berlaku", "Sesi berakhir. Masuk lagi.");
    if (!(await verifyPin(opts.pin, me["pin_hash"]))) {
      throw fail(401, "pin_salah", "Konfirmasi PIN salah.");
    }
    const check = await validateCloseable(found, opts.handover);
    if (check.errors.length > 0) {
      throw fail(422, "belum_bisa_tutup", check.errors.join(" "));
    }
    if (check.incidentCount === 0 && !opts.noIncidentConfirmed) {
      throw fail(422, "incident_belum_ditegaskan", "Tegaskan tidak ada incident bila memang tidak ada.");
    }

    const now = nowIso();
    const tabMonth = row["tab_month"];
    const ada = await handoversForShift(spreadsheetId, tabMonth, row["id"]);
    let handoverRow = ada[0] ?? null;
    if (!handoverRow) {
      const h = opts.handover as HandoverPayload;
      const hTab = await ensureMonthlyTab(spreadsheetId, "Handovers", tabMonth);
      const hRepo = new SheetRepo(spreadsheetId, hTab, MONTHLY_HEADERS["Handovers"]);
      const hid = newId();
      const obj: Record<string, string> = {};
      for (const hh of MONTHLY_HEADERS["Handovers"]) obj[hh] = "";
      obj["id"] = hid;
      obj["shift_instance_id"] = row["id"];
      obj["values"] = JSON.stringify(h.values ?? {});
      obj["free_text"] = h.free_text ?? "";
      obj["photo_ids"] = JSON.stringify(h.photo_ids ?? []);
      obj["submitted_by"] = opts.userId;
      obj["submitted_at"] = now;
      obj["created_at"] = now;
      obj["updated_at"] = now;
      await hRepo.append(obj);
      await appendPhotoRefs(spreadsheetId, tabMonth, "handover", hid, h.photo_ids ?? [], row["id"], opts.userId);
      handoverRow = obj;
    }

    const entries = await entriesForShift(spreadsheetId, tabMonth, row["id"]);
    const participants = await participantsForShift(spreadsheetId, row["id"]);
    const incidents = await incidentsForShift(spreadsheetId, row["id"]);
    const yyyymmdd = row["shift_date"].replaceAll("-", "");
    const reportNumber = await nextReportNumber(spreadsheetId, found.branchCode, yyyymmdd);
    const summary = {
      required_total: check.requiredTotal,
      required_done: check.requiredDone,
      required_skipped: check.requiredSkipped,
      participants: participants.length,
      incidents: incidents.length,
      no_incident_confirmed: opts.noIncidentConfirmed,
      opened_outside_hours: row["opened_outside_hours"] === "TRUE",
      is_incomplete: false,
    };
    const content = canonical({
      shift: stripMeta(row),
      snapshot_hash: row["snapshot_hash"],
      entries: entries.map(stripMeta).sort((a, b) => String(a["point_ref"]).localeCompare(String(b["point_ref"]))),
      handover: handoverRow
        ? { values: handoverRow["values"], free_text: handoverRow["free_text"], photo_ids: handoverRow["photo_ids"], submitted_by: handoverRow["submitted_by"], submitted_at: handoverRow["submitted_at"] }
        : null,
      participants: participants
        .map((p) => ({ user_id: p["user_id"], first_action_at: p["first_action_at"], first_action_type: p["first_action_type"] }))
        .sort((a, b) => a.user_id.localeCompare(b.user_id)),
      incident_ids: incidents.map((r) => r["incident_id"]).sort(),
    });
    const contentHash = createHash("sha256").update(content).digest("hex");

    const reportId = newId();
    const rObj: Record<string, string> = {};
    for (const h of BRANCH_TEMPLATE_HEADERS["Reports"]) rObj[h] = "";
    rObj["id"] = reportId;
    rObj["shift_instance_id"] = row["id"];
    rObj["report_number"] = reportNumber;
    rObj["generated_by"] = opts.userId;
    rObj["generated_at"] = now;
    rObj["is_locked"] = "TRUE";
    rObj["summary_stats"] = JSON.stringify(summary);
    rObj["content_hash"] = contentHash;
    rObj["unlock_count"] = "0";
    rObj["created_at"] = now;
    rObj["updated_at"] = now;
    rObj["version"] = "1";
    await new SheetRepo(spreadsheetId, "Reports", BRANCH_TEMPLATE_HEADERS["Reports"]).append(rObj);

    await shiftRepo(spreadsheetId).update(row["id"], {
      status: "ditutup",
      closed_at: now,
      closed_by: opts.userId,
      close_type: "normal",
      is_incomplete: "FALSE",
      no_incident_confirmed: opts.noIncidentConfirmed ? "TRUE" : "FALSE",
      updated_at: now,
      version: String(Number(row["version"] || "1") + 1),
    });
    await metaSet(spreadsheetId, "last_closed_shift_id", row["id"]);
    await ensureMonthlyTab(spreadsheetId, "AuditLog", tabMonth);
    await auditAppend(spreadsheetId, monthlyTabName("AuditLog", tabMonth), now, {
      actor_id: opts.userId,
      action: "shift.tutup",
      object_type: "shift",
      object_id: row["id"],
      branch_id: found.branchId,
      shift_instance_id: row["id"],
    });
    const shift = (await shiftRepo(spreadsheetId).get(row["id"])) as Record<string, string>;
    return { report: rObj, shift };
  });
}
