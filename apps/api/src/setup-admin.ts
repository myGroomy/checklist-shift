// Bootstrap admin PERTAMA dari env (ADM-AC-01, ADM-AC-06).
// Jalankan: npm run setup:admin --workspace=apps/api
// Fail-closed bila ADMIN_* kosong; tolak bila sudah ada admin aktif.
import { REGISTRY_HEADERS, newId, nowIso } from "@checklist-shift/shared";
import { registryId } from "./lib/env.js";
import { SheetRepo } from "./lib/repo.js";
import { valuesGet } from "./lib/sheets.js";
import { auditAppend } from "./lib/audit.js";
import { hashPin, pinFormatOk } from "./lib/pin.js";
import { withLock } from "./lib/lock.js";

async function main() {
  const name = process.env["ADMIN_NAME"]?.trim();
  const username = process.env["ADMIN_USER"]?.trim().toLowerCase();
  const pin = process.env["ADMIN_PIN"];
  if (!name || !username || !pin) {
    throw new Error("ADMIN_NAME/ADMIN_USER/ADMIN_PIN wajib diisi (fail closed)");
  }
  if (!/^[a-z0-9]{3,30}$/.test(username)) throw new Error("ADMIN_USER tidak valid");
  if (!pinFormatOk(pin)) throw new Error("ADMIN_PIN harus 6 angka");

  const reg = registryId();
  if (!reg) throw new Error("env registry belum lengkap");
  const users = new SheetRepo(reg, "Users", REGISTRY_HEADERS["Users"]);

  const snap = await valuesGet(reg, "Users!A2:F10000");
  if (snap.some((r) => r[4] === "admin" && r[5] === "TRUE")) {
    throw new Error("sudah ada admin aktif — bootstrap ditolak");
  }

  const id = newId();
  const now = nowIso();
  await withLock(`lock:user:${username}`, async () => {
    const col = await valuesGet(reg, "Users!C2:C10000");
    if (col.some((r) => (r[0] ?? "").toLowerCase() === username)) {
      throw new Error("username sudah dipakai");
    }
    await users.append({
      id, name, username, pin_hash: await hashPin(pin),
      role: "admin", is_active: "TRUE", must_change_pin: "TRUE",
      locked_until: "", last_login_at: "", pin_changed_at: "",
      created_at: now, updated_at: now, version: "1",
    });
  });
  await auditAppend(reg, "AuditLog_Global", now, {
    actor_id: id, action: "akun.buat", object_type: "user", object_id: id,
    reason: "bootstrap admin pertama",
  });
  console.log(`admin pertama dibuat: ${username} (wajib ganti PIN saat login pertama)`);
}

main().catch((e) => {
  console.error("setup gagal:", (e as Error).message);
  process.exit(1);
});
