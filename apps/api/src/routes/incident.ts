import { Hono } from "hono";
import { z } from "zod";
import {
  BRANCH_TEMPLATE_HEADERS,
  MONTHLY_HEADERS,
  REGISTRY_HEADERS,
  monthlyTabName,
  newId,
  nowIso,
  toApiError,
} from "@checklist-shift/shared";
import { registryId } from "../lib/env.js";
import { SheetRepo } from "../lib/repo.js";
import { ensureMonthlyTab } from "../lib/monthly.js";
import { valuesGet } from "../lib/sheets.js";
import { withLock } from "../lib/lock.js";
import { auditAppend } from "../lib/audit.js";
import { getIntSetting } from "../lib/settings.js";
import {
  appendPhotoRefs,
  fail,
  isCloseError,
  readTabObjects,
  tzParts,
} from "../lib/close.js";
import { adminOnly, requireAuth, type AuthEnv } from "../lib/authz.js";

// Incident Fase 5 (PRD §6.4, skema §5.5): buat + foto (maks 5) + kategori,
// penautan otomatis (jendela 4 jam default), di luar shift, catatan (BR-41:
// isi tak bisa diubah), status oleh admin.
// Mount di "/api": POST /incident, GET /incident/open, GET /incident/:id,
// POST /incident/:id/catatan, PATCH /incident/:id/status, POST /incident/:id/tautkan.

const app = new Hono<AuthEnv>();
// TANPA app.use(): lihat catatan komposisi di routes/ops.ts. Pakai per-route.

function err(c: { json: (b: unknown, s?: number) => Response }, e: unknown): Response {
  if (isCloseError(e)) {
    return c.json(toApiError(e.code, e.message), e.status as 400);
  }
  console.error("[incident]", (e as Error).message);
  return c.json(toApiError("gagal", "Terjadi galat. Coba lagi."), 500);
}

function guardCabang(p: { role: string; branches: string[] }, branchId: string): boolean {
  return p.role === "admin" || p.branches.includes(branchId);
}

async function branchInfo(branchId: string): Promise<{ ss: string; timezone: string }> {
  const row = await new SheetRepo(
    registryId() as string,
    "Branches",
    REGISTRY_HEADERS["Branches"],
  ).get(branchId);
  if (!row || row["is_active"] !== "TRUE") throw fail(404, "cabang_tidak_ada", "Cabang tidak ditemukan.");
  return { ss: row["spreadsheet_id"], timezone: row["timezone"] || "Asia/Jakarta" };
}

async function kategoriAktif(categoryId: string): Promise<string> {
  const row = await new SheetRepo(
    registryId() as string,
    "IncidentCategories",
    REGISTRY_HEADERS["IncidentCategories"],
  ).get(categoryId);
  if (!row || row["is_active"] !== "TRUE") throw fail(400, "kategori_tidak_ada", "Kategori incident tidak dikenal.");
  return row["name"] ?? "";
}

// Penautan otomatis (IN-03): shift berjalan di cabang, atau shift yang baru
// berakhir dalam jendela jam. Keputusan: bila >1 shift berjalan, pilih yang
// opened_at paling akhir; bila tak ada, pilih yang closed_at paling akhir
// dalam jendela. Selain itu outside_shift TRUE + link_source none.
export interface TautanRow {
  id: string;
  status: string;
  opened_at: string;
  closed_at: string;
  is_test: string;
}

export function pilihTautan(
  rows: TautanRow[],
  windowHours: number,
  nowMs: number,
): { shiftId: string; source: "otomatis" } | { shiftId: ""; source: "none" } {
  const berjalan = rows
    .filter((r) => r.status === "berjalan" && r.is_test !== "TRUE")
    .sort((a, b) => b.opened_at.localeCompare(a.opened_at));
  const kandidat = berjalan.length > 0
    ? berjalan
    : rows
      .filter((r) => r.status === "berjalan")
      .sort((a, b) => b.opened_at.localeCompare(a.opened_at));
  if (kandidat[0]) return { shiftId: kandidat[0].id, source: "otomatis" };
  const batas = nowMs - windowHours * 3600000;
  const baruTutup = rows
    .filter((r) => (r.status === "ditutup" || r.status === "ditutup_paksa") && Date.parse(r.closed_at || "") >= batas)
    .sort((a, b) => b.closed_at.localeCompare(a.closed_at));
  if (baruTutup[0]) return { shiftId: baruTutup[0].id, source: "otomatis" };
  return { shiftId: "", source: "none" };
}

