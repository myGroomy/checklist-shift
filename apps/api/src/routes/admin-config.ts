import { Hono } from "hono";
import {
  BRANCH_TEMPLATE_HEADERS,
  ChecklistPointCreate,
  ChecklistPointPatch,
  HandoverFieldCreate,
  HandoverFieldPatch,
  IncidentCategoryCreate,
  IncidentCategoryPatch,
  KNOWN_SETTINGS,
  OrderBody,
  REGISTRY_HEADERS,
  SettingPut,
  ShiftDefCreate,
  ShiftDefPatch,
  SopCategoryCreate,
  SopCategoryPatch,
  newId,
  nowIso,
  shiftDateIn,
  toApiError,
} from "@checklist-shift/shared";
import { registryId } from "../lib/env.js";
import { SheetRepo } from "../lib/repo.js";
import { valuesGet } from "../lib/sheets.js";
import { auditAppend, type AuditEntry } from "../lib/audit.js";
import { ensureMonthlyTab } from "../lib/monthly.js";
import { resolveBranch } from "../lib/branch.js";
import { duplicatePoint, duplicateShiftDefinition } from "../lib/copy.js";
import { adminOnly, requireAuth, type AuthEnv } from "../lib/authz.js";

const adminConfig = new Hono<AuthEnv>();
adminConfig.use(requireAuth, adminOnly);

// Audit perubahan template ke AuditLog bulan berjalan di spreadsheet cabang
// (DATABASE_SCHEMA §5.5, §11; ADM-CK-06 riwayat versi template).
export async function auditCabang(
  spreadsheetId: string,
  branchId: string,
  entry: AuditEntry,
): Promise<void> {
  const reg = registryId() as string;
  const rows = await valuesGet(reg, "Branches!A2:E10000");
  const tz = rows.find((r) => r[0] === branchId)?.[4] || "Asia/Jakarta";
  const month = shiftDateIn(tz).slice(0, 7);
  const tab = await ensureMonthlyTab(spreadsheetId, "AuditLog", month);
  await auditAppend(spreadsheetId, tab, nowIso(), { ...entry, branch_id: branchId });
}

function branchRepo(tab: string): SheetRepo {
  const id = registryId();
  if (!id) throw new Error("env registry belum lengkap");
  return new SheetRepo(id, tab, REGISTRY_HEADERS[tab]);
}

function ssRepo(ss: string, tab: string): SheetRepo {
  return new SheetRepo(ss, tab, BRANCH_TEMPLATE_HEADERS[tab]);
}

const cell = (b: boolean): string => (b ? "TRUE" : "FALSE");

async function listBy(ss: string, tab: string, colIdx: number, want: string) {
  const H = BRANCH_TEMPLATE_HEADERS[tab];
  const all = await valuesGet(ss, `${tab}!A2:Z10000`);
  return all
    .filter((r) => r[0] && (r[colIdx] ?? "") === want)
    .map((r) => Object.fromEntries(H.map((h, i) => [h, r[i] ?? ""])));
}

async function nextSort(ss: string, tab: string, colIdx: number, want: string): Promise<number> {
  const rows = await listBy(ss, tab, colIdx, want);
  let max = 0;
  for (const r of rows) max = Math.max(max, Number(r["sort_order"]) || 0);
  return max + 1;
}

async function writeAudit(
  ss: string, branchId: string, actor: string, action: string,
  objectType: string, objectId: string, before: unknown, after: unknown, reason?: string,
): Promise<void> {
  await auditCabang(ss, branchId, {
    actor_id: actor, action, object_type: objectType, object_id: objectId,
    before: before === undefined ? "" : JSON.stringify(before),
    after: after === undefined ? "" : JSON.stringify(after),
    reason,
  }).catch(() => undefined);
}

// ---------- Definisi shift ----------

