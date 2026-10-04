import { createHash } from "node:crypto";
import { newId } from "@checklist-shift/shared";
import { valuesAppend, valuesGet } from "./sheets.js";

// Audit log append-only + hash chain (§11). Mendeteksi manipulasi, bukan mencegah.
// hash = SHA-256(prev_hash + "|" + canonicalJSON({seq,at,actor_id,action,
//   object_type,object_id,branch_id,shift_instance_id,before,after,reason}))
// Kolom: id,seq,at,actor_id,action,object_type,object_id,branch_id,
//   shift_instance_id,before,after,reason,prev_hash,hash

export interface AuditEntry {
  actor_id: string;
  action: string;
  object_type: string;
  object_id?: string;
  branch_id?: string;
  shift_instance_id?: string;
  before?: string;
  after?: string;
  reason?: string;
}

const GENESIS = "0".repeat(64);

function canonical(o: Record<string, string>): string {
  return JSON.stringify(o, Object.keys(o).sort());
}

export function chainHash(prev: string, body: Record<string, string>): string {
  return createHash("sha256").update(`${prev}|${canonical(body)}`).digest("hex");
}

export async function auditHead(spreadsheetId: string, tab: string): Promise<{ hash: string; seq: number }> {
  const rows = await valuesGet(spreadsheetId, `${tab}!B2:N100000`);
  if (rows.length === 0) return { hash: GENESIS, seq: 0 };
  const last = rows[rows.length - 1];
  return { hash: last[12] || GENESIS, seq: Number(last[0]) || rows.length };
}

export async function auditAppend(
  spreadsheetId: string,
  tab: string,
  at: string,
  entry: AuditEntry,
): Promise<string> {
  if (entry.before?.includes("pin_hash") || entry.after?.includes("pin_hash")) {
    throw new Error("audit tidak boleh memuat pin_hash");
  }
  const { hash: prev, seq: lastSeq } = await auditHead(spreadsheetId, tab);
  const seq = lastSeq + 1;
  const body: Record<string, string> = {
    seq: String(seq), at, actor_id: entry.actor_id, action: entry.action,
    object_type: entry.object_type, object_id: entry.object_id ?? "",
    branch_id: entry.branch_id ?? "", shift_instance_id: entry.shift_instance_id ?? "",
    before: entry.before ?? "", after: entry.after ?? "", reason: entry.reason ?? "",
  };
  const hash = chainHash(prev, body);
  const id = newId();
  await valuesAppend(spreadsheetId, `${tab}!A:N`, [[
    id, String(seq), at, entry.actor_id, entry.action, entry.object_type,
    entry.object_id ?? "", entry.branch_id ?? "", entry.shift_instance_id ?? "",
    entry.before ?? "", entry.after ?? "", entry.reason ?? "", prev, hash,
  ]]);
  return id;
}

// Pemeriksa rantai: hitung ulang dari genesis; kembalikan baris pertama yang rusak, atau null bila utuh.
export async function auditVerify(spreadsheetId: string, tab: string): Promise<number | null> {
  const rows = await valuesGet(spreadsheetId, `${tab}!A2:N100000`);
  let prev = GENESIS;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const body: Record<string, string> = {
      seq: r[1] ?? "", at: r[2] ?? "", actor_id: r[3] ?? "", action: r[4] ?? "",
      object_type: r[5] ?? "", object_id: r[6] ?? "", branch_id: r[7] ?? "",
      shift_instance_id: r[8] ?? "", before: r[9] ?? "", after: r[10] ?? "", reason: r[11] ?? "",
    };
    if ((r[12] ?? "") !== prev) return i + 2;
    if (chainHash(prev, body) !== (r[13] ?? "")) return i + 2;
    prev = r[13];
  }
  return null;
}
