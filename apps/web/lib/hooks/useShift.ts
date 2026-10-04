// Shift & Checklist Hooks
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/client";
import {} from "react";

// Types
export interface HandoverData {
  id: string;
  shift_instance_id: string;
  values: Record<string, string>;
  free_text: string;
  photo_ids: string[];
  submitted_by: string;
  submitted_at: string;
}

export interface HandoverAck {
  user_id: string;
  user_name: string;
  read_at: string;
}

export interface PreviousHandoverResponse {
  handover: HandoverData | null;
  incident_open: Array<{
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
  }>;
  handover_acks: HandoverAck[];
}

export interface ShiftListItem {
  id: string;
  shift_definition_id: string;
  shift_date: string;
  status: "belum_dibuka" | "berjalan" | "ditutup" | "ditutup_paksa" | "void";
  pj_user_id: string;
  pj_name: string;
  progress: { wajib_total: number; wajib_selesai: number };
}

export interface ShiftDetail {
  shift_id: string;
  status: string;
  kategori: Array<{
    id: string;
    nama: string;
    butir: Array<{
      point_ref: string;
      judul: string;
      instruksi: string;
      tipe: string;
      wajib: boolean;
      target_time: string | null;
      toleransi_menit: number | null;
      rentang: { min: number | null; max: number | null } | null;
      state: "belum" | "selesai" | "skip";
      nilai: string | null;
      di_luar_rentang: boolean;
      pengisi: string | null;
      diisi_pada: string | null;
      label_waktu: string | null;
      timing_delta_minutes: number | null;
      alasan_skip: string | null;
    }>;
  }>;
  progress: { wajib_total: number; wajib_selesai: number };
}

export interface ChecklistActionPayload {
  point_ref: string;
  action: "selesai" | "batal" | "skip" | "ubah_nilai";
  value?: string;
  skip_reason?: string;
  client_action_id: string;
  client_at: string;
}

export interface ChecklistActionResponse {
  ok: boolean;
  state: "belum" | "selesai" | "skip";
  timing_label?: string | null;
  timing_delta_minutes?: number | null;
  di_luar_rentang?: boolean;
  diulang?: boolean;
}

// Get daftar shift untuk cabang
export function useShiftList(branchId: string, status?: string) {
  return useQuery({
    queryKey: queryKeys.shift.list(branchId, status),
    queryFn: () => api.get<{ shifts: ShiftListItem[] }>(`/api/shift`, { branch_id: branchId, status }),
    enabled: !!branchId,
  });
}

// Get shift aktif (berjalan) untuk cabang
export function useActiveShift(branchId: string) {
  return useQuery({
    queryKey: queryKeys.shift.active(branchId),
    queryFn: () => api.get<{ shift: ShiftListItem | null }>(`/api/shift/active`, { branch_id: branchId }),
    enabled: !!branchId,
    refetchInterval: 15000, // Polling 15 detik (CK-10)
  });
}

// Get detail checklist untuk shift
export function useChecklistDetail(shiftId: string, branchId: string) {
  return useQuery<ShiftDetail>({
    queryKey: queryKeys.checklist.detail(shiftId, branchId),
    queryFn: () => api.get<ShiftDetail>(`/api/checklist/${shiftId}`, { branch_id: branchId }),
    enabled: !!shiftId && !!branchId,
    refetchInterval: 30000, // Polling 30 detik untuk progress bersama
  });
}

// Get handover sebelumnya
export function usePreviousHandover(shiftInstanceId: string, branchId: string) {
  return useQuery<PreviousHandoverResponse>({
    queryKey: queryKeys.checklist.handover(shiftInstanceId, branchId),
    queryFn: () => api.get<PreviousHandoverResponse>(`/api/handover/sebelumnya`, {
      shift_instance_id: shiftInstanceId,
      branch_id: branchId,
    }),
    enabled: !!shiftInstanceId && !!branchId,
  });
}

// Buka shift mutation
export function useOpenShift() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { branch_id: string; shift_def_id: string; is_test?: boolean }) =>
      api.post<{ shiftId: string; shiftDate: string; openedOutsideHours: boolean; joined: boolean }>(
        "/api/shift/buka",
        data
      ),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shift.list(variables.branch_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.shift.active(variables.branch_id) });
    },
  });
}

// Gabung shift mutation
export function useJoinShift() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { branch_id: string; shift_id: string }) =>
      api.post<{ sudah: boolean }>("/api/shift/gabung", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shift.list(variables.branch_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.shift.active(variables.branch_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.checklist.detail(variables.shift_id, variables.branch_id) });
    },
  });
}

// Saya bertugas mutation
export function useSayaBertugas() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { branch_id: string; shift_id: string }) =>
      api.post<{ sudah: boolean }>("/api/shift/saya-bertugas", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.checklist.detail(variables.shift_id, variables.branch_id) });
    },
  });
}

// Checklist action mutation (centang, batal, skip, ubah nilai)
export function useChecklistAction(shiftId: string, branchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ChecklistActionPayload) =>
      api.post<ChecklistActionResponse>(`/api/checklist/${shiftId}/aksi`, payload, { branch_id: branchId }),
    onMutate: async (payload) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.checklist.detail(shiftId, branchId) });
      const previous = queryClient.getQueryData<ShiftDetail>(queryKeys.checklist.detail(shiftId, branchId));

      queryClient.setQueryData<ShiftDetail>(queryKeys.checklist.detail(shiftId, branchId), (old) => {
        if (!old) return old;
        return {
          ...old,
          kategori: old.kategori.map((kat) => ({
            ...kat,
            butir: kat.butir.map((butir) => {
              if (butir.point_ref !== payload.point_ref) return butir;

              switch (payload.action) {
                case "selesai":
                  return { ...butir, state: "selesai", nilai: payload.value ?? "TRUE", pengisi: "Saya", diisi_pada: new Date().toISOString() };
                case "batal":
                  return { ...butir, state: "belum", nilai: null, pengisi: null, diisi_pada: null, label_waktu: null };
                case "skip":
                  return { ...butir, state: "skip", alasan_skip: payload.skip_reason ?? "", pengisi: "Saya", diisi_pada: new Date().toISOString() };
                case "ubah_nilai":
                  return { ...butir, nilai: payload.value ?? butir.nilai };
                default:
                  return butir;
              }
            }),
          })),
        };
      });

      return { previous };
    },
    onError: (err, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.checklist.detail(shiftId, branchId), context.previous);
      }
      throw err;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.checklist.detail(shiftId, branchId) });
    },
  });
}

// Tutup shift mutation (stepper 3 langkah)
export function useCloseShift(shiftId: string, branchId: string) {
  const queryClient = useQueryClient();

  const validate = useMutation({
    mutationFn: (pin: string) =>
      api.post<{ ok: boolean; missing: unknown[] }>(`/api/shift/${shiftId}/tutup/validasi`, { pin }, { branch_id: branchId }),
  });

  const submitHandover = useMutation({
    mutationFn: (data: { values: Record<string, string>; free_text: string; photo_ids: string[]; no_incident: boolean }) =>
      api.post<{ ok: boolean }>(`/api/shift/${shiftId}/handover`, data, { branch_id: branchId }),
  });

  const confirmClose = useMutation({
    mutationFn: (pin: string) =>
      api.post<{ ok: boolean; report_id: string }>(`/api/shift/${shiftId}/tutup/konfirmasi`, { pin }, { branch_id: branchId }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shift.list(branchId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.shift.active(branchId) });
      // Redirect ke laporan akan di-handle di component
    },
  });

  return { validate, submitHandover, confirmClose };
}