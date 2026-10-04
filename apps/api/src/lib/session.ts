import { SignJWT, jwtVerify } from "jose";
import { newId, type SessionClaims } from "@checklist-shift/shared";
import { requireRedis } from "./redis.js";

// Sesi JWT + revokasi Redis (§TRD-7, skema kunci §9):
// sess:{userId}:{sessionId} (TTL session_days), sess:revoked:{userId} (waktu),
// pinfail:{userId} (counter), rl:{aksi}:{kunci} (rate limit).
// Tanpa Redis: semua fungsi penyimpanan melempar (fail closed).

function secret(): Uint8Array {
  const s = process.env["SESSION_SECRET"];
  if (!s) throw new Error("SESSION_SECRET belum diisi (fail closed)");
  return new TextEncoder().encode(s);
}

export async function signJwt(
  userId: string,
  sid: string,
  role: "admin" | "petugas",
  days: number,
  key?: Uint8Array,
): Promise<{ token: string; exp: number }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + days * 86400;
  const token = await new SignJWT({ sub: userId, sid, role } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key ?? secret());
  return { token, exp };
}

export async function verifyJwt(token: string, key?: Uint8Array): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, key ?? secret());
  const sub = payload["sub"];
  const sid = payload["sid"];
  const role = payload["role"];
  if (typeof sub !== "string" || typeof sid !== "string" || (role !== "admin" && role !== "petugas")) {
    throw new Error("klaim sesi tidak valid");
  }
  return { sub, sid, role, iat: payload["iat"] as number, exp: payload["exp"] as number };
}

export async function issueSession(
  userId: string,
  role: "admin" | "petugas",
  days: number,
): Promise<{ token: string; sid: string; exp: number }> {
  const r = requireRedis();
  const sid = newId();
  const { token, exp } = await signJwt(userId, sid, role, days);
  await r.set(`sess:${userId}:${sid}`, String(exp), { ex: days * 86400 });
  return { token, sid, exp };
}

export async function isSessionLive(userId: string, sid: string, iat: number): Promise<boolean> {
  const r = requireRedis();
  const revokedAt = await r.get(`sess:revoked:${userId}`);
  if (revokedAt && iat * 1000 <= Number(revokedAt)) return false;
  return (await r.get(`sess:${userId}:${sid}`)) !== null;
}

export async function revokeSession(userId: string, sid: string): Promise<void> {
  const r = requireRedis();
  await r.del(`sess:${userId}:${sid}`);
}

export async function revokeAllSessions(userId: string, days: number): Promise<void> {
  const r = requireRedis();
  await r.set(`sess:revoked:${userId}`, String(Date.now()), { ex: days * 86400 });
}

// Counter PIN salah di Redis; Sheets hanya menyimpan locked_until saat terkunci (§4.3).
export async function incrPinFail(userId: string, lockMinutes: number): Promise<number> {
  const r = requireRedis();
  const n = await r.incr(`pinfail:${userId}`);
  if (n === 1) await r.expire(`pinfail:${userId}`, lockMinutes * 60);
  return n;
}

export async function resetPinFail(userId: string): Promise<void> {
  const r = requireRedis();
  await r.del(`pinfail:${userId}`);
}

export async function checkRateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const r = requireRedis();
  const n = await r.incr(`rl:${key}`);
  if (n === 1) await r.expire(`rl:${key}`, windowSec);
  return n <= limit;
}
