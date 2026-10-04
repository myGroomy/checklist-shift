import { z } from "zod";

// Skema request admin Fase 3 (PRD §7, DATABASE_SCHEMA §4-§5).
// Skema baris Sheets tetap di schemas.ts; di sini hanya validasi input API.

export const Ulid = z.string().length(26);
export const Pin6 = z.string().regex(/^[0-9]{6}$/);
export const TimeHHmm = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
export const MonthYM = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

// ADM-SEC-01: aksi sensitif wajib alasan + konfirmasi PIN pemohon.
export const SensitiveBody = z.object({
  alasan: z.string().trim().min(3).max(500),
  pin: Pin6,
});
export type SensitiveBody = z.infer<typeof SensitiveBody>;

// --- Cabang (registry Branches) ---
export const BranchCreate = z.object({
  spreadsheet_id: z.string().min(10).max(200),
  name: z.string().trim().min(2).max(100).optional(),
  code: z.string().trim().min(2).max(12).optional(),
  address: z.string().trim().max(300).optional(),
  timezone: z.string().trim().min(3).max(60).optional(),
});
export type BranchCreate = z.infer<typeof BranchCreate>;

export const BranchPatch = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  code: z.string().trim().min(2).max(12).optional(),
  address: z.string().trim().max(300).optional(),
  timezone: z.string().trim().min(3).max(60).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "Tidak ada perubahan." });
export type BranchPatch = z.infer<typeof BranchPatch>;

export const BranchCopyBody = SensitiveBody.extend({
  sumber_branch_id: Ulid,
});
export type BranchCopyBody = z.infer<typeof BranchCopyBody>;

export const CodeOk = (code: string): boolean => /^[A-Z0-9]{2,12}$/.test(code);

// --- Akun (registry Users + UserBranchAccess) ---
export const UsernameOk = (u: string): boolean => /^[a-z0-9]{3,30}$/.test(u);

export const UserCreate = z.object({
  name: z.string().trim().min(2).max(100),
  username: z.string().trim().min(3).max(30),
  pin: Pin6,
  role: z.enum(["admin", "petugas"]),
  cabang: z.array(Ulid).min(1).max(100),
});
export type UserCreate = z.infer<typeof UserCreate>;

export const UserPatch = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  role: z.enum(["admin", "petugas"]).optional(),
  cabang: z.array(Ulid).min(1).max(100).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "Tidak ada perubahan." });
export type UserPatch = z.infer<typeof UserPatch>;

// --- Definisi shift (tab cabang ShiftDefinitions) ---
export const ShiftDefCreate = z.object({
  name: z.string().trim().min(2).max(100),
  start_time: TimeHHmm,
  end_time: TimeHHmm,
  crosses_midnight: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});
export type ShiftDefCreate = z.infer<typeof ShiftDefCreate>;

export const ShiftDefPatch = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  start_time: TimeHHmm.optional(),
  end_time: TimeHHmm.optional(),
  crosses_midnight: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  is_active: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "Tidak ada perubahan." });
export type ShiftDefPatch = z.infer<typeof ShiftDefPatch>;

// --- Kategori SOP ---
export const SopCategoryCreate = z.object({
  name: z.string().trim().min(2).max(100),
  sort_order: z.number().int().min(0).max(9999).optional(),
});
export type SopCategoryCreate = z.infer<typeof SopCategoryCreate>;

export const SopCategoryPatch = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  is_active: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "Tidak ada perubahan." });
export type SopCategoryPatch = z.infer<typeof SopCategoryPatch>;

// --- Checklist point ---
export const ChecklistPointCreate = z.object({
  title: z.string().trim().min(2).max(300),
  instruction: z.string().trim().max(20000).optional(),
  input_type: z.enum(["centang", "foto", "teks", "angka", "ok_tidak_ok"]),
  is_required: z.boolean().optional(),
  target_time: TimeHHmm.optional(),
  tolerance_minutes: z.number().int().min(0).max(1440).optional(),
  active_days: z.string().regex(/^[1-7](,[1-7])*$/).optional(),
  number_min: z.number().optional(),
  number_max: z.number().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});
export type ChecklistPointCreate = z.infer<typeof ChecklistPointCreate>;

export const ChecklistPointPatch = z.object({
  title: z.string().trim().min(2).max(300).optional(),
  instruction: z.string().trim().max(20000).optional(),
  input_type: z.enum(["centang", "foto", "teks", "angka", "ok_tidak_ok"]).optional(),
  is_required: z.boolean().optional(),
  target_time: TimeHHmm.nullish(),
  tolerance_minutes: z.number().int().min(0).max(1440).nullish(),
  active_days: z.string().regex(/^[1-7](,[1-7])*$/).nullish(),
  number_min: z.number().nullish(),
  number_max: z.number().nullish(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  is_active: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "Tidak ada perubahan." });
export type ChecklistPointPatch = z.infer<typeof ChecklistPointPatch>;

// Urutan drag & drop: daftar id berurutan; sort_order ditulis ulang 1..n.
export const OrderBody = z.object({
  urutan: z.array(Ulid).min(1).max(500),
});
export type OrderBody = z.infer<typeof OrderBody>;

// --- Handover field ---
export const HandoverFieldCreate = z.object({
  label: z.string().trim().min(2).max(200),
  field_type: z.enum(["teks", "angka", "pilihan", "ya_tidak"]),
  options: z.array(z.string().trim().min(1).max(100)).min(2).max(20).optional(),
  is_required: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});
export type HandoverFieldCreate = z.infer<typeof HandoverFieldCreate>;

export const HandoverFieldPatch = z.object({
  label: z.string().trim().min(2).max(200).optional(),
  field_type: z.enum(["teks", "angka", "pilihan", "ya_tidak"]).optional(),
  options: z.array(z.string().trim().min(1).max(100)).min(2).max(20).nullish(),
  is_required: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  is_active: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "Tidak ada perubahan." });
export type HandoverFieldPatch = z.infer<typeof HandoverFieldPatch>;

// --- Kategori incident (registry global) ---
export const IncidentCategoryCreate = z.object({
  name: z.string().trim().min(2).max(100),
  sort_order: z.number().int().min(0).max(9999).optional(),
});
export type IncidentCategoryCreate = z.infer<typeof IncidentCategoryCreate>;

export const IncidentCategoryPatch = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  is_active: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "Tidak ada perubahan." });
export type IncidentCategoryPatch = z.infer<typeof IncidentCategoryPatch>;

// --- Settings: hanya kunci yang dikenal (§4.6) ---
export const KNOWN_SETTINGS = [
  "tolerance_default_minutes",
  "pin_max_attempts",
  "pin_lock_minutes",
  "session_days",
  "share_token_days",
  "incident_link_window_hours",
  "photo_max_count",
  "photo_max_size_kb",
  "photo_retention_days",
  "public_show_photos",
  "pin_block_weak",
  "whatsapp_template",
] as const;
export type KnownSetting = (typeof KNOWN_SETTINGS)[number];

export const SettingPut = z.object({
  value: z.string().max(20000),
});
export type SettingPut = z.infer<typeof SettingPut>;
