// Admin Incident - List, filter, status update, link to shift
"use client";

import { useState } from "react";
import { useAdminIncidents, useUpdateIncidentStatusAdmin, useLinkIncidentAdmin } from "@/lib/hooks/useAdmin";
import { Link, AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";

export default function AdminIncidentPage() {
  const { data: incidentsData, isLoading } = useAdminIncidents();
  const incidents = incidentsData?.incidents ?? [];

  const updateStatus = useUpdateIncidentStatusAdmin();
  const linkIncident = useLinkIncidentAdmin();

  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "selesai">("all");
  const [filterSeverity, setFilterSeverity] = useState<"all" | "rendah" | "sedang" | "tinggi">("all");

  const [linkData, setLinkData] = useState<{ incidentId: string; branchId: string; shiftInstanceId: string; reason: string } | null>(null);

  const filteredIncidents = incidents.filter((inc) => {
    if (filterStatus !== "all" && inc.status !== filterStatus) return false;
    if (filterSeverity !== "all" && inc.severity !== filterSeverity) return false;
    return true;
  });

  const formatDateTime = (iso: string) => {
    try {
      return format(parseISO(iso), "dd MMM yyyy HH:mm", { locale: localeId });
    } catch {
      return iso;
    }
  };

  const handleStatusChange = async (incidentId: string, branchId: string, newStatus: "open" | "selesai") => {
    try {
      await updateStatus.mutateAsync({ incident_id: incidentId, branch_id: branchId, status: newStatus, alasan: "" });
    } catch (err) {
      alert("Gagal update status");
    }
  };

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkData) return;
    try {
      await linkIncident.mutateAsync({
        incident_id: linkData.incidentId,
        branch_id: linkData.branchId,
        shift_instance_id: linkData.shiftInstanceId,
        alasan: linkData.reason,
      });
      setLinkData(null);
    } catch (err) {
      alert("Gagal tautkan incident");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Manajemen Incident</h1>
          <p className="text-gray-500 dark:text-gray-400">Review, update status, dan tautkan incident ke shift</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border p-4 flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">Semua</option>
            <option value="open">Terbuka</option>
            <option value="selesai">Selesai</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Severity</label>
          <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value as typeof filterSeverity)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">Semua</option>
            <option value="rendah">Rendah</option>
            <option value="sedang">Sedang</option>
            <option value="tinggi">Tinggi</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : filteredIncidents.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">Tidak ada incident sesuai filter</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Incident</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Kategori</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Severity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pelapor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Waktu</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Shift</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-48">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredIncidents.map((inc) => (
                  <tr key={inc.incident_id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-xs">{inc.category_name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{inc.incident_id.slice(0, 12)}...</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{inc.category_name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${inc.severity === "tinggi" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : inc.severity === "sedang" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"}`}>
                        {inc.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{inc.reported_by_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{formatDateTime(inc.reported_at)}</td>
                    <td className="px-4 py-3">
                      {inc.shift_instance_id ? (
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{inc.shift_instance_id.slice(0, 12)}...</div>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Di luar shift</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${inc.status === "open" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"}`}>
                        {inc.status === "open" ? "Terbuka" : "Selesai"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleStatusChange(inc.incident_id, "branch_id", inc.status === "open" ? "selesai" : "open")}
                          disabled={updateStatus.isPending}
                          className={`px-2 py-1 text-xs rounded ${inc.status === "open" ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-amber-100 text-amber-700 hover:bg-amber-200"} dark:bg-green-900/30 dark:hover:bg-green-900/50 dark:bg-amber-900/30 dark:hover:bg-amber-900/50`}
                        >
                          {inc.status === "open" ? "Selesaikan" : "Buka Lagi"}
                        </button>
                        {!inc.shift_instance_id && (
                          <button
                            onClick={() => setLinkData({ incidentId: inc.incident_id, branchId: "branch_id", shiftInstanceId: "", reason: "" })}
                            className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50"
                          >
                            <Link className="w-3 h-3 mr-1" /> Tautkan
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Link Modal */}
      {linkData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl p-6 animate-slide-up">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Tautkan ke Shift</h3>
            <form onSubmit={handleLink} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Shift Instance ID *</label>
                <input type="text" value={linkData.shiftInstanceId} onChange={(e) => setLinkData({ ...linkData, shiftInstanceId: e.target.value })} placeholder="ULID shift instance" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Alasan</label>
                <textarea value={linkData.reason} onChange={(e) => setLinkData({ ...linkData, reason: e.target.value })} rows={2} placeholder="Alasan tautan..." className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setLinkData(null)} className="flex-1 py-2 px-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Batal</button>
                <button className="flex-1 py-2 px-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Tautkan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}