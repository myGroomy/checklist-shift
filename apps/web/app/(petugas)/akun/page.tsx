// Petugas Akun Page
"use client";

import { useState } from "react";
import { useAuth, useLogout, useLogoutAll, useChangePin } from "@/lib/hooks/useAuth";
import { User, LogOut, Key, Loader2, AlertCircle, XCircle } from "lucide-react";

export default function AkunPage() {
  const { data: user, isLoading } = useAuth();
  const logout = useLogout();
  const logoutAll = useLogoutAll();
  const changePin = useChangePin();

  const [showChangePin, setShowChangePin] = useState(false);
  const [pinLama, setPinLama] = useState("");
  const [pinBaru, setPinBaru] = useState("");
  const [konfirmasiPin, setKonfirmasiPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
        <p className="text-gray-500 dark:text-gray-400">Silakan login terlebih dahulu</p>
      </div>
    );
  }

  const handleChangePin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!/^\d{6}$/.test(pinLama)) {
      setError("PIN lama harus 6 angka");
      return;
    }
    if (!/^\d{6}$/.test(pinBaru)) {
      setError("PIN baru harus 6 angka");
      return;
    }
    if (pinBaru !== konfirmasiPin) {
      setError("Konfirmasi PIN tidak cocok");
      return;
    }
    if (pinLama === pinBaru) {
      setError("PIN baru harus berbeda dari PIN lama");
      return;
    }

    changePin.mutate({ pin_lama: pinLama, pin_baru: pinBaru }, {
      onSuccess: () => {
        setSuccess(true);
        setShowChangePin(false);
        setPinLama("");
        setPinBaru("");
        setKonfirmasiPin("");
        setTimeout(() => setSuccess(false), 2000);
      },
      onError: (err: Error) => {
        const apiError = err as { code?: string; message?: string };
        setError(apiError.message ?? "Gagal mengganti PIN");
      },
    });
  };

  const handleLogout = () => {
    logout.mutate();
  };

  const handleLogoutAll = () => {
    if (confirm("Logout dari semua perangkat?")) {
      logoutAll.mutate();
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Akun Saya</h1>

      {success && (
        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200">
          PIN berhasil diubah
        </div>
      )}

      <div className="rounded-xl border bg-white dark:bg-gray-800 p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <User className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{user.name}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">@{user.username}</p>
            <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full ${
              user.role === "admin" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
            }`}>
              {user.role}
            </span>
          </div>
        </div>

        <div className="border-t pt-4 space-y-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">Cabang Akses:</p>
          <div className="flex flex-wrap gap-2">
            {user.cabang.map((c) => (
              <span key={c} className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">
                {c.slice(0, 8)}...
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white dark:bg-gray-800 p-4 space-y-4">
        <h3 className="font-medium text-gray-900 dark:text-gray-100">Keamanan</h3>

        <button
          onClick={() => setShowChangePin(true)}
          className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between touch-target"
        >
          <div className="flex items-center gap-3">
            <Key className="w-5 h-5 text-gray-400" />
            <span className="font-medium">Ganti PIN</span>
          </div>
        </button>

        <button
          onClick={handleLogout}
          disabled={logout.isPending}
          className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between touch-target"
        >
          <div className="flex items-center gap-3">
            <LogOut className="w-5 h-5 text-gray-400" />
            <span className="font-medium">Keluar</span>
          </div>
        </button>

        <button
          onClick={handleLogoutAll}
          disabled={logoutAll.isPending}
          className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between touch-target"
        >
          <div className="flex items-center gap-3">
            <LogOut className="w-5 h-5 text-gray-400" />
            <span className="font-medium">Keluar dari Semua Perangkat</span>
          </div>
        </button>
      </div>

      {/* Change PIN Modal */}
      {showChangePin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Ganti PIN</h3>
              <button onClick={() => setShowChangePin(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleChangePin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">PIN Lama</label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pinLama}
                  onChange={(e) => setPinLama(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
                  placeholder="••••••"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">PIN Baru (6 angka)</label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pinBaru}
                  onChange={(e) => setPinBaru(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
                  placeholder="••••••"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Konfirmasi PIN Baru</label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={konfirmasiPin}
                  onChange={(e) => setKonfirmasiPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
                  placeholder="••••••"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowChangePin(false); setPinLama(""); setPinBaru(""); setKonfirmasiPin(""); }}
                  className="flex-1 py-3 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 touch-target"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={changePin.isPending}
                  className="flex-1 py-3 px-4 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 touch-target"
                >
                  {changePin.isPending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}