async function tautanOtomatis(
  ss: string,
  windowHours: number,
  nowMs: number,
): Promise<{ shiftId: string; source: "otomatis" } | { shiftId: ""; source: "none" }> {
  const all = await readTabObjects(ss, "ShiftInstances");
  return pilihTautan(
    all.map((r) => ({
      id: r["id"], status: r["status"], opened_at: r["opened_at"] || "",
      closed_at: r["closed_at"] || "", is_test: r["is_test"] || "",
    })),
    windowHours,
    nowMs,
  );
}

const BuatBody = z.object({
  branch_id: z.string().length(26),
  category_id: z.string().length(26),
  description: z.string().trim().min(1).max(20000),
  occurred_at: z.string().optional(),
  photo_ids: z.array(z.string()).max(5, "Maksimal 5 foto per incident."),
  severity: z.enum(["rendah", "sedang", "tinggi"]).optional(),
});

// POST /incident — kategori wajib ada+aktif, deskripsi wajib, occurred_at
// default sekarang, maks 5 foto (photo_ids >5 ditolak).
app.post("/incident", requireAuth, async (c) => {
  try {
    const p = c.get("principal");
    const parsed = BuatBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      const isu = parsed.error.issues[0];
      const msg = isu?.code === "too_big" ? "Maksimal 5 foto per incident." : "Isi incident tidak lengkap.";
      return c.json(toApiError("wajib_diisi", msg), 400);
    }
    const body = parsed.data;
    if (!guardCabang(p, body.branch_id)) {
      return c.json(toApiError("di_luar_akses", "Di luar cabang aksesmu."), 403);
    }
    const { ss, timezone } = await branchInfo(body.branch_id);
    await kategoriAktif(body.category_id);
    const occurred = body.occurred_at ?? nowIso();
    if (!Number.isFinite(Date.parse(occurred))) {
      return c.json(toApiError("wajib_diisi", "Waktu kejadian tidak valid."), 400);
    }
    const windowHours = await getIntSetting("incident_link_window_hours", 4);
    const result = await withLock(`lock:incident:${body.branch_id}`, async () => {
      const now = nowIso();
      const link = await tautanOtomatis(ss, windowHours, Date.parse(now));
      const month = tzParts(now, timezone).month;
      const incTab = await ensureMonthlyTab(ss, "Incidents", month);
      const iid = newId();
      const obj: Record<string, string> = {};
      for (const h of MONTHLY_HEADERS["Incidents"]) obj[h] = "";
      obj["id"] = iid;
      obj["shift_instance_id"] = link.shiftId;
      obj["tab_month"] = month;
      obj["category_id"] = body.category_id;
      obj["description"] = body.description;
      obj["occurred_at"] = occurred;
      obj["reported_by"] = p.userId;
      obj["reported_at"] = now;
      obj["status"] = "open";
      obj["outside_shift"] = link.shiftId ? "FALSE" : "TRUE";
      obj["link_source"] = link.source;
      obj["severity"] = body.severity ?? "";
      obj["is_test"] = "FALSE";
      obj["created_at"] = now;
      obj["updated_at"] = now;
      obj["version"] = "1";
      await new SheetRepo(ss, incTab, MONTHLY_HEADERS["Incidents"]).append(obj);
      const idx: Record<string, string> = {
        incident_id: iid,
        tab_month: month,
        status: "open",
        category_id: body.category_id,
        shift_instance_id: link.shiftId,
        outside_shift: link.shiftId ? "FALSE" : "TRUE",
        reported_at: now,
        is_test: "FALSE",
        updated_at: now,
      };
      await new SheetRepo(ss, "IncidentIndex", BRANCH_TEMPLATE_HEADERS["IncidentIndex"]).append(idx);
      await appendPhotoRefs(ss, month, "incident", iid, body.photo_ids, link.shiftId, p.userId);
      return { incident: obj, link };
    });
    return c.json({ ok: true, incident: { id: result.incident["id"], outside_shift: result.incident["outside_shift"], link_source: result.incident["link_source"] } }, 201);
  } catch (e) {
    return err(c, e);
  }
});