adminConfig.get("/:branchId/shift", async (c) => {
  const ss = await resolveBranch(c.req.param("branchId")).catch(() => null);
  if (!ss) return c.json(toApiError("tidak_ada", "Cabang tidak ditemukan."), 404);
  const H = BRANCH_TEMPLATE_HEADERS["ShiftDefinitions"];
  const all = await valuesGet(ss, "ShiftDefinitions!A2:Z1000");
  return c.json({
    shift: all.filter((r) => r[0]).map((r) => Object.fromEntries(H.map((h, i) => [h, r[i] ?? ""]))),
  });
});

adminConfig.post("/:branchId/shift", async (c) => {
  const p = c.get("principal");
  const branchId = c.req.param("branchId");
  const ss = await resolveBranch(branchId).catch(() => null);
  if (!ss) return c.json(toApiError("tidak_ada", "Cabang tidak ditemukan."), 404);
  const parsed = ShiftDefCreate.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(toApiError("input_salah", "Data shift tidak valid."), 400);
  const b = parsed.data;
  const id = newId();
  const now = nowIso();
  const obj = {
    id, name: b.name.trim(), start_time: b.start_time, end_time: b.end_time,
    crosses_midnight: cell(b.crosses_midnight ?? b.end_time <= b.start_time),
    sort_order: String(b.sort_order ?? await nextSort(ss, "ShiftDefinitions", 6, "TRUE")),
    is_active: "TRUE", created_at: now, updated_at: now, version: "1",
  };
  await ssRepo(ss, "ShiftDefinitions").append(obj);
  await writeAudit(ss, branchId, p.userId, "template.shift_tambah", "shift_definition", id, "", obj);
  return c.json({ ok: true, id }, 201);
});

adminConfig.patch("/:branchId/shift/:id", async (c) => {
  const p = c.get("principal");
  const branchId = c.req.param("branchId");
  const ss = await resolveBranch(branchId).catch(() => null);
  if (!ss) return c.json(toApiError("tidak_ada", "Cabang tidak ditemukan."), 404);
  const parsed = ShiftDefPatch.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(toApiError("input_salah", "Data shift tidak valid."), 400);
  const b = parsed.data;
  const id = c.req.param("id");
  const repo = ssRepo(ss, "ShiftDefinitions");
  const cur = await repo.get(id);
  if (!cur || !cur["id"]) return c.json(toApiError("tidak_ada", "Definisi shift tidak ditemukan."), 404);
  const patch: Record<string, string> = { updated_at: nowIso() };
  if (b.name !== undefined) patch["name"] = b.name.trim();
  if (b.start_time !== undefined) patch["start_time"] = b.start_time;
  if (b.end_time !== undefined) patch["end_time"] = b.end_time;
  if (b.crosses_midnight !== undefined) patch["crosses_midnight"] = cell(b.crosses_midnight);
  if (b.sort_order !== undefined) patch["sort_order"] = String(b.sort_order);
  if (b.is_active !== undefined) patch["is_active"] = cell(b.is_active);
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, cur[k] ?? ""]));
  await repo.update(id, patch);
  await writeAudit(ss, branchId, p.userId, "template.shift_ubah", "shift_definition", id, before, patch);
  return c.json({ ok: true });
});

adminConfig.post("/:branchId/shift/:id/duplikat", async (c) => {
  const p = c.get("principal");
  const branchId = c.req.param("branchId");
  const ss = await resolveBranch(branchId).catch(() => null);
  if (!ss) return c.json(toApiError("tidak_ada", "Cabang tidak ditemukan."), 404);
  const body = (await c.req.json().catch(() => ({}))) as { name?: string };
  const name = typeof body.name === "string" && body.name.trim().length >= 2
    ? body.name.trim().slice(0, 100) : undefined;
  try {
    const hasil = await duplicateShiftDefinition(branchId, c.req.param("id"), branchId, name);
    await writeAudit(ss, branchId, p.userId, "template.shift_duplikat", "shift_definition",
      hasil.shift_id, { dari: c.req.param("id") }, hasil);
    return c.json({ ok: true, ...hasil }, 201);
  } catch {
    return c.json(toApiError("gagal", "Duplikasi shift gagal."), 500);
  }
});

