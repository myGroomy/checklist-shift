// Admin Cabang Page
"use client";

import { useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useBranches, useCreateBranch, useUpdateBranch, useVerifyBranchSpreadsheet, useCopyBranch } from "@/lib/hooks/useAdmin";
import { Building2, Plus, Edit, XCircle, Loader2, ExternalLink } from "lucide-react";

export default function AdminCabangPage() {
  const { data: user } = useAuth();
  const { data: branchesData, isLoading, refetch } = useBranches();
  const createBranch = useCreateBranch();
  const updateBranch = useUpdateBranch();
  const verifySpreadsheet = useVerifyBranchSpreadsheet();
  const copyBranch = useCopyBranch();

  const branches = branchesData?.branches ?? [];
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<typeof branches[0] | null>(null);
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; missing_tabs: string[] } | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    address: "",
    timezone: "Asia/Jakarta",
    spreadsheet_id: "",
    is_active: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBranch) {
        await updateBranch.mutateAsync({ ...formData, id: editingBranch.id });
      } else {
        await createBranch.mutateAsync(formData);
      }
      setShowForm(false);
      setEditingBranch(null);
      resetForm();
      refetch();
    } catch (err) {
      console.error("Gagal menyimpan cabang:", err);
      alert("Gagal menyimpan cabang");
    }
  };

  const handleEdit = (branch: typeof branches[0]) => {
    setEditingBranch(branch);
    setFormData({
      name: branch.name,
      code: branch.code,
      address: branch.address ?? "",
      timezone: branch.timezone,
      spreadsheet_id: branch.spreadsheet_id,
      is_active: branch.is_active,
    });
    setShowForm(true);
  };

  const handleVerify = async (spreadsheetId: string, branchId: string) => {
    setVerifyId(branchId);
    try {
      const result = await verifySpreadsheet.mutateAsync(spreadsheetId);
      setVerifyResult(result);
    } catch (err) {
      console.error("Verifikasi gagal:", err);
      setVerifyResult({ ok: false, missing_tabs: ["Verifikasi gagal"] });
    }
  };

  const handleCopy = async (sourceId: string, targetId: string) => {
    if (!confirm("Salin konfigurasi dari cabang sumber ke target? Data target akan ditimpa.")) return;
    try {
      await copyBranch.mutateAsync({ source_branch_id: sourceId, target_branch_id: targetId, scope: ["shift", "checklist", "handover", "incident"] });
      refetch();
    } catch (err) {
      console.error("Salin gagal:", err);
      alert("Gagal menyalin konfigurasi");
    }
  };

  const handleDelete = async (branchId: string) => {
    if (!confirm("Nonaktifkan cabang ini? (Tidak bisa dihapus permanen - BR-40)")) return;
    try {
      await updateBranch.mutateAsync({ id: branchId, is_active: false });
      refetch();
    } catch (err) {
      console.error("Gagal nonaktifkan:", err);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      code: "",
      address: "",
      timezone: "Asia/Jakarta",
      spreadsheet_id: "",
      is_active: true,
    });
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Kelola Cabang</h1>
          <p className="text-gray-500 dark:text-gray-400">Daftarkan spreadsheet & kelola cabang outlet</p>
        </div>
        <button
          onClick={() => { resetForm(); setEditingBranch(null); setShowForm(true); }}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors touch-target flex items-center gap-2"
        >
          <Plus className="w-5 h-5" /> Tambah Cabang
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-xl p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {editingBranch ? "Edit Cabang" : "Tambah Cabang Baru"}
              </h3>
              <button onClick={() => { setShowForm(false); setEditingBranch(null); resetForm(); }} className="p-1 text-gray-400 hover:text-gray-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nama Cabang *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kode Cabang *</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
                  required
                  maxLength={10}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Alamat</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Zona Waktu *</label>
                <select
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
                >
                  <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                  <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
                  <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
                  <option value="Asia/Bangkok">Asia/Bangkok</option>
                  <option value="Asia/Singapore">Asia/Singapore</option>
                  <option value="Asia/Kuala_Lumpur">Asia/Kuala_Lumpur</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Spreadsheet ID *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.spreadsheet_id}
                    onChange={(e) => setFormData({ ...formData, spreadsheet_id: e.target.value })}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
                    placeholder="1AbCdEfGhIjKlMnOpQrStUvWxYz..."
                    required
                  />
                  <button
                    type="button"
                    onClick={() => formData.spreadsheet_id && handleVerify(formData.spreadsheet_id, editingBranch?.id ?? "new")}
                    disabled={!formData.spreadsheet_id || verifySpreadsheet.isPending}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 touch-target"
                  >
                    {verifySpreadsheet.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verifikasi"}
                  </button>
                </div>
                {verifyResult && verifyId === (editingBranch?.id ?? "new") && (
                  <p className={`mt-1 text-sm ${verifyResult.ok ? "text-green-600" : "text-red-600"}`}>
                    {verifyResult.ok ? "✓ Spreadsheet valid, tab siap" : `✗ Tab kurang: ${verifyResult.missing_tabs.join(", ")}`}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <label className="text-sm text-gray-700 dark:text-gray-300">Aktif</label>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingBranch(null); resetForm(); }}
                  className="flex-1 py-3 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 touch-target"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createBranch.isPending || updateBranch.isPending}
                  className="flex-1 py-3 px-4 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors touch-target"
                >
                  {(createBranch.isPending || updateBranch.isPending) ? "Menyimpan..." : (editingBranch ? "Update" : "Simpan")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Branches Table */}
      <div className="rounded-xl border bg-white dark:bg-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cabang</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Kode</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Zona Waktu</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Spreadsheet</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Schema</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {branches.map((branch) => (
                <tr key={branch.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{branch.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{branch.address ?? "-"}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 font-mono">{branch.code}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{branch.timezone}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded font-mono truncate max-w-[150px] block">
                        {branch.spreadsheet_id.slice(0, 20)}...
                      </code>
                      <a
                        href={`https://docs.google.com/spreadsheets/d/${branch.spreadsheet_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 text-gray-400 hover:text-blue-600"
                        title="Buka di Google Sheets"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{branch.schema_version}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${branch.is_active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"}`}>
                      {branch.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleEdit(branch)} className="p-1.5 text-gray-400 hover:text-blue-600" title="Edit">
                        <Edit className="w-4 h-4" />
                      </button>
                      {!editingBranch && branch.is_active && branches.length > 1 && (
                        <select
                          onChange={(e) => handleCopy(branch.id, e.target.value)}
                          className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                          defaultValue=""
                        >
                          <option value="">Salin ke...</option>
                          {branches.filter((b) => b.id !== branch.id && b.is_active).map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => handleDelete(branch.id)}
                        disabled={branch.id === user?.user_id} // Prevent self-delete
                        className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-50" title="Nonaktifkan"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {branches.length === 0 && (
          <div className="p-8 text-center">
            <Building2 className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-gray-500 dark:text-gray-400">Belum ada cabang terdaftar</p>
            <button
              onClick={() => { resetForm(); setEditingBranch(null); setShowForm(true); }}
              className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors touch-target flex items-center gap-2 mx-auto"
            >
              <Plus className="w-5 h-5" /> Tambah Cabang Pertama
            </button>
          </div>
        )}
      </div>
    </div>
  );
}