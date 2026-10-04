import { z } from "zod";

// Cermin DATABASE_SCHEMA.md. HEADER adalah sumber kebenaran urutan/kolom
// untuk validasi header baris 1 (baca by nama, tulis RAW).

export const Bool = z.enum(["TRUE", "FALSE"]);
export const boolToCell = (b: boolean): "TRUE" | "FALSE" => (b ? "TRUE" : "FALSE");

export const Role = z.enum(["admin", "petugas"]);
export const ShiftStatus = z.enum(["berjalan", "ditutup", "ditutup_paksa", "void"]);
export const CloseType = z.enum(["normal", "paksa"]);
export const InputType = z.enum(["centang", "foto", "teks", "angka", "ok_tidak_ok"]);
export const EntryState = z.enum(["belum", "selesai", "skip"]);
export const TimingLabel = z.enum(["tepat_waktu", "lebih_awal", "terlambat"]);
export const EntryAction = z.enum(["selesai", "batal", "skip", "ubah_nilai"]);
export const Outcome = z.enum(["diterima", "ditolak_kalah"]);
export const HandoverFieldType = z.enum(["teks", "angka", "pilihan", "ya_tidak"]);
export const IncidentStatus = z.enum(["open", "selesai"]);
export const LinkSource = z.enum(["otomatis", "admin", "none"]);
export const Severity = z.enum(["rendah", "sedang", "tinggi"]);
export const PhotoOwner = z.enum(["entry", "handover", "incident"]);
export const PhotoStatus = z.enum(["pending", "uploaded", "purged"]);
export const Storage = z.enum(["drive", "blob"]);
export const FirstActionType = z.enum(["buka_shift", "centang", "isi", "skip", "incident", "saya_bertugas"]);

const id = z.string().length(26);
const opt = z.string().optional();
const dt = z.string(); // UTC ISO 8601, divalidasi longgar di repo

export const REGISTRY_HEADERS: Record<string, string[]> = {
  Branches: ["id", "name", "code", "address", "timezone", "spreadsheet_id", "schema_version", "is_active", "created_at", "updated_at"],
  BranchArchives: ["id", "branch_id", "from_month", "to_month", "spreadsheet_id", "created_at"],
  Users: ["id", "name", "username", "pin_hash", "role", "is_active", "must_change_pin", "locked_until", "last_login_at", "pin_changed_at", "created_at", "updated_at", "version"],
  UserBranchAccess: ["id", "user_id", "branch_id", "granted_by", "is_active", "created_at", "updated_at"],
  IncidentCategories: ["id", "name", "sort_order", "is_active", "created_at", "updated_at"],
  Settings: ["key", "value", "value_type", "updated_by", "updated_at"],
  ShareTokens: ["id", "secret_hash", "branch_id", "report_id", "shift_instance_id", "expires_at", "revoked_at", "revoked_by", "created_by", "created_at"],
  PushSubscriptions: ["id", "user_id", "endpoint", "p256dh", "auth", "device_info", "revoked_at", "created_at"],
  NotificationPrefs: ["id", "user_id", "type", "enabled", "updated_at"],
  AuditLog_Global: ["id", "seq", "at", "actor_id", "action", "object_type", "object_id", "branch_id", "shift_instance_id", "before", "after", "reason", "prev_hash", "hash"],
};

export const BranchUserRow = z.object({
  id, name: z.string(), username: z.string(), pin_hash: z.string(), role: Role,
  is_active: Bool, must_change_pin: Bool, locked_until: opt, last_login_at: opt,
  pin_changed_at: opt, created_at: dt, updated_at: dt, version: z.string(),
});

export const BranchRow = z.object({
  id, name: z.string(), code: z.string(), address: opt, timezone: z.string(),
  spreadsheet_id: z.string(), schema_version: z.string(),
  is_active: Bool, created_at: dt, updated_at: dt,
});

