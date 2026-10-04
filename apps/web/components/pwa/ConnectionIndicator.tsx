// Indikator koneksi & antrian sinkronisasi (Fase 7)
// Tampil di bawah header saat offline atau ada antrian

"use client";

import { useSync } from "@/hooks/useSync";
import { WifiOff, AlertCircle, RotateCcw, Clock, XCircle, CheckCircle } from "lucide-react";
import { useState } from "react";

export function ConnectionIndicator() {
  const { isOnline, wasOffline, pendingCount, failedCount, isSyncing, lastSyncResult, triggerSync, triggerRetry } = useSync();
  const [showDetails, setShowDetails] = useState(false);

  // Jika online dan tidak ada antrian, sembunyikan
  if (isOnline && pendingCount === 0 && failedCount === 0 && !wasOffline) {
    return null;
  }

  const hasQueue = pendingCount > 0 || failedCount > 0;

  return (
    <div
      className={`fixed top-16 left-0 right-0 z-40 px-4 transition-all duration-300 ${
        hasQueue || !isOnline ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="max-w-md mx-auto">
        {/* Banner utama */}
        <div
          className={`flex items-center gap-3 rounded-lg border p-3 shadow-lg transition-colors ${
            !isOnline
              ? "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-200"
              : failedCount > 0
              ? "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/30 dark:border-red-800 dark:text-red-200"
              : "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-200"
          }`}
        >
          {/* Icon status */}
          <div className="flex-shrink-0">
            {!isOnline ? (
              <WifiOff className="w-5 h-5" aria-hidden="true" />
            ) : failedCount > 0 ? (
              <AlertCircle className="w-5 h-5" aria-hidden="true" />
            ) : isSyncing ? (
              <RotateCcw className="w-5 h-5 animate-spin" aria-hidden="true" />
            ) : pendingCount > 0 ? (
              <Clock className="w-5 h-5" aria-hidden="true" />
            ) : (
              <CheckCircle className="w-5 h-5" aria-hidden="true" />
            )}
          </div>

          {/* Teks status */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {!isOnline
                ? "Mode offline — perubahan disimpan lokal"
                : isSyncing
                ? "Menyinkronkan..."
                : failedCount > 0
                ? `${failedCount} aksi gagal, ${pendingCount} menunggu`
                : pendingCount > 0
                ? `${pendingCount} aksi menunggu sinkronisasi`
                : wasOffline
                ? "Kembali online — menyinkronkan..."
                : "Terhubung"}
            </p>
            {lastSyncResult && (
              <p className="text-xs mt-1 opacity-80">
                Terakhir: {lastSyncResult.synced} tersinkron
                {lastSyncResult.conflicts > 0 && `, ${lastSyncResult.conflicts} konflik`}
                {lastSyncResult.failed > 0 && `, ${lastSyncResult.failed} gagal`}
              </p>
            )}
          </div>

          {/* Tombol aksi */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {failedCount > 0 && (
              <button
                onClick={triggerRetry}
                disabled={isSyncing}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-current bg-transparent hover:bg-current/10 transition-colors disabled:opacity-50"
                aria-label="Coba lagi aksi gagal"
              >
                Coba Lagi
              </button>
            )}
            {(!isOnline || pendingCount > 0) && !isSyncing && (
              <button
                onClick={triggerSync}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-current text-white hover:opacity-90 transition-opacity"
                aria-label="Sinkronkan sekarang"
              >
                Sinkronkan
              </button>
            )}

            {/* Toggle detail */}
            <button
              onClick={() => setShowDetails((d) => !d)}
              className="p-1.5 rounded-md hover:bg-current/10 transition-colors"
              aria-label={showDetails ? "Sembunyikan detail" : "Tampilkan detail"}
              aria-expanded={showDetails}
            >
              <Sync className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Detail antrian (expandable) */}
        {showDetails && hasQueue && (
          <SyncQueueSummary
            pendingCount={pendingCount}
            failedCount={failedCount}
            onRetry={triggerRetry}
            onSync={triggerSync}
            isSyncing={isSyncing}
            onClose={() => setShowDetails(false)}
          />
        )}
      </div>
    </div>
  );
}

// Komponen ringkasan antrian (dipakai di ConnectionIndicator dan SyncQueueDrawer)
function SyncQueueSummary({
  pendingCount,
  failedCount,
  onRetry,
  onSync,
  isSyncing,
  onClose,
}: {
  pendingCount: number;
  failedCount: number;
  onRetry: () => void;
  onSync: () => void;
  isSyncing: boolean;
  onClose: () => void;
}) {
  return (
    <div className="mt-2 rounded-lg border bg-white p-3 shadow-lg dark:bg-gray-800 animate-slide-down">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium">Antrian Sinkronisasi</h4>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Tutup">
          <XCircle className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg bg-blue-50 p-2 text-center dark:bg-blue-900/30">
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{pendingCount}</p>
          <p className="text-xs text-blue-700 dark:text-blue-300">Menunggu</p>
        </div>
        <div className="rounded-lg bg-red-50 p-2 text-center dark:bg-red-900/30">
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{failedCount}</p>
          <p className="text-xs text-red-700 dark:text-red-300">Gagal</p>
        </div>
      </div>

      <div className="flex gap-2">
        {failedCount > 0 && (
          <button
            onClick={onRetry}
            disabled={isSyncing}
            className="flex-1 px-3 py-2 text-sm font-medium rounded-md border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50 dark:border-red-700 dark:text-red-300 dark:bg-red-900/30 dark:hover:bg-red-900/50"
          >
            Coba Lagi Semua
          </button>
        )}
        <button
          onClick={onSync}
          disabled={isSyncing}
          className="flex-1 px-3 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isSyncing ? "Menyinkronkan..." : "Sinkronkan Sekarang"}
        </button>
      </div>
    </div>
  );
}

// Animasi slide down
const style = document.createElement("style");
style.textContent = `
  @keyframes slide-down {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-slide-down { animation: slide-down 0.2s ease-out; }
`;
if (typeof document !== "undefined") {
  document.head.appendChild(style);
}