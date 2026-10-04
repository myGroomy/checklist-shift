// Admin Dashboard Page
"use client";

import { useAuth } from "@/lib/hooks/useAuth";
import { useBranches, useShiftOperations } from "@/lib/hooks/useAdmin";
import { Building2, Clock, AlertTriangle, AlertCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";
import Link from "next/link";

export default function AdminDashboardPage() {
  const { data: user } = useAuth();
  const { data: branchesData } = useBranches();
  const { data: shiftsData } = useShiftOperations();

  const branches = branchesData?.branches ?? [];
  const shifts = shiftsData?.shifts ?? [];

  // Active shifts across all branches
  const activeShifts = shifts.filter((s) => s.status === "berjalan");
  const forcedShifts = shifts.filter((s) => s.status === "ditutup_paksa");
  const voidShifts = shifts.filter((s) => s.status === "void");

  // Incidents open (placeholder - would use useAdminIncidents)
  const openIncidentsCount = 0; // TODO

  // Shifts not closed past end time (placeholder)
  const unclosedShifts = activeShifts.filter(() => {
    // Check if past end time
    return false; // TODO: implement time check
  });

  const formatDateTime = (iso: string) => {
    try {
      return format(parseISO(iso), "dd MMM HH:mm", { locale: localeId });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard Admin</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Ringkasan seluruh cabang</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 text-sm font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">
            {user?.name}
          </span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Cabang Aktif"
          value={branches.filter((b) => b.is_active).length}
          subtitle={`${branches.length} total`}
          icon={<Building2 className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title="Shift Berjalan"
          value={activeShifts.length}
          subtitle={forcedShifts.length > 0 ? `${forcedShifts.length} paksa` : "Normal"}
          icon={<Clock className="w-6 h-6" />}
          color="green"
        />
        <StatCard
          title="Incident Terbuka"
          value={openIncidentsCount}
          subtitle="Perlu ditindaklanjuti"
          icon={<AlertTriangle className="w-6 h-6" />}
          color="amber"
        />
        <StatCard
          title="Peringatan"
          value={unclosedShifts.length + voidShifts.length}
          subtitle={unclosedShifts.length > 0 ? `${unclosedShifts.length} belum ditutup` : voidShifts.length > 0 ? `${voidShifts.length} void` : "Aman"}
          icon={<AlertCircle className="w-6 h-6" />}
          color="red"
        />
      </div>

      {/* Branch Overview */}
      <div className="rounded-xl border bg-white dark:bg-gray-800 overflow-hidden">
        <div className="p-4 border-b bg-gray-50 dark:bg-gray-900/20 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Ringkasan Cabang</h2>
          <Link href="/admin/cabang" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Lihat semua</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cabang</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Zona Waktu</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Shift Berjalan</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Progress</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Incident</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {branches.map((branch) => {
                const branchShifts = shifts.filter((s) => s.branch_id === branch.id);
                const active = branchShifts.filter((s) => s.status === "berjalan");
                const closed = branchShifts.filter((s) => s.status === "ditutup" || s.status === "ditutup_paksa");

                return (
                  <tr key={branch.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">{branch.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{branch.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{branch.timezone}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded">{active.length}</span>
                        <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">{closed.length}</span>
                        {branchShifts.filter((s) => s.status === "void").length > 0 && (
                          <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded">
                            {branchShifts.filter((s) => s.status === "void").length} void
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {active.length > 0 ? (
                        <div className="w-24 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600"
                            style={{ width: `${active.reduce((acc, s) => acc + (s.progress.wajib_total > 0 ? s.progress.wajib_selesai / s.progress.wajib_total : 0), 0) / active.length * 100}%` }}
                          />
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">-</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/operasi-shift?branch=${branch.id}`}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Kelola
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {branches.length === 0 && (
          <div className="p-8 text-center">
            <Building2 className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-gray-500 dark:text-gray-400">Belum ada cabang terdaftar</p>
          </div>
        )}
      </div>

      {/* Alerts Panel */}
      {(unclosedShifts.length > 0 || voidShifts.length > 0 || openIncidentsCount > 0) && (
        <div className="rounded-xl border bg-white dark:bg-gray-800 overflow-hidden">
          <div className="p-4 border-b bg-gray-50 dark:bg-gray-900/20 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              Peringatan
            </h2>
          </div>
          <div className="p-4 space-y-3">
            {unclosedShifts.length > 0 && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
                <p className="font-medium text-red-800 dark:text-red-200">{unclosedShifts.length} shift melewati jam selesai tanpa ditutup</p>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">Perlu tindakan admin: tutup paksa atau ganti PJ</p>
              </div>
            )}
            {voidShifts.length > 0 && (
              <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <p className="font-medium text-gray-800 dark:text-gray-200">{voidShifts.length} shift di-void</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Dikecualikan dari statistik</p>
              </div>
            )}
            {openIncidentsCount > 0 && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800">
                <p className="font-medium text-amber-800 dark:text-amber-200">{openIncidentsCount} incident terbuka</p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">Perlu review dan update status</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent Activity - Shift Operations */}
      {activeShifts.length > 0 && (
        <div className="rounded-xl border bg-white dark:bg-gray-800 overflow-hidden">
          <div className="p-4 border-b bg-gray-50 dark:bg-gray-900/20 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Shift Berjalan (Lintas Cabang)</h2>
            <Link href="/admin/operasi-shift" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Lihat semua</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cabang</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Shift</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">PJ</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Dibuka</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Progress</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {activeShifts.slice(0, 10).map((shift) => (
                  <tr key={shift.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{shift.branch_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{shift.shift_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{shift.pj_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{formatDateTime(shift.opened_at)}</td>
                    <td className="px-4 py-3">
                      <div className="w-24 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600"
                          style={{ width: `${shift.progress.wajib_total > 0 ? Math.round((shift.progress.wajib_selesai / shift.progress.wajib_total) * 100) : 0}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/operasi-shift?shift=${shift.id}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, subtitle, icon, color }: { title: string; value: number; subtitle: string; icon: React.ReactNode; color: "blue" | "green" | "amber" | "red" }) {
  const colors = {
    blue: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    green: "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800",
    amber: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    red: "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800",
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