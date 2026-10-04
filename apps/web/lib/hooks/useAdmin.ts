// Admin Hooks - 13 Modul
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/client";

// ==================== TYPES ====================

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string | null;
  timezone: string;
  spreadsheet_id: string;
  schema_version: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  name: string;
  username: string;
  role: "admin" | "petugas";
  is_active: boolean;
  must_change_pin: boolean;
  locked_until: string | null;
  last_login_at: string | null;
  branches: string[];
  created_at: string;
  updated_at: string;
}

export interface ShiftDefinition {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  crosses_midnight: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface SopCategory {
  id: string;
  shift_definition_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface ChecklistPoint {
  id: string;
  sop_category_id: string;
  title: string;
  instruction: string | null;
  input_type: "centang" | "foto" | "teks" | "angka" | "ok_tidak_ok";
  is_required: boolean;
  target_time: string | null;
  tolerance_minutes: number | null;
  active_days: string;
  number_min: number | null;
  number_max: number | null;
  sort_order: number;
  is_active: boolean;
}

export interface HandoverField {
  id: string;
  shift_definition_id: string;
  label: string;
  field_type: "teks" | "angka" | "pilihan" | "ya_tidak";
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface IncidentCategory {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface ShiftOpsItem {
  id: string;
  branch_id: string;
  branch_name: string;
  shift_definition_id: string;
  shift_name: string;
  shift_date: string;
  status: string;
  pj_user_id: string;
  pj_name: string;
  opened_at: string;
  progress: { wajib_total: number; wajib_selesai: number };
  shift_instance_id: string;
  is_locked: boolean;
}

export interface AdminStats {
  branch_id: string;
  branch_name: string;
  period: string;
  shifts_total: number;
  shifts_closed_normal: number;
  shifts_closed_forced: number;
  shifts_void: number;
  required_total: number;
  required_done: number;
  required_skipped: number;
  timed_on_time: number;
  timed_early: number;
  timed_late: number;
  incidents_total: number;
  incidents_open: number;
  incidents_by_category: Record<string, number>;
  handovers_read: number;
  participants_avg: number;
}

export interface AuditLogEntry {
  id: string;
  seq: number;
  at: string;
  actor_id: string;
  actor_name: string;
  action: string;
  object_type: string;
  object_id: string;
  branch_id: string | null;
  branch_name: string | null;
  shift_instance_id: string | null;
  before: string | null;
  after: string | null;
  reason: string | null;
}

export interface SystemSettings {
  tolerance_default_minutes: number;
  pin_max_attempts: number;
  pin_lock_minutes: number;
  pin_block_weak: boolean;
  session_days: number;
  incident_link_window_hours: number;
  photo_max_size_kb: number;
  photo_retention_days: number;
  public_show_photos: boolean;
  wa_template: string;
}

// ==================== BRANCH ====================

export function useBranches() {
  return useQuery({
    queryKey: queryKeys.admin.branches(),
    queryFn: () => api.get<{ branches: Branch[] }>("/api/admin/branches"),
  });
}

export function useCreateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Branch, "id" | "created_at" | "updated_at" | "schema_version">) =>
      api.post<{ branch: Branch }>("/api/admin/branches", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.branches() }),
  });
}

export function useUpdateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Branch> & { id: string }) =>
      api.patch<{ branch: Branch }>(`/api/admin/branches/${data.id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.branches() }),
  });
}

export function useVerifyBranchSpreadsheet() {
  return useMutation({
    mutationFn: (spreadsheetId: string) =>
      api.post<{ ok: boolean; missing_tabs: string[] }>("/api/admin/branches/verify", { spreadsheet_id: spreadsheetId }),
  });
}

export function useCopyBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { source_branch_id: string; target_branch_id: string; scope: string[] }) =>
      api.post<{ ok: boolean }>("/api/admin/branches/copy", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.branches() }),
  });
}

// ==================== USERS ====================

export function useUsers(branchId?: string) {
  return useQuery({
    queryKey: queryKeys.admin.users(branchId),
    queryFn: () => api.get<{ users: User[] }>("/api/admin/users", branchId ? { branch_id: branchId } : {}),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; username: string; pin: string; role: "admin" | "petugas"; branch_ids: string[] }) =>
      api.post<{ user: User }>("/api/admin/users", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.users() }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<User> & { id: string }) =>
      api.patch<{ user: User }>(`/api/admin/users/${data.id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.users() }),
  });
}

export function useResetUserPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { user_id: string; new_pin: string }) =>
      api.post<{ ok: boolean }>("/api/admin/users/reset-pin", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.users() }),
  });
}

export function useUnlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (user_id: string) =>
      api.post<{ ok: boolean }>("/api/admin/users/unlock", { user_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.users() }),
  });
}

export function useForceLogoutUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (user_id: string) =>
      api.post<{ ok: boolean }>("/api/admin/users/force-logout", { user_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.users() }),
  });
}

// ==================== SHIFT DEFINITIONS ====================