// Salin satu definisi shift dari cabang lain (ADM-SH-03, ADM-CK-02, ADM-HO-03).
adminConfig.post("/:branchId/shift/salin", async (c) => {
  const p = c.get("principal");
  const branchId = c.req.param("branchId");
  const ss = await resolveBranch(branchId).catch(() => null);
  if (!ss) return c.json(toApiError("tidak_ada", "Cabang tidak ditemukan."), 404);
  const body = (await c.req.json().catch(() => ({}))) as {
    sumber_branch_id?: string; sumber_shift_id?: string; name?: string;
  };
  if (!body.sumber_branch_id || !body.sumber_shift_id) {
    return c.json(toApiError("input_salah", "Cabang sumber dan shift sumber wajib diisi."), 400);
  }
  try {
    await resolveBranch(body.sumber_branch_id);
    const hasil = await duplicateShiftDefinition(
      body.sumber_branch_id, body.sumber_shift_id, branchId,
      typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 100) : undefined,
    );
    await writeAudit(ss, branchId, p.userId, "template.shift_salin", "shift_definition",
      hasil.shift_id, { dari_cabang: body.sumber_branch_id, dari_shift: body.sumber_shift_id }, hasil);
    return c.json({ ok: true, ...hasil }, 201);
  } catch {
    return c.json(toApiError("gagal", "Penyalinan shift gagal."), 500);
  }
});

// ---------- Kategori SOP ----------

adminConfig.get("/:branchId/shift/:shiftId/kategori", async (c) => {
  const ss = await resolveBranch(c.req.param("branchId")).catch(() => null);
  if (!ss) return c.json(toApiError("tidak_ada", "Cabang tidak ditemukan."), 404);
  return c.json({ kategori: await listBy(ss, "SopCategories", 1, c.req.param("shiftId")) });
});

adminConfig.post("/:branchId/shift/:shiftId/kategori", async (c) => {
  const p = c.get("principal");
  const branchId = c.req.param("branchId");
  const shiftId = c.req.param("shiftId");
  const ss = await resolveBranch(branchId).catch(() => null);
  if (!ss) return c.json(toApiError("tidak_ada", "Cabang tidak ditemukan."), 404);
  const parsed = SopCategoryCreate.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(toApiError("input_salah", "Data kategori tidak valid."), 400);
  const shift = await ssRepo(ss, "ShiftDefinitions").get(shiftId);
  if (!shift || !shift["id"]) return c.json(toApiError("tidak_ada", "Definisi shift tidak ditemukan."), 404);
  const id = newId();
  const now = nowIso();
  const obj = {
    id, shift_definition_id: shiftId, name: parsed.data.name.trim(),
    sort_order: String(parsed.data.sort_order ?? await nextSort(ss, "SopCategories", 1, shiftId)),
    is_active: "TRUE", created_at: now, updated_at: now, version: "1",
  };
  await ssRepo(ss, "SopCategories").append(obj);
  await writeAudit(ss, branchId, p.userId, "template.kategori_tambah", "sop_category", id, "", obj);
  return c.json({ ok: true, id }, 201);
});

adminConfig.patch("/:branchId/kategori/:id", async (c) => {
  const p = c.get("principal");
  const branchId = c.req.param("branchId");
  const ss = await resolveBranch(branchId).catch(() => null);
  if (!ss) return c.json(toApiError("tidak_ada", "Cabang tidak ditemukan."), 404);
  const parsed = SopCategoryPatch.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(toApiError("input_salah", "Data kategori tidak valid."), 400);
  const b = parsed.data;
  const id = c.req.param("id");
  const repo = ssRepo(ss, "SopCategories");
  const cur = await repo.get(id);
  if (!cur || !cur["id"]) return c.json(toApiError("tidak_ada", "Kategori tidak ditemukan."), 404);
  const patch: Record<string, string> = { updated_at: nowIso() };
  if (b.name !== undefined) patch["name"] = b.name.trim();
  if (b.sort_order !== undefined) patch["sort_order"] = String(b.sort_order);
  if (b.is_active !== undefined) patch["is_active"] = cell(b.is_active);
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, cur[k] ?? ""]));
  await repo.update(id, patch);
  await writeAudit(ss, branchId, p.userId, "template.kategori_ubah", "sop_category", id, before, patch);
  return c.json({ ok: true });
});

