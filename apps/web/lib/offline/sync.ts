// Mesin sinkronisasi offline (Fase 7)
// - Kalibrasi waktu server (BR-23)
// - Proses antrian dengan exponential backoff
// - Resolusi konflik BR-12 (tampilkan jelas, jangan buang diam-diam)
// - Auto-retry + manual retry

import { offlineDB, type TimeCalibrationRecord } from "./db";
import {
  getPendingActions,
  getFailedActions,
  updateActionStatus,
  recordActionError,
  resetActionForRetry,
  getPhotosForAction,
  updateLastSync,
  updateAppStateCountsWithNotify,
} from "./queue";
import { defaultSyncConfig } from "./db";
import type { OfflineActionRecord, SyncResult, SyncConfig, TimeCalibration } from "@checklist-shift/shared";

// Kalibrasi offset waktu server vs klien (BR-23)
let timeCalibration: TimeCalibration | null = null;
let calibrationPromise: Promise<TimeCalibration> | null = null;

// Ambil waktu server via HEAD request ke /api/time (endpoint khusus kalibrasi)
export async function calibrateServerTime(): Promise<TimeCalibration> {
  if (calibrationPromise) return calibrationPromise;

  calibrationPromise = (async () => {
    const clientBefore = new Date().toISOString();
    const clientBeforeMs = Date.now();

    try {
      // Gunakan endpoint /api/time yang mengembalikan Date header
      const res = await fetch("/api/time", {
        method: "HEAD",
        cache: "no-store",
        credentials: "include",
      });

      const clientAfterMs = Date.now();
      const clientAfter = new Date().toISOString();

      // Ambil Date header dari server
      const serverDateHeader = res.headers.get("Date");
      if (!serverDateHeader) {
        throw new Error("Server Date header tidak ada");
      }

      const serverTimeMs = Date.parse(serverDateHeader);
      if (!Number.isFinite(serverTimeMs)) {
        throw new Error("Server Date header tidak valid");
      }

      // Estimasi server time di tengah round-trip
      const rtt = clientAfterMs - clientBeforeMs;
      const estimatedServerTimeMs = serverTimeMs + rtt / 2;
      const offsetMs = estimatedServerTimeMs - clientAfterMs;

      const calibration: TimeCalibration = {
        server_time: new Date(estimatedServerTimeMs).toISOString(),
        client_time: clientAfter,
        offset_ms: offsetMs,
        measured_at: clientAfter,
        ttl_ms: 300000, // 5 menit
      };

      // Simpan ke IndexedDB
      await offlineDB.timeCalibration.put({
        id: "global",
        calibration,
        updated_at: new Date().toISOString(),
      });

      timeCalibration = calibration;
      return calibration;
    } catch (e) {
      console.warn("[sync] Kalibrasi waktu gagal:", e);
      // Fallback: offset 0
      const fallback: TimeCalibration = {
        server_time: new Date().toISOString(),
        client_time: new Date().toISOString(),
        offset_ms: 0,
        measured_at: new Date().toISOString(),
        ttl_ms: 60000,
      };
      timeCalibration = fallback;
      return fallback;
    } finally {
      calibrationPromise = null;
    }
  })();

  return calibrationPromise;
}

// Dapatkan waktu server terkoreksi (BR-23: pakai jam server, bukan HP)
export function getServerTimeNow(): Date {
  if (!timeCalibration) {
    return new Date();
  }
  const now = Date.now();
  const corrected = now + timeCalibration.offset_ms;
  return new Date(corrected);
}

// Dapatkan ISO string waktu server terkoreksi
export function getServerTimeIso(): string {
  return getServerTimeNow().toISOString();
}

// Cek apakah kalibrasi masih valid
export function isCalibrationValid(): boolean {
  if (!timeCalibration) return false;
  const age = Date.now() - Date.parse(timeCalibration.measured_at);
  return age < timeCalibration.ttl_ms;
}

// Inisialisasi kalibrasi saat startup
export async function initTimeCalibration(): Promise<void> {
  // Coba load dari IndexedDB dulu
  const record = await offlineDB.timeCalibration.get("global");
  if (record?.calibration && isCalibrationValid()) {
    timeCalibration = record.calibration;
    return;
  }
  // Kalibrasi baru
  await calibrateServerTime();
}

// Fungsi delay dengan jitter
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Hitung delay exponential backoff dengan jitter
function calculateBackoff(attempt: number, config: SyncConfig): number {
  const base = config.base_delay_ms * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * base; // 0-30% jitter
  return Math.min(base + jitter, config.max_delay_ms);
}

