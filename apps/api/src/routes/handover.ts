import { Hono } from "hono";
import { z } from "zod";
import {
  MONTHLY_HEADERS,
  newId,
  nowIso,
  toApiError,
} from "@checklist-shift/shared";
import { SheetRepo } from "../lib/repo.js";
import { ensureMonthlyTab } from "../lib/monthly.js";
import { valuesGet } from "../lib/sheets.js";
import { withLock } from "../lib/lock.js";
import {
  accessibleBranchIds,
  appendPhotoRefs,
  assertBerjalan,
  decodeSnapshot,
  fail,
  findShift,
  handoversForShift,
  isCloseError,
  readTabObjects,
  requiredHandoverFields,
  type FoundShift,
} from "../lib/close.js";
import { requireAuth, type AuthEnv } from "../lib/authz.js";

// Handover Fase 5 (PRD §6.3.1): satu per shift, baca + tandai.
// Mount di "/api": GET /handover/sebelumnya, POST /shift/:id/handover,
// POST /handover/:id/baca. Draf offline = Fase 7 (belum didukung).

const app = new Hono<AuthEnv>();
// TANPA app.use(): lihat catatan komposisi di routes/ops.ts. Pakai per-route.

function err(c: { json: (b: unknown, s?: number) => Response }, e: unknown): Response {
  if (isCloseError(e)) {
    return c.json(toApiError(e.code, e.message), e.status as 400);
  }
  console.error("[handover]", (e as Error).message);
  return c.json(toApiError("gagal", "Terjadi galat. Coba lagi."), 500);
}

async function guardCabang(p: { role: string; branches: string[] }, branchId: string): Promise<boolean> {
  return p.role === "admin" || p.branches.includes(branchId);
}

// Cari handover di semua tab Handovers_* (bulan tab = bulan shift pemilik, tak selalu diketahui).
async function findHandover(ss: string, handoverId: string): Promise<Record<string, string> | null> {
  const { sheetsClient } = await import("../lib/sheets.js");
  const api = sheetsClient();
  const meta = await api.spreadsheets.get({ spreadsheetId: ss, fields: "sheets.properties.title" });
  const names = (meta.data.sheets ?? [])
    .map((s) => s.properties?.title ?? "")
    .filter((t) => t.startsWith("Handovers_"));
  const header = MONTHLY_HEADERS["Handovers"];
  const endCol = String.fromCharCode(64 + header.length); // 9 kolom -> A:I
  for (const name of names) {
    const col = await valuesGet(ss, `${name}!A2:A100000`);
    const idx = col.findIndex((r) => r[0] === handoverId);
    if (idx >= 0) {
      const rows = await valuesGet(ss, `${name}!A${idx + 2}:${endCol}${idx + 2}`);
      return Object.fromEntries(header.map((h, i) => [h, rows[0]?.[i] ?? ""]));
    }
  }
  return null;
}

// GET /handover/sebelumnya?shift_instance_id= — handover shift sebelumnya
// (_meta.last_closed_shift_id) + incident open cabang ringkas.
app.get("/handover/sebelumnya", requireAuth, async (c) => {
  try {
    const p = c.get("principal");
    const shiftId = c.req.query("shift_instance_id") ?? "";
    if (!shiftId) return c.json(toApiError("wajib_diisi", "shift_instance_id wajib diisi."), 400);
    const found = await findShift(shiftId, await accessibleBranchIds(p.role, p.branches));
    if (!found) return c.json(toApiError("tidak_ada", "Shift tidak ditemukan."), 404);
    if (!(await guardCabang(p, found.branchId))) {
      return c.json(toApiError("di_luar_akses", "Di luar cabang aksesmu."), 403);
    }
    const { metaGet } = await import("../lib/close.js");
    const prevId = await metaGet(found.spreadsheetId, "last_closed_shift_id");
    let handover: Record<string, unknown> | null = null;
    if (prevId) {
      const prev = await findShift(prevId, [found.branchId]);
      if (prev) {
        const rows = await handoversForShift(found.spreadsheetId, prev.row["tab_month"], prevId);
        if (rows[0]) {
          handover = {
            id: rows[0]["id"],
            shift_instance_id: prevId,
            values: rows[0]["values"],
            free_text: rows[0]["free_text"],
            photo_ids: rows[0]["photo_ids"],
            submitted_by: rows[0]["submitted_by"],
            submitted_at: rows[0]["submitted_at"],
          };
        }
      }
    }
    const index = await readTabObjects(found.spreadsheetId, "IncidentIndex");
    const open = index
      .filter((r) => r["status"] === "open")
      .sort((a, b) => String(b["reported_at"]).localeCompare(String(a["reported_at"])))
      .slice(0, 50)
      .map((r) => ({
        incident_id: r["incident_id"],
        category_id: r["category_id"],
        shift_instance_id: r["shift_instance_id"],
        outside_shift: r["outside_shift"],
        reported_at: r["reported_at"],
      }));
    return c.json({ handover, incident_open: open });
  } catch (e) {
    return err(c, e);
  }
});

const HandoverBody = z.object({
  values: z.record(z.string(), z.string()),
  free_text: z.string().max(20000).optional().default(""),
  photo_ids: z.array(z.string()).max(20).optional().default([]),
});

