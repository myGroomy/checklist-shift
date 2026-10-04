// Tipe untuk antrian offline (Fase 7). Dibagi agar bisa dipakai web & api.
import { z } from "zod";

export const OfflineActionType = z.enum([
  "checklist_selesai",
  "checklist_batal",
  "checklist_skip",
  "checklist_ubah_nilai",
  "incident_buat",
  "incident_catatan",
  "handover_draf",
  "handover_kirim",
  "handover_baca",
]);

export type OfflineActionType = z.infer<typeof OfflineActionType>;

export const OfflineActionStatus = z.enum(["menunggu", "mengirim", "terkirim", "gagal"]);
export type OfflineActionStatus = z.infer<typeof OfflineActionStatus>;

// Base action yang dikirim ke API
export const OfflineActionBase = z.object({
  id: z.string(), // ULID dibuat di klien
  type: OfflineActionType,
  status: OfflineActionStatus,
  created_at: z.string(), // ISO 8601 lokal (waktu device)
  updated_at: z.string(),
  retry_count: z.number().default(0),
  last_error: z.string().optional(),
  client_action_id: z.string(), // Idempotensi
  shift_instance_id: z.string().optional(), // untuk aksi terkait shift
  payload: z.record(z.unknown()), // Body request API
  response: z.record(z.unknown()).optional(), // Respons server bila sukses
});

// Foto offline: disimpan sebagai Blob di IndexedDB, referensi di sini
export const OfflinePhoto = z.object({
  id: z.string(),
  action_id: z.string(), // ID action induk
  blob_ref: z.string(), // Key di object store "photos" Dexie
  mime: z.string(),
  size: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  created_at: z.string(),
});

export type OfflineAction = z.infer<typeof OfflineActionBase> & {
  photos?: OfflinePhotoType[];
};

export type OfflinePhotoType = z.infer<typeof OfflinePhoto>;

// Konfigurasi sinkronisasi
export const SyncConfig = z.object({
  max_retries: z.number().default(5),
  base_delay_ms: z.number().default(1000),
  max_delay_ms: z.number().default(30000),
  batch_size: z.number().default(10),
  auto_retry: z.boolean().default(true),
});

export type SyncConfig = z.infer<typeof SyncConfig>;

// Kalibrasi waktu server (BR-23)
export const TimeCalibration = z.object({
  server_time: z.string(), // ISO 8601 UTC dari server
  client_time: z.string(), // ISO 8601 UTC saat request dikirim
  offset_ms: z.number(), // server - client (positif = server lebih cepat)
  measured_at: z.string(),
  ttl_ms: z.number().default(300000), // 5 menit
});

export type TimeCalibration = z.infer<typeof TimeCalibration>;

// Hasil sinkronisasi aksi offline
export const SyncResult = z.object({
  action_id: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
  server_response: z.record(z.unknown()).optional(),
  conflict: z.boolean().default(false), // BR-12: aksi kalah
  conflict_winner: z.string().optional(), // nama pengguna yang menang
  conflict_action: z.string().optional(), // aksi yang dilakukan pemenang
});

export type SyncResult = z.infer<typeof SyncResult>;