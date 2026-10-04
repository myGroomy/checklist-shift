import { Hono } from "hono";
import { toApiError } from "@checklist-shift/shared";
import { registryId } from "../lib/env.js";
import { SheetRepo } from "../lib/repo.js";
import { REGISTRY_HEADERS } from "@checklist-shift/shared";
import {
  accessibleBranchIds,
  isCloseError,
  readTabObjects,
} from "../lib/close.js";
import { requireAuth, type AuthEnv } from "../lib/authz.js";

// Daftar laporan Fase 6 (PRD ADM-RP-01, RP-09).
// CATATAN ANTI-DUPLIKAT: GET /laporan/:shiftId (detail penuh) SUDAH ada di
// routes/close.ts — dipakai-ulang, TIDAK diduplikat di sini. File ini hanya
// berisi daftar lintas cabang + filter.
// Mount di "/api": GET /laporan.

const app = new Hono<AuthEnv>();
// Tanpa app.use(): lihat catatan komposisi di routes/ops.ts.

// GET /laporan?branch_id=&tanggal=&dari=&sampai=&shift_definition_id=&pj=&status=
// tanggal/dari/sampai = shift_date (YYYY-MM-DD, zona cabang).
app.get("/laporan", requireAuth, async (c) => {
  try {
    const p = c.get("principal");
    const q = c.req.query();
    const boleh = await accessibleBranchIds(p.role, p.branches);
    const target = q["branch_id"] ? [q["branch_id"]] : boleh;
    if (q["branch_id"] && p.role !== "admin" && !p.branches.includes(q["branch_id"])) {
      return c.json(toApiError("di_luar_akses", "Di luar cabang aksesmu."), 403);
    }
    const keluar: Record<string, string>[] = [];
    const sudah: Set<string> = new Set();
    for (const branchId of target) {
      const branch = await new SheetRepo(
        registryId() as string, "Branches", REGISTRY_HEADERS["Branches"],
      ).get(branchId).catch(() => null);
      const ss = branch?.["spreadsheet_id"] ?? "";
      if (!ss) continue;
      const shifts = await readTabObjects(ss, "ShiftInstances");
      const reports = await readTabObjects(ss, "Reports");
      const lapByShift = new Map(reports.map((r) => [r["shift_instance_id"], r]));
      for (const s of shifts) {
        // Beberapa baris Branches dapat menunjuk satu spreadsheet uji yang sama;
        // shift yang sama jangan tampil ganda.
        if (sudah.has(s["id"])) continue;
        if (q["shift_definition_id"] && s["shift_definition_id"] !== q["shift_definition_id"]) continue;
        if (q["pj"] && s["pj_user_id"] !== q["pj"]) continue;
        if (q["status"] && s["status"] !== q["status"]) continue;
        if (q["tanggal"] && s["shift_date"] !== q["tanggal"]) continue;
        if (q["dari"] && s["shift_date"] < q["dari"]) continue;
        if (q["sampai"] && s["shift_date"] > q["sampai"]) continue;
        sudah.add(s["id"]);
        const lap = lapByShift.get(s["id"]);
        keluar.push({
          branch_id: branchId,
          shift_instance_id: s["id"],
          shift_definition_id: s["shift_definition_id"],
          shift_date: s["shift_date"],
          status: s["status"],
          pj_user_id: s["pj_user_id"],
          opened_at: s["opened_at"],
          closed_at: s["closed_at"],
          close_type: s["close_type"],
          is_incomplete: s["is_incomplete"],
          report_id: lap?.["id"] ?? "",
          report_number: lap?.["report_number"] ?? "",
          is_locked: lap?.["is_locked"] ?? "",
        });
      }
    }
    keluar.sort((a, b) => String(b["shift_date"]).localeCompare(String(a["shift_date"]))
      || String(b["opened_at"]).localeCompare(String(a["opened_at"])));
    return c.json({ laporan: keluar });
  } catch (e) {
    if (isCloseError(e)) {
      const ce = e as unknown as { status: number; code: string };
      return c.json(toApiError(ce.code, (e as Error).message), ce.status as 400);
    }
    console.error("[laporan]", (e as Error).message);
    return c.json(toApiError("gagal", "Terjadi galat. Coba lagi."), 500);
  }
});

export default app;
