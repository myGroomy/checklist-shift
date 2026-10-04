// Hook untuk state sinkronisasi offline
// Menggunakan Zustand untuk reactive state di seluruh app

import { create } from "zustand";
import { subscribeToCounts, getAppState } from "@/lib/offline/queue";
import { runSync, retryFailedActions } from "@/lib/offline/sync";
import { initOfflineDB } from "@/lib/offline/db";
import { initTimeCalibration } from "@/lib/offline/sync";
import { useOnline } from "./useOnline";
import { useEffect } from "react";

interface SyncState {
  // Counts
  pendingCount: number;
  failedCount: number;
  lastSyncAt: string | null;

  // Status
  isSyncing: boolean;
  lastSyncResult: { synced: number; failed: number; conflicts: number } | null;

  // Actions
  refreshCounts: () => Promise<void>;
  triggerSync: () => Promise<void>;
  triggerRetry: () => Promise<void>;
  initialize: () => Promise<void>;
}

// Store global
const useSyncStore = create<SyncState>((set, get) => ({
  pendingCount: 0,
  failedCount: 0,
  lastSyncAt: null,
  isSyncing: false,
  lastSyncResult: null,

  refreshCounts: async () => {
    const state = await getAppState();
    set({ pendingCount: state.pending, failedCount: state.failed, lastSyncAt: state.last_sync_at });
  },

  triggerSync: async () => {
    if (get().isSyncing) return;
    set({ isSyncing: true });
    try {
      const result = await runSync();
      set({ lastSyncResult: { synced: result.synced, failed: result.failed, conflicts: result.conflicts } });
      await get().refreshCounts();
    } catch (e) {
      console.error("[sync] Sync gagal:", e);
    } finally {
      set({ isSyncing: false });
    }
  },

  triggerRetry: async () => {
    await retryFailedActions();
    await get().refreshCounts();
  },

  initialize: async () => {
    await initOfflineDB();
    await initTimeCalibration();
    await get().refreshCounts();
  },
}));

// Hook React yang subscribe ke store + online status
export function useSync() {
  const isOnline = useOnline();
  const store = useSyncStore();

  // Subscribe ke perubahan count dari Dexie
  useEffect(() => {
    const unsubscribe = subscribeToCounts(() => {
      store.getState().refreshCounts();
    });
    return unsubscribe;
  }, []);

  // Auto-sync saat online kembali
  useEffect(() => {
    if (isOnline.isOnline && (store.pendingCount > 0 || store.failedCount > 0)) {
      // Debounce: tunggu sebentar setelah online
      const timer = setTimeout(() => {
        store.getState().triggerSync();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isOnline.isOnline, store.pendingCount, store.failedCount]);

  // Periodic sync saat online
  useEffect(() => {
    if (!isOnline.isOnline) return;
    const interval = setInterval(() => {
      const { pendingCount, failedCount, isSyncing } = store.getState();
      if ((pendingCount > 0 || failedCount > 0) && !isSyncing) {
        store.getState().triggerSync();
      }
    }, 30000); // Setiap 30 detik
    return () => clearInterval(interval);
  }, [isOnline.isOnline]);

  return {
    ...store,
    isOnline: isOnline.isOnline,
    wasOffline: isOnline.wasOffline,
  };
}

// Hook untuk inisialisasi sekali di app root
export function useSyncInit() {
  const initialize = useSyncStore((s) => s.initialize);
  useEffect(() => {
    initialize();
  }, [initialize]);
}