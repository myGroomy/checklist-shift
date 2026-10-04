// Admin Audit Log - Read-only with filters and expand before/after
"use client";

import { useState } from "react";
import { useAuditLog } from "@/lib/hooks/useAdmin";
import { ChevronRight, X, Download, Clock, Building2, AlertCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";

interface AuditLogEntry {
  id: string;
  seq: number;
  at: string;
  actor_id: string;
  actor_name: string;
  action: string;
  object_type: string;
  object_id: string;
  branch_id: string | null;
  branch_name: string | null;
  shift_instance_id: string | null;
  before: string | null;
  after: string | null;
  reason: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  "cabang.create": "Buat Cabang",
  "cabang.update": "Update Cabang",
  "cabang.delete": "Nonaktifkan Cabang",
  "user.create": "Buat Akun",
  "user.update": "Update Akun",
  "user.delete": "Nonaktifkan Akun",
  "user.reset_pin": "Reset PIN",
  "user.unlock": "Buka Kunci Akun",
  "user.force_logout": "Paksa Logout",
  "shift_definition.create": "Buat Shift Definition",
  "shift_definition.update": "Update Shift Definition",
  "shift_definition.delete": "Nonaktifkan Shift Definition",
  "sop_category.create": "Buat Kategori SOP",
  "sop_category.update": "Update Kategori SOP",
  "sop_category.delete": "Nonaktifkan Kategori SOP",
  "checklist_point.create": "Buat Butir Checklist",
  "checklist_point.update": "Update Butir Checklist",
  "checklist_point.delete": "Nonaktifkan Butir Checklist",
  "handover_field.create": "Buat Field Handover",
  "handover_field.update": "Update Field Handover",
  "handover_field.delete": "Nonaktifkan Field Handover",
  "incident_category.create": "Buat Kategori Incident",
  "incident_category.update": "Update Kategori Incident",
  "incident_category.delete": "Nonaktifkan Kategori Incident",
  "shift.open": "Buka Shift",
  "shift.join": "Gabung Shift",
  "shift.close": "Tutup Shift",
  "shift.force_close": "Tutup Paksa Shift",
  "shift.change_pj": "Ganti PJ",
  "shift.void": "Void Shift",
  "shift.unlock_report": "Buka Kunci Laporan",
  "incident.create": "Buat Incident",
  "incident.update_status": "Update Status Incident",
  "incident.link": "Tautkan Incident",
  "handover.submit": "Kirim Handover",
  "handover.read": "Baca Handover",
  "report.share": "Bagikan Laporan",
  "report.addendum": "Tambah Addendum",
  "settings.update": "Update Pengaturan",
  "akun.logout_semua": "Logout Semua Perangkat",
  "akun.ganti_pin": "Ganti PIN",
};

export default function AuditLogPage() {
  const [filters, setFilters] = useState({
    branch_id: "",
    actor_id: "",
    action: "",
    date_from: "",
    date_to: "",
  });
  const [page, setPage] = useState(1);

  const { data: logsData, isLoading } = useAuditLog(filters);
  const logs = logsData?.logs ?? [];

  const formatDateTime = (iso: string) => {
    try {
      return format(parseISO(iso), "dd MMM yyyy HH:mm:ss", { locale: localeId });
    } catch {
      return iso;
    }
  };

  const getActionLabel = (action: string) => ACTION_LABELS[action] ?? action;

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleExport = () => {
    // Export to CSV
    const csv = [
      ["Seq", "Waktu", "Aktor", "Aksi", "Objek", "Object ID", "Cabang", "Shift ID", "Sebelum", "Sesudah", "Alasan"],
      ...logs.map((log) => [
        log.seq,
        formatDateTime(log.at),
        `${log.actor_name} (${log.actor_id.slice(0, 8)})`,
        getActionLabel(log.action),
        log.object_type,
        log.object_id,
        log.branch_name ?? "",
        log.shift_instance_id ?? "",
        log.before ?? "",
        log.after ?? "",
        log.reason ?? "",
      ]),
    ].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasChanges = (log: AuditLogEntry) => log.before !== null || log.after !== null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Audit Log</h1>
          <p className="text-gray-500 dark:text-gray-400">Riwayat aktivitas sistem (append-only, hash chain)</p>
        </div>
        <button onClick={handleExport} disabled={isLoading} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
          <Download className="w-4 h-4" /> Ekspor CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border p-4">
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cabang</label>
            <input type="text" value={filters.branch_id} onChange={(e) => handleFilterChange("branch_id", e.target.value)} placeholder="Branch ID atau nama" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Aktor (User ID)</label>
            <input type="text" value={filters.actor_id} onChange={(e) => handleFilterChange("actor_id", e.target.value)} placeholder="User ID" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Aksi</label>
            <input type="text" value={filters.action} onChange={(e) => handleFilterChange("action", e.target.value)} placeholder="Contoh: shift.close" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dari Tanggal</label>
            <input type="date" value={filters.date_from} onChange={(e) => handleFilterChange("date_from", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sampai Tanggal</label>
            <input type="date" value={filters.date_to} onChange={(e) => handleFilterChange("date_to", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex items-end gap-2">
            <button onClick={() => { setFilters({ branch_id: "", actor_id: "", action: "", date_from: "", date_to: "" }); }} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
              <X className="w-4 h-4" /> Reset
            </button>
          </div>
        </div>
      </div>

      {/* Log Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <p>Tidak ada log audit</p>
            <p className="text-sm mt-1">Coba ubah filter atau rentang tanggal</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-10">Seq</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-40">Waktu</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">Aktor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-40">Aksi</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Objek</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">Cabang</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">Shift</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <td className="px-4 py-3 font-mono text-sm text-gray-900 dark:text-gray-100">{log.seq}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-sm text-gray-900 dark:text-gray-100">
                        <Clock className="w-4 h-4 text-gray-400" />
                        {formatDateTime(log.at)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900 dark:text-gray-100 font-medium">{log.actor_name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{log.actor_id.slice(0, 12)}...</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{getActionLabel(log.action)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900 dark:text-gray-100">{log.object_type}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate max-w-xs">{log.object_id}</div>
                    </td>
                    <td className="px-4 py-3">
                      {log.branch_name ? (
                        <div className="flex items-center gap-1 text-sm text-gray-900 dark:text-gray-100">
                          <Building2 className="w-4 h-4 text-gray-400" />
                          {log.branch_name}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {log.shift_instance_id ? (
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 font-mono">
                          <ChevronRight className="w-3 h-3" />
                          {log.shift_instance_id.slice(0, 12)}...
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {hasChanges(log) && (
                        <button
                          onClick={() => alert(`Before: ${log.before || "(kosong)"}\n\nAfter: ${log.after || "(kosong)"}\n\nReason: ${log.reason || "(tidak ada)"}`)}
                          className="px-2 py-1 text-xs rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 flex items-center gap-1"
                        >
                          <AlertCircle className="w-3 h-3" /> Detail
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between p-4 border-t bg-gray-50 dark:bg-gray-900/50">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Menampilkan {logs.length} log
        </div>
        <div className="flex gap-2">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50">Sebelumnya</button>
          <button disabled={logs.length < 50} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50">Selanjutnya</button>
        </div>
      </div>
    </div>
  );
}