export function useShiftDefinitions(branchId: string) {
  return useQuery({
    queryKey: queryKeys.admin.shiftDefs(branchId),
    queryFn: () => api.get<{ shifts: ShiftDefinition[] }>(`/api/admin/shift-definitions`, { branch_id: branchId }),
    enabled: !!branchId,
  });
}

export function useCreateShiftDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<ShiftDefinition, "id"> & { branch_id: string }) =>
      api.post<{ shift: ShiftDefinition }>("/api/admin/shift-definitions", data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: queryKeys.admin.shiftDefs(vars.branch_id) }),
  });
}

export function useUpdateShiftDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ShiftDefinition> & { id: string; branch_id: string }) =>
      api.patch<{ shift: ShiftDefinition }>(`/api/admin/shift-definitions/${data.id}`, data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: queryKeys.admin.shiftDefs(vars.branch_id) }),
  });
}

// ==================== CHECKLIST BUILDER ====================

export function useSopCategories(branchId: string, shiftDefId?: string) {
  return useQuery({
    queryKey: queryKeys.admin.categories(branchId, shiftDefId),
    queryFn: () => api.get<{ categories: SopCategory[] }>(`/api/admin/sop-categories`, {
      branch_id: branchId,
      shift_definition_id: shiftDefId,
    }),
    enabled: !!branchId,
  });
}

export function useCreateSopCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<SopCategory, "id"> & { branch_id: string }) =>
      api.post<{ category: SopCategory }>("/api/admin/sop-categories", data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: queryKeys.admin.categories(vars.branch_id, vars.shift_definition_id) }),
  });
}

export function useUpdateSopCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SopCategory> & { id: string; branch_id: string }) =>
      api.patch<{ category: SopCategory }>(`/api/admin/sop-categories/${data.id}`, data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: queryKeys.admin.categories(vars.branch_id, vars.shift_definition_id) }),
  });
}

export function useReorderSopCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { branch_id: string; shift_definition_id: string; category_ids: string[] }) =>
      api.post<{ ok: boolean }>("/api/admin/sop-categories/reorder", data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: queryKeys.admin.categories(vars.branch_id, vars.shift_definition_id) }),
  });
}

export function useChecklistPoints(branchId: string, categoryId?: string) {
  return useQuery({
    queryKey: queryKeys.admin.checklistPoints(branchId, categoryId),
    queryFn: () => api.get<{ points: ChecklistPoint[] }>(`/api/admin/checklist-points`, {
      branch_id: branchId,
      category_id: categoryId,
    }),
    enabled: !!branchId,
  });
}

export function useCreateChecklistPoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<ChecklistPoint, "id"> & { branch_id: string }) =>
      api.post<{ point: ChecklistPoint }>("/api/admin/checklist-points", data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: queryKeys.admin.checklistPoints(vars.branch_id, vars.sop_category_id) }),
  });
}

export function useUpdateChecklistPoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ChecklistPoint> & { id: string; branch_id: string }) =>
      api.patch<{ point: ChecklistPoint }>(`/api/admin/checklist-points/${data.id}`, data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: queryKeys.admin.checklistPoints(vars.branch_id, vars.sop_category_id) }),
  });
}

export function useReorderChecklistPoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { branch_id: string; category_id: string; point_ids: string[] }) =>
      api.post<{ ok: boolean }>("/api/admin/checklist-points/reorder", data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: queryKeys.admin.checklistPoints(vars.branch_id, vars.category_id) }),
  });
}

export function useDuplicateChecklistPoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { point_id: string; branch_id: string; target_category_id?: string }) =>
      api.post<{ point: ChecklistPoint }>("/api/admin/checklist-points/duplicate", data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: queryKeys.admin.checklistPoints(vars.branch_id) }),
  });
}

// ==================== HANDOVER BUILDER ====================

export function useHandoverFields(branchId: string, shiftDefId?: string) {
  return useQuery({
    queryKey: queryKeys.admin.handoverFields(branchId, shiftDefId),
    queryFn: () => api.get<{ fields: HandoverField[] }>(`/api/admin/handover-fields`, {
      branch_id: branchId,
      shift_definition_id: shiftDefId,
    }),
    enabled: !!branchId,
  });
}

export function useCreateHandoverField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<HandoverField, "id"> & { branch_id: string }) =>
      api.post<{ field: HandoverField }>("/api/admin/handover-fields", data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: queryKeys.admin.handoverFields(vars.branch_id, vars.shift_definition_id) }),
  });
}

export function useUpdateHandoverField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<HandoverField> & { id: string; branch_id: string }) =>
      api.patch<{ field: HandoverField }>(`/api/admin/handover-fields/${data.id}`, data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: queryKeys.admin.handoverFields(vars.branch_id, vars.shift_definition_id) }),
  });
}

export function useReorderHandoverFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { branch_id: string; shift_definition_id: string; field_ids: string[] }) =>
      api.post<{ ok: boolean }>("/api/admin/handover-fields/reorder", data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: queryKeys.admin.handoverFields(vars.branch_id, vars.shift_definition_id) }),
  });
}

