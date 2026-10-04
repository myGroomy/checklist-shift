import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";import { REGISTRY_HEADERS, SESSION_COOKIE, type SessionClaims } from "@checklist-shift/shared";
import { registryId } from "./env.js";
import { SheetRepo } from "./repo.js";
import { valuesGet } from "./sheets.js";
import { isSessionLive, verifyJwt } from "./session.js";

export interface Principal {
  userId: string;
  role: "admin" | "petugas";
  name: string;
  branches: string[]; // branch_id aktif
  claims: SessionClaims;
}

export type AuthEnv = { Variables: { principal: Principal } };
export type AuthContext = Context<AuthEnv>;

function usersRepo(): SheetRepo {
  const id = registryId();
  if (!id) throw new Error("env registry belum lengkap");
  return new SheetRepo(id, "Users", REGISTRY_HEADERS["Users"]);
}

// Muat user + akses cabang aktif. Akun nonaktif/sesi mati -> 401.
export async function loadPrincipal(token: string): Promise<Principal> {
  const claims = await verifyJwt(token);
  const ok = await isSessionLive(claims.sub, claims.sid, claims.iat);
  if (!ok) {
    const e = new Error("sesi tidak berlaku") as Error & { status?: number };
    e.status = 401;
    throw e;
  }
  const user = await usersRepo().get(claims.sub);
  if (!user || user["is_active"] !== "TRUE") {
    const e = new Error("akun nonaktif") as Error & { status?: number };
    e.status = 401;
    throw e;
  }
  const reg = registryId() as string;
  const access = await valuesGet(reg, "UserBranchAccess!A2:E10000");
  const branches = access.filter((r) => r[1] === claims.sub && r[4] === "TRUE").map((r) => r[2]);
  return {
    userId: claims.sub,
    role: user["role"] as "admin" | "petugas",
    name: user["name"] ?? "",
    branches,
    claims,
  };
}

export async function requireAuth(c: AuthContext, next: Next): Promise<Response | void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: { code: "butuh_login", message: "Masuk dulu." } }, 401);
  try {
    c.set("principal", await loadPrincipal(token));
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (msg.includes("fail closed") || msg.includes("belum diisi")) {
      return c.json({ error: { code: "layanan_belum_siap", message: "Layanan sesi belum siap." } }, 503);
    }
    return c.json({ error: { code: "sesi_tidak_berlaku", message: "Sesi berakhir. Masuk lagi." } }, 401);
  }
  await next();
}

export async function adminOnly(c: AuthContext, next: Next): Promise<Response | void> {
  const p = c.get("principal");
  if (p.role !== "admin") {
    return c.json({ error: { code: "khusus_admin", message: "Khusus admin." } }, 403);
  }
  await next();
}

export function branchGuard(branchId: string) {
  return async (c: AuthContext, next: Next): Promise<Response | void> => {
    const p = c.get("principal");
    if (p.role !== "admin" && !p.branches.includes(branchId)) {
      return c.json({ error: { code: "di_luar_akses", message: "Di luar cabang aksesmu." } }, 403);
    }
    await next();
  };
}
