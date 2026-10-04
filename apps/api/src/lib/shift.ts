import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  BRANCH_TEMPLATE_HEADERS,
  MONTHLY_HEADERS,
  REGISTRY_HEADERS,
  monthlyTabName,
  newId,
  nowIso,
  shiftDateIn,
  wallTimeIn,
  monthOf,
} from "@checklist-shift/shared";
import { registryId } from "./env.js";
import { SheetRepo } from "./repo.js";
import { resolveBranch } from "./branch.js";
import { valuesGet } from "./sheets.js";
import { ensureMonthlyTab } from "./monthly.js";
import { cacheGet, cacheSet } from "./redis.js";
import { getIntSetting } from "./settings.js";
import { withLock } from "./lock.js";

// Siklus shift + snapshot template (Fase 4). Lib Fase 1-2 tidak diubah.
// Audit: buka/gabung/saya-bertugas adalah operasional harian, TIDAK menulis
// audit log (audit dicadangkan untuk tutup/ganti/void Fase 5-6).

export interface SnapshotPoint {
  point_ref: string;
  title: string;
  instruction: string;
  input_type: string;
  is_required: boolean;
  target_time: string;
  tolerance_minutes: number | null;
  active_days: string;
  number_min: number | null;
  number_max: number | null;
  sort_order: number;
}

export interface SnapshotCategory {
  id: string;
  name: string;
  sort_order: number;
  points: SnapshotPoint[];
}

export interface SnapshotDoc {
  v: 1;
  shift: { id: string; name: string; start_time: string; end_time: string; crosses_midnight: boolean };
  settings: { tolerance_default_minutes: number; timezone: string };
  categories: SnapshotCategory[];
  handover_fields: Array<{
    id: string; label: string; field_type: string; options: string[] | null;
    is_required: boolean; sort_order: number;
  }>;
}

export class ShiftSudahAda extends Error {
  shiftId: string;
  constructor(shiftId: string) {
    super("shift sudah dibuka");
    this.shiftId = shiftId;
  }
}

const SI = BRANCH_TEMPLATE_HEADERS["ShiftInstances"];

export function branchRepos(ss: string): Record<string, SheetRepo> {
  const out: Record<string, SheetRepo> = {};
  for (const [tab, header] of Object.entries(BRANCH_TEMPLATE_HEADERS)) {
    out[tab] = new SheetRepo(ss, tab, header);
  }
  return out;
}

export function monthlyRepo(ss: string, base: string, month: string): SheetRepo {
  const header = MONTHLY_HEADERS[base];
  if (!header) throw new Error(`tab bulanan tak dikenal: ${base}`);
  return new SheetRepo(ss, monthlyTabName(base, month), header);
}

export async function branchTimezone(branchId: string): Promise<string> {
  const reg = registryId();
  if (!reg) throw new Error("env registry belum lengkap");
  const row = await new SheetRepo(reg, "Branches", REGISTRY_HEADERS["Branches"]).get(branchId);
  return row?.["timezone"] || "Asia/Jakarta";
}

// Kanonik JSON: kunci objek diurut rekursif (DATABASE_SCHEMA §8).
export function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v !== null && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      o[k] = canon((v as Record<string, unknown>)[k]);
    }
    return o;
  }
  return v;
}

export function snapshotHash(doc: SnapshotDoc): { json: string; hash: string } {
  const json = JSON.stringify(canon(doc));
  return { json, hash: createHash("sha256").update(json).digest("hex") };
}

export function parseSnapshotCell(cell: string): SnapshotDoc {
  const buf = gunzipSync(Buffer.from(cell, "base64"));
  return JSON.parse(buf.toString("utf8")) as SnapshotDoc;
}

export async function readSnapshot(ss: string, shiftRow: Record<string, string>): Promise<SnapshotDoc> {
  const cell = shiftRow["template_snapshot"] ?? "";
  if (!cell.startsWith("ref:")) return parseSnapshotCell(cell);
  const snapId = cell.slice(4);
  const rows = await valuesGet(ss, "Snapshots!A2:E100000");
  const parts = rows
    .filter((r) => r[1] === snapId)
    .map((r) => ({ no: Number(r[2] ?? "0"), chunk: r[3] ?? "" }))
    .sort((a, b) => a.no - b.no);
  if (parts.length === 0) throw new Error("potongan snapshot tidak ditemukan");
  return parseSnapshotCell(parts.map((p) => p.chunk).join(""));
}