adminConfig.post("/:branchId/kategori/urut", async (c) => {
  const p = c.get("principal");
  const branchId = c.req.param("branchId");
  const ss = await resolveBranch(branchId).catch(() => null);
  if (!ss) return c.json(toApiError("tidak_ada", "Cabang tidak ditemukan."), 404);
  const parsed = OrderBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(toApiError("input_salah", "Daftar urutan tidak valid."), 400);
  const repo = ssRepo(ss, "SopCategories");
  const before: Record<string, string> = {};
  for (const [i, kid] of parsed.data.urutan.entries()) {
    const cur = await repo.get(kid);
    if (!cur || !cur["id"]) return c.json(toApiError("tidak_ada", "Ada kategori yang tidak ditemukan."), 404);
    before[kid] = cur["sort_order"] ?? "";
    await repo.update(kid, { sort_order: String(i + 1), updated_at: nowIso() });
  }
  await writeAudit(ss, branchId, p.userId, "template.kategori_urut", "sop_category", "",
    before, Object.fromEntries(parsed.data.urutan.map((k, i) => [k, String(i + 1)])));
  return c.json({ ok: true });
});

// ---------- Checklist point ----------

adminConfig.get("/:branchId/kategori/:katId/point", async (c) => {
  const ss = await resolveBranch(c.req.param("branchId")).catch(() => null);
  if (!ss) return c.json(toApiError("tidak_ada", "Cabang tidak ditemukan."), 404);
  return c.json({ point: await listBy(ss, "ChecklistPoints", 1, c.req.param("katId")) });
});

function pointCells(b: {
  target_time?: string | null; tolerance_minutes?: number | null;
  active_days?: string | null; number_min?: number | null; number_max?: number | null;
}): Record<string, string> {
  return {
    target_time: b.target_time ?? "",
    tolerance_minutes: b.tolerance_minutes === undefined || b.tolerance_minutes === null ? "" : String(b.tolerance_minutes),
    active_days: b.active_days ?? "",
    number_min: b.number_min === undefined || b.number_min === null ? "" : String(b.number_min),
    number_max: b.number_max === undefined || b.number_max === null ? "" : String(b.number_max),
  };
}

adminConfig.post("/:branchId/kategori/:katId/point", async (c) => {
  const p = c.get("principal");
  const branchId = c.req.param("branchId");
  const katId = c.req.param("katId");
  const ss = await resolveBranch(branchId).catch(() => null);
  if (!ss) return c.json(toApiError("tidak_ada", "Cabang tidak ditemukan."), 404);
  const parsed = ChecklistPointCreate.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(toApiError("input_salah", "Data butir tidak valid."), 400);
  const b = parsed.data;
  if (b.number_min !== undefined && b.number_max !== undefined && b.number_min > b.number_max) {
    return c.json(toApiError("input_salah", "Rentang angka tidak valid."), 400);
  }
  const kat = await ssRepo(ss, "SopCategories").get(katId);
  if (!kat || !kat["id"]) return c.json(toApiError("tidak_ada", "Kategori tidak ditemukan."), 404);
  const id = newId();
  const now = nowIso();
  const obj = {
    id, sop_category_id: katId, title: b.title.trim(), instruction: b.instruction?.trim() ?? "",
    input_type: b.input_type, is_required: cell(b.is_required ?? true),
    ...pointCells(b),
    sort_order: String(b.sort_order ?? await nextSort(ss, "ChecklistPoints", 1, katId)),
    is_active: "TRUE", created_at: now, updated_at: now, version: "1",
  };
  await ssRepo(ss, "ChecklistPoints").append(obj);
  await writeAudit(ss, branchId, p.userId, "template.point_tambah", "checklist_point", id, "", obj);
  return c.json({ ok: true, id }, 201);
});

