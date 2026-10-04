// Report List Page
"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";
import { useReportList } from "@/lib/hooks/useReport";
import { FileText, ChevronRight, X } from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { id as localeId } from "date-fns/locale";

export default function ReportPage() {
  const { data: user } = useAuth();
  const branchId = user?.cabang[0] ?? "";
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [statusFilter, setStatusFilter] = useState<"all" | "berjalan" | "ditutup" | "ditutup_paksa" | "void">("all");
  const [shiftFilter, setShiftFilter] = useState("");

  const { data: reportsData, isLoading } = useReportList(branchId, {
    status: statusFilter !== "all" ? statusFilter : undefined,
    date_from: dateFrom,
    date_to: dateTo,
    shift_def_id: shiftFilter || undefined,
  });

  const reports = reportsData?.reports ?? [];

  const formatDate = (iso: string) => {
    try {
      return format(parseISO(iso), "dd MMM yyyy", { locale: localeId });
    } catch {
      return iso;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "berjalan":
        return { label: "Berjalan", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" };
      case "ditutup":
        return { label: "Ditutup", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" };
      case "ditutup_paksa":
        return { label: "Ditutup Paksa", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" };
      case "void":
        return { label: "Void", className: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" };
      default:
        return { label: status, className: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" };
    }
  };

  const hasFilters = statusFilter !== "all" || shiftFilter;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Laporan Shift</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{reports.length} laporan</p>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border bg-white dark:bg-gray-800 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dari Tanggal</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sampai Tanggal</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
            >
              <option value="all">Semua Status</option>
              <option value="berjalan">Berjalan</option>
              <option value="ditutup">Ditutup</option>
              <option value="ditutup_paksa">Ditutup Paksa</option>
              <option value="void">Void</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Shift</label>
            <input
              type="text"
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
              placeholder="Filter shift (opsional)"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
            />
          </div>
        </div>

        {hasFilters && (
          <button
            onClick={() => {
              setStatusFilter("all");
              setShiftFilter("");
              setDateFrom(format(startOfMonth(new Date()), "yyyy-MM-dd"));
              setDateTo(format(endOfMonth(new Date()), "yyyy-MM-dd"));
            }}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <X className="w-4 h-4" /> Reset Filter
          </button>
        )}
      </div>

      {/* Report List */}
      {reports.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">Tidak ada laporan</h3>
          <p className="text-gray-500 dark:text-gray-400">Coba ubah filter atau rentang tanggal</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const badge = getStatusBadge(report.status);
            const isLocked = report.is_locked;

            return (
              <Link
                key={report.id}
                href={`/report/${report.shift_instance_id}`}
                className="block p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{report.shift_name}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                      {isLocked && (
                        <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded flex items-center gap-1">
                          <FileText className="w-3 h-3" /> Terkunci
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
                      PJ: {report.pj_name} • {formatDate(report.shift_date)}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>Wajib: {report.progress.wajib_selesai}/{report.progress.wajib_total}</span>
                      <span>Incident: {report.incident_count}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}