// Tab cabang (§5). TEMPLATE_HEADERS untuk tab non-partisi; MONTHLY_BUILDERS untuk partisi bulan.
export const BRANCH_TEMPLATE_HEADERS: Record<string, string[]> = {
  ShiftDefinitions: ["id", "name", "start_time", "end_time", "crosses_midnight", "sort_order", "is_active", "created_at", "updated_at", "version"],
  SopCategories: ["id", "shift_definition_id", "name", "sort_order", "is_active", "created_at", "updated_at", "version"],
  ChecklistPoints: ["id", "sop_category_id", "title", "instruction", "input_type", "is_required", "target_time", "tolerance_minutes", "active_days", "number_min", "number_max", "sort_order", "is_active", "created_at", "updated_at", "version"],
  HandoverFields: ["id", "shift_definition_id", "label", "field_type", "options", "is_required", "sort_order", "is_active", "created_at", "updated_at", "version"],
  ShiftInstances: ["id", "shift_definition_id", "shift_date", "tab_month", "status", "pj_user_id", "opened_by", "opened_at", "opened_outside_hours", "closed_at", "closed_by", "close_type", "force_close_reason", "is_incomplete", "no_incident_confirmed", "void_reason", "void_by", "void_at", "is_test", "snapshot_encoding", "template_snapshot", "snapshot_hash", "created_at", "updated_at", "version"],
  Participants: ["id", "shift_instance_id", "user_id", "first_action_at", "first_action_type", "created_at"],
  Reports: ["id", "shift_instance_id", "report_number", "generated_by", "generated_at", "is_locked", "summary_stats", "content_hash", "unlock_count", "last_unlocked_at", "last_unlocked_by", "created_at", "updated_at", "version"],
  Addenda: ["id", "report_id", "author_id", "note", "created_at"],
  Summary: ["id", "summary_date", "shift_definition_id", "shifts_total", "shifts_closed_normal", "shifts_closed_forced", "shifts_void", "required_total", "required_done", "required_skipped", "timed_on_time", "timed_early", "timed_late", "incidents_total", "incidents_open", "incidents_by_category", "handovers_read", "participants_count", "computed_at"],
  Snapshots: ["id", "shift_instance_id", "part_no", "chunk", "created_at"],
  IncidentIndex: ["incident_id", "tab_month", "status", "category_id", "shift_instance_id", "outside_shift", "reported_at", "is_test", "updated_at"],
};

export const MONTHLY_HEADERS: Record<string, string[]> = {
  Entries: ["id", "shift_instance_id", "point_ref", "state", "value", "out_of_range", "photo_ids", "completed_by", "completed_at", "timing_label", "timing_delta_minutes", "skip_reason", "created_at", "updated_at", "version"],
  EntryLogs: ["id", "shift_instance_id", "entry_id", "point_ref", "action", "outcome", "user_id", "winner_user_id", "prev_state", "new_state", "value", "note", "client_action_id", "client_at", "at", "created_at"],
  Handovers: ["id", "shift_instance_id", "values", "free_text", "photo_ids", "submitted_by", "submitted_at", "created_at", "updated_at"],
  HandoverAcks: ["id", "handover_id", "reading_shift_instance_id", "user_id", "read_at", "created_at"],
  Photos: ["id", "shift_instance_id", "owner_type", "owner_id", "storage", "file_ref", "mime", "size_bytes", "width", "height", "sort_order", "status", "uploaded_by", "uploaded_at", "purged_at", "created_at"],
  Incidents: ["id", "shift_instance_id", "tab_month", "category_id", "description", "occurred_at", "reported_by", "reported_at", "status", "outside_shift", "link_source", "linked_by", "linked_at", "source_entry_id", "severity", "status_changed_by", "status_changed_at", "is_test", "created_at", "updated_at", "version"],
  IncidentNotes: ["id", "incident_id", "author_id", "author_role", "note", "created_at"],
  AuditLog: ["id", "seq", "at", "actor_id", "action", "object_type", "object_id", "branch_id", "shift_instance_id", "before", "after", "reason", "prev_hash", "hash"],
};

export const monthlyTabName = (base: string, month: string): string => `${base}_${month}`;

export const ShiftInstanceRow = z.object({
  id, shift_definition_id: id, shift_date: z.string(), tab_month: z.string(),
  status: ShiftStatus, pj_user_id: id, opened_by: id, opened_at: dt,
  opened_outside_hours: Bool, closed_at: opt, closed_by: opt, close_type: opt,
  force_close_reason: opt, is_incomplete: Bool, no_incident_confirmed: Bool,
  void_reason: opt, void_by: opt, void_at: opt, is_test: Bool,
  snapshot_encoding: z.string(), template_snapshot: z.string(), snapshot_hash: z.string(),
  created_at: dt, updated_at: dt, version: z.string(),
});

export const EntryRow = z.object({
  id, shift_instance_id: id, point_ref: id, state: EntryState, value: opt,
  out_of_range: Bool, photo_ids: opt, completed_by: opt, completed_at: opt,
  timing_label: opt, timing_delta_minutes: opt, skip_reason: opt,
  created_at: dt, updated_at: dt, version: z.string(),
});

export const IncidentRow = z.object({
  id, shift_instance_id: opt, tab_month: z.string(), category_id: id,
  description: z.string(), occurred_at: dt, reported_by: id, reported_at: dt,
  status: IncidentStatus, outside_shift: Bool, link_source: LinkSource,
  linked_by: opt, linked_at: opt, source_entry_id: opt, severity: opt,
  status_changed_by: opt, status_changed_at: opt, is_test: Bool,
  created_at: dt, updated_at: dt, version: z.string(),
});