adminConfig.patch("/:branchId/point/:id", async (c) => {
  const p = c.get("principal");
  const branchId = c.req.param("branchId");
  const ss = await resolveBranch(branchId).catch(() => null);
  if (!ss) return c.json(toApiError("tidak_ada", "Cabang tidak ditemukan."), 404);
  const parsed = ChecklistPointPatch.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(toApiError("input_salah", "Data butir tidak valid."), 400);
  const b = parsed.data;
  const id = c.req.param("id");
  const repo = ssRepo(ss, "ChecklistPoints");
  const cur = await repo.get(id);
  if (!cur || !cur["id"]) return c.json(toApiError("tidak_ada", "Butir tidak ditemukan."), 404);
  const nmin = b.number_min === undefined ? (cur["number_min"] ? Number(cur["number_min"]) : undefined) : (b.number_min ?? undefined);
  const nmax = b.number_max === undefined ? (cur["number_max"] ? Number(cur["number_max"]) : undefined) : (b.number_max ?? undefined);
  if (nmin !== undefined && nmax !== undefined && nmin > nmax) {
    return c.json(toApiError("input_salah", "Rentang angka tidak valid."), 400);
  }
  const patch: Record<string, string> = { updated_at: nowIso() };
  if (b.title !== undefined) patch["title"] = b.title.trim();
  if (b.instruction !== undefined) patch["instruction"] = b.instruction?.trim() ?? "";
  if (b.input_type !== undefined) patch["input_type"] = b.input_type;
  if (b.is_required !== undefined) patch["is_required"] = cell(b.is_required);
  if (b.target_time !== undefined) patch["target_time"] = b.target_time ?? "";
  if (b.tolerance_minutes !== undefined) patch["tolerance_minutes"] = b.tolerance_minutes === null ? "" : String(b.tolerance_minutes);
  if (b.active_days !== undefined) patch["active_days"] = b.active_days ?? "";
  if (b.number_min !== undefined) patch["number_min"] = b.number_min === null ? "" : String(b.number_min);
  if (b.number_max !== undefined) patch["number_max"] = b.number_max === null ? "" : String(b.number_max);
  if (b.sort_order !== undefined) patch["sort_order"] = String(b.sort_order);
  if (b.is_active !== undefined) patch["is_active"] = cell(b.is_active);
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, cur[k] ?? ""]));
  await repo.update(id, patch);
  await writeAudit(ss, branchId, p.userId, "template.point_ubah", "checklist_point", id, before, patch);
  return c.json({ ok: true });
});

adminConfig.post("/:branchId/point/:id/duplikat", async (c) => {
  const p = c.get("principal");
  const branchId = c.req.param("branchId");
  const ss = await resolveBranch(branchId).catch(() => null);
  if (!ss) return c.json(toApiError("tidak_ada", "Cabang tidak ditemukan."), 404);
  try {
    const nid = await duplicatePoint(branchId, c.req.param("id"));
    await writeAudit(ss, branchId, p.userId, "template.point_duplikat", "checklist_point",
      nid, { dari: c.req.param("id") }, { id: nid });
    return c.json({ ok: true, id: nid }, 201);
  } catch {
    return c.json(toApiError("gagal", "Duplikasi butir gagal."), 500);
  }
});

