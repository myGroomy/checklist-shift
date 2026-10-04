import { REGISTRY_HEADERS } from "@checklist-shift/shared";
import { registryId } from "./env.js";
import { SheetRepo } from "./repo.js";
import { cacheGet, cacheSet } from "./redis.js";

function repo(): SheetRepo {
  const id = registryId();
  if (!id) throw new Error("env registry belum lengkap");
  return new SheetRepo(id, "Settings", REGISTRY_HEADERS["Settings"]);
}

// Memo proses 60 dtk + cache Redis 60 dtk (registry sudah di-cache di sana).
const memo = new Map<string, { v: string; at: number }>();

export async function getSetting(key: string, fallback: string): Promise<string> {
  const m = memo.get(key);
  if (m && Date.now() - m.at < 60000) return m.v;
  try {
    const hit = await cacheGet(`set:${key}`);
    if (hit !== null) {
      memo.set(key, { v: hit, at: Date.now() });
      return hit;
    }
    const row = await repo().get(key);
    const v = row?.["value"] ?? fallback;
    memo.set(key, { v, at: Date.now() });
    await cacheSet(`set:${key}`, v, 60);
    return v;
  } catch {
    return fallback;
  }
}

export async function getIntSetting(key: string, fallback: number): Promise<number> {
  const v = Number(await getSetting(key, String(fallback)));
  return Number.isFinite(v) ? v : fallback;
}
