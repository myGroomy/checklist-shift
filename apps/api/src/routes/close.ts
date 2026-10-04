import { Hono } from "hono";
import { z } from "zod";
import {
  REGISTRY_HEADERS,
  toApiError,
} from "@checklist-shift/shared";
import { registryId } from "../lib/env.js";
import { SheetRepo } from "../lib/repo.js";
import {
  accessibleBranchIds,
  closeShift,
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

// Penutupan shift + baca laporan Fase 5 (BR-30 s/d BR-33, skema §10 resep 4).
// Mount di "/api": POST /shift/:id/tutup, GET /laporan/:shiftId.
// Addendum milik Fase 6 — GET laporan menyertakan struktur addendum kosong
// yang siap diisi (baca Addenda bila tab sudah ada).

const app = new Hono<AuthEnv>();
// TANPA app.use(): middleware sub-app ikut menjerat rute app lain saat komposisi (401/403 misterius). Pakai per-route.

function err(c: { json: (b: unknown, s?: number) => Response }, e: unknown): Response {
  if (isCloseError(e)) {
    return c.json(toApiError(e.code, e.message), e.status as 400);
  }
  console.error("[tutup]", (e as Error).message);
  return c.json(toApiError("gagal", "Terjadi galat. Coba lagi."), 500);
}

const TutupBody = z.object({
  handover: z.object({
    values: z.record(z.string(), z.string()),
    free_text: z.string().max(20000).optional().default(""),
    photo_ids: z.array(z.string()).max(20).optional().default([]),
  }).nullable().optional(),
  no_incident_confirmed: z.boolean().optional().default(false),
  pin: z.string().regex(/^[0-9]{6}$/, "PIN harus 6 angka."),
});

// POST /shift/:id/tutup — auth PJ + PIN + BR-30, kembalikan laporan terkunci.
app.post("/shift/:id/tutup", requireAuth, async (c) => {
  try {
    const p = c.get("principal");
    const parsed = TutupBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json(toApiError("wajib_diisi", "Permintaan tutup tidak lengkap (handover/pin)."), 400);
    }
    const body = parsed.data;
    const result = await closeShift({
      shiftId: c.req.param("id") ?? "",
      branchIds: await accessibleBranchIds(p.role, p.branches),
      userId: p.userId,
      pin: body.pin,
      handover: body.handover
        ? { values: body.handover.values, free_text: body.handover.free_text, photo_ids: body.handover.photo_ids }
        : null,
      noIncidentConfirmed: body.no_incident_confirmed,
    });
    return c.json({
      ok: true,
      laporan: {
        id: result.report["id"],
        report_number: result.report["report_number"],
        content_hash: result.report["content_hash"],
        is_locked: result.report["is_locked"],
      },
    }, 201);
  } catch (e) {
    return err(c, e);
  }
});

// GET /laporan/:shiftId — detail read-only: header + entries per kategori +
// skip + incident + handover + kontribusi + addendum (kosong hingga Fase 6).
app.get("/laporan/:shiftId", requireAuth, async (c) => {
  try {
    const p = c.get("principal");
    const shiftId = c.req.param("shiftId") ?? "";
    const found = await findShift(shiftId, await accessibleBranchIds(p.role, p.branches));
    if (!found) return c.json(toApiError("tidak_ada", "Shift tidak ditemukan."), 404);
    if (p.role !== "admin" && !p.branches.includes(found.branchId)) {
      return c.json(toApiError("di_luar_akses", "Di luar cabang aksesmu."), 403);
    }
    const { spreadsheetId, row } = found;
    const reports = await readTabObjects(spreadsheetId, "Reports");
    const report = reports.find((r) => r["shift_instance_id"] === shiftId) ?? null;
    const snap = await decodeSnapshot(spreadsheetId, row);
    const entries = await entriesForShift(spreadsheetId, row["tab_month"], shiftId);
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
    const hoRows = await handoversForShift(spreadsheetId, row["tab_month"], shiftId);
    const handover = hoRows[0]
      ? {
        values: hoRows[0]["values"],
        free_text: hoRows[0]["free_text"],
        photo_ids: hoRows[0]["photo_ids"],
        submitted_by: hoRows[0]["submitted_by"],
        submitted_at: hoRows[0]["submitted_at"],
      }
      : null;
    const incidentsIdx = await incidentsForShift(spreadsheetId, shiftId);
    const reg = registryId() as string;
    const usersRepo = new SheetRepo(reg, "Users", REGISTRY_HEADERS["Users"]);
    const parts = await participantsForShift(spreadsheetId, shiftId);
    const kontribusi: { user_id: string; name: string; first_action_at: string; item_dicatat: number }[] = [];
    for (const pt of parts) {
      const u = await usersRepo.get(pt["user_id"]).catch(() => null);
      const dicatat = entries.filter((e) => e["completed_by"] === pt["user_id"]).length;
      kontribusi.push({
        user_id: pt["user_id"],
        name: u?.["name"] ?? "",
        first_action_at: pt["first_action_at"],
        item_dicatat: dicatat,
      });
    }
    // Addendum (Fase 6): baca bila tab sudah ada, sonst kosong.
    let addendum: Record<string, string>[] = [];
    try {
      const all = await readTabObjects(spreadsheetId, "Addenda");
      if (report) addendum = all.filter((a) => a["report_id"] === report["id"]);
    } catch {
      addendum = [];
    }
    return c.json({
      shift: {
        id: row["id"],
        branch_id: found.branchId,
        shift_definition_id: row["shift_definition_id"],
        shift_date: row["shift_date"],
        status: row["status"],
        pj_user_id: row["pj_user_id"],
        opened_at: row["opened_at"],
        closed_at: row["closed_at"],
        close_type: row["close_type"],
        is_incomplete: row["is_incomplete"],
        no_incident_confirmed: row["no_incident_confirmed"],
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
    });
  } catch (e) {
    return err(c, e);
  }
});

export default app;