adminConfig.post("/:branchId/point/urut", async (c) => {
  const p = c.get("principal");
  const branchId = c.req.param("branchId");
  const ss = await resolveBranch(branchId).catch(() => null);
  if (!ss) return c.json(toApiError("tidak_ada", "Cabang tidak ditemukan."), 404);
  const parsed = OrderBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(toApiError("input_salah", "Daftar urutan tidak valid."), 400);
  const repo = ssRepo(ss, "ChecklistPoints");
  const seen = new Set<string>();
  const before: Record<string, string> = {};
  for (const pid of parsed.data.urutan) {
    const cur = await repo.get(pid);
    if (!cur || !cur["id"]) return c.json(toApiError("tidak_ada", "Ada butir yang tidak ditemukan."), 404);
    seen.add(cur["sop_category_id"] ?? "");
  }
  if (seen.size !== 1) {
    return c.json(toApiError("input_salah", "Urutan harus dalam satu kategori yang sama."), 400);
  }
  for (const [i, pid] of parsed.data.urutan.entries()) {
    const cur = await repo.get(pid);
    before[pid] = cur?.["sort_order"] ?? "";
    await repo.update(pid, { sort_order: String(i + 1), updated_at: nowIso() });
  }
  await writeAudit(ss, branchId, p.userId, "template.point_urut", "checklist_point", "",
    before, Object.fromEntries(parsed.data.urutan.map((k, i) => [k, String(i + 1)])));
  return c.json({ ok: true });
});

// ---------- Handover field ----------

adminConfig.get("/:branchId/shift/:shiftId/handover", async (c) => {
  const ss = await resolveBranch(c.req.param("branchId")).catch(() => null);
  if (!ss) return c.json(toApiError("tidak_ada", "Cabang tidak ditemukan."), 404);
  return c.json({ field: await listBy(ss, "HandoverFields", 1, c.req.param("shiftId")) });
});

adminConfig.post("/:branchId/shift/:shiftId/handover", async (c) => {
  const p = c.get("principal");
  const branchId = c.req.param("branchId");
  const shiftId = c.req.param("shiftId");
  const ss = await resolveBranch(branchId).catch(() => null);
  if (!ss) return c.json(toApiError("tidak_ada", "Cabang tidak ditemukan."), 404);
  const parsed = HandoverFieldCreate.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(toApiError("input_salah", "Data field tidak valid."), 400);
  const b = parsed.data;
  if (b.field_type === "pilihan" && (!b.options || b.options.length < 2)) {
    return c.json(toApiError("input_salah", "Tipe pilihan butuh minimal 2 opsi."), 400);
  }
  const shift = await ssRepo(ss, "ShiftDefinitions").get(shiftId);
  if (!shift || !shift["id"]) return c.json(toApiError("tidak_ada", "Definisi shift tidak ditemukan."), 404);
  const id = newId();
  const now = nowIso();
  const obj = {
    id, shift_definition_id: shiftId, label: b.label.trim(), field_type: b.field_type,
    options: b.options ? JSON.stringify(b.options) : "",
    is_required: cell(b.is_required ?? false),
    sort_order: String(b.sort_order ?? await nextSort(ss, "HandoverFields", 1, shiftId)),
    is_active: "TRUE", created_at: now, updated_at: now, version: "1",
  };
  await ssRepo(ss, "HandoverFields").append(obj);
  await writeAudit(ss, branchId, p.userId, "template.handover_tambah", "handover_field", id, "", obj);
  return c.json({ ok: true, id }, 201);
});

