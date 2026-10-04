// Admin Operasi Shift - Cross-branch shift management
"use client";

import { useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useShiftOperations, useForceCloseShift, useChangePj, useOpenOnBehalf, useVoidShift, useUnlockReport } from "@/lib/hooks/useAdmin";
import { Activity, XCircle, UserPlus, Ban, LockOpen, Loader2, AlertCircle, ExternalLink, Eye, MoreVertical } from "lucide-react";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";

export default function OperasiShiftPage() {
  const { data: user } = useAuth();
  const { data: shiftsData, isLoading, refetch } = useShiftOperations();

  const forceClose = useForceCloseShift();
  const changePj = useChangePj();
  const openOnBehalf = useOpenOnBehalf();
  const voidShift = useVoidShift();
  const unlockReport = useUnlockReport();

  const shifts = shiftsData?.shifts ?? [];
  const [filterBranch, setFilterBranch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "berjalan" | "ditutup" | "ditutup_paksa" | "void">("all");

  const [forceCloseData, setForceCloseData] = useState<{ shift_id: string; branch_id: string; reason: string; pin: string } | null>(null);
  const [changePjData, setChangePjData] = useState<{ shift_id: string; branch_id: string; new_pj_id: string; pin: string } | null>(null);
  const [openOnBehalfData, setOpenOnBehalfData] = useState<{ branch_id: string; shift_def_id: string; pj_user_id: string; pin: string } | null>(null);
  const [voidData, setVoidData] = useState<{ shift_id: string; branch_id: string; reason: string; pin: string } | null>(null);
  const [unlockData, setUnlockData] = useState<{ report_id: string; branch_id: string; reason: string; pin: string } | null>(null);

  const filteredShifts = shifts.filter((s) => {
    if (filterBranch && s.branch_id !== filterBranch) return false;
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    return true;
  });

  const branches = [...new Set(shifts.map((s) => s.branch_id))];

  const formatDateTime = (iso: string) => {
    try {
      return format(parseISO(iso), "dd MMM yyyy HH:mm", { locale: localeId });
    } catch {
      return iso;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "berjalan": return { label: "Berjalan", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" };
      case "ditutup": return { label: "Ditutup", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" };
      case "ditutup_paksa": return { label: "Ditutup Paksa", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" };
      case "void": return { label: "Void", className: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" };
      default: return { label: status, className: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" };
    }
  };

  const handleForceClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forceCloseData) return;
    try {
      await forceClose.mutateAsync(forceCloseData);
      setForceCloseData(null);
      refetch();
    } catch (err) {
      alert("Gagal tutup paksa shift");
    }
  };

  const handleChangePj = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changePjData) return;
    try {
      await changePj.mutateAsync(changePjData);
      setChangePjData(null);
      refetch();
    } catch (err) {
      alert("Gagal ganti PJ");
    }
  };

  const handleOpenOnBehalf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openOnBehalfData) return;
    try {
      await openOnBehalf.mutateAsync(openOnBehalfData);
      setOpenOnBehalfData(null);
      refetch();
    } catch (err) {
      alert("Gagal buka shift atas nama");
    }
  };

  const handleVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidData) return;
    try {
      await voidShift.mutateAsync(voidData);
      setVoidData(null);
      refetch();
    } catch (err) {
      alert("Gagal void shift");
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockData) return;
    try {
      await unlockReport.mutateAsync(unlockData);
      setUnlockData(null);
      refetch();
    } catch (err) {
      alert("Gagal buka kunci laporan");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Operasi Shift</h1>
          <p className="text-gray-500 dark:text-gray-400">Kelola shift berjalan lintas cabang: tutup paksa, ganti PJ, void, buka kunci laporan</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border p-4 flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cabang</label>
          <select
            value={filterBranch}
            onChange={(e) => setFilterBranch(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Semua Cabang</option>
            {branches.map((b) => <option key={b} value={b}>{b.slice(0, 12)}...</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Semua Status</option>
            <option value="berjalan">Berjalan</option>
            <option value="ditutup">Ditutup</option>
            <option value="ditutup_paksa">Ditutup Paksa</option>
            <option value="void">Void</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : filteredShifts.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">Tidak ada shift sesuai filter</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cabang</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Shift</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tanggal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">PJ</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Dibuka</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Progress</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-64">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredShifts.map((shift) => (
                  <tr key={shift.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{shift.branch_name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{shift.branch_id.slice(0, 12)}...</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{shift.shift_name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{shift.shift_instance_id.slice(0, 12)}...</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{formatDateTime(shift.opened_at).split(" ")[0]}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{shift.pj_name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{shift.pj_user_id.slice(0, 12)}...</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{formatDateTime(shift.opened_at)}</td>
                    <td className="px-4 py-3">
                      <div className="w-24 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600" style={{ width: `${shift.progress.wajib_total > 0 ? Math.round((shift.progress.wajib_selesai / shift.progress.wajib_total) * 100) : 0}%` }} />
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{shift.progress.wajib_selesai}/{shift.progress.wajib_total} wajib</div>
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(shift.status).label && (
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(shift.status).className}`}>
                          {getStatusBadge(shift.status).label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {shift.status === "berjalan" && (
                          <>
                            <button
                              onClick={() => setForceCloseData({ shift_id: shift.shift_instance_id, branch_id: shift.branch_id, reason: "", pin: "" })}
                              className="px-2 py-1 text-xs rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
                            >
                              Tutup Paksa
                            </button>
                            <button
                              onClick={() => setChangePjData({ shift_id: shift.shift_instance_id, branch_id: shift.branch_id, new_pj_id: "", pin: "" })}
                              className="px-2 py-1 text-xs rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50"
                            >
                              Ganti PJ
                            </button>
                            <button
                              onClick={() => setVoidData({ shift_id: shift.shift_instance_id, branch_id: shift.branch_id, reason: "", pin: "" })}
                              className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                            >
                              Void
                            </button>
                          </>
                        )}
                        {shift.is_locked && (
                          <button
                            onClick={() => setUnlockData({ report_id: shift.shift_instance_id, branch_id: shift.branch_id, reason: "", pin: "" })}
                            className="px-2 py-1 text-xs rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50"
                          >
                            Buka Kunci
                          </button>
                        )}
                        <button
                          onClick={() => window.open(`/r/${shift.shift_instance_id}`, "_blank")}
                          className="p-1 text-gray-400 hover:text-blue-600" title="Lihat Laporan"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                        <button className="p-1 text-gray-400 hover:text-blue-600" title="Detail">
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Modals */}
        {forceCloseData && (
          <ForceCloseModal data={forceCloseData} onClose={() => setForceCloseData(null)} onSubmit={handleForceClose} loading={forceClose.isPending} />
        )}
        {changePjData && (
          <ChangePjModal data={changePjData} onClose={() => setChangePjData(null)} onSubmit={handleChangePj} loading={changePj.isPending} />
        )}
        {openOnBehalfData && (
          <OpenOnBehalfModal data={openOnBehalfData} onClose={() => setOpenOnBehalfData(null)} onSubmit={handleOpenOnBehalf} loading={openOnBehalf.isPending} />
        )}
        {voidData && (
          <VoidShiftModal data={voidData} onClose={() => setVoidData(null)} onSubmit={handleVoid} loading={voidShift.isPending} />
        )}
        {unlockData && (
          <UnlockReportModal data={unlockData} onClose={() => setUnlockData(null)} onSubmit={handleUnlock} loading={unlockReport.isPending} />
        )}
      </div>
    </div>
  );
}

function ForceCloseModal({ data, onClose, onSubmit, loading }: { data: { shiftId: string; branchId: string; reason: string; pin: string }; onClose: () => void; onSubmit: (e: React.FormEvent) => void; loading: boolean }) {
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl p-6 animate-slide-up">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Tutup Paksa Shift</h3>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Alasan *</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Alasan tutup paksa..." className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">PIN Konfirmasi *</label>
            <input type="password" inputMode="numeric" pattern="[0-9]*" value={pin} onChange={(e) => setPin(e.target.value)} maxLength={6} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="••••••" required />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 px-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Batal</button>
            <button type="submit" disabled={loading} className="flex-1 py-2 px-3 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">{loading ? "Memproses..." : "Tutup Paksa"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChangePjModal({ data, onClose, onSubmit, loading }: { data: { shiftId: string; branchId: string; newPjId: string; pin: string }; onClose: () => void; onSubmit: (e: React.FormEvent) => void; loading: boolean }) {
  const [newPjId, setNewPjId] = useState("");
  const [pin, setPin] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl p-6 animate-slide-up">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Ganti Penanggung Jawab</h3>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">User ID PJ Baru *</label>
            <input type="text" value={newPjId} onChange={(e) => setNewPjId(e.target.value)} placeholder="ULID user baru" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">PIN Konfirmasi *</label>
            <input type="password" inputMode="numeric" pattern="[0-9]*" value={pin} onChange={(e) => setPin(e.target.value)} maxLength={6} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="••••••" required />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 px-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Batal</button>
            <button type="submit" disabled={loading} className="flex-1 py-2 px-3 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">{loading ? "Memproses..." : "Ganti PJ"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OpenOnBehalfModal({ data, onClose, onSubmit, loading }: { data: { branchId: string; shiftDefId: string; pjUserId: string; pin: string }; onClose: () => void; onSubmit: (e: React.FormEvent) => void; loading: boolean }) {
  const [shiftDefId, setShiftDefId] = useState("");
  const [pjUserId, setPjUserId] = useState("");
  const [pin, setPin] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl p-6 animate-slide-up">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Buka Shift Atas Nama</h3>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Shift Definition ID *</label>
            <input type="text" value={shiftDefId} onChange={(e) => setShiftDefId(e.target.value)} placeholder="ULID shift definition" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">User ID PJ *</label>
            <input type="text" value={pjUserId} onChange={(e) => setPjUserId(e.target.value)} placeholder="ULID user PJ" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">PIN Konfirmasi *</label>
            <input type="password" inputMode="numeric" pattern="[0-9]*" value={pin} onChange={(e) => setPin(e.target.value)} maxLength={6} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="••••••" required />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 px-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Batal</button>
            <button type="submit" disabled={loading} className="flex-1 py-2 px-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{loading ? "Memproses..." : "Buka Shift"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function VoidShiftModal({ data, onClose, onSubmit, loading }: { data: { shiftId: string; branchId: string; reason: string; pin: string }; onClose: () => void; onSubmit: (e: React.FormEvent) => void; loading: boolean }) {
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl p-6 animate-slide-up">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Void Shift</h3>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Alasan *</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Alasan void shift..." className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">PIN Konfirmasi *</label>
            <input type="password" inputMode="numeric" pattern="[0-9]*" value={pin} onChange={(e) => setPin(e.target.value)} maxLength={6} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="••••••" required />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 px-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Batal</button>
            <button type="submit" disabled={loading} className="flex-1 py-2 px-3 rounded-lg bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-50">{loading ? "Memproses..." : "Void Shift"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UnlockReportModal({ data, onClose, onSubmit, loading }: { data: { reportId: string; branchId: string; reason: string; pin: string }; onClose: () => void; onSubmit: (e: React.FormEvent) => void; loading: boolean }) {
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl p-6 animate-slide-up">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Buka Kunci Laporan</h3>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Alasan *</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Alasan buka kunci..." className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">PIN Konfirmasi *</label>
            <input type="password" inputMode="numeric" pattern="[0-9]*" value={pin} onChange={(e) => setPin(e.target.value)} maxLength={6} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="••••••" required />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 px-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Batal</button>
            <button type="submit" disabled={loading} className="flex-1 py-2 px-3 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50">{loading ? "Memproses..." : "Buka Kunci"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}