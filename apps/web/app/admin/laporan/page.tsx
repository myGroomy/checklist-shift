// Admin Laporan & Statistik - KPI, Charts, Export, Token Management
"use client";

import { useState } from "react";
import { useBranches, useAdminStats, useExportReport, useRevokeShareToken } from "@/lib/hooks/useAdmin";
import { Download, ExternalLink, BarChart3, Share2, Trash2, AlertCircle, CheckCircle, Clock, Activity } from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { id as localeId } from "date-fns/locale";

interface Stats {
  branch_id: string;
  branch_name: string;
  period: string;
  shifts_total: number;
  shifts_closed_normal: number;
  shifts_closed_forced: number;
  shifts_void: number;
  required_total: number;
  required_done: number;
  required_skipped: number;
  timed_on_time: number;
  timed_early: number;
  timed_late: number;
  incidents_total: number;
  incidents_open: number;
  incidents_by_category: Record<string, number>;
  handovers_read: number;
  participants_avg: number;
}

interface ShareToken {
  id: string;
  token: string;
  branch_id: string;
  report_id: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  created_by: string;
}

export default function LaporanStatistikPage() {
  const { data: branchesData } = useBranches();
  const branches = branchesData?.branches ?? [];

  const [selectedBranchId, setSelectedBranchId] = useState(branches[0]?.id ?? "");
  const [dateRange, setDateRange] = useState<"month" | "quarter" | "year" | "custom">("month");
  const [customFrom, setCustomFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));

  const { data: statsData } = useAdminStats(selectedBranchId, dateRange === "custom" ? `${customFrom} to ${customTo}` : dateRange);
  const stats = statsData as Stats | undefined;

  const exportReport = useExportReport();
  const revokeToken = useRevokeShareToken();

  const [tokens, setTokens] = useState<ShareToken[]>([]);

  const handleExport = async (formatType: "pdf" | "csv") => {
    try {
      await exportReport.mutateAsync({ branch_id: selectedBranchId, format: formatType, range: dateRange === "custom" ? `${customFrom} to ${customTo}` : dateRange });
      alert(`Ekspor ${formatType.toUpperCase()} berhasil!`);
    } catch (err) {
      alert(`Gagal ekspor ${formatType.toUpperCase()}`);
    }
  };

  const handleRevokeToken = async (tokenId: string, branchId: string) => {
    if (!confirm("Cabut tautan ini?")) return;
    try {
      await revokeToken.mutateAsync({ branch_id: branchId, token_id: tokenId });
      setTokens((prev) => prev.filter((t) => t.id !== tokenId));
    } catch (err) {
      alert("Gagal cabut tautan");
    }
  };

  const formatDate = (iso: string) => {
    try {
      return format(parseISO(iso), "dd MMM yyyy HH:mm", { locale: localeId });
    } catch {
      return iso;
    }
  };

  const formatPercent = (n: number, d: number) => d > 0 ? ((n / d) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Laporan & Statistik</h1>
          <p className="text-gray-500 dark:text-gray-400">KPI, visualisasi, ekspor, dan tautan berbagi</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleExport("pdf")} disabled={exportReport.isPending} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
            <Download className="w-4 h-4" /> Ekspor PDF
          </button>
          <button onClick={() => handleExport("csv")} disabled={exportReport.isPending} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2">
            <Download className="w-4 h-4" /> Ekspor CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border p-4 flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cabang</label>
          <select value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Periode</label>
          <select value={dateRange} onChange={(e) => setDateRange(e.target.value as typeof dateRange)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="month">Bulan Ini</option>
            <option value="quarter">Kuartal Ini</option>
            <option value="year">Tahun Ini</option>
            <option value="custom">Kustom</option>
          </select>
        </div>
        {dateRange === "custom" && (
          <>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dari</label>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sampai</label>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </>
        )}
      </div>

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="Total Shift" value={stats.shifts_total} subtitle={`${stats.shifts_closed_normal} normal, ${stats.shifts_closed_forced} paksa, ${stats.shifts_void} void`} icon={<Activity className="w-6 h-6" />} color="blue" />
          <KPICard title="Checklist Wajib" value={`${stats.required_done}/${stats.required_total}`} subtitle={`${formatPercent(stats.required_done, stats.required_total)}% selesai (${stats.required_skipped} skip)`} icon={<CheckCircle className="w-6 h-6" />} color="green" />
          <KPICard title="Ketepatan Waktu" value={`${formatPercent(stats.timed_on_time, stats.required_done)}% tepat`} subtitle={`${stats.timed_early} awal, ${stats.timed_late} terlambat`} icon={<Clock className="w-6 h-6" />} color="amber" />
          <KPICard title="Incident" value={stats.incidents_total} subtitle={`${stats.incidents_open} terbuka, ${stats.incidents_total - stats.incidents_open} selesai`} icon={<AlertCircle className="w-6 h-6" />} color="red" />
          <KPICard title="Handover Dibaca" value={stats.handovers_read} subtitle={`Rata ${stats.participants_avg} peserta per shift`} icon={<CheckCircle className="w-6 h-6" />} color="purple" />
        </div>
      )}

      {/* Incident by Category Chart (Simple Text) */}
      {stats && Object.keys(stats.incidents_by_category).length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5" /> Incident per Kategori</h3>
          <div className="space-y-3">
            {Object.entries(stats.incidents_by_category).map(([cat, count]) => (
              <div key={cat} className="flex items-center gap-4">
                <span className="w-48 text-sm text-gray-700 dark:text-gray-300 truncate">{cat}</span>
                <div className="flex-1 h-6 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500" style={{ width: `${stats.incidents_total > 0 ? (count / stats.incidents_total) * 100 : 0}%` }} />
                </div>
                <span className="w-16 text-right text-sm font-medium text-gray-900 dark:text-gray-100">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Share Tokens Management */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Share2 className="w-5 h-5" /> Tautan Berbagi Publik</h3>
          <button onClick={() => { /* load tokens */ }} className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Muat Tautan</button>
        </div>

        {tokens.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <p>Belum ada tautan berbagi</p>
            <p className="text-sm mt-1">Tautan akan muncul di sini setelah dibuat dari halaman detail laporan</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Token</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Report</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Dibuat</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Kedaluwarsa</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {tokens.map((token) => (
                  <tr key={token.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <td className="px-4 py-3"><code className="text-xs text-gray-500 dark:text-gray-400">{token.token.slice(0, 16)}...</code></td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 font-mono">{token.report_id.slice(0, 12)}...</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{formatDate(token.created_at)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{formatDate(token.expires_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${token.revoked_at ? "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" : new Date(token.expires_at) < new Date() ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"}`}>
                        {token.revoked_at ? "Dicabut" : new Date(token.expires_at) < new Date() ? "Kedaluwarsa" : "Aktif"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <a href={`/r/${token.token}`} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-400 hover:text-blue-600" title="Buka"><ExternalLink className="w-4 h-4" /></a>
                        {!token.revoked_at && (
                          <button onClick={() => handleRevokeToken(token.id, token.branch_id)} className="p-1.5 text-gray-400 hover:text-red-600" title="Cabut"><Trash2 className="w-4 h-4" /></button>
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
    </div>
  );
}

function KPICard({ title, value, subtitle, icon, color }: { title: string; value: string | number; subtitle: string; icon: React.ReactNode; color: "blue" | "green" | "amber" | "red" | "purple" }) {
  const colors = {
    blue: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    green: "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800",
    amber: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    red: "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800",
    purple: "bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800",
  };

  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
        </div>
        <div className="p-3 rounded-xl bg-white/50 dark:bg-gray-800/50">{icon}</div>
      </div>
    </div>
  );
}