adminConfig.patch("/:branchId/handover/:id", async (c) => {
  const p = c.get("principal");
  const branchId = c.req.param("branchId");
  const ss = await resolveBranch(branchId).catch(() => null);
  if (!ss) return c.json(toApiError("tidak_ada", "Cabang tidak ditemukan."), 404);
  const parsed = HandoverFieldPatch.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(toApiError("input_salah", "Data field tidak valid."), 400);
  const b = parsed.data;
  const id = c.req.param("id");
  const repo = ssRepo(ss, "HandoverFields");
  const cur = await repo.get(id);
  if (!cur || !cur["id"]) return c.json(toApiError("tidak_ada", "Field tidak ditemukan."), 404);
  const nextType = b.field_type ?? cur["field_type"];
  const nextOpts = b.options === undefined ? cur["options"] : (b.options === null ? "" : JSON.stringify(b.options));
  if (nextType === "pilihan") {
    try {
      const arr = JSON.parse(nextOpts || "[]") as unknown[];
      if (!Array.isArray(arr) || arr.length < 2) throw new Error("opsi kurang");
    } catch {
      return c.json(toApiError("input_salah", "Tipe pilihan butuh minimal 2 opsi."), 400);
    }
  }
  const patch: Record<string, string> = { updated_at: nowIso() };
  if (b.label !== undefined) patch["label"] = b.label.trim();
  if (b.field_type !== undefined) patch["field_type"] = b.field_type;
  if (b.options !== undefined) patch["options"] = nextOpts;
  if (b.is_required !== undefined) patch["is_required"] = cell(b.is_required);
  if (b.sort_order !== undefined) patch["sort_order"] = String(b.sort_order);
  if (b.is_active !== undefined) patch["is_active"] = cell(b.is_active);
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, cur[k] ?? ""]));
  await repo.update(id, patch);
  await writeAudit(ss, branchId, p.userId, "template.handover_ubah", "handover_field", id, before, patch);
  return c.json({ ok: true });
});

adminConfig.post("/:branchId/handover/urut", async (c) => {
  const p = c.get("principal");
  const branchId = c.req.param("branchId");
  const ss = await resolveBranch(branchId).catch(() => null);
  if (!ss) return c.json(toApiError("tidak_ada", "Cabang tidak ditemukan."), 404);
  const parsed = OrderBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(toApiError("input_salah", "Daftar urutan tidak valid."), 400);
  const repo = ssRepo(ss, "HandoverFields");
  const seen = new Set<string>();
  const before: Record<string, string> = {};
  for (const fid of parsed.data.urutan) {
    const cur = await repo.get(fid);
    if (!cur || !cur["id"]) return c.json(toApiError("tidak_ada", "Ada field yang tidak ditemukan."), 404);
    seen.add(cur["shift_definition_id"] ?? "");
  }
  if (seen.size !== 1) {
    return c.json(toApiError("input_salah", "Urutan harus dalam satu shift yang sama."), 400);
  }
  for (const [i, fid] of parsed.data.urutan.entries()) {
    const cur = await repo.get(fid);
    before[fid] = cur?.["sort_order"] ?? "";
    await repo.update(fid, { sort_order: String(i + 1), updated_at: nowIso() });
  }
  await writeAudit(ss, branchId, p.userId, "template.handover_urut", "handover_field", "",
    before, Object.fromEntries(parsed.data.urutan.map((k, i) => [k, String(i + 1)])));
  return c.json({ ok: true });
});

// ---------- Kategori incident (global registry, ADM-IC-01) ----------

adminConfig.get("/kategori-incident", async (c) => {
  const rows = await valuesGet(registryId() as string, "IncidentCategories!A2:F10000");
  const H = REGISTRY_HEADERS["IncidentCategories"];
  return c.json({
    kategori: rows.filter((r) => r[0]).map((r) => Object.fromEntries(H.map((h, i) => [h, r[i] ?? ""]))),
  });
});

async function auditKategori(actor: string, action: string, objectId: string, before: unknown, after: unknown): Promise<void> {
  const reg = registryId() as string;
  await auditAppend(reg, "AuditLog_Global", nowIso(), {
    actor_id: actor, action, object_type: "kategori_incident", object_id: objectId,
    before: before === undefined ? "" : JSON.stringify(before),
    after: after === undefined ? "" : JSON.stringify(after),
  }).catch(() => undefined);
}

adminConfig.post("/kategori-incident", async (c) => {
  const p = c.get("principal");
  const parsed = IncidentCategoryCreate.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(toApiError("input_salah", "Data kategori tidak valid."), 400);
  const reg = registryId() as string;
  const names = await valuesGet(reg, "IncidentCategories!B2:B10000");
  if (names.some((r) => (r[0] ?? "").toLowerCase() === parsed.data.name.trim().toLowerCase())) {
    return c.json(toApiError("nama_dobel", "Nama kategori sudah dipakai."), 409);
  }
  const id = newId();
  const now = nowIso();
  const obj = {
    id, name: parsed.data.name.trim(),
    sort_order: String(parsed.data.sort_order ?? names.length + 1),
    is_active: "TRUE", created_at: now, updated_at: now,
  };
  await branchRepo("IncidentCategories").append(obj);
  await auditKategori(p.userId, "kategori_incident.tambah", id, "", obj);
  return c.json({ ok: true, id }, 201);
});

