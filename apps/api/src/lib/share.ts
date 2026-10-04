import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { REGISTRY_HEADERS, newId, nowIso } from "@checklist-shift/shared";
import { registryId } from "./env.js";
import { SheetRepo } from "./repo.js";
import { getIntSetting, getSetting } from "./settings.js";
import { fail } from "./close.js";

// Token publik laporan Fase 6 (skema §4.7 ShareTokens).
// Format di URL: {id}.{secret}. Secret 32 byte acak base64url; yang disimpan
// hanya SHA-256-nya. Lib Fase 1-2 tidak diubah; fail() dipakai-ulang dari
// lib/close.js (milik Fase 5, hanya diimpor).

export interface ShareTokenRow {
  id: string;
  secret: string;
  token: string;
  expires_at: string;
}

function tokenRepo(): SheetRepo {
  const id = registryId();
  if (!id) throw new Error("env registry belum lengkap");
  return new SheetRepo(id, "ShareTokens", REGISTRY_HEADERS["ShareTokens"]);
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

// Buat token + simpan hash-nya. Masa berlaku dari settings share_token_days.
export async function buatShareToken(
  branchId: string,
  reportId: string,
  shiftId: string,
  createdBy: string,
): Promise<ShareTokenRow> {
  const id = newId();
  const secret = randomBytes(32).toString("base64url");
  const days = await getIntSetting("share_token_days", 30);
  const expires = new Date(Date.parse(nowIso()) + days * 86400000).toISOString();
  const obj: Record<string, string> = {};
  for (const h of REGISTRY_HEADERS["ShareTokens"]) obj[h] = "";
  obj["id"] = id;
  obj["secret_hash"] = hashSecret(secret);
  obj["branch_id"] = branchId;
  obj["report_id"] = reportId;
  obj["shift_instance_id"] = shiftId;
  obj["expires_at"] = expires;
  obj["created_by"] = createdBy;
  obj["created_at"] = nowIso();
  await tokenRepo().append(obj);
  return { id, secret, token: `${id}.${secret}`, expires_at: expires };
}

export interface TokenValid {
  row: Record<string, string>;
}

// Verifikasi: id tak dikenal / secret salah -> 404 (tanpa bocor);
// kedaluwarsa / dicabut -> 410 + pesan informasi.
export async function verifikasiShareToken(token: string): Promise<TokenValid> {
  const dot = token.indexOf(".");
  const id = dot > 0 ? token.slice(0, dot) : "";
  const secret = dot > 0 ? token.slice(dot + 1) : "";
  if (!id || !secret) throw fail(404, "tautan_tidak_ada", "Tautan laporan tidak ditemukan.");
  const row = await tokenRepo().get(id).catch(() => null);
  if (!row || !row["secret_hash"]) {
    throw fail(404, "tautan_tidak_ada", "Tautan laporan tidak ditemukan.");
  }
  const a = Buffer.from(hashSecret(secret), "utf8");
  const b = Buffer.from(row["secret_hash"], "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw fail(404, "tautan_tidak_ada", "Tautan laporan tidak ditemukan.");
  }
  if (row["revoked_at"]) {
    throw fail(410, "tautan_dicabut", "Tautan ini sudah dicabut. Minta tautan baru kepada admin atau PJ.");
  }
  if (Date.parse(row["expires_at"] || "") <= Date.parse(nowIso())) {
    throw fail(410, "tautan_kedaluwarsa", "Tautan ini sudah kedaluwarsa. Minta tautan baru kepada admin atau PJ.");
  }
  return { row };
}

export async function cabutShareToken(id: string, revokedBy: string): Promise<Record<string, string>> {
  const row = await tokenRepo().get(id);
  if (!row) throw fail(404, "tautan_tidak_ada", "Tautan laporan tidak ditemukan.");
  if (row["revoked_at"]) return row;
  const now = nowIso();
  await tokenRepo().update(id, { revoked_at: now, revoked_by: revokedBy });
  return { ...row, revoked_at: now, revoked_by: revokedBy };
}

export interface WaVars {
  cabang: string;
  tanggal: string;
  shift: string;
  pj: string;
  ringkasan: string;
  tautan: string;
}

// Bangun pesan WhatsApp dari template settings whatsapp_template.
// Variabel tak dikenal dibiarkan apa adanya agar salah ketik terlihat.
export function bangunPesanWa(template: string, vars: WaVars): string {
  return template
    .replaceAll("{cabang}", vars.cabang)
    .replaceAll("{tanggal}", vars.tanggal)
    .replaceAll("{shift}", vars.shift)
    .replaceAll("{pj}", vars.pj)
    .replaceAll("{ringkasan}", vars.ringkasan)
    .replaceAll("{tautan}", vars.tautan);
}

export function waLink(pesan: string): string {
  return `https://wa.me/?text=${encodeURIComponent(pesan)}`;
}

export async function pesanBagikan(vars: WaVars): Promise<{ pesan: string; tautanWa: string }> {
  const template = await getSetting(
    "whatsapp_template",
    "Laporan {shift} {cabang} {tanggal} — PJ: {pj}. {ringkasan} {tautan}",
  );
  const pesan = bangunPesanWa(template, vars);
  return { pesan, tautanWa: waLink(pesan) };
}
