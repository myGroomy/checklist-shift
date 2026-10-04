// Report Hooks
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/client";

// Types
export interface ReportListItem {
  id: string;
  shift_instance_id: string;
  shift_name: string;
  shift_date: string;
  status: "berjalan" | "ditutup" | "ditutup_paksa" | "void";
  pj_name: string;
  progress: { wajib_total: number; wajib_selesai: number };
  incident_count: number;
  generated_at: string | null;
  is_locked: boolean;
}

export interface ReportDetail {
  id: string;
  shift_instance_id: string;
  shift_name: string;
  shift_date: string;
  status: string;
  pj_name: string;
  pj_user_id: string;
  opened_at: string;
  closed_at: string | null;
  close_type: string | null;
  is_incomplete: boolean;
  no_incident_confirmed: boolean;
  handover: {
    values: Record<string, string>;
    free_text: string;
    photo_ids: string[];
    submitted_by: string;
    submitted_at: string;
  } | null;
  handover_acks: Array<{
    user_id: string;
    user_name: string;
    read_at: string;
  }>;
  checklist: Array<{
    category_id: string;
    category_name: string;
    items: Array<{
      point_ref: string;
      judul: string;
      tipe: string;
      wajib: boolean;
      state: "belum" | "selesai" | "skip";
      nilai: string | null;
      di_luar_rentang: boolean;
      pengisi: string | null;
      diisi_pada: string | null;
      label_waktu: string | null;
      alasan_skip: string | null;
          target_time?: string | null;
          tolerance_minutes?: number | null;
          timing_delta_minutes?: number | null;
    }>;
  }>;
  incident: Array<{
    incident_id: string;
    category_name: string;
    description: string;
    occurred_at: string;
    reported_by_name: string;
    status: string;
    severity: string;
    photos: string[];
    catatan: Array<{ author_name: string; note: string; created_at: string }>;
  }>;
  kontribusi: Array<{
    user_id: string;
    user_name: string;
    aksi_count: number;
    item_selesai: number;
    item_skip: number;
  }>;
  addenda: Array<{
    id: string;
    author_name: string;
    note: string;
    created_at: string;
  }>;
  is_locked: boolean;
}

export interface ShareTokenPayload {
  branch_id: string;
  report_id: string;
  expires_in_hours: number;
  max_views?: number;
}

export interface PublicReport {
  ok: boolean;
  report: ReportDetail;
  token_info: {
    expires_at: string;
    revoked: boolean;
  };
}

// Get daftar laporan
export function useReportList(branchId: string, filters?: { status?: string; date_from?: string; date_to?: string; shift_def_id?: string }) {
  return useQuery({
    queryKey: queryKeys.report.list(branchId, filters),
    queryFn: () => api.get<{ reports: ReportListItem[] }>(`/api/report`, { branch_id: branchId, ...filters }),
    enabled: !!branchId,
  });
}

// Get detail laporan
export function useReportDetail(shiftId: string, branchId: string) {
  return useQuery({
    queryKey: queryKeys.report.detail(shiftId, branchId),
    queryFn: () => api.get<ReportDetail>(`/api/report/${shiftId}`, { branch_id: branchId }),
    enabled: !!shiftId && !!branchId,
  });
}

// Public report via token
export function usePublicReport(token: string) {
  return useQuery({
    queryKey: ["report", "public", token],
    queryFn: () => api.get<PublicReport>(`/r/${token}`, { requireAuth: false }),
    enabled: !!token,
    retry: false,
  });
}

// Buat token share (admin)
export function useCreateShareToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ShareTokenPayload) =>
      api.post<{ token: string; url: string; expires_at: string }>(`/api/share`, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.stats(variables.branch_id) });
    },
  });
}

// Cabut token share (admin)
export function useRevokeShareToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { branch_id: string; token_id: string }) =>
      api.post<{ ok: boolean }>(`/api/share/revoke`, data),
  });
}

// Tambah addendum (admin)
export function useAddAddendum(reportId: string, branchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (note: string) =>
      api.post<{ ok: boolean }>(`/api/report/${reportId}/addendum`, { note }, { branch_id: branchId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.report.detail(reportId, branchId) });
    },
  });
}

// Generate WhatsApp share URL
export function generateWhatsAppUrl(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

// Format template WhatsApp (dari pengaturan admin)
export function formatWhatsAppTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? "");
}