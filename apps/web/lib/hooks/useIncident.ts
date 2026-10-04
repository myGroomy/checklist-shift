// Incident Hooks
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/client";

// Types
export interface IncidentListItem {
  incident_id: string;
  category_id: string;
  category_name: string;
  description: string;
  shift_instance_id: string | null;
  outside_shift: boolean;
  reported_at: string;
  reported_by_name: string;
  status: "open" | "selesai";
  severity: "rendah" | "sedang" | "tinggi";
}

export interface IncidentDetail {
  id: string;
  shift_instance_id: string | null;
  tab_month: string;
  category_id: string;
  category_name: string;
  description: string;
  occurred_at: string;
  reported_by: string;
  reported_by_name: string;
  reported_at: string;
  status: "open" | "selesai";
  outside_shift: boolean;
  link_source: "otomatis" | "admin" | "none";
  linked_by: string | null;
  linked_at: string | null;
  source_entry_id: string | null;
  severity: "rendah" | "sedang" | "tinggi";
  status_changed_by: string | null;
  status_changed_at: string | null;
  is_test: boolean;
  photos: Array<{
    id: string;
    file_ref: string;
    mime: string;
    size_bytes: number;
    width: number | null;
    height: number | null;
  }>;
  catatan: Array<{
    id: string;
    author_id: string;
    author_name: string;
    author_role: "admin" | "petugas";
    note: string;
    created_at: string;
  }>;
}

export interface CreateIncidentPayload {
  branch_id: string;
  category_id: string;
  description: string;
  occurred_at?: string;
  photo_ids: string[];
  severity?: "rendah" | "sedang" | "tinggi";
}

export interface AddNotePayload {
  branch_id: string;
  note: string;
}

export interface UpdateStatusPayload {
  branch_id: string;
  status: "open" | "selesai";
  alasan?: string;
}

export interface LinkShiftPayload {
  branch_id: string;
  shift_instance_id: string;
  alasan?: string;
}

// Get incident open untuk cabang
export function useOpenIncidents(branchId: string) {
  return useQuery({
    queryKey: queryKeys.incident.open(branchId),
    queryFn: () => api.get<{ incident_open: IncidentListItem[] }>(`/api/incident/open`, { branch_id: branchId }),
    enabled: !!branchId,
    refetchInterval: 30000,
  });
}

// Get detail incident
export function useIncidentDetail(id: string, branchId: string) {
  return useQuery({
    queryKey: queryKeys.incident.detail(id, branchId),
    queryFn: () => api.get<IncidentDetail>(`/api/incident/${id}`, { branch_id: branchId }),
    enabled: !!id && !!branchId,
  });
}

// Buat incident mutation
export function useCreateIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateIncidentPayload) =>
      api.post<{ incident: { id: string; outside_shift: boolean; link_source: string } }>("/api/incident", payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.incident.open(variables.branch_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.incident.list(variables.branch_id) });
    },
  });
}

// Tambah catatan incident
export function useAddIncidentNote(incidentId: string, branchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: AddNotePayload) =>
      api.post<{ catatan: { id: string } }>(`/api/incident/${incidentId}/catatan`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.incident.detail(incidentId, branchId) });
    },
  });
}

// Update status incident (admin only)
export function useUpdateIncidentStatus(incidentId: string, branchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateStatusPayload) =>
      api.patch<{ ok: boolean }>(`/api/incident/${incidentId}/status`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.incident.detail(incidentId, branchId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.incident.open(branchId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.incident.list(branchId) });
    },
  });
}

// Tautkan incident ke shift (admin only)
export function useLinkIncident(incidentId: string, branchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: LinkShiftPayload) =>
      api.post<{ ok: boolean }>(`/api/incident/${incidentId}/tautkan`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.incident.detail(incidentId, branchId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.incident.open(branchId) });
    },
  });
}