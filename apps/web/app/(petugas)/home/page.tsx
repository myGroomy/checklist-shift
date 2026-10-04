// Petugas Home Page
"use client";

import Link from "next/link";
import { useAuth, useIsAdmin } from "@/lib/hooks/useAuth";
import { useActiveShift } from "@/lib/hooks/useShift";
import { useOpenIncidents } from "@/lib/hooks/useIncident";
import { Clock, ClipboardCheck, AlertTriangle, FileText, ChevronRight, Plus, ExternalLink } from "lucide-react";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";

export default function HomePage() {
  const { data: user, isLoading } = useAuth();
  const isAdmin = useIsAdmin();

  // Untuk demo, gunakan branch pertama dari user
  // Nanti ganti dengan branch picker
  const branchId = user?.cabang[0] ?? "";

  const { data: activeShift } = useActiveShift(branchId);
  const { data: incidents } = useOpenIncidents(branchId);

  const shift = activeShift?.shift ?? null;
  const isShiftActive = shift?.status === "berjalan";

  const formatTime = (iso: string) => {
    try {
      return format(parseISO(iso), "HH:mm", { locale: localeId });
    } catch {
      return iso;
    }
  };

  const formatDate = (iso: string) => {
    try {
      return format(parseISO(iso), "EEEE, dd MMMM yyyy", { locale: localeId });
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

  return (
    <div className="space-y-6">
      {/* Header dengan tanggal */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Selamat datang, {user?.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{formatDate(new Date().toISOString())}</p>
        </div>
        {isAdmin && (
          <Link href="/admin/dashboard" className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
            <ExternalLink className="w-4 h-4" /> Admin
          </Link>
        )}
      </div>

      {/* Shift Aktif Card */}
      <div className="rounded-xl border bg-white dark:bg-gray-800 overflow-hidden">
        {shift ? (
          <>
            <div className={`p-4 border-b ${isShiftActive ? "bg-green-50 dark:bg-green-900/20" : "bg-gray-50 dark:bg-gray-900/20"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{shift.shift_definition_id}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">PJ: {shift.pj_name}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  isShiftActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                  shift.status === "ditutup" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                  "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                }`}>
                  {isShiftActive ? "BERJALAN" : shift.status.toUpperCase()}
                </span>
              </div>

              {isShiftActive && (
                <div className="mt-3 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${shift.progress.wajib_total > 0 ? Math.round((shift.progress.wajib_selesai / shift.progress.wajib_total) * 100) : 0}%` }}
                  />
                </div>
              )}
            </div>

            <div className="p-4 space-y-3">
              {isShiftActive ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Progress</span>
                    <span className="font-medium">{shift.progress.wajib_selesai} / {shift.progress.wajib_total} wajib</span>
                  </div>

                  <Link
                    href={`/checklist/${shift.id}`}
                    className="block w-full px-4 py-3 rounded-lg bg-blue-600 text-white font-medium text-center hover:bg-blue-700 transition-colors touch-target flex items-center justify-center gap-2"
                  >
                    <ClipboardCheck className="w-5 h-5" />
                    Lanjutkan Checklist
                  </Link>
                </>
              ) : (
                <Link
                  href={`/report/${shift.id}`}
                  className="block w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium text-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors touch-target flex items-center justify-center gap-2"
                >
                  <FileText className="w-5 h-5" />
                  Lihat Laporan
                </Link>
              )}
            </div>
          </>
        ) : (
          <div className="p-8 text-center">
            <ClipboardCheck className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">Belum ada shift hari ini</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">Buka checklist untuk memulai shift baru</p>
            <Link
              href="/checklist"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors touch-target"
            >
              <Plus className="w-4 h-4" /> Buka Checklist
            </Link>
          </div>
        )}
      </div>

      {/* Handover belum dibaca - placeholder */}
      {/* TODO: Integrate with handover hook */}

      {/* Incident Open */}
      {incidents && incidents.incident_open.length > 0 && (
        <div className="rounded-xl border bg-white dark:bg-gray-800 overflow-hidden">
          <div className="p-4 border-b bg-gray-50 dark:bg-gray-900/20 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              Incident Terbuka ({incidents.incident_open.length})
            </h3>
            <Link href="/incident" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Lihat semua</Link>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {incidents.incident_open.slice(0, 3).map((inc) => (
              <Link key={inc.incident_id} href={`/incident/${inc.incident_id}`} className="block p-4 hover:bg-gray-50 dark:hover:bg-gray-900/50">
                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${inc.severity === "tinggi" ? "bg-red-500" : inc.severity === "sedang" ? "bg-amber-500" : "bg-green-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{inc.category_name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{formatTime(inc.reported_at)} • {inc.reported_by_name}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Shortcut Grid */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/checklist" className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors touch-target flex flex-col items-center gap-2 text-center">
          <ClipboardCheck className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Checklist</span>
        </Link>
        <Link href="/incident/baru" className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors touch-target flex flex-col items-center gap-2 text-center">
          <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Buat Incident</span>
        </Link>
        <Link href="/report" className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors touch-target flex flex-col items-center gap-2 text-center">
          <FileText className="w-8 h-8 text-green-600 dark:text-green-400" />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Laporan Hari Ini</span>
        </Link>
        <Link href="/incident" className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors touch-target flex flex-col items-center gap-2 text-center">
          <Clock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Handover Terakhir</span>
        </Link>
      </div>
    </div>
  );
}