// GET /incident/open?branch_id= — via IncidentIndex (tanpa pindai tab bulanan).
app.get("/incident/open", requireAuth, async (c) => {
  try {
    const p = c.get("principal");
    const branchId = c.req.query("branch_id") ?? "";
    if (!branchId) return c.json(toApiError("wajib_diisi", "branch_id wajib diisi."), 400);
    if (!guardCabang(p, branchId)) {
      return c.json(toApiError("di_luar_akses", "Di luar cabang aksesmu."), 403);
    }
    const { ss } = await branchInfo(branchId);
    const index = await readTabObjects(ss, "IncidentIndex");
    const open = index
      .filter((r) => r["status"] === "open")
      .sort((a, b) => String(b["reported_at"]).localeCompare(String(a["reported_at"])));
    return c.json({ incident_open: open });
  } catch (e) {
    return err(c, e);
  }
});

async function loadIncident(ss: string, incidentId: string): Promise<{ index: Record<string, string>; row: Record<string, string> }> {
  const index = await new SheetRepo(ss, "IncidentIndex", BRANCH_TEMPLATE_HEADERS["IncidentIndex"]).get(incidentId);
  if (!index) throw fail(404, "tidak_ada", "Incident tidak ditemukan.");
  const tab = monthlyTabName("Incidents", index["tab_month"]);
  const rows = await valuesGet(ss, `${tab}!A2:Z100000`);
  const header = MONTHLY_HEADERS["Incidents"];
  const hit = rows.find((r) => r[0] === incidentId);
  if (!hit) throw fail(404, "tidak_ada", "Incident tidak ditemukan.");
  return { index, row: Object.fromEntries(header.map((h, i) => [h, hit[i] ?? ""])) };
}

// GET /incident/:id?branch_id= — isi + catatan (isi tak bisa diubah).
app.get("/incident/:id", requireAuth, async (c) => {
  try {
    const p = c.get("principal");
    const branchId = c.req.query("branch_id") ?? "";
    if (!branchId) return c.json(toApiError("wajib_diisi", "branch_id wajib diisi."), 400);
    if (!guardCabang(p, branchId)) {
      return c.json(toApiError("di_luar_akses", "Di luar cabang aksesmu."), 403);
    }
    const { ss } = await branchInfo(branchId);
    const { row } = await loadIncident(ss, c.req.param("id") ?? "");
    const notesTab = monthlyTabName("IncidentNotes", row["tab_month"]);
    const notes = await valuesGet(ss, `${notesTab}!A2:Z100000`).catch(() => [] as string[][]);
    const nHeader = MONTHLY_HEADERS["IncidentNotes"];
    const catatan = notes
      .filter((r) => r[1] === row["id"])
      .map((r) => Object.fromEntries(nHeader.map((h, i) => [h, r[i] ?? ""])));
    return c.json({ incident: row, catatan });
  } catch (e) {
    return err(c, e);
  }
});

const CatatanBody = z.object({
  branch_id: z.string().length(26),
  note: z.string().trim().min(1).max(20000),
});

// POST /incident/:id/catatan — append catatan; isi incident tidak tersentuh (BR-41).
app.post("/incident/:id/catatan", requireAuth, async (c) => {
  try {
    const p = c.get("principal");
    const parsed = CatatanBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json(toApiError("wajib_diisi", "Catatan wajib diisi."), 400);
    if (!guardCabang(p, parsed.data.branch_id)) {
      return c.json(toApiError("di_luar_akses", "Di luar cabang aksesmu."), 403);
    }
    const { ss } = await branchInfo(parsed.data.branch_id);
    const { row } = await loadIncident(ss, c.req.param("id") ?? "");
    const notesTab = await ensureMonthlyTab(ss, "IncidentNotes", row["tab_month"]);
    const now = nowIso();
    const obj: Record<string, string> = {};
    for (const h of MONTHLY_HEADERS["IncidentNotes"]) obj[h] = "";
    obj["id"] = newId();
    obj["incident_id"] = row["id"];
    obj["author_id"] = p.userId;
    obj["author_role"] = p.role;
    obj["note"] = parsed.data.note;
    obj["created_at"] = now;
    await new SheetRepo(ss, notesTab, MONTHLY_HEADERS["IncidentNotes"]).append(obj);
    return c.json({ ok: true, catatan: { id: obj["id"] } }, 201);
  } catch (e) {
    return err(c, e);
  }
});

