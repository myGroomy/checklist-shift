import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { REGISTRY_HEADERS, SESSION_COOKIE, toApiError, type LoginResponse } from "@checklist-shift/shared";
import { registryId } from "../lib/env.js";
import { SheetRepo } from "../lib/repo.js";
import { valuesGet } from "../lib/sheets.js";
import { auditAppend } from "../lib/audit.js";
import { hashPin, isWeakPin, pinFormatOk, verifyPin } from "../lib/pin.js";
import { getIntSetting } from "../lib/settings.js";
import {
  checkRateLimit,
  incrPinFail,
  isSessionLive,
  issueSession,
  resetPinFail,
  revokeAllSessions,
  revokeSession,
  verifyJwt,
} from "../lib/session.js";
import { requireAuth, type AuthEnv } from "../lib/authz.js";
import { nowIso } from "@checklist-shift/shared";

const auth = new Hono<AuthEnv>();

function usersRepo(): SheetRepo {
  const id = registryId();
  if (!id) throw new Error("env registry belum lengkap");
  return new SheetRepo(id, "Users", REGISTRY_HEADERS["Users"]);
}

async function findByUsername(username: string): Promise<{ row: number; data: Record<string, string> } | null> {
  const reg = registryId() as string;
  const col = await valuesGet(reg, "Users!C2:C10000");
  const idx = col.findIndex((r) => (r[0] ?? "").toLowerCase() === username.toLowerCase());
  if (idx < 0) return null;
  const full = await valuesGet(reg, `Users!A${idx + 2}:M${idx + 2}`);
  const header = REGISTRY_HEADERS["Users"];
  const obj = Object.fromEntries(header.map((h, i) => [h, full[0]?.[i] ?? ""]));
  return { row: idx + 2, data: obj };
}

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge,
  };
}

// Pesan gagal login dibuat umum agar tidak membocorkan akun mana yang ada.
const LOGIN_GAGAL = toApiError("login_gagal", "Username atau PIN salah.");

auth.post("/login", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { username?: string; pin?: string };
  const username = String(body.username ?? "").trim().toLowerCase();
  const pin = String(body.pin ?? "");
  if (!username || !pinFormatOk(pin)) return c.json(LOGIN_GAGAL, 401);

  const ip = c.req.header("x-forwarded-for") ?? "lokal";
  if (!(await checkRateLimit(`login:${ip}`, 20, 60))) {
    return c.json(toApiError("terlalu_sering", "Terlalu sering. Coba lagi sebentar."), 429);
  }

  const found = await findByUsername(username);
  if (!found || found.data["is_active"] !== "TRUE") return c.json(LOGIN_GAGAL, 401);
  const u = found.data;

  const lockedUntil = u["locked_until"] ? Date.parse(u["locked_until"]) : NaN;
  if (Number.isFinite(lockedUntil) && lockedUntil > Date.now()) {
    return c.json(toApiError("akun_terkunci", "Akun terkunci sementara. Hubungi admin."), 423);
  }

  const okPin = await verifyPin(pin, u["pin_hash"]);
  const maxAttempts = await getIntSetting("pin_max_attempts", 5);
  const lockMinutes = await getIntSetting("pin_lock_minutes", 15);
  if (!okPin) {
    const n = await incrPinFail(u["id"], lockMinutes);
    if (n >= maxAttempts) {
      const until = new Date(Date.now() + lockMinutes * 60000).toISOString();
      await usersRepo().update(u["id"], { locked_until: until, updated_at: nowIso() });
      return c.json(toApiError("akun_terkunci", "Akun terkunci sementara. Hubungi admin."), 423);
    }
    return c.json(LOGIN_GAGAL, 401);
  }

  await resetPinFail(u["id"]);
  const days = await getIntSetting("session_days", 30);
  const { token, exp } = await issueSession(u["id"], u["role"] as "admin" | "petugas", days);
  await usersRepo().update(u["id"], { last_login_at: nowIso(), updated_at: nowIso() });
  setCookie(c, SESSION_COOKIE, token, cookieOpts(days * 86400));
  void exp;
  const res: LoginResponse = {
    ok: true,
    must_change_pin: u["must_change_pin"] === "TRUE",
    role: u["role"] as "admin" | "petugas",
    name: u["name"] ?? "",
  };
  return c.json(res);
});

auth.post("/logout", requireAuth, async (c) => {
  const p = c.get("principal");
  await revokeSession(p.userId, p.claims.sid);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

auth.post("/logout-semua", requireAuth, async (c) => {
  const p = c.get("principal");
  const days = await getIntSetting("session_days", 30);
  await revokeAllSessions(p.userId, days);
  const reg = registryId() as string;
  await auditAppend(reg, "AuditLog_Global", nowIso(), {
    actor_id: p.userId, action: "akun.logout_semua", object_type: "user", object_id: p.userId,
  });
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

auth.post("/ganti-pin", requireAuth, async (c) => {
  const p = c.get("principal");
  const body = (await c.req.json().catch(() => ({}))) as { pin_lama?: string; pin_baru?: string };
  const lama = String(body.pin_lama ?? "");
  const baru = String(body.pin_baru ?? "");
  if (!pinFormatOk(lama) || !pinFormatOk(baru)) {
    return c.json(toApiError("pin_salah", "PIN harus 6 angka."), 400);
  }
  const blockWeak = (await getIntSetting("pin_block_weak", 1)) === 1;
  if (blockWeak && isWeakPin(baru)) {
    return c.json(toApiError("pin_lemah", "PIN terlalu mudah ditebak. Pilih yang lain."), 400);
  }
  const cur = await usersRepo().get(p.userId);
  if (!cur || !(await verifyPin(lama, cur["pin_hash"]))) {
    return c.json(toApiError("pin_lama_salah", "PIN lama salah."), 400);
  }
  await usersRepo().update(p.userId, {
    pin_hash: await hashPin(baru),
    must_change_pin: "FALSE",
    pin_changed_at: nowIso(),
    updated_at: nowIso(),
  });
  const reg = registryId() as string;
  await auditAppend(reg, "AuditLog_Global", nowIso(), {
    actor_id: p.userId, action: "akun.ganti_pin", object_type: "user", object_id: p.userId,
  });
  return c.json({ ok: true });
});

// Helper uji: validasi token langsung (dipakai verify-fase2).
auth.get("/siapa", requireAuth, async (c) => {
  const p = c.get("principal");
  return c.json({ user_id: p.userId, role: p.role, name: p.name, cabang: p.branches });
});

export async function findUserByUsernamePublic(username: string) {
  return findByUsername(username);
}

export async function sessionLivePublic(token: string): Promise<boolean> {
  const claims = await verifyJwt(token);
  return isSessionLive(claims.sub, claims.sid, claims.iat);
}

export default auth;
