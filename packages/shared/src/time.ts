// Waktu disimpan UTC ISO 8601, tampil sesuai zona cabang (DATABASE_SCHEMA §2.1).
export function nowIso(): string {
  return new Date().toISOString();
}

export function isUtcIso(v: unknown): v is string {
  if (typeof v !== "string" || v.length === 0) return false;
  const t = Date.parse(v);
  return Number.isFinite(t) && v.endsWith("Z");
}

// YYYY-MM-DD menurut zona waktu cabang (BR-02 memakai tanggal pembukaan).
export function shiftDateIn(tz: string, at = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  return parts; // YYYY-MM-DD
}

// HH:mm dinding zona cabang.
export function wallTimeIn(tz: string, at = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
  return parts;
}

export function monthOf(dateYmd: string): string {
  return dateYmd.slice(0, 7); // YYYY-MM
}
