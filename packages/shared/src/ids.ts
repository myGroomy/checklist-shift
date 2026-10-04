import { ulid } from "ulid";

// ID memakai ULID 26 karakter, dibuat di aplikasi (DATABASE_SCHEMA §2.1).
export function newId(): string {
  return ulid();
}

export function isId(v: unknown): v is string {
  return typeof v === "string" && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(v);
}
