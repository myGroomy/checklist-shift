import { Redis } from "@upstash/redis";
import { redisConfig } from "./env.js";

// Cache Redis dapat dibangun ulang dari Sheets (§1 prinsip 7).
// null = Redis tidak tersedia; pemanggil operasi atomik WAJIB menolak (fail closed).
let client: Redis | null | undefined;

export function redis(): Redis | null {
  if (client !== undefined) return client;
  const cfg = redisConfig();
  client = cfg ? new Redis({ url: cfg.url, token: cfg.token }) : null;
  return client;
}

export function requireRedis(): Redis {
  const r = redis();
  if (!r) throw new Error("redis tidak tersedia: operasi atomik ditolak (fail closed)");
  return r;
}

export async function cacheGet(key: string): Promise<string | null> {
  const r = redis();
  if (!r) return null;
  try {
    return await r.get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: string, ttlSec?: number): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    if (ttlSec) await r.set(key, value, { ex: ttlSec });
    else await r.set(key, value);
  } catch {
    // Cache best-effort; kegagalan tulis cache bukan kegagalan operasi.
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  const r = redis();
  if (!r || keys.length === 0) return;
  try {
    await r.del(...keys);
  } catch {
    // best-effort
  }
}