// Hari Senin=1..Minggu=7 menurut zona cabang untuk tanggal shift (filter active_days).
export function weekdayIn(tz: string, ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(dt);
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[wd] ?? 1;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function diDalamJam(start: string, end: string, cross: boolean, wall: string): boolean {
  const s = toMinutes(start);
  const e = toMinutes(end);
  const w = toMinutes(wall);
  return cross ? w >= s || w <= e : w >= s && w <= e;
}

// Label ketepatan dari jam dinding server vs target (BR-20..BR-23).
export type LabelWaktu = "tepat_waktu" | "lebih_awal" | "terlambat";
export function hitungTiming(
  target: string,
  tolerance: number | null,
  defaultTol: number,
  wallNow: string,
): { label: LabelWaktu; delta: number } {
  const tol = tolerance ?? defaultTol;
  const delta = toMinutes(wallNow) - toMinutes(target);
  if (Math.abs(delta) <= tol) return { label: "tepat_waktu", delta };
  return delta < 0 ? { label: "lebih_awal", delta } : { label: "terlambat", delta };
}

async function cariShift(
  ss: string,
  defId: string,
  date: string,
  isTest: string,
): Promise<Record<string, string> | null> {
  const rows = await valuesGet(ss, "ShiftInstances!A2:Z100000");
  const iDef = SI.indexOf("shift_definition_id");
  const iDate = SI.indexOf("shift_date");
  const iStatus = SI.indexOf("status");
  const iTest = SI.indexOf("is_test");
  for (const r of rows) {
    if (r[iDef] === defId && r[iDate] === date && r[iTest] === isTest && r[iStatus] !== "void") {
      const obj: Record<string, string> = {};
      SI.forEach((h, i) => { obj[h] = r[i] ?? ""; });
      return obj;
    }
  }
  return null;
}

export async function bacaShiftRow(
  branchId: string,
  shiftId: string,
): Promise<{ ss: string; row: Record<string, string> }> {
  const ss = await resolveBranch(branchId);
  const row = await branchRepos(ss)["ShiftInstances"].get(shiftId);
  if (!row) throw new Error("shift tidak ditemukan");
  return { ss, row };
}

export async function bukaShift(opts: {
  branchId: string;
  shiftDefId: string;
  userId: string;
  isTest: boolean;
}): Promise<{ shiftId: string; shiftDate: string; openedOutsideHours: boolean; joined: boolean }> {
  const ss = await resolveBranch(opts.branchId);
  const tz = await branchTimezone(opts.branchId);
  const repos = branchRepos(ss);
  const testCell = opts.isTest ? "TRUE" : "FALSE";
  const shiftDate = shiftDateIn(tz);
  const lockKey = `lock:shift:${opts.branchId}:${opts.shiftDefId}:${shiftDate}:${testCell}`;

  return withLock(lockKey, async () => {
    const ada = await cariShift(ss, opts.shiftDefId, shiftDate, testCell);
    if (ada && ada["id"]) throw new ShiftSudahAda(ada["id"]);

    const def = await repos["ShiftDefinitions"].get(opts.shiftDefId);
    if (!def || def["is_active"] !== "TRUE") throw new Error("definisi shift tidak aktif");
    const now = nowIso();
    const wall = wallTimeIn(tz);
    const cross = def["crosses_midnight"] === "TRUE";
    const outside = !diDalamJam(def["start_time"], def["end_time"], cross, wall);

    const tolDefault = await getIntSetting("tolerance_default_minutes", 15);
    const weekday = weekdayIn(tz, shiftDate);
    const cats = await valuesGet(ss, "SopCategories!A2:I100000");
    const myCats = cats
      .filter((r) => r[1] === opts.shiftDefId && r[4] === "TRUE")
      .map((r) => ({ id: r[0], name: r[2], sort: Number(r[3] ?? "0") }))
      .sort((a, b) => a.sort - b.sort);
    const pts = await valuesGet(ss, "ChecklistPoints!A2:P100000");
    const categories: SnapshotCategory[] = myCats.map((c) => {
      const points: SnapshotPoint[] = pts
        .filter((r) => r[1] === c.id && r[12] === "TRUE")
        .filter((r) => {
          const ad = (r[8] ?? "").trim();
          if (!ad) return true;
          return ad.split(",").map((s) => Number(s.trim())).includes(weekday);
        })
        .map((r) => ({
          point_ref: r[0],
          title: r[2] ?? "",
          instruction: r[3] ?? "",
          input_type: r[4] ?? "centang",
          is_required: r[5] === "TRUE",
          target_time: r[6] ?? "",
          tolerance_minutes: r[7] === "" ? null : Number(r[7]),
          active_days: r[8] ?? "",
          number_min: r[9] === "" ? null : Number(r[9]),
          number_max: r[10] === "" ? null : Number(r[10]),
          sort_order: Number(r[11] ?? "0"),
        }))
        .sort((a, b) => a.sort_order - b.sort_order);
      return { id: c.id, name: c.name, sort_order: c.sort, points };
    });

    const hf = await valuesGet(ss, "HandoverFields!A2:J100000");
    const handoverFields = hf
      .filter((r) => r[1] === opts.shiftDefId && r[7] === "TRUE")
      .map((r) => ({
        id: r[0],
        label: r[2] ?? "",
        field_type: r[3] ?? "teks",
        options: r[4] ? (JSON.parse(r[4]) as string[]) : null,
        is_required: r[5] === "TRUE",
        sort_order: Number(r[6] ?? "0"),
      }))
      .sort((a, b) => a.sort_order - b.sort_order);

    const doc: SnapshotDoc = {
      v: 1,
      shift: {
        id: opts.shiftDefId,
        name: def["name"] ?? "",
        start_time: def["start_time"] ?? "",
        end_time: def["end_time"] ?? "",
        crosses_midnight: cross,
      },
      settings: { tolerance_default_minutes: tolDefault, timezone: tz },
      categories,
      handover_fields: handoverFields,
    };
    const { json, hash } = snapshotHash(doc);
    const b64 = gzipSync(Buffer.from(json, "utf8")).toString("base64");
    const shiftId = newId();
    let cell = b64;
    if (b64.length > 45000) {
      for (let i = 0; i < b64.length; i += 45000) {
        await repos["Snapshots"].append({
          id: newId(),
          shift_instance_id: shiftId,
          part_no: String(Math.floor(i / 45000)),
          chunk: b64.slice(i, i + 45000),
          created_at: now,
        });
      }
      cell = `ref:${shiftId}`;
    }

    const month = monthOf(shiftDate);
    await repos["ShiftInstances"].append({
      id: shiftId,
      shift_definition_id: opts.shiftDefId,
      shift_date: shiftDate,
      tab_month: month,
      status: "berjalan",
      pj_user_id: opts.userId,
      opened_by: opts.userId,
      opened_at: now,
      opened_outside_hours: outside ? "TRUE" : "FALSE",
      closed_at: "",
      closed_by: "",
      close_type: "",
      force_close_reason: "",
      is_incomplete: "FALSE",
      no_incident_confirmed: "FALSE",
      void_reason: "",
      void_by: "",
      void_at: "",
      is_test: testCell,
      snapshot_encoding: "gzip_b64",
      template_snapshot: cell,
      snapshot_hash: hash,
      created_at: now,
      updated_at: now,
      version: "1",
    });
    await repos["Participants"].append({
      id: newId(),
      shift_instance_id: shiftId,
      user_id: opts.userId,
      first_action_at: now,
      first_action_type: "buka_shift",
      created_at: now,
    });
    await cacheSet(`shift:${opts.branchId}:${opts.shiftDefId}:${shiftDate}:${testCell}`, shiftId);
    return { shiftId, shiftDate, openedOutsideHours: outside, joined: false };
  });
}

export async function gabungShift(opts: {
  branchId: string;
  shiftId: string;
  userId: string;
}): Promise<{ sudah: boolean }> {
  const { ss, row } = await bacaShiftRow(opts.branchId, opts.shiftId);
  if (row["status"] !== "berjalan") throw new Error("shift tidak berjalan");
  return withLock(`lock:gabung:${opts.shiftId}:${opts.userId}`, async () => {
    const hit = await valuesGet(ss, "Participants!A2:F100000");
    if (hit.some((r) => r[1] === opts.shiftId && r[2] === opts.userId)) return { sudah: true };
    const now = nowIso();
    await branchRepos(ss)["Participants"].append({
      id: newId(),
      shift_instance_id: opts.shiftId,
      user_id: opts.userId,
      first_action_at: now,
      first_action_type: "saya_bertugas",
      created_at: now,
    });
    return { sudah: false };
  });
}

export async function sayaBertugas(opts: {
  branchId: string;
  shiftId: string;
  userId: string;
}): Promise<{ sudah: boolean }> {
  return gabungShift(opts);
}

// Peserta tercatat pada aksi pertama (BR-07). Dipakai route checklist.
export async function pastikanPesertaAksi(
  ss: string,
  shiftId: string,
  userId: string,
  tipe: "centang" | "isi" | "skip" | "incident",
): Promise<void> {
  await withLock(`lock:gabung:${shiftId}:${userId}`, async () => {
    const hit = await valuesGet(ss, "Participants!A2:F100000");
    if (hit.some((r) => r[1] === shiftId && r[2] === userId)) return;
    const now = nowIso();
    await branchRepos(ss)["Participants"].append({
      id: newId(),
      shift_instance_id: shiftId,
      user_id: userId,
      first_action_at: now,
      first_action_type: tipe,
      created_at: now,
    });
  });
}

export async function daftarPeserta(
  branchId: string,
  shiftId: string,
): Promise<Array<{ user_id: string; nama: string; first_action_at: string; first_action_type: string }>> {
  const { ss } = await bacaShiftRow(branchId, shiftId);
  const hit = (await valuesGet(ss, "Participants!A2:F100000")).filter((r) => r[1] === shiftId);
  const reg = registryId() as string;
  const urepo = new SheetRepo(reg, "Users", REGISTRY_HEADERS["Users"]);
  const out: Array<{ user_id: string; nama: string; first_action_at: string; first_action_type: string }> = [];
  for (const r of hit) {
    const u = await urepo.get(r[2] ?? "");
    out.push({
      user_id: r[2] ?? "",
      nama: u?.["name"] ?? "",
      first_action_at: r[3] ?? "",
      first_action_type: r[4] ?? "",
    });
  }
  return out;
}

export async function namaPengguna(userId: string): Promise<string> {
  const reg = registryId();
  if (!reg) return "";
  const u = await new SheetRepo(reg, "Users", REGISTRY_HEADERS["Users"]).get(userId);
  return u?.["name"] ?? "";
}

export interface RingkasanShift {
  row: Record<string, string>;
  snapshot: SnapshotDoc;
  entries: Record<string, string>[];
  peserta: Array<{ user_id: string; nama: string; first_action_at: string; first_action_type: string }>;
  progress: { wajib_total: number; wajib_selesai: number; total: number; selesai: number };
}

export async function bacaShift(branchId: string, shiftId: string): Promise<RingkasanShift> {
  const { ss, row } = await bacaShiftRow(branchId, shiftId);
  const snapshot = await readSnapshot(ss, row);
  await ensureMonthlyTab(ss, "Entries", row["tab_month"]).catch(() => undefined);
  const tab = monthlyTabName("Entries", row["tab_month"]);
  const header = MONTHLY_HEADERS["Entries"];
  const rows = await valuesGet(ss, `${tab}!A2:O100000`).catch(() => [] as string[][]);
  const entries = rows
    .filter((r) => r[1] === shiftId)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
  const byPoint = new Map(entries.map((e) => [e["point_ref"], e]));
  let wajibTotal = 0;
  let wajibSelesai = 0;
  let total = 0;
  let selesai = 0;
  for (const c of snapshot.categories) {
    for (const p of c.points) {
      total++;
      const e = byPoint.get(p.point_ref);
      const done = e !== undefined && (e["state"] === "selesai" || e["state"] === "skip");
      if (done) selesai++;
      if (p.is_required) {
        wajibTotal++;
        if (done) wajibSelesai++;
      }
    }
  }
  const peserta = await daftarPeserta(branchId, shiftId);
  return {
    row,
    snapshot,
    entries,
    peserta,
    progress: { wajib_total: wajibTotal, wajib_selesai: wajibSelesai, total, selesai },
  };
}

export async function daftarBerjalan(
  branchId: string,
  sertakanUji: boolean,
): Promise<Array<{ id: string; shift_definition_id: string; shift_date: string; pj_user_id: string }>> {
  const ss = await resolveBranch(branchId);
  const rows = await valuesGet(ss, "ShiftInstances!A2:Z100000");
  const iDef = SI.indexOf("shift_definition_id");
  const iDate = SI.indexOf("shift_date");
  const iStatus = SI.indexOf("status");
  const iPj = SI.indexOf("pj_user_id");
  const iTest = SI.indexOf("is_test");
  const out: Array<{ id: string; shift_definition_id: string; shift_date: string; pj_user_id: string }> = [];
  for (const r of rows) {
    if (r[iStatus] !== "berjalan") continue;
    if (!sertakanUji && r[iTest] === "TRUE") continue;
    out.push({
      id: r[0] ?? "",
      shift_definition_id: r[iDef] ?? "",
      shift_date: r[iDate] ?? "",
      pj_user_id: r[iPj] ?? "",
    });
  }
  return out;
}

export async function bacaCacheShift(
  branchId: string,
  defId: string,
  date: string,
  isTest: string,
): Promise<string | null> {
  return cacheGet(`shift:${branchId}:${defId}:${date}:${isTest}`);
}