// POST /shift/:id/handover — submit handover saat alur penutupan.
// Shift wajib berjalan; satu handover per shift; setelah tutup ditolak.
app.post("/shift/:id/handover", requireAuth, async (c) => {
  try {
    const p = c.get("principal");
    const parsed = HandoverBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json(toApiError("wajib_diisi", "Isi handover tidak valid."), 400);
    }
    const shiftId = c.req.param("id") ?? "";
    const body = parsed.data;
    const result = await withLock(`lock:close:${shiftId}`, async () => {
      const found: FoundShift | null = await findShift(shiftId, await accessibleBranchIds(p.role, p.branches));
      if (!found) throw fail(404, "shift_tidak_ada", "Shift tidak ditemukan.");
      if (!(await guardCabang(p, found.branchId))) {
        throw fail(403, "di_luar_akses", "Di luar cabang aksesmu.");
      }
      assertBerjalan(found.row);
      const ada = await handoversForShift(found.spreadsheetId, found.row["tab_month"], shiftId);
      if (ada.length > 0) throw fail(409, "sudah_ada", "Handover shift ini sudah dikirim.");
      const snap = await decodeSnapshot(found.spreadsheetId, found.row);
      const kosong = requiredHandoverFields(snap).filter((f) => !String(body.values[f.id] ?? "").trim());
      if (kosong.length > 0) {
        throw fail(422, "wajib_diisi", `Field wajib belum diisi: ${kosong.map((f) => f.label || f.id).join(", ")}`);
      }
      const now = nowIso();
      const tab = await ensureMonthlyTab(found.spreadsheetId, "Handovers", found.row["tab_month"]);
      const repo = new SheetRepo(found.spreadsheetId, tab, MONTHLY_HEADERS["Handovers"]);
      const hid = newId();
      const obj: Record<string, string> = {};
      for (const h of MONTHLY_HEADERS["Handovers"]) obj[h] = "";
      obj["id"] = hid;
      obj["shift_instance_id"] = shiftId;
      obj["values"] = JSON.stringify(body.values);
      obj["free_text"] = body.free_text ?? "";
      obj["photo_ids"] = JSON.stringify(body.photo_ids ?? []);
      obj["submitted_by"] = p.userId;
      obj["submitted_at"] = now;
      obj["created_at"] = now;
      obj["updated_at"] = now;
      await repo.append(obj);
      await appendPhotoRefs(found.spreadsheetId, found.row["tab_month"], "handover", hid, body.photo_ids ?? [], shiftId, p.userId);
      return obj;
    });
    return c.json({ ok: true, handover: { id: result["id"] } }, 201);
  } catch (e) {
    return err(c, e);
  }
});

const BacaBody = z.object({ reading_shift_instance_id: z.string().length(26) });

// POST /handover/:id/baca — tandai "sudah dibaca" oleh shift pembaca.
// Pembaca wajib peserta shift pembaca (atau admin); unik per
// (handover_id, reading_shift_instance_id).
app.post("/handover/:id/baca", requireAuth, async (c) => {
  try {
    const p = c.get("principal");
    const parsed = BacaBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json(toApiError("wajib_diisi", "reading_shift_instance_id wajib diisi."), 400);
    }
    const handoverId = c.req.param("id") ?? "";
    const readingId = parsed.data.reading_shift_instance_id;
    const result = await withLock(`lock:ack:${handoverId}:${readingId}`, async () => {
      const reading = await findShift(readingId, await accessibleBranchIds(p.role, p.branches));
      if (!reading) throw fail(404, "shift_tidak_ada", "Shift pembaca tidak ditemukan.");
      if (!(await guardCabang(p, reading.branchId))) {
        throw fail(403, "di_luar_akses", "Di luar cabang aksesmu.");
      }
      const ho = await findHandover(reading.spreadsheetId, handoverId);
      if (!ho) throw fail(404, "tidak_ada", "Handover tidak ditemukan.");
      if (p.role !== "admin") {
        const parts = await valuesGet(reading.spreadsheetId, "Participants!A2:C100000");
        const isPeserta = parts.some((r) => r[1] === readingId && r[2] === p.userId);
        if (!isPeserta) throw fail(403, "bukan_peserta", "Hanya peserta shift pembaca yang dapat menandai.");
      }
      // Bulan tab ack = bulan shift pembaca (skema §5.5).
      const ackTab = await ensureMonthlyTab(reading.spreadsheetId, "HandoverAcks", reading.row["tab_month"]);
      const existing = await readTabObjects(reading.spreadsheetId, ackTab);
      if (existing.some((r) => r["handover_id"] === handoverId && r["reading_shift_instance_id"] === readingId)) {
        throw fail(409, "sudah_dibaca", "Handover sudah ditandai dibaca oleh shift ini.");
      }
      const now = nowIso();
      const obj: Record<string, string> = {};
      for (const h of MONTHLY_HEADERS["HandoverAcks"]) obj[h] = "";
      obj["id"] = newId();
      obj["handover_id"] = handoverId;
      obj["reading_shift_instance_id"] = readingId;
      obj["user_id"] = p.userId;
      obj["read_at"] = now;
      obj["created_at"] = now;
      await new SheetRepo(reading.spreadsheetId, ackTab, MONTHLY_HEADERS["HandoverAcks"]).append(obj);
      return obj;
    });
    return c.json({ ok: true, ack: { id: result["id"] } }, 201);
  } catch (e) {
    return err(c, e);
  }
});

export default app;
