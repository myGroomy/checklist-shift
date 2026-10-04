// Checklist Active Page - Accordion per Kategori SOP
"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useChecklistDetail, usePreviousHandover, useChecklistAction, useSayaBertugas } from "@/lib/hooks/useShift";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Camera,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  AlertTriangle,
  Plus,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { SyncQueueDrawer } from "@/components/pwa/SyncQueueDrawer";

interface ChecklistItem {
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
}

export default function ChecklistActivePage() {
  const params = useParams();
  const shiftId = params.shiftId as string;
  const { data: user } = useAuth();
  const branchId = user?.cabang[0] ?? "";
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showHandover, setShowHandover] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [skipReason, setSkipReason] = useState("");
  const [skipPointRef, setSkipPointRef] = useState<string | null>(null);

  const { data: checklist, isLoading, refetch } = useChecklistDetail(shiftId, branchId);
const checklistData = checklist;
const categoriesData: Array<{ id: string; nama: string; butir: ChecklistItem[] }> = checklistData?.kategori ?? [];
const progressData = checklistData?.progress ?? { wajib_total: 0, wajib_selesai: 0 };
const shiftStatusData = checklistData?.status ?? "unknown";
  const { data: handoverData } = usePreviousHandover(shiftId, branchId);
  const checklistAction = useChecklistAction(shiftId, branchId);
  const sayaBertugas = useSayaBertugas();

  // Ensure user is participant
  useEffect(() => {
    if (checklistData && !checklistAction.isPending) {
      // Auto-register as participant on first action
    }
  }, [checklistData]);

  const categories = categoriesData;
  const progress = progressData;
  const shiftStatus = shiftStatusData;

  // Pre-extract to avoid TypeScript JSX inference issues
  const firstItemTitle = categoriesData[0]?.butir[0]?.judul ?? "Checklist";

  const formatDateTime = (iso: string | null) => {
    if (!iso) return "";
    try {
      return format(parseISO(iso), "dd MMM HH:mm", { locale: localeId });
    } catch {
      return iso;
    }
  };

  const getTimingIcon = (label: string | null) => {
    switch (label) {
      case "tepat_waktu": return <CheckCircle className="w-3 h-3 text-green-600 dark:text-green-400" />;
      case "lebih_awal": return <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />;
      case "terlambat": return <AlertTriangle className="w-3 h-3 text-red-600 dark:text-red-400" />;
      default: return null;
    }
  };

  const getInputComponent = (item: ChecklistItem, disabled: boolean) => {
    switch (item.tipe) {
      case "centang":
        return (
          <button
            onClick={() => handleAction(item.point_ref, item.state === "selesai" ? "batal" : "selesai")}
            disabled={disabled || checklistAction.isPending}
            className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center transition-colors touch-target ${
              item.state === "selesai"
                ? "bg-green-600 border-green-600 text-white"
                : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
            aria-label={item.state === "selesai" ? "Batalkan" : "Centang"}
          >
            {item.state === "selesai" && <CheckCircle className="w-5 h-5" />}
          </button>
        );
      case "ok_tidak_ok":
        return (
          <div className="flex gap-2" role="group" aria-label="Pilih OK atau Tidak OK">
            <button
              onClick={() => handleAction(item.point_ref, "selesai", "OK")}
              disabled={disabled || checklistAction.isPending}
              className={`flex-1 py-2.5 px-3 rounded-lg border-2 text-sm font-medium transition-colors touch-target ${
                item.state === "selesai" && item.nilai === "OK"
                  ? "bg-green-600 border-green-600 text-white"
                  : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              OK
            </button>
            <button
              onClick={() => handleAction(item.point_ref, "selesai", "TIDAK_OK")}
              disabled={disabled || checklistAction.isPending}
              className={`flex-1 py-2.5 px-3 rounded-lg border-2 text-sm font-medium transition-colors touch-target ${
                item.state === "selesai" && item.nilai === "TIDAK_OK"
                  ? "bg-red-600 border-red-600 text-white"
                  : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              Tidak OK
            </button>
          </div>
        );
      case "teks":
        return (
          <input
            type="text"
            value={item.nilai ?? ""}
            onChange={(e) => handleAction(item.point_ref, "selesai", e.target.value)}
            disabled={disabled || checklistAction.isPending}
            placeholder="Isi keterangan..."
            className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 touch-target"
          />
        );
      case "angka":
        return (
          <input
            type="number"
            min={item.rentang?.min ?? undefined}
            max={item.rentang?.max ?? undefined}
            step="any"
            value={item.nilai ?? ""}
            onChange={(e) => handleAction(item.point_ref, "selesai", e.target.value)}
            disabled={disabled || checklistAction.isPending}
            placeholder="Isi angka..."
            className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 touch-target"
          />
        );
      case "foto":
        return (
          <button
            onClick={() => handleAction(item.point_ref, "selesai")}
            disabled={disabled || checklistAction.isPending}
            className="w-full py-3 px-4 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors touch-target flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400"
          >
            <Camera className="w-5 h-5" />
            <span>Ambil Foto</span>
          </button>
        );
      default:
        return null;
    }
  };

  const handleAction = async (pointRef: string, action: "selesai" | "batal" | "skip" | "ubah_nilai", value?: string): Promise<void> => {
    const clientActionId = `ca_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const clientAt = new Date().toISOString();

    try {
      const actionType = action as "selesai" | "batal" | "skip" | "ubah_nilai";
      if (actionType === "skip") {
        setSkipPointRef(pointRef);
        setSkipReason("");
        return; // Will show skip modal
      }

      await checklistAction.mutateAsync({
        point_ref: pointRef,
        action,
        value,
        skip_reason: action === "skip" ? skipReason : undefined,
        client_action_id: clientActionId,
        client_at: clientAt,
      });
      refetch();
    } catch (err: unknown) {
      const apiError = err as { code?: string; message?: string; data?: { conflict_winner?: string } };
      if (apiError.code === "sudah_diselesaikan") {
        alert(`Sudah diselesaikan oleh ${apiError.data?.conflict_winner ?? "orang lain"}.`);
      }
      throw err;
    }
  };

  const handleSkipConfirm = async () => {
    if (!skipPointRef || !skipReason.trim()) return;
    await handleAction(skipPointRef, "skip", skipReason);
    setSkipPointRef(null);
    setSkipReason("");
  };

  const toggleCategory = (catId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const handleSayaBertugas = async () => {
    await sayaBertugas.mutateAsync({ branch_id: branchId, shift_id: shiftId });
    refetch();
  };

  // Sticky action bar

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!checklist) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">Shift tidak ditemukan</h3>
        <Link href="/checklist" className="text-blue-600 dark:text-blue-400 hover:underline">Kembali ke daftar shift</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="sticky top-16 z-20 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{firstItemTitle ? "Checklist" : "Shift"}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{categories.length} kategori • {progress.wajib_selesai}/{progress.wajib_total} wajib</p>
          </div>
          <div className="flex items-center gap-2">
            {shiftStatus === "berjalan" && (
              <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded">BERJALAN</span>
            )}
          </div>
        </div>
      </div>

      {/* Handover Banner */}
      {!!handoverData?.handover && !showHandover && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-medium text-amber-800 dark:text-amber-200">Handover shift sebelumnya belum dibaca</span>
          </div>
          <button
            onClick={() => setShowHandover(true)}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-amber-600 text-white hover:bg-amber-700 transition-colors touch-target"
          >
            Baca & Tandai
          </button>
        </div>
      )}

      {/* Checklist Accordion */}
      <div className="space-y-3">
        {categories.map((cat) => {
          const catProgress = cat.butir.filter((b) => b.wajib).length > 0
            ? Math.round((cat.butir.filter((b) => b.wajib && (b.state === "selesai" || b.state === "skip")).length / cat.butir.filter((b) => b.wajib).length) * 100)
            : 100;
          const isExpanded = expandedCategories.has(cat.id);

          return (
            <div key={cat.id} className="rounded-xl border bg-white dark:bg-gray-800 overflow-hidden">
              <button
                onClick={() => toggleCategory(cat.id)}
                className="w-full p-4 flex items-center justify-between gap-4 text-left"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 dark:text-gray-100">{cat.nama}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{cat.butir.length} item • {catProgress}% wajib</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-20 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${catProgress}%` }} />
                  </div>
                  {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                </div>
              </button>

              {isExpanded && (
                <div className="divide-y divide-gray-200 dark:divide-gray-700 p-4 space-y-4">
                  {cat.butir.map((item) => {
                    const isDisabled = shiftStatus !== "berjalan";
                    const isCompleted = item.state === "selesai" || item.state === "skip";
                    const isOwn = item.pengisi === user?.name;

                    return (
                      <div
                        key={item.point_ref}
                        className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                          isCompleted ? "bg-gray-50 dark:bg-gray-900/50 opacity-70" : ""
                        }`}
                      >
                        {/* Input Control */}
                        <div className="flex-shrink-0 mt-1">{getInputComponent(item, isDisabled || isCompleted && !isOwn)}</div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2">
                            <h4 className="font-medium text-gray-900 dark:text-gray-100 flex-1">{item.judul}</h4>
                            {item.wajib && <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded">Wajib</span>}
                          </div>
                          {item.instruksi && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{item.instruksi}</p>}

                          {/* Target Time & Timing Label */}
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {item.target_time && (
                              <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Target: {item.target_time} (±{item.toleransi_menit ?? 15} menit)
                              </span>
                            )}
                            {item.label_waktu && (
                              <span className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded ${
                                item.label_waktu === "tepat_waktu" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                                item.label_waktu === "lebih_awal" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              }`}>
                                {getTimingIcon(item.label_waktu)}
                                {item.label_waktu === "tepat_waktu" && "Tepat waktu"}
                                {item.label_waktu === "lebih_awal" && `Lebih awal (${item.timing_delta_minutes} menit)`}
                                {item.label_waktu === "terlambat" && `Terlambat (${item.timing_delta_minutes} menit)`}
                              </span>
                            )}
                            {item.di_luar_rentang && (
                              <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Di luar rentang
                              </span>
                            )}
                          </div>

                          {/* Filled Info */}
                          {isCompleted && (
                            <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                              <span>Oleh: <strong>{item.pengisi}</strong></span>
                              {item.diisi_pada && <span>• {formatDateTime(item.diisi_pada)}</span>}
                              {item.state === "skip" && item.alasan_skip && (
                                <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded">
                                  Skip: {item.alasan_skip}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Range Warning */}
                          {item.tipe === "angka" && item.rentang && item.nilai && item.di_luar_rentang && (
                            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                              Nilai di luar rentang ({item.rentang.min ?? "-"} - {item.rentang.max ?? "-"})
                            </p>
                          )}
                        </div>

                        {/* Actions Menu */}
                        {isCompleted && !isDisabled && isOwn && (
                          <div className="relative">
                            <button
                              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 touch-target"
                              aria-label="Menu aksi"
                            >
                              <MoreVertical className="w-5 h-5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Skip Modal */}
      {skipPointRef && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl p-6 animate-slide-up">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Alasan Skip</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Item wajib di-skip harus diisi alasan</p>
            <textarea
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
              rows={3}
              placeholder="Tulis alasan skip di sini..."
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              required
            />
            <div className="flex gap-2">
              <button
                onClick={handleSkipConfirm}
                disabled={!skipReason.trim()}
                className="flex-1 py-2.5 px-4 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 touch-target"
              >
                Skip & Simpan
              </button>
              <button
                onClick={() => { setSkipPointRef(null); setSkipReason(""); }}
                className="flex-1 py-2.5 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 touch-target"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Handover Modal */}
      {showHandover && !!handoverData?.handover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Handover Shift Sebelumnya</h3>
              <button onClick={() => setShowHandover(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            {/* Handover content */}
            <div className="space-y-4 mb-4 max-h-64 overflow-y-auto">
              {/* TODO: Render handover fields */}
              <p className="text-sm text-gray-500 dark:text-gray-400">Detail handover akan ditampilkan di sini</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowHandover(false)}
                className="flex-1 py-2.5 px-4 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 touch-target"
              >
                Sudah Dibaca
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Action Bar */}
      {shiftStatus === "berjalan" && (
        <div className="fixed bottom-0 left-0 right-0 md:hidden z-30 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-t border-gray-200 dark:border-gray-700 p-4 safe-bottom">
          <div className="max-w-md mx-auto flex gap-2">
            <button
              onClick={handleSayaBertugas}
              className="flex-1 py-3 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 touch-target flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" /> Saya Bertugas
            </button>
            <Link
              href={`/checklist/${shiftId}/tutup`}
              className="flex-1 py-3 px-4 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 touch-target flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-5 h-5" /> Tutup Shift
            </Link>
          </div>
        </div>
      )}

      <SyncQueueDrawer open={showQueue} onClose={() => setShowQueue(false)} />
    </div>
  );
}