// Drawer antrian sinkronisasi (Fase 7)
// Menampilkan daftar aksi menunggu/gagal dengan detail dan tombol retry per item

"use client";

import { useSync } from "@/hooks/useSync";
import { getPendingActions, getFailedActions, getPhotosForAction, resetActionForRetry, deleteAction } from "@/lib/offline/queue";
import { runSync } from "@/lib/offline/sync";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  RotateCcw,
  Trash2,
  ChevronDown,
  ChevronUp,
  Eye,
  FileText,
  Camera,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";

type ActionStatus = "menunggu" | "mengirim" | "terkirim" | "gagal";

interface QueueAction {
  id: string;
  type: string;
  status: ActionStatus;
  created_at: string;
  updated_at: string;
  retry_count: number;
  last_error?: string;
  client_action_id: string;
  shift_instance_id?: string;
  payload: Record<string, unknown>;
  response?: Record<string, unknown>;
  photos?: Array<{ id: string; mime: string; size: number }>;
  conflict?: boolean;
  conflict_winner?: string;
  conflict_action?: string;
}

export function SyncQueueDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isOnline, pendingCount, failedCount, isSyncing, triggerSync, triggerRetry } = useSync();
  const [pendingActions, setPendingActions] = useState<QueueAction[]>([]);
  const [failedActions, setFailedActions] = useState<QueueAction[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<"menunggu" | "gagal">("menunggu");

  // Load actions
  const loadActions = useCallback(async () => {
    setLoading(true);
    try {
      const [pending, failed] = await Promise.all([getPendingActions(50), getFailedActions(50)]);

      // Enrich dengan foto
      const enrich = async (actions: typeof pending) => {
        const enriched = await Promise.all(
          actions.map(async (a) => {
            const photos = await getPhotosForAction(a.id);
            return {
              ...a,
              photos: photos.map((p) => ({ id: p.id, mime: p.mime, size: p.size })),
            };
          })
        );
        return enriched;
      };

      setPendingActions(await enrich(pending));
      setFailedActions(await enrich(failed));
    } catch (e) {
      console.error("[SyncQueueDrawer] Load gagal:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadActions();
  }, [open, loadActions]);

  // Refresh saat sync selesai
  useEffect(() => {
    if (!isSyncing && open) loadActions();
  }, [isSyncing, open, loadActions]);

  if (!open) return null;

  const allActions = selectedTab === "menunggu" ? pendingActions : failedActions;
  const hasActions = allActions.length > 0;

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRetry = async (actionId: string) => {
    await resetActionForRetry(actionId);
    await runSync();
    loadActions();
  };

  const handleDelete = async (actionId: string) => {
    if (confirm("Hapus aksi ini dari antrian? Perubahan lokal akan hilang.")) {
      await deleteAction(actionId);
      loadActions();
    }
  };

  const formatActionType = (type: string): { label: string; icon: React.ReactNode } => {
    switch (type) {
      case "checklist_selesai":
        return { label: "Centang item", icon: <CheckCircle className="w-4 h-4" /> };
      case "checklist_batal":
        return { label: "Batalkan centang", icon: <XCircle className="w-4 h-4" /> };
      case "checklist_skip":
        return { label: "Skip item", icon: <MessageSquare className="w-4 h-4" /> };
      case "checklist_ubah_nilai":
        return { label: "Ubah nilai", icon: <FileText className="w-4 h-4" /> };
      case "incident_buat":
        return { label: "Buat incident", icon: <AlertCircle className="w-4 h-4" /> };
      case "incident_catatan":
        return { label: "Catatan incident", icon: <MessageSquare className="w-4 h-4" /> };
      case "handover_kirim":
        return { label: "Kirim handover", icon: <FileText className="w-4 h-4" /> };
      case "handover_baca":
        return { label: "Baca handover", icon: <Eye className="w-4 h-4" /> };
      default:
        return { label: type, icon: <FileText className="w-4 h-4" /> };
    }
  };

  const formatStatus = (status: ActionStatus, conflict?: boolean) => {
    if (conflict) return { label: "Konflik (kalah)", color: "text-amber-600 dark:text-amber-400", icon: <AlertCircle className="w-4 h-4" /> };
    switch (status) {
      case "menunggu":
        return { label: "Menunggu", color: "text-blue-600 dark:text-blue-400", icon: <Clock className="w-4 h-4" /> };
      case "mengirim":
        return { label: "Mengirim...", color: "text-blue-600 dark:text-blue-400", icon: <Loader2 className="w-4 h-4 animate-spin" /> };
      case "terkirim":
        return { label: "Terkirim", color: "text-green-600 dark:text-green-400", icon: <CheckCircle className="w-4 h-4" /> };
      case "gagal":
        return { label: "Gagal", color: "text-red-600 dark:text-red-400", icon: <AlertCircle className="w-4 h-4" /> };
    }
  };

  const formatTime = (iso: string) => {
    try {
      return format(parseISO(iso), "HH:mm:ss", { locale: localeId });
    } catch {
      return iso;
    }
  };

  const formatDateTime = (iso: string) => {
    try {
      return format(parseISO(iso), "dd MMM HH:mm", { locale: localeId });
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-labelledby="queue-title">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white shadow-xl flex flex-col animate-slide-in dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4 sticky top-0 bg-white/95 backdrop-blur dark:bg-gray-900/95 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <RotateCcw className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 id="queue-title" className="text-lg font-semibold">Antrian Sinkronisasi</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isOnline ? "Online" : "Offline"} • {pendingCount} menunggu • {failedCount} gagal
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Tutup">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Tab filter */}
        <div className="flex border-b px-4 bg-gray-50 dark:bg-gray-800/50">
          <button
            onClick={() => setSelectedTab("menunggu")}
            className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
              selectedTab === "menunggu"
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 dark:text-gray-400"
            }`}
          >
            Menunggu {pendingCount > 0 && <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full dark:bg-blue-900/30 dark:text-blue-300">{pendingCount}</span>}
          </button>
          <button
            onClick={() => setSelectedTab("gagal")}
            className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
              selectedTab === "gagal"
                ? "border-red-600 text-red-600 dark:text-red-400"
                : "border-transparent text-gray-500 dark:text-gray-400"
            }`}
          >
            Gagal {failedCount > 0 && <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded-full dark:bg-red-900/30 dark:text-red-300">{failedCount}</span>}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : !hasActions ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500 dark:text-gray-400">
              {selectedTab === "menunggu" ? (
                <>
                  <Clock className="w-12 h-12 mb-2 opacity-50" />
                  <p className="text-center">Tidak ada aksi menunggu</p>
                </>
              ) : (
                <>
                  <CheckCircle className="w-12 h-12 mb-2 opacity-50" />
                  <p className="text-center">Tidak ada aksi gagal</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {allActions.map((action) => {
                const isExpanded = expandedIds.has(action.id);
                const { label: typeLabel, icon: typeIcon } = formatActionType(action.type);
                const { label: statusLabel, color, icon: statusIcon } = formatStatus(action.status, action.conflict);

                return (
                  <div
                    key={action.id}
                    className={`rounded-lg border p-3 transition-colors ${
                      action.status === "gagal"
                        ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/30"
                        : action.conflict
                        ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/30"
                        : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50"
                    }`}
                  >
                    {/* Header baris */}
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 p-1.5 rounded bg-current/10">{typeIcon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium truncate">{typeLabel}</p>
                          <span className={`flex items-center gap-1 text-xs font-medium ${color} whitespace-nowrap`}>
                            {statusIcon} {statusLabel}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                          {action.shift_instance_id ? `Shift: ${action.shift_instance_id.slice(0, 8)}...` : "Tanpa shift"}
                        </p>
                      </div>
                      <button
                        onClick={() => toggleExpand(action.id)}
                        className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        aria-label={isExpanded ? "Sembunyikan detail" : "Tampilkan detail"}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </button>
                    </div>

                    {/* Detail expandable */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t space-y-2">
                        {/* Waktu */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-gray-500 dark:text-gray-400">Dibuat</p>
                            <p className="font-mono">{formatDateTime(action.created_at)}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 dark:text-gray-400">Diupdate</p>
                            <p className="font-mono">{formatDateTime(action.updated_at)}</p>
                          </div>
                          {action.retry_count > 0 && (
                            <div className="col-span-2">
                              <p className="text-gray-500 dark:text-gray-400">Percobaan ulang</p>
                              <p className="font-mono text-amber-600 dark:text-amber-400">{action.retry_count}x</p>
                            </div>
                          )}
                        </div>

                        {/* Payload (ringkas) */}
                        <details className="group">
                          <summary className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                            <FileText className="w-3 h-3" /> Payload
                          </summary>
                          <pre className="mt-1 p-2 text-xs bg-gray-100 dark:bg-gray-800 rounded overflow-x-auto max-h-32">
                            {JSON.stringify(action.payload, null, 2)}
                          </pre>
                        </details>

                        {/* Foto */}
                        {action.photos && action.photos.length > 0 && (
                          <details className="group">
                            <summary className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                              <Camera className="w-3 h-3" /> Foto ({action.photos.length})
                            </summary>
                            <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
                              {action.photos.map((photo) => (
                                <div key={photo.id} className="flex-shrink-0 w-20 h-20 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                  <span className="text-xs text-gray-500">{Math.round(photo.size / 1024)} KB</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}

                        {/* Error / Konflik */}
                        {(action.last_error || action.conflict) && (
                          <div className="p-2 rounded bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
                            {action.conflict && (
                              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 mb-1">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                <span className="text-sm font-medium">Konflik BR-12: Aksi kalah</span>
                              </div>
                            )}
                            {action.conflict_winner && (
                              <p className="text-xs text-amber-700 dark:text-amber-300">
                                Sudah diselesaikan oleh <strong>{action.conflict_winner}</strong>
                                {action.conflict_action && ` (${action.conflict_action})`}
                              </p>
                            )}
                            {action.last_error && !action.conflict && (
                              <p className="text-xs text-red-700 dark:text-red-300 font-mono">{action.last_error}</p>
                            )}
                          </div>
                        )}

                        {/* Response server */}
                        {action.response && !action.conflict && (
                          <details className="group">
                            <summary className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                              <Eye className="w-3 h-3" /> Respons Server
                            </summary>
                            <pre className="mt-1 p-2 text-xs bg-green-50 dark:bg-green-900/30 rounded overflow-x-auto max-h-32">
                              {JSON.stringify(action.response, null, 2)}
                            </pre>
                          </details>
                        )}

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-2 pt-2 border-t">
                          {action.status === "gagal" && !action.conflict && (
                            <button
                              onClick={() => handleRetry(action.id)}
                              disabled={isSyncing}
                              className="px-3 py-1.5 text-xs font-medium rounded-md border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-700 dark:text-blue-300 dark:bg-blue-900/30 dark:hover:bg-blue-900/50"
                            >
                              <RotateCcw className="w-3 h-3 mr-1" /> Coba Lagi
                            </button>
                            )}
                          {(action.status === "terkirim" || action.conflict) && (
                            <button
                              onClick={() => handleDelete(action.id)}
                              className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-700 bg-gray-50 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:bg-gray-800/50 dark:hover:bg-gray-800"
                            >
                              <Trash2 className="w-3 h-3 mr-1" /> Hapus
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t p-4 sticky bottom-0 bg-white/95 backdrop-blur dark:bg-gray-900/95">
          <div className="flex gap-2">
            {failedCount > 0 && (
              <button
                onClick={triggerRetry}
                disabled={isSyncing}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-md border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50 dark:border-red-700 dark:text-red-300 dark:bg-red-900/30 dark:hover:bg-red-900/50"
              >
                <RotateCcw className="w-4 h-4 mr-2" /> Coba Lagi Semua ({failedCount})
              </button>
            )}
            <button
              onClick={triggerSync}
              disabled={isSyncing || (!isOnline && pendingCount === 0 && failedCount === 0)}
              className="flex-1 px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Sinkronkan Sekarang"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Animasi slide in
const style = document.createElement("style");
style.textContent = `
  @keyframes slide-in {
    from { opacity: 0; transform: translateX(100%); }
    to { opacity: 1; transform: translateX(0); }
  }
  .animate-slide-in { animation: slide-in 0.25s ease-out; }
`;
if (typeof document !== "undefined") {
  document.head.appendChild(style);
}