adminConfig.patch("/kategori-incident/:id", async (c) => {
  const p = c.get("principal");
  const parsed = IncidentCategoryPatch.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(toApiError("input_salah", "Data kategori tidak valid."), 400);
  const b = parsed.data;
  const id = c.req.param("id");
  const repo = branchRepo("IncidentCategories");
  const cur = await repo.get(id);
  if (!cur || !cur["id"]) return c.json(toApiError("tidak_ada", "Kategori tidak ditemukan."), 404);
  if (b.name !== undefined) {
    const reg = registryId() as string;
    const rows = await valuesGet(reg, "IncidentCategories!A2:B10000");
    if (rows.some((r) => r[0] !== id && (r[1] ?? "").toLowerCase() === b.name?.trim().toLowerCase())) {
      return c.json(toApiError("nama_dobel", "Nama kategori sudah dipakai."), 409);
    }
  }
  const patch: Record<string, string> = { updated_at: nowIso() };
  if (b.name !== undefined) patch["name"] = b.name.trim();
  if (b.sort_order !== undefined) patch["sort_order"] = String(b.sort_order);
  if (b.is_active !== undefined) patch["is_active"] = cell(b.is_active);
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, cur[k] ?? ""]));
  await repo.update(id, patch);
  await auditKategori(p.userId, "kategori_incident.ubah", id, before, patch);
  return c.json({ ok: true });
});

// ---------- Pengaturan (PRD §7.11) ----------

adminConfig.get("/pengaturan", async (c) => {
  const reg = registryId() as string;
  const rows = await valuesGet(reg, "Settings!A2:E10000");
  const map = new Map(rows.filter((r) => r[0]).map((r) => [r[0], { value: r[1] ?? "", value_type: r[2] ?? "string" }]));
  return c.json({
    pengaturan: (KNOWN_SETTINGS as readonly string[]).map((k) => ({ key: k, ...(map.get(k) ?? { value: "", value_type: "string" }) })),
  });
});

adminConfig.put("/pengaturan/:key", async (c) => {
  const p = c.get("principal");
  const key = c.req.param("key");
  if (!(KNOWN_SETTINGS as readonly string[]).includes(key)) {
    return c.json(toApiError("kunci_tak_dikenal", "Kunci pengaturan tidak dikenal."), 400);
  }
  const parsed = SettingPut.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(toApiError("input_salah", "Nilai pengaturan tidak valid."), 400);
  const value = parsed.data.value;
  const repo = branchRepo("Settings");
  const cur = await repo.get(key);
  if (!cur || !cur["key"]) return c.json(toApiError("tidak_ada", "Kunci pengaturan belum ada."), 404);
  const t = cur["value_type"];
  if (t === "int" && !/^-?\d+$/.test(value.trim())) {
    return c.json(toApiError("input_salah", "Nilai harus bilangan bulat."), 400);
  }
  if (t === "bool" && value !== "TRUE" && value !== "FALSE") {
    return c.json(toApiError("input_salah", "Nilai harus TRUE atau FALSE."), 400);
  }
  const before = { value: cur["value"] ?? "" };
  await repo.update(key, { value, updated_by: p.userId, updated_at: nowIso() });
  const reg = registryId() as string;
  await auditAppend(reg, "AuditLog_Global", nowIso(), {
    actor_id: p.userId, action: "pengaturan.ubah", object_type: "pengaturan", object_id: key,
    before: JSON.stringify(before), after: JSON.stringify({ value }),
  }).catch(() => undefined);
  return c.json({ ok: true });
});

export default adminConfig;
