import { REGISTRY_HEADERS } from "@checklist-shift/shared";
import { registryId } from "./env.js";
import { cacheDel, cacheGet, cacheSet } from "./redis.js";
import { SheetRepo } from "./repo.js";

// Resolver cabang: branch_id -> spreadsheet_id dari registry (Branches + cache).
const repo = (): SheetRepo => {
  const id = registryId();
  if (!id) throw new Error("env registry belum lengkap");
  return new SheetRepo(id, "Branches", REGISTRY_HEADERS["Branches"]);
};

export async function resolveBranch(branchId: string): Promise<string> {
  const key = `branch:ss:${branchId}`;
  const hit = await cacheGet(key);
  if (hit) return hit;
  const row = await repo().get(branchId);
  const ss = row?.["spreadsheet_id"];
  if (!ss) throw new Error("cabang tidak ditemukan");
  if (row?.["is_active"] !== "TRUE") throw new Error("cabang nonaktif");
  await cacheSet(key, ss, 60);
  return ss;
}

export async function invalidateBranch(branchId: string): Promise<void> {
  await cacheDel(`branch:ss:${branchId}`);
}
