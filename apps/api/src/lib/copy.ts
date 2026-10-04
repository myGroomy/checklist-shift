import { BRANCH_TEMPLATE_HEADERS, newId, nowIso } from "@checklist-shift/shared";
import { SheetRepo } from "./repo.js";
import { resolveBranch } from "./branch.js";
import { valuesGet, valuesAppendMany } from "./sheets.js";

// Salin template cabang→cabang / shift→shift (ADM-BR-02, ADM-SH-03, ADM-CK-02, ADM-HO-03).
// Selalu membuat baris BARU ber-ID ULID baru; relasi dijaga:
// kategori lama -> kategori baru, kategori baru -> point baru, shift lama -> field baru.
// BR-40: tidak ada hapus; salinan bersifat mandiri (bukan tautan).

function repo(ss: string, tab: string): SheetRepo {
  return new SheetRepo(ss, tab, BRANCH_TEMPLATE_HEADERS[tab]);
}

async function rowsByCol(
  ss: string,
  tab: string,
  header: string[],
  colIdx: number,
  want: string,
): Promise<Array<Record<string, string>>> {
  const all = await valuesGet(ss, `${tab}!A2:Z10000`);
  const out: Array<Record<string, string>> = [];
  for (const r of all) {
    if ((r[colIdx] ?? "") !== want) continue;
    out.push(Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
  }
  return out;
}

async function appendRows(ss: string, tab: string, objs: Array<Record<string, string>>): Promise<void> {
  if (objs.length === 0) return;
  const header = BRANCH_TEMPLATE_HEADERS[tab];
  const r = repo(ss, tab);
  if (!(await r.headerOk())) throw new Error(`header tab ${tab} tidak sesuai skema`);
  await valuesAppendMany(ss, `${tab}!A:Z`, objs.map((o) => header.map((h) => o[h] ?? "")));
}

// Salin seluruh template satu cabang ke cabang lain. Mengembalikan jumlah per tab.
export async function copyBranchTemplate(
  sumberBranchId: string,
  targetBranchId: string,
): Promise<{ shift: number; kategori: number; point: number; field: number }> {
  const src = await resolveBranch(sumberBranchId);
  const dst = await resolveBranch(targetBranchId);
  const now = nowIso();
  const H = BRANCH_TEMPLATE_HEADERS;

  const shifts = await rowsByCol(src, "ShiftDefinitions", H["ShiftDefinitions"], 6, "TRUE");
  const shiftMap = new Map<string, string>();
  const shiftRows = shifts.map((s) => {
    const id = newId();
    shiftMap.set(s["id"], id);
    return {
      id, name: s["name"], start_time: s["start_time"], end_time: s["end_time"],
      crosses_midnight: s["crosses_midnight"], sort_order: s["sort_order"], is_active: "TRUE",
      created_at: now, updated_at: now, version: "1",
    };
  });

  const catRows: Array<Record<string, string>> = [];
  const catMap = new Map<string, string>();
  let points = 0;
  const pointRows: Array<Record<string, string>> = [];
  for (const s of shifts) {
    const cats = await rowsByCol(src, "SopCategories", H["SopCategories"], 1, s["id"]);
    for (const k of cats) {
      if (k["is_active"] !== "TRUE") continue;
      const kid = newId();
      catMap.set(k["id"], kid);
      catRows.push({
        id: kid, shift_definition_id: shiftMap.get(s["id"]) ?? "", name: k["name"],
        sort_order: k["sort_order"], is_active: "TRUE",
        created_at: now, updated_at: now, version: "1",
      });
      const pts = await rowsByCol(src, "ChecklistPoints", H["ChecklistPoints"], 1, k["id"]);
      for (const t of pts) {
        if (t["is_active"] !== "TRUE") continue;
        points++;
        pointRows.push({
          id: newId(), sop_category_id: kid, title: t["title"], instruction: t["instruction"],
          input_type: t["input_type"], is_required: t["is_required"], target_time: t["target_time"],
          tolerance_minutes: t["tolerance_minutes"], active_days: t["active_days"],
          number_min: t["number_min"], number_max: t["number_max"],
          sort_order: t["sort_order"], is_active: "TRUE",
          created_at: now, updated_at: now, version: "1",
        });
      }
    }
  }

  const fieldRows: Array<Record<string, string>> = [];
  for (const s of shifts) {
    const flds = await rowsByCol(src, "HandoverFields", H["HandoverFields"], 1, s["id"]);
    for (const f of flds) {
      if (f["is_active"] !== "TRUE") continue;
      fieldRows.push({
        id: newId(), shift_definition_id: shiftMap.get(s["id"]) ?? "", label: f["label"],
        field_type: f["field_type"], options: f["options"], is_required: f["is_required"],
        sort_order: f["sort_order"], is_active: "TRUE",
        created_at: now, updated_at: now, version: "1",
      });
    }
  }

  await appendRows(dst, "ShiftDefinitions", shiftRows);
  await appendRows(dst, "SopCategories", catRows);
  await appendRows(dst, "ChecklistPoints", pointRows);
  await appendRows(dst, "HandoverFields", fieldRows);
  return { shift: shiftRows.length, kategori: catRows.length, point: points, field: fieldRows.length };
}

// Duplikat satu definisi shift (dalam cabang yang sama atau antar cabang).
// name bisa dioverride; default nama lama + " (salinan)".
export async function duplicateShiftDefinition(
  sumberBranchId: string,
  shiftId: string,
  targetBranchId: string,
  nameOverride?: string,
): Promise<{ shift_id: string; kategori: number; point: number; field: number }> {
  const src = await resolveBranch(sumberBranchId);
  const dst = await resolveBranch(targetBranchId);
  const now = nowIso();
  const H = BRANCH_TEMPLATE_HEADERS;

  const srcShift = await repo(src, "ShiftDefinitions").get(shiftId);
  if (!srcShift || !srcShift["id"]) throw new Error("definisi shift tidak ditemukan");
  const nid = newId();
  await appendRows(dst, "ShiftDefinitions", [{
    id: nid,
    name: (nameOverride ?? `${srcShift["name"]} (salinan)`).slice(0, 100),
    start_time: srcShift["start_time"], end_time: srcShift["end_time"],
    crosses_midnight: srcShift["crosses_midnight"], sort_order: srcShift["sort_order"],
    is_active: "TRUE", created_at: now, updated_at: now, version: "1",
  }]);

  const cats = await rowsByCol(src, "SopCategories", H["SopCategories"], 1, shiftId);
  const catRows: Array<Record<string, string>> = [];
  const catMap = new Map<string, string>();
  for (const k of cats) {
    if (k["is_active"] !== "TRUE") continue;
    const kid = newId();
    catMap.set(k["id"], kid);
    catRows.push({
      id: kid, shift_definition_id: nid, name: k["name"],
      sort_order: k["sort_order"], is_active: "TRUE",
      created_at: now, updated_at: now, version: "1",
    });
  }
  await appendRows(dst, "SopCategories", catRows);

  const pointRows: Array<Record<string, string>> = [];
  for (const k of cats) {
    const kid = catMap.get(k["id"]);
    if (!kid) continue;
    const pts = await rowsByCol(src, "ChecklistPoints", H["ChecklistPoints"], 1, k["id"]);
    for (const t of pts) {
      if (t["is_active"] !== "TRUE") continue;
      pointRows.push({
        id: newId(), sop_category_id: kid, title: t["title"], instruction: t["instruction"],
        input_type: t["input_type"], is_required: t["is_required"], target_time: t["target_time"],
        tolerance_minutes: t["tolerance_minutes"], active_days: t["active_days"],
        number_min: t["number_min"], number_max: t["number_max"],
        sort_order: t["sort_order"], is_active: "TRUE",
        created_at: now, updated_at: now, version: "1",
      });
    }
  }
  await appendRows(dst, "ChecklistPoints", pointRows);

  const flds = await rowsByCol(src, "HandoverFields", H["HandoverFields"], 1, shiftId);
  const fieldRows = flds
    .filter((f) => f["is_active"] === "TRUE")
    .map((f) => ({
      id: newId(), shift_definition_id: nid, label: f["label"],
      field_type: f["field_type"], options: f["options"], is_required: f["is_required"],
      sort_order: f["sort_order"], is_active: "TRUE",
      created_at: now, updated_at: now, version: "1",
    }));
  await appendRows(dst, "HandoverFields", fieldRows);
  return { shift_id: nid, kategori: catRows.length, point: pointRows.length, field: fieldRows.length };
}

// Duplikat satu checklist point dalam kategori yang sama.
export async function duplicatePoint(branchId: string, pointId: string): Promise<string> {
  const ss = await resolveBranch(branchId);
  const r = repo(ss, "ChecklistPoints");
  const src = await r.get(pointId);
  if (!src || !src["id"]) throw new Error("butir tidak ditemukan");
  const now = nowIso();
  const nid = newId();
  const H = BRANCH_TEMPLATE_HEADERS["ChecklistPoints"];
  const obj: Record<string, string> = {};
  for (const h of H) obj[h] = src[h] ?? "";
  obj["id"] = nid;
  obj["title"] = `${src["title"]} (salinan)`.slice(0, 300);
  obj["sort_order"] = String(Number(src["sort_order"] || "0") + 1);
  obj["is_active"] = "TRUE";
  obj["created_at"] = now;
  obj["updated_at"] = now;
  obj["version"] = "1";
  await appendRows(ss, "ChecklistPoints", [obj]);
  return nid;
}