// Proses satu aksi offline
async function processAction(
  action: OfflineActionRecord,
  config: SyncConfig
): Promise<SyncResult> {
  const { id, type, payload, client_action_id, shift_instance_id } = action;

  // Update status ke mengirim
  await updateActionStatus(id, "mengirim");

  // Siapkan body request
  const body = {
    ...payload,
    client_action_id,
    // Tambahkan waktu klien terkoreksi untuk BR-23
    client_at: getServerTimeIso(),
  };

  // Ambil foto jika ada
  const photos = await getPhotosForAction(id);
  let photoFiles: File[] = [];
  if (photos.length > 0) {
    photoFiles = photos.map((p) => new File([p.blob], `photo-${p.id}.${p.mime.split("/")[1] || "jpg"}`, { type: p.mime }));
  }

  // Tentukan endpoint berdasarkan type
  let endpoint = "";
  let method = "POST";

  switch (type) {
    case "checklist_selesai":
    case "checklist_batal":
    case "checklist_skip":
    case "checklist_ubah_nilai":
      if (!shift_instance_id) throw new Error("shift_instance_id wajib untuk checklist");
      endpoint = `/api/checklist/${shift_instance_id}/aksi`;
      break;
    case "incident_buat":
      endpoint = "/api/incident";
      break;
    case "incident_catatan":
      endpoint = `/api/incident/${payload.incident_id}/catatan`;
      break;
    case "handover_draf":
      // Draf hanya lokal, tidak dikirim
      return { action_id: id, success: true };
    case "handover_kirim":
      if (!shift_instance_id) throw new Error("shift_instance_id wajib untuk handover");
      endpoint = `/api/shift/${shift_instance_id}/handover`;
      break;
    case "handover_baca":
      endpoint = "/api/handover/baca";
      break;
    default:
      throw new Error(`Tipe aksi tidak dikenal: ${type}`);
  }

  // Kirim request
  try {
    let res: Response;

    if (photoFiles.length > 0) {
      // Multipart form data untuk foto
      const formData = new FormData();
      formData.append("data", JSON.stringify(body));
      for (const file of photoFiles) {
        formData.append("photos", file);
      }
      res = await fetch(endpoint, {
        method,
        body: formData,
        credentials: "include",
      });
    } else {
      // JSON request
      res = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        credentials: "include",
      });
    }

    const responseData = await res.json().catch(() => ({}));

    if (res.ok) {
      // Sukses
      await updateActionStatus(id, "terkirim", {
        response: responseData,
        updated_at: getServerTimeIso(),
      });
      return {
        action_id: id,
        success: true,
        server_response: responseData,
      };
    }

    // Error dari server
    const errorCode = responseData?.error?.code ?? "unknown";
    const errorMsg = responseData?.error?.message ?? `HTTP ${res.status}`;

    // Cek apakah ini konflik BR-12 (sudah_diselesaikan)
    const isConflict = errorCode === "sudah_diselesaikan";

    if (isConflict) {
      // Konflik BR-12: aksi kalah, tapi jangan dihapus - tampilkan ke user
      await updateActionStatus(id, "terkirim", {
        response: responseData,
        updated_at: getServerTimeIso(),
      });
      return {
        action_id: id,
        success: false,
        error: errorMsg,
        server_response: responseData,
        conflict: true,
        conflict_winner: responseData?.error?.message?.match(/oleh (.+)\./)?.[1],
        conflict_action: type,
      };
    }

    // Error lain: lempar untuk retry
    throw new Error(`${errorCode}: ${errorMsg}`);
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    await recordActionError(id, errorMsg);
    return {
      action_id: id,
      success: false,
      error: errorMsg,
    };
  }
}

// Proses batch aksi
export async function processSyncBatch(
  actions: OfflineActionRecord[],
  config: SyncConfig
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  for (const action of actions) {
    // Kalibrasi ulang jika perlu (setiap batch)
    if (!isCalibrationValid()) {
      await calibrateServerTime();
    }

    const result = await processAction(action, config);
    results.push(result);

    // Jika gagal dan bukan konflik, hentikan batch (akan di-retry nanti)
    if (!result.success && !result.conflict) {
      break;
    }
  }

  return results;
}

// Fungsi utama sinkronisasi
export async function runSync(): Promise<{ results: SyncResult[]; synced: number; failed: number; conflicts: number }> {
  const configRecord = await offlineDB.syncConfig.get("global");
  const config: SyncConfig = configRecord?.config ?? defaultSyncConfig;

  // Kalibrasi waktu server
  await calibrateServerTime();

  // Ambil aksi pending
  const pending = await getPendingActions(config.batch_size);
  if (pending.length === 0) {
    await updateLastSync();
    return { results: [], synced: 0, failed: 0, conflicts: 0 };
  }

  // Proses batch
  const results = await processSyncBatch(pending, config);

  const synced = results.filter((r) => r.success && !r.conflict).length;
  const conflicts = results.filter((r) => r.conflict).length;
  const failed = results.filter((r) => !r.success && !r.conflict).length;

  // Auto-retry untuk yang gagal (bukan konflik)
  if (config.auto_retry && failed > 0) {
    // Schedule retry dengan backoff
    for (const action of pending) {
      const result = results.find((r) => r.action_id === action.id);
      if (result && !result.success && !result.conflict && action.retry_count < config.max_retries) {
        const backoff = calculateBackoff(action.retry_count, config);
        setTimeout(() => {
          runSync().catch(console.error);
        }, backoff);
      }
    }
  }

  await updateLastSync();
  await updateAppStateCountsWithNotify();

  return { results, synced, failed, conflicts };
}

// Retry manual untuk aksi gagal
export async function retryFailedActions(): Promise<void> {
  const configRecord = await offlineDB.syncConfig.get("global");
  const config: SyncConfig = configRecord?.config ?? defaultSyncConfig;

  const failed = await getFailedActions(config.batch_size);
  if (failed.length === 0) return;

  // Reset status ke menunggu
  for (const action of failed) {
    await resetActionForRetry(action.id);
  }

  // Jalankan sinkronisasi
  await runSync();
}

// Load kalibrasi dari DB saat startup
export async function loadCalibrationFromDB(): Promise<void> {
  const record = await offlineDB.timeCalibration.get("global");
  if (record?.calibration) {
    timeCalibration = record.calibration;
  }
}