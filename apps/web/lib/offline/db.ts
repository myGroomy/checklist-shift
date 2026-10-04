// Dexie database untuk antrian offline (Fase 7)
// Menyimpan aksi checklist, incident, handover, foto, dan state sinkronisasi

import Dexie, { Table } from "dexie";
import type { OfflineAction, SyncConfig, TimeCalibration, OfflinePhotoType } from "@checklist-shift/shared";

export interface OfflineActionRecord extends OfflineAction {
  // Tambahan untuk indeks Dexie
  shift_instance_id: string | undefined;
  created_at: string;
  updated_at: string;
}

export interface OfflinePhotoRecord extends OfflinePhoto {
  blob: Blob; // Blob sebenarnya disimpan di sini
}

export interface SyncConfigRecord {
  id: "global";
  config: SyncConfig;
  updated_at: string;
}

export interface TimeCalibrationRecord {
  id: "global";
  calibration: TimeCalibration | null;
  updated_at: string;
}

export interface AppStateRecord {
  id: "global";
  last_sync_at: string | null;
  pending_count: number;
  failed_count: number;
  updated_at: string;
}

export class OfflineDB extends Dexie {
  actions!: Table<OfflineActionRecord, string>;
  photos!: Table<OfflinePhotoRecord, string>;
  syncConfig!: Table<SyncConfigRecord, string>;
  timeCalibration!: Table<TimeCalibrationRecord, string>;
  appState!: Table<AppStateRecord, string>;

  constructor() {
    super("checklist-shift-offline");
    this.version(1).stores({
      // actions: id PK, indeks untuk query cepat
      actions: "id, type, status, shift_instance_id, created_at, client_action_id",
      // photos: id PK, indeks action_id untuk join
      photos: "id, action_id, created_at",
      // singleton tables
      syncConfig: "id",
      timeCalibration: "id",
      appState: "id",
    });

    // Hook: update updated_at otomatis
    this.actions.hook("creating", (primKey, obj, trans) => {
      obj.updated_at = new Date().toISOString();
    });
    this.actions.hook("updating", (modifications, primKey, obj, trans) => {
      (modifications as Record<string, unknown>).updated_at = new Date().toISOString();
    });
  }
}

// Singleton instance
export const offlineDB = new OfflineDB();

// Helper: buka database (auto-migrasi)
export async function openOfflineDB(): Promise<OfflineDB> {
  await offlineDB.open();
  return offlineDB;
}

// Helper: tutup database
export async function closeOfflineDB(): Promise<void> {
  await offlineDB.close();
}

// Default config
export const defaultSyncConfig: SyncConfig = {
  max_retries: 5,
  base_delay_ms: 1000,
  max_delay_ms: 30000,
  batch_size: 10,
  auto_retry: true,
};

// Inisialisasi config default
export async function initSyncConfig(): Promise<void> {
  const existing = await offlineDB.syncConfig.get("global");
  if (!existing) {
    await offlineDB.syncConfig.put({
      id: "global",
      config: defaultSyncConfig,
      updated_at: new Date().toISOString(),
    });
  }
}

// Inisialisasi app state
export async function initAppState(): Promise<void> {
  const existing = await offlineDB.appState.get("global");
  if (!existing) {
    await offlineDB.appState.put({
      id: "global",
      last_sync_at: null,
      pending_count: 0,
      failed_count: 0,
      updated_at: new Date().toISOString(),
    });
  }
}

// Inisialisasi time calibration
export async function initTimeCalibration(): Promise<void> {
  const existing = await offlineDB.timeCalibration.get("global");
  if (!existing) {
    await offlineDB.timeCalibration.put({
      id: "global",
      calibration: null,
      updated_at: new Date().toISOString(),
    });
  }
}

// Inisialisasi lengkap
export async function initOfflineDB(): Promise<void> {
  await openOfflineDB();
  await initSyncConfig();
  await initAppState();
  await initTimeCalibration();
}