// ==================== INCIDENT CATEGORIES ====================

export function useIncidentCategories() {
  return useQuery({
    queryKey: queryKeys.admin.incidentCategories(),
    queryFn: () => api.get<{ categories: IncidentCategory[] }>("/api/admin/incident-categories"),
  });
}

export function useCreateIncidentCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<IncidentCategory, "id">) =>
      api.post<{ category: IncidentCategory }>("/api/admin/incident-categories", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.incidentCategories() }),
  });
}

export function useUpdateIncidentCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<IncidentCategory> & { id: string }) =>
      api.patch<{ category: IncidentCategory }>(`/api/admin/incident-categories/${data.id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.incidentCategories() }),
  });
}

// ==================== OPERASI SHIFT ====================

export function useShiftOperations() {
  return useQuery({
    queryKey: queryKeys.admin.shiftOps(),
    queryFn: () => api.get<{ shifts: ShiftOpsItem[] }>("/api/admin/shift-ops"),
  });
}

export function useForceCloseShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { shift_id: string; branch_id: string; reason: string; pin: string }) =>
      api.post<{ ok: boolean }>("/api/admin/shift-ops/force-close", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.shiftOps() }),
  });
}

export function useChangePj() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { shift_id: string; branch_id: string; new_pj_id: string; pin: string }) =>
      api.post<{ ok: boolean }>("/api/admin/shift-ops/change-pj", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.shiftOps() }),
  });
}

export function useOpenOnBehalf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { branch_id: string; shift_def_id: string; pj_user_id: string; pin: string }) =>
      api.post<{ shift_id: string }>("/api/admin/shift-ops/open-on-behalf", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.shiftOps() }),
  });
}

export function useVoidShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { shift_id: string; branch_id: string; reason: string; pin: string }) =>
      api.post<{ ok: boolean }>("/api/admin/shift-ops/void", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.shiftOps() }),
  });
}

export function useUnlockReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { report_id: string; branch_id: string; reason: string; pin: string }) =>
      api.post<{ ok: boolean }>("/api/admin/shift-ops/unlock-report", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.shiftOps() }),
  });
}

// ==================== INCIDENT ADMIN ====================

export function useAdminIncidents(branchId?: string) {
  return useQuery({
    queryKey: queryKeys.admin.incidents(branchId),
    queryFn: () => api.get<{ incidents: IncidentListItem[] }>(`/api/admin/incidents`, branchId ? { branch_id: branchId } : {}),
  });
}

export function useUpdateIncidentStatusAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { incident_id: string; branch_id: string; status: "open" | "selesai"; alasan?: string }) =>
      api.patch<{ ok: boolean }>(`/api/admin/incidents/${data.incident_id}/status`, data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: queryKeys.admin.incidents(vars.branch_id) }),
  });
}

export function useLinkIncidentAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { incident_id: string; branch_id: string; shift_instance_id: string; alasan?: string }) =>
      api.post<{ ok: boolean }>(`/api/admin/incidents/${data.incident_id}/link`, data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: queryKeys.admin.incidents(vars.branch_id) }),
  });
}

// ==================== STATISTIK & EKSPOR ====================

export function useAdminStats(branchId: string, range?: string) {
  return useQuery({
    queryKey: queryKeys.admin.stats(branchId, range),
    queryFn: () => api.get<AdminStats>(`/api/admin/stats`, { branch_id: branchId, range }),
    enabled: !!branchId,
  });
}

export function useExportReport() {
  return useMutation({
    mutationFn: (data: { branch_id: string; format: "pdf" | "csv"; range?: string; shift_def_id?: string }) =>
      api.post<{ url: string }>("/api/admin/export", data),
  });
}

// ==================== AUDIT LOG ====================

export function useAuditLog(filters?: { branch_id?: string; actor_id?: string; action?: string; date_from?: string; date_to?: string }) {
  return useQuery({
    queryKey: queryKeys.admin.auditLog(filters),
    queryFn: () => api.get<{ logs: AuditLogEntry[] }>("/api/admin/audit-log", filters),
  });
}

// ==================== PENGATURAN ====================

export function useSystemSettings() {
  return useQuery({
    queryKey: queryKeys.admin.settings(),
    queryFn: () => api.get<SystemSettings>("/api/admin/settings"),
  });
}

export function useUpdateSystemSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SystemSettings>) =>
      api.patch<{ settings: SystemSettings }>("/api/admin/settings", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.settings() }),
  });
}

// ==================== SHARE TOKEN ====================

export function useCreateShareToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { branch_id: string; report_id: string; expires_in_hours: number; max_views?: number }) =>
      api.post<{ token: string; url: string; expires_at: string }>("/api/share", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.stats("") }),
  });
}

export function useRevokeShareToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { branch_id: string; token_id: string }) =>
      api.post<{ ok: boolean }>("/api/share/revoke", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.stats("") }),
  });
}