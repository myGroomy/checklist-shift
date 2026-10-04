import { hash, verify } from "@node-rs/argon2";

// PIN 6 digit + argon2id + pepper (PRD AUTH-02). Pepper tidak pernah ke klien/log.
export function pinFormatOk(pin: unknown): pin is string {
  return typeof pin === "string" && /^[0-9]{6}$/.test(pin);
}

const BLOCKED = new Set([
  "000000", "111111", "222222", "333333", "444444", "555555",
  "666666", "777777", "888888", "999999",
  "123456", "654321", "123123", "321321", "112233", "121212", "987654",
]);

export function isWeakPin(pin: string): boolean {
  if (BLOCKED.has(pin)) return true;
  const d = pin.split("").map(Number);
  const up = d.every((v, i) => i === 0 || v === d[i - 1] + 1);
  const down = d.every((v, i) => i === 0 || v === d[i - 1] - 1);
  return up || down;
}

function pepper(): string {
  const v = process.env["PIN_PEPPER"];
  if (!v) throw new Error("PIN_PEPPER belum diisi (fail closed)");
  return v;
}

export async function hashPin(pin: string): Promise<string> {
  if (!pinFormatOk(pin)) throw new Error("format PIN salah");
  return hash(pin + pepper(), { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPin(pin: string, pinHash: string): Promise<boolean> {
  if (!pinFormatOk(pin)) return false;
  try {
    return await verify(pinHash, pin + pepper());
  } catch {
    return false;
  }
}
