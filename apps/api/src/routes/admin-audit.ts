import { Hono } from "hono";
import { REGISTRY_HEADERS, monthlyTabName, toApiError } from "@checklist-shift/shared";
import { registryId } from "../lib/env.js";
import { valuesGet } from "../lib/sheets.js";
import { resolveBranch } from "../lib/branch.js";
import { adminOnly, requireAuth, type AuthEnv } from "../lib/authz.js";

// Audit viewer read-only (ADM-AL-01..03, BR-43). Filter: pelaku, aksi, objek, rentang tanggal.
const adminAudit = new Hono<AuthEnv>();
adminAudit.use(requireAuth, adminOnly);

const H = REGISTRY_HEADERS["AuditLog_Global"];
const MAX = 200;

interface AuditFilter {
  actor?: string;
  action?: string;
  object?: string;
  from?: string;
  to?: string;
}

function parseFilter(q: (k: string) => string | undefined): AuditFilter {
  return {
    actor: q("pelaku") || undefined,
    action: q("aksi") || undefined,
    object: q("objek") || undefined,
    from: q("dari") || undefined,
    to: q("sampai") || undefined,
  };
}

function applyFilter(rows: string[][], f: AuditFilter): string[][] {
  return rows.filter((r) => {
    if (f.actor && (r[3] ?? "") !== f.actor) return false;
    if (f.action && !(r[4] ?? "").includes(f.action)) return false;
    if (f.object && (r[6] ?? "") !== f.object && (r[5] ?? "") !== f.object) return false;
    if (f.from && (r[2] ?? "") < f.from) return false;
    if (f.to && (r[2] ?? "") > f.to) return false;
    return true;
  });
}

function toJson(rows: string[][]) {
  return {
    audit: rows.map((r) => Object.fromEntries(H.map((h, i) => [h, r[i] ?? ""]))),
  };
}

// Global: akun, akses, cabang, pengaturan, kategori incident, token (skema §4.10).
adminAudit.get("/global", async (c) => {
  const f = parseFilter((k) => c.req.query(k));
  const limit = Math.min(Number(c.req.query("batas") || MAX), MAX);
  const rows = await valuesGet(registryId() as string, "AuditLog_Global!A2:N100000");
  const hit = applyFilter(rows, f);
  return c.json(toJson(hit.slice(-limit)));
});

// Per cabang: ?month=YYYY-MM (default bulan berjalan). Baca saja, tanpa membuat tab.
adminAudit.get("/cabang/:branchId", async (c) => {
  const branchId = c.req.param("branchId");
  const ss = await resolveBranch(branchId).catch(() => null);
  if (!ss) return c.json(toApiError("tidak_ada", "Cabang tidak ditemukan."), 404);
  const month = c.req.query("month") || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return c.json(toApiError("input_salah", "Format bulan: YYYY-MM."), 400);
  }
  const f = parseFilter((k) => c.req.query(k));
  const limit = Math.min(Number(c.req.query("batas") || MAX), MAX);
  let rows: string[][];
  try {
    rows = await valuesGet(ss, `${monthlyTabName("AuditLog", month)}!A2:N100000`);
  } catch {
    return c.json({ audit: [] });
  }
  const hit = applyFilter(rows.filter((r) => r[0]), f);
  return c.json(toJson(hit.slice(-limit)));
});

export default adminAudit;
