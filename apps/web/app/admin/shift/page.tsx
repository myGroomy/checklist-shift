// Admin Shift Page - Shift Definitions
"use client";

import { useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useBranches, useShiftDefinitions, useCreateShiftDefinition, useUpdateShiftDefinition } from "@/lib/hooks/useAdmin";
import { Clock, Plus, Edit, XCircle, Copy, CheckCircle } from "lucide-react";

export default function AdminShiftPage() {
  const { data: _user } = useAuth();
  const { data: branchesData } = useBranches();
  const branches = branchesData?.branches ?? [];
  const [selectedBranchId, setSelectedBranchId] = useState(branches[0]?.id ?? "");
  const [showForm, setShowForm] = useState(false);
  const [editingShift, setEditingShift] = useState<{ id: string; name: string; start_time: string; end_time: string; crosses_midnight: boolean; sort_order: number; is_active: boolean } | null>(null);

  const { data: shiftsData, isLoading, refetch } = useShiftDefinitions(selectedBranchId);
  const createShift = useCreateShiftDefinition();
  const updateShift = useUpdateShiftDefinition();

  const shifts = shiftsData?.shifts ?? [];
  const [formData, setFormData] = useState({
    name: "",
    start_time: "08:00",
    end_time: "16:00",
    crosses_midnight: false,
    sort_order: 0,
    is_active: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingShift) {
        await updateShift.mutateAsync({ ...formData, id: editingShift.id, branch_id: selectedBranchId });
      } else {
        await createShift.mutateAsync({ ...formData, branch_id: selectedBranchId });
      }
      setShowForm(false);
      setEditingShift(null);
      resetForm();
      refetch();
    } catch (err) {
      console.error("Gagal menyimpan shift:", err);
      alert("Gagal menyimpan shift");
    }
  };

  const handleEdit = (shift: typeof shifts[0]) => {
    setEditingShift(shift);
    setFormData({
      name: shift.name,
      start_time: shift.start_time,
      end_time: shift.end_time,
      crosses_midnight: shift.crosses_midnight,
      sort_order: shift.sort_order,
      is_active: shift.is_active,
    });
    setShowForm(true);
  };

  const handleCopy = async (_sourceId: string) => {
    // TODO: implement copy shift
    alert("Fitur salin shift belum diimplementasikan");
  };

  const resetForm = () => {
    setFormData({
      name: "",
      start_time: "08:00",
      end_time: "16:00",
      crosses_midnight: false,
      sort_order: 0,
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Definisi Shift</h1>
          <p className="text-gray-500 dark:text-gray-400">Atur jam shift, lewat tengah malam, dan urutan</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedBranchId}
            onChange={(e) => { setSelectedBranchId(e.target.value); setShowForm(false); setEditingShift(null); }}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          {selectedBranchId && (
            <button
              onClick={() => { resetForm(); setEditingShift(null); setShowForm(true); }}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors touch-target flex items-center gap-2"
            >
              <Plus className="w-5 h-5" /> Tambah Shift
            </button>
          )}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {editingShift ? "Edit Shift" : "Tambah Shift Baru"}
              </h3>
              <button onClick={() => { setShowForm(false); setEditingShift(null); resetForm(); }} className="p-1 text-gray-400 hover:text-gray-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nama Shift *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
                  required
                  placeholder="Contoh: Pagi, Siang, Malam"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Jam Mulai *</label>
                  <input
                    type="time"
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Jam Selesai *</label>
                  <input
                    type="time"
                    value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.crosses_midnight}
                  onChange={(e) => setFormData({ ...formData, crosses_midnight: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <label className="text-sm text-gray-700 dark:text-gray-300">Lewat tengah malam (mis. 22:00 - 06:00)</label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Urutan Tampil</label>
                <input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
                  min={0}
                />
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
                  onClick={() => { setShowForm(false); setEditingShift(null); resetForm(); }}
                  className="flex-1 py-3 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 touch-target"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createShift.isPending || updateShift.isPending}
                  className="flex-1 py-3 px-4 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors touch-target"
                >
                  {(createShift.isPending || updateShift.isPending) ? "Menyimpan..." : (editingShift ? "Update" : "Simpan")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Shifts Table */}
      <div className="rounded-xl border bg-white dark:bg-gray-800 overflow-hidden">
        {shifts.length === 0 ? (
          <div className="p-8 text-center">
            <Clock className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">Belum ada definisi shift untuk cabang ini</p>
            {selectedBranchId && (
              <button
                onClick={() => { resetForm(); setEditingShift(null); setShowForm(true); }}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors touch-target flex items-center gap-2 mx-auto"
              >
                <Plus className="w-5 h-5" /> Tambah Shift Pertama
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nama</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Jam</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Lewat Malam</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Urutan</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {shifts.map((shift) => (
                  <tr key={shift.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{shift.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{shift.id.slice(0, 12)}...</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 font-mono">
                      {shift.start_time} - {shift.end_time}
                    </td>
                    <td className="px-4 py-3">
                      {shift.crosses_midnight ? (
                        <span className="px-2 py-1 text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded">Ya</span>
                      ) : (
                        <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded">Tidak</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{shift.sort_order}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${shift.is_active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"}`}>
                        {shift.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleEdit(shift)} className="p-1.5 text-gray-400 hover:text-blue-600" title="Edit">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleCopy(shift.id)} className="p-1.5 text-gray-400 hover:text-green-600" title="Salin">
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("Nonaktifkan shift ini?")) {
                              updateShift.mutateAsync({ id: shift.id, branch_id: selectedBranchId, is_active: !shift.is_active });
                              refetch();
                            }
                          }}
                          className={`p-1.5 ${shift.is_active ? "text-gray-400 hover:text-red-600" : "text-gray-400 hover:text-green-600"}`}
                        >
                          {shift.is_active ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        </button>
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