const StatusBody = z.object({
  branch_id: z.string().length(26),
  status: z.enum(["open", "selesai"]),
  alasan: z.string().max(5000).optional().default(""),
});

// PATCH /incident/:id/status — hanya admin + audit.
app.patch("/incident/:id/status", requireAuth, adminOnly, async (c) => {
  try {
    const p = c.get("principal");
    const parsed = StatusBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json(toApiError("wajib_diisi", "Status tidak valid."), 400);
    const { ss } = await branchInfo(parsed.data.branch_id);
    const { row, index } = await loadIncident(ss, c.req.param("id") ?? "");
    const now = nowIso();
    const tab = monthlyTabName("Incidents", row["tab_month"]);
    await new SheetRepo(ss, tab, MONTHLY_HEADERS["Incidents"]).update(row["id"], {
      status: parsed.data.status,
      status_changed_by: p.userId,
      status_changed_at: now,
      updated_at: now,
      version: String(Number(row["version"] || "1") + 1),
    });
    await new SheetRepo(ss, "IncidentIndex", BRANCH_TEMPLATE_HEADERS["IncidentIndex"]).update(index["incident_id"], {
      status: parsed.data.status,
      updated_at: now,
    });
    await ensureMonthlyTab(ss, "AuditLog", row["tab_month"]);
    await auditAppend(ss, monthlyTabName("AuditLog", row["tab_month"]), now, {
      actor_id: p.userId,
      action: "incident.ubah_status",
      object_type: "incident",
      object_id: row["id"],
      branch_id: parsed.data.branch_id,
      shift_instance_id: row["shift_instance_id"] || undefined,
      before: row["status"],
      after: parsed.data.status,
      reason: parsed.data.alasan || undefined,
    });
    return c.json({ ok: true });
  } catch (e) {
    return err(c, e);
  }
});

const TautBody = z.object({
  branch_id: z.string().length(26),
  shift_instance_id: z.string().length(26),
  alasan: z.string().max(5000).optional().default(""),
});

// POST /incident/:id/tautkan — hanya admin + audit.
app.post("/incident/:id/tautkan", requireAuth, adminOnly, async (c) => {
  try {
    const p = c.get("principal");
    const parsed = TautBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json(toApiError("wajib_diisi", "shift_instance_id wajib diisi."), 400);
    const { ss } = await branchInfo(parsed.data.branch_id);
    const { row, index } = await loadIncident(ss, c.req.param("id") ?? "");
    const shiftTarget = await new SheetRepo(ss, "ShiftInstances", BRANCH_TEMPLATE_HEADERS["ShiftInstances"]).get(parsed.data.shift_instance_id);
    if (!shiftTarget) throw fail(404, "tidak_ada", "Shift tujuan tidak ditemukan.");
    const now = nowIso();
    const tab = monthlyTabName("Incidents", row["tab_month"]);
    await new SheetRepo(ss, tab, MONTHLY_HEADERS["Incidents"]).update(row["id"], {
      shift_instance_id: parsed.data.shift_instance_id,
      outside_shift: "FALSE",
      link_source: "admin",
      linked_by: p.userId,
      linked_at: now,
      updated_at: now,
      version: String(Number(row["version"] || "1") + 1),
    });
    await new SheetRepo(ss, "IncidentIndex", BRANCH_TEMPLATE_HEADERS["IncidentIndex"]).update(index["incident_id"], {
      shift_instance_id: parsed.data.shift_instance_id,
      outside_shift: "FALSE",
      updated_at: now,
    });
    await ensureMonthlyTab(ss, "AuditLog", row["tab_month"]);
    await auditAppend(ss, monthlyTabName("AuditLog", row["tab_month"]), now, {
      actor_id: p.userId,
      action: "incident.tautkan",
      object_type: "incident",
      object_id: row["id"],
      branch_id: parsed.data.branch_id,
      shift_instance_id: parsed.data.shift_instance_id,
      before: row["shift_instance_id"] || "",
      after: parsed.data.shift_instance_id,
      reason: parsed.data.alasan || undefined,
    });
    return c.json({ ok: true });
  } catch (e) {
    return err(c, e);
  }
});

export default app;
