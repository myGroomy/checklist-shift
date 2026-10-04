// Admin Akun Page
"use client";

import { useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useUsers, useCreateUser, useUpdateUser, useResetUserPin, useUnlockUser, useForceLogoutUser } from "@/lib/hooks/useAdmin";
import { Users, Plus, Edit, Key, LockOpen, LogOut, AlertCircle, XCircle, CheckCircle, Shield } from "lucide-react";

export default function AdminAkunPage() {
  const { data: user } = useAuth();
  const { data: usersData, isLoading, refetch } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const resetPin = useResetUserPin();
  const unlockUser = useUnlockUser();
  const forceLogout = useForceLogoutUser();

  const users = usersData?.users ?? [];
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<typeof users[0] | null>(null);
  const [resetPinUserId, setResetPinUserId] = useState<string | null>(null);
  const [newPin, setNewPin] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    username: "",
    pin: "",
    role: "petugas" as "admin" | "petugas",
    branch_ids: [] as string[],
    is_active: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await updateUser.mutateAsync({ ...formData, id: editingUser.id });
      } else {
        await createUser.mutateAsync(formData);
      }
      setShowForm(false);
      setEditingUser(null);
      resetForm();
      refetch();
    } catch (err) {
      console.error("Gagal menyimpan akun:", err);
      alert("Gagal menyimpan akun");
    }
  };

  const handleEdit = (u: typeof users[0]) => {
    setEditingUser(u);
    setFormData({
      name: u.name,
      username: u.username,
      pin: "",
      role: u.role,
      branch_ids: u.branches,
      is_active: u.is_active,
    });
    setShowForm(true);
  };

  const handleResetPin = (userId: string) => {
    setResetPinUserId(userId);
    setNewPin("");
  };

  const handleConfirmResetPin = async () => {
    if (!resetPinUserId || !/^\d{6}$/.test(newPin)) {
      alert("PIN harus 6 angka");
      return;
    }
    try {
      await resetPin.mutateAsync({ user_id: resetPinUserId, new_pin: newPin });
      setResetPinUserId(null);
      setNewPin("");
      refetch();
    } catch (err) {
      console.error("Reset PIN gagal:", err);
      alert("Gagal reset PIN");
    }
  };

  const handleUnlock = async (userId: string) => {
    try {
      await unlockUser.mutateAsync(userId);
      refetch();
    } catch (err) {
      console.error("Buka kunci gagal:", err);
    }
  };

  const handleForceLogout = async (userId: string) => {
    if (!confirm("Paksa logout semua sesi pengguna ini?")) return;
    try {
      await forceLogout.mutateAsync(userId);
      refetch();
    } catch (err) {
      console.error("Paksa logout gagal:", err);
    }
  };

  const handleToggleActive = async (u: typeof users[0]) => {
    if (!u.is_active) {
      // Reactivate
      await updateUser.mutateAsync({ id: u.id, is_active: true });
      refetch();
      return;
    }
    // Deactivate - check if last admin
    const adminCount = users.filter((x) => x.role === "admin" && x.is_active).length;
    if (u.role === "admin" && adminCount <= 1) {
      alert("Admin terakhir tidak bisa dinonaktifkan");
      return;
    }
    if (!confirm(`Nonaktifkan akun ${u.name}?`)) return;
    await updateUser.mutateAsync({ id: u.id, is_active: false });
    refetch();
  };

  const resetForm = () => {
    setFormData({
      name: "",
      username: "",
      pin: "",
      role: "petugas",
      branch_ids: [],
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Kelola Akun</h1>
          <p className="text-gray-500 dark:text-gray-400">Pengguna, peran, akses cabang, & keamanan PIN</p>
        </div>
        <button
          onClick={() => { resetForm(); setEditingUser(null); setShowForm(true); }}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors touch-target flex items-center gap-2"
        >
          <Plus className="w-5 h-5" /> Tambah Akun
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-xl p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {editingUser ? "Edit Akun" : "Tambah Akun Baru"}
              </h3>
              <button onClick={() => { setShowForm(false); setEditingUser(null); resetForm(); }} className="p-1 text-gray-400 hover:text-gray-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username *</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase() })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
                  required
                  disabled={!!editingUser}
                />
                {editingUser && <p className="text-xs text-gray-500 mt-1">Username tidak bisa diubah</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {editingUser ? "PIN Baru (kosongkan jika tidak diubah)" : "PIN (6 angka) *"}
                </label>
                <input
                  type="password"
                  value={formData.pin}
                  onChange={(e) => setFormData({ ...formData, pin: e.target.value })}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
                  required={!editingUser}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Peran *</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as "admin" | "petugas" })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
                >
                  <option value="petugas">Petugas</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Akses Cabang *</label>
                <div className="space-y-1">
                  {usersData?.users?.flatMap((u) => u.branches).filter((v, i, a) => a.indexOf(v) === i).map((branchId) => (
                    <label key={branchId} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.branch_ids.includes(branchId)}
                        onChange={(e) => setFormData({
                          ...formData,
                          branch_ids: e.target.checked
                            ? [...formData.branch_ids, branchId]
                            : formData.branch_ids.filter((id) => id !== branchId)
                        })}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{branchId.slice(0, 8)}...</span>
                    </label>
                  ))}
                </div>
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
                  onClick={() => { setShowForm(false); setEditingUser(null); resetForm(); }}
                  className="flex-1 py-3 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 touch-target"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createUser.isPending || updateUser.isPending}
                  className="flex-1 py-3 px-4 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors touch-target"
                >
                  {(createUser.isPending || updateUser.isPending) ? "Menyimpan..." : (editingUser ? "Update" : "Simpan")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset PIN Modal */}
      {resetPinUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl p-6 animate-slide-up">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Reset PIN Pengguna</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Masukkan PIN baru 6 angka</p>
            <input
              type="password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
              placeholder="••••••"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setResetPinUserId(null); setNewPin(""); }}
                className="flex-1 py-3 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 touch-target"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmResetPin}
                disabled={resetPin.isPending || !/^\d{6}$/.test(newPin)}
                className="flex-1 py-3 px-4 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors touch-target"
              >
                {resetPin.isPending ? "Mereset..." : "Reset PIN"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="rounded-xl border bg-white dark:bg-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pengguna</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Username</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Peran</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cabang</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Terakhir Login</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{u.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{u.id.slice(0, 12)}...</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{u.username}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${u.role === "admin" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}>
                      {u.role === "admin" ? <Shield className="w-3 h-3 mr-1" /> : <Users className="w-3 h-3 mr-1" />} {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {u.branches.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {u.branches.map((b) => (
                          <span key={b} className="px-1.5 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">{b.slice(0, 8)}</span>
                        ))}
                      </div>
                    ) : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${u.is_active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"}`}>
                        {u.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                      {u.locked_until && new Date(u.locked_until) > new Date() && (
                        <span title={`Terkunci sampai ${new Date(u.locked_until).toLocaleString()}`}>
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        </span>
                      )}
                      {u.must_change_pin && (
                        <span title="Wajib ganti PIN">
                          <Key className="w-4 h-4 text-amber-500" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString("id-ID") : "Belum pernah"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleEdit(u)} className="p-1.5 text-gray-400 hover:text-blue-600" title="Edit">
                        <Edit className="w-4 h-4" />
                      </button>
                      {u.locked_until && new Date(u.locked_until) > new Date() && (
                        <button onClick={() => handleUnlock(u.id)} disabled={unlockUser.isPending} className="p-1.5 text-gray-400 hover:text-green-600" title="Buka Kunci">
                          <LockOpen className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => handleResetPin(u.id)} disabled={resetPin.isPending} className="p-1.5 text-gray-400 hover:text-amber-600" title="Reset PIN">
                        <Key className="w-4 h-4" />
                      </button>
                      {u.id !== user?.user_id && (
                        <button onClick={() => handleForceLogout(u.id)} disabled={forceLogout.isPending} className="p-1.5 text-gray-400 hover:text-red-600" title="Paksa Logout">
                          <LogOut className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => handleToggleActive(u)} className={`p-1.5 ${u.is_active ? "text-gray-400 hover:text-red-600" : "text-gray-400 hover:text-green-600"}`} title={u.is_active ? "Nonaktifkan" : "Aktifkan"}>
                        {u.is_active ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 && (
          <div className="p-8 text-center">
            <Users className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-gray-500 dark:text-gray-400">Belum ada akun terdaftar</p>
          </div>
        )}
      </div>
    </div>
  );
}