// Operasi antrian offline: enqueue, update status, retry, hapus
// Menggunakan Dexie via offlineDB

import { offlineDB, type OfflineActionRecord, type OfflinePhotoRecord } from "./db";
import type { OfflineActionType, OfflineActionStatus } from "@checklist-shift/shared";
import { newId } from "@checklist-shift/shared";

// Generate ULID-compatible ID (26 char) di klien
function generateClientId(): string {
  return newId();
}

// Enqueue aksi baru ke database offline
export async function enqueueAction(
  type: OfflineActionType,
  payload: Record<string, unknown>,
  options?: {
    shift_instance_id?: string;
    photos?: Array<{ file: File; mime: string; width?: number; height?: number }>;
    client_action_id?: string;
  }
): Promise<string> {
  const now = new Date().toISOString();
  const actionId = options?.client_action_id ?? generateClientId();
  const clientActionId = options?.client_action_id ?? generateClientId();

  const action: OfflineActionRecord = {
    id: actionId,
    type,
    status: "menunggu",
    created_at: now,
    updated_at: now,
    retry_count: 0,
    client_action_id: clientActionId,
    shift_instance_id: options?.shift_instance_id,
    payload,
  };

  // Simpan foto sebagai Blob di IndexedDB
  const photoRecords: OfflinePhotoRecord[] = [];
  if (options?.photos) {
    for (let i = 0; i < options.photos.length; i++) {
      const p = options.photos[i];
      const photoId = generateClientId();
      photoRecords.push({
        id: photoId,
        action_id: actionId,
        blob_ref: photoId, // Key sama dengan id
        blob: p.file,
        mime: p.mime,
        size: p.file.size,
        width: p.width,
        height: p.height,
        created_at: now,
      });
    }
  }

  await offlineDB.transaction("rw", [offlineDB.actions, offlineDB.photos], async () => {
    await offlineDB.actions.put(action);
    if (photoRecords.length > 0) {
      await offlineDB.photos.bulkPut(photoRecords);
    }
    await updateAppStateCounts();
  });

  return actionId;
}

// Update status aksi
export async function updateActionStatus(
  actionId: string,
  status: OfflineActionStatus,
  extra?: Partial<OfflineActionRecord>
): Promise<void> {
  await offlineDB.actions.update(actionId, {
    status,
    ...extra,
    updated_at: new Date().toISOString(),
  });
  await updateAppStateCounts();
}

// Tambah error dan increment retry count
export async function recordActionError(actionId: string, error: string): Promise<void> {
  const action = await offlineDB.actions.get(actionId);
  if (action) {
    await offlineDB.actions.update(actionId, {
      status: "gagal",
      last_error: error,
      retry_count: action.retry_count + 1,
      updated_at: new Date().toISOString(),
    });
    await updateAppStateCounts();
  }
}

// Reset aksi gagal ke menunggu (untuk retry manual)
export async function resetActionForRetry(actionId: string): Promise<void> {
  await offlineDB.actions.update(actionId, {
    status: "menunggu",
    last_error: undefined,
    updated_at: new Date().toISOString(),
  });
  await updateAppStateCounts();
}

// Hapus aksi (mis. setelah sinkron sukses dan user bersihkan)
export async function deleteAction(actionId: string): Promise<void> {
  await offlineDB.transaction("rw", [offlineDB.actions, offlineDB.photos], async () => {
    await offlineDB.actions.delete(actionId);
    await offlineDB.photos.where("action_id").equals(actionId).delete();
    await updateAppStateCounts();
  });
}

// Hapus semua aksi terkirim (cleanup)
export async function clearSentActions(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const sentActions = await offlineDB.actions
    .where("status")
    .equals("terkirim")
    .and((a) => a.created_at < cutoff)
    .toArray();

  if (sentActions.length === 0) return 0;

  const ids = sentActions.map((a) => a.id);
  await offlineDB.transaction("rw", [offlineDB.actions, offlineDB.photos], async () => {
    await offlineDB.actions.bulkDelete(ids);
    for (const id of ids) {
      await offlineDB.photos.where("action_id").equals(id).delete();
    }
    await updateAppStateCounts();
  });

  return ids.length;
}

// Ambil aksi menunggu/mengirim untuk sinkronisasi
export async function getPendingActions(limit: number = 10): Promise<OfflineActionRecord[]> {
  return offlineDB.actions
    .where("status")
    .anyOf(["menunggu", "mengirim"])
    .sortBy("created_at")
    .then((actions) => actions.slice(0, limit));
}

// Ambil aksi gagal untuk retry
export async function getFailedActions(limit: number = 10): Promise<OfflineActionRecord[]> {
  return offlineDB.actions
    .where("status")
    .equals("gagal")
    .sortBy("created_at")
    .then((actions) => actions.slice(0, limit));
}

// Ambil semua aksi untuk shift tertentu (untuk UI)
export async function getActionsForShift(shiftInstanceId: string): Promise<OfflineActionRecord[]> {
  return offlineDB.actions
    .where("shift_instance_id")
    .equals(shiftInstanceId)
    .sortBy("created_at");
}

// Ambil aksi by ID
export async function getActionById(actionId: string): Promise<OfflineActionRecord | undefined> {
  return offlineDB.actions.get(actionId);
}

// Ambil foto untuk aksi
export async function getPhotosForAction(actionId: string): Promise<OfflinePhotoRecord[]> {
  return offlineDB.photos.where("action_id").equals(actionId).toArray();
}

// Update app state counts
async function updateAppStateCounts(): Promise<void> {
  const [pending, failed] = await Promise.all([
    offlineDB.actions.where("status").anyOf(["menunggu", "mengirim"]).count(),
    offlineDB.actions.where("status").equals("gagal").count(),
  ]);

  await offlineDB.appState.update("global", {
    pending_count: pending,
    failed_count: failed,
    updated_at: new Date().toISOString(),
  });
}

// Get app state
export async function getAppState(): Promise<{ pending: number; failed: number; last_sync_at: string | null }> {
  const state = await offlineDB.appState.get("global");
  return {
    pending: state?.pending_count ?? 0,
    failed: state?.failed_count ?? 0,
    last_sync_at: state?.last_sync_at ?? null,
  };
}

// Update last sync time
export async function updateLastSync(): Promise<void> {
  await offlineDB.appState.update("global", {
    last_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

// Subscribe ke perubahan count (untuk UI reactive)
let countSubscribers: Set<() => void> = new Set();

export function subscribeToCounts(callback: () => void): () => void {
  countSubscribers.add(callback);
  return () => countSubscribers.delete(callback);
}

async function notifyCountChange(): Promise<void> {
  for (const cb of countSubscribers) {
    try {
      cb();
    } catch {
      // ignore
    }
  }
}

const originalUpdateCounts = updateAppStateCounts;
export async function updateAppStateCountsWithNotify(): Promise<void> {
  await originalUpdateCounts();
  await notifyCountChange();
}