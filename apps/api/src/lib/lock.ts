import { randomUUID } from "node:crypto";
import { requireRedis } from "./redis.js";

// Lock Redis: nilai acak pemilik, TTL 10 detik, lepas via banding token (§7).
// Redis mati -> requireRedis melempar -> operasi atomik ditolak (fail closed).
const TTL_SEC = 10;

export async function acquireLock(key: string): Promise<string | null> {
  const r = requireRedis();
  const token = randomUUID();
  const ok = await r.set(key, token, { nx: true, ex: TTL_SEC });
  return ok ? token : null;
}

export async function releaseLock(key: string, token: string): Promise<void> {
  const r = requireRedis();
  // Lua: hanya hapus bila token pemilik cocok.
  await r.eval(
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
    [key],
    [token],
  );
}

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const token = await acquireLock(key);
  if (!token) throw new Error(`lock sibuk: ${key}`);
  try {
    return await fn();
  } finally {
    await releaseLock(key, token).catch(() => undefined);
  }
}
