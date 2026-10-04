import { Hono } from "hono";
import { google } from "googleapis";
import type { HealthResponse } from "@checklist-shift/shared";
import { registryId, serviceAccount } from "./lib/env.js";
import authRoutes from "./routes/auth.js";
import adminUsersRoutes from "./routes/admin-users.js";
import adminBranchesRoutes from "./routes/admin-branches.js";
import adminConfigRoutes from "./routes/admin-config.js";
import adminAuditRoutes from "./routes/admin-audit.js";
import shiftRoutes from "./routes/shift.js";
import checklistRoutes from "./routes/checklist.js";
import handoverRoutes from "./routes/handover.js";
import incidentRoutes from "./routes/incident.js";
import closeRoutes from "./routes/close.js";
import shareRoutes, { publikApp } from "./routes/share.js";
import opsRoutes from "./routes/ops.js";
import reportRoutes from "./routes/report.js";

async function readSettingsHead(): Promise<{ ok: boolean; detail?: string }> {
  const spreadsheetId = registryId();
  const sa = serviceAccount();
  if (!spreadsheetId || !sa) return { ok: false, detail: "env belum lengkap" };
  try {
    const auth = new google.auth.JWT({
      email: sa.email,
      key: sa.key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    // Baris 1 = header (DATABASE_SCHEMA §2.2). Baca A1:Z1 tab Settings.
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Settings!A1:Z1",
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    const header = (res.data.values?.[0] ?? []).map(String);
    const need = ["key", "value"];
    const missing = need.filter((h) => !header.includes(h));
    if (missing.length > 0) return { ok: false, detail: `header kurang: ${missing.join(",")}` };
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Jangan bocorkan detail Google ke klien (TESTING §13).
    console.error("[api/health] sheets error:", msg);
    return { ok: false, detail: "gagal membaca registry" };
  }
}

const app = new Hono();

// PENTING: publikApp (GET /publik/r/:token, tanpa auth) WAJIB di-mount
// pertama — middleware app.use(requireAuth) milik router lain menjadi
// ALL /api/* saat komposisi dan akan menjerat rute publik (terbukti: 401).
app.route("/api", publikApp);
app.route("/api/auth", authRoutes);
app.route("/api/admin/users", adminUsersRoutes);
app.route("/api/admin/branches", adminBranchesRoutes);
app.route("/api/admin/config", adminConfigRoutes);
app.route("/api/admin/audit", adminAuditRoutes);
app.route("/api/shift", shiftRoutes);
app.route("/api/checklist", checklistRoutes);
app.route("/api", handoverRoutes);
app.route("/api", incidentRoutes);
app.route("/api", closeRoutes);
app.route("/api", shareRoutes);
app.route("/api", opsRoutes);
app.route("/api", reportRoutes);

app.get("/health", (c) => c.json({ status: "ok", service: "checklist-shift-api" }));
app.get("/api/health", async (c) => {
  const r = await readSettingsHead();
  const body: HealthResponse = r.ok
    ? { status: "ok", service: "checklist-shift-api", checks: { registry: "ok" } }
    : {
        status: "degraded",
        service: "checklist-shift-api",
        checks: { registry: r.detail === "env belum lengkap" ? "skipped" : "error" },
        detail: r.detail,
      };
  return c.json(body, r.ok ? 200 : 200);
});

const port = Number(process.env["API_PORT"] ?? 3001);

export { app };

export default {
  port,
  fetch: app.fetch,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const { serve } = await import("@hono/node-server");
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[api] listening :${info.port}`);
  });
}
