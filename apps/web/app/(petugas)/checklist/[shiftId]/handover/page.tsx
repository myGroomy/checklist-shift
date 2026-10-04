// Petugas Handover Page - Baca handover shift sebelumnya
"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { usePreviousHandover } from "@/lib/hooks/useShift";
import { ArrowLeft, CheckCircle, AlertTriangle, Camera, FileText, MessageSquare, ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";
import Link from "next/link";

export default function HandoverPage() {
  const params = useParams();
  const shiftInstanceId = params.shiftId as string;
  const { data: user } = useAuth();
  const branchId = user?.cabang[0] ?? "";
  const [showAckModal, setShowAckModal] = useState(false);

  const { data: handoverData, isLoading } = usePreviousHandover(shiftInstanceId, branchId);

  const formatDateTime = (iso: string | null) => {
    if (!iso) return "";
    try {
      return format(parseISO(iso), "dd MMM yyyy HH:mm", { locale: localeId });
    } catch {
      return iso;
    }
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return "";
    try {
      return format(parseISO(iso), "HH:mm", { locale: localeId });
    } catch {
      return iso;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handover = handoverData?.handover;
  const incidentOpen = handoverData?.incident_open ?? [];

  if (!handover) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/checklist/${shiftInstanceId}`} className="p-1 text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Handover Shift Sebelumnya</h1>
        </div>
        <div className="text-center py-12">
          <MessageSquare className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">Belum ada handover sebelumnya</h3>
          <p className="text-gray-500 dark:text-gray-400">Shift ini adalah shift pertama atau shift sebelumnya belum mengirim handover</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="sticky top-16 z-20 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href={`/checklist/${shiftInstanceId}`} className="p-1 text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="font-semibold text-gray-900 dark:text-gray-100">Handover Shift Sebelumnya</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Diserahkan oleh {handover.submitted_by} • {formatDateTime(handover.submitted_at)}</p>
          </div>
        </div>
      </div>

      {/* Handover Content */}
      <div className="max-w-3xl mx-auto px-4 space-y-6">
        {/* Free Text */}
        {handover.free_text && (
          <div className="rounded-xl border bg-white dark:bg-gray-800 p-6">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Catatan Bebas
            </h3>
            <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{handover.free_text}</p>
          </div>
        )}

        {/* Structured Fields */}
        {handover.values && Object.keys(handover.values).length > 0 && (
          <div className="rounded-xl border bg-white dark:bg-gray-800 p-6">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Field Terstruktur
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.entries(handover.values).map(([key, value]) => (
                <div key={key} className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{key}</p>
                  <p className="text-gray-900 dark:text-gray-100 font-medium">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Photos */}
        {handover.photo_ids && handover.photo_ids.length > 0 && (
          <div className="rounded-xl border bg-white dark:bg-gray-800 p-6">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Camera className="w-5 h-5 text-green-600 dark:text-green-400" /> Foto ({handover.photo_ids.length})
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {handover.photo_ids.map((_photoId, idx) => (
                <div key={idx} className="aspect-square rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <Camera className="w-8 h-8 text-gray-400" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Incident Open */}
        {incidentOpen.length > 0 && (
          <div className="rounded-xl border bg-white dark:bg-gray-800 p-6">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" /> Incident Terbuka ({incidentOpen.length})
            </h3>
            <div className="space-y-3">
              {incidentOpen.map((inc) => (
                <Link key={inc.incident_id} href={`/incident/${inc.incident_id}`} className="block p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${inc.severity === "tinggi" ? "bg-red-500" : inc.severity === "sedang" ? "bg-amber-500" : "bg-green-500"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100">{inc.category_name}</h4>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${inc.severity === "tinggi" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : inc.severity === "sedang" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"}`}>
                          {inc.severity}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">{inc.description}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{formatDateTime(inc.reported_at)} • {inc.reported_by_name}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Read Acks */}
        {handoverData?.handover_acks && handoverData.handover_acks.length > 0 && (
          <div className="rounded-xl border bg-white dark:bg-gray-800 p-6">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" /> Sudah Dibaca ({handoverData.handover_acks.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {handoverData.handover_acks.map((ack) => (
                <span key={ack.user_id} className="px-3 py-1.5 text-sm bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-lg flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" />
                  <span>{ack.user_name}</span>
                  <span className="text-xs opacity-70">({formatTime(ack.read_at)})</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sticky Action */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden z-30 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-t border-gray-200 dark:border-gray-700 p-4 safe-bottom">
        <button
          onClick={() => setShowAckModal(true)}
          className="w-full py-3 px-4 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 touch-target flex items-center justify-center gap-2"
        >
          <CheckCircle className="w-5 h-5" /> Sudah Dibaca
        </button>
      </div>

      {/* Ack Modal */}
      {showAckModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl p-6 animate-slide-up">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Tandai Sudah Dibaca</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Anda akan menandai handover ini sudah dibaca. Tindakan ini tidak bisa dibatalkan.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowAckModal(false)} className="flex-1 py-3 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 touch-target">
                Batal
              </button>
              <button
                onClick={() => { /* API call to mark as read */ setShowAckModal(false); }}
                className="flex-1 py-3 px-4 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 touch-target"
              >
                Sudah Dibaca
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}