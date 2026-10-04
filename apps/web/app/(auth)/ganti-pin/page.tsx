// Ganti PIN Page (wajib saat login pertama)
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useChangePin } from "@/lib/hooks/useAuth";
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle } from "lucide-react";

export default function GantiPinPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/home";

  const [pinLama, setPinLama] = useState("");
  const [pinBaru, setPinBaru] = useState("");
  const [konfirmasiPin, setKonfirmasiPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { mutate: changePin, isPending } = useChangePin();

  const validatePin = (pin: string): string | null => {
    if (!/^\d{6}$/.test(pin)) return "PIN harus 6 angka";
    // Cek PIN lemah (opsional, backend juga cek)
    const weakPatterns = ["000000", "111111", "123456", "654321", "111111", "000001"];
    if (weakPatterns.includes(pin)) return "PIN terlalu mudah ditebak, pilih yang lain";
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const errLama = validatePin(pinLama);
    if (errLama) {
      setError(`PIN lama: ${errLama}`);
      return;
    }

    const errBaru = validatePin(pinBaru);
    if (errBaru) {
      setError(`PIN baru: ${errBaru}`);
      return;
    }

    if (pinBaru !== konfirmasiPin) {
      setError("Konfirmasi PIN baru tidak cocok");
      return;
    }

    if (pinLama === pinBaru) {
      setError("PIN baru harus berbeda dari PIN lama");
      return;
    }

    changePin({ pin_lama: pinLama, pin_baru: pinBaru }, {
      onSuccess: () => {
        setSuccess(true);
        setTimeout(() => router.push(redirect), 1500);
      },
      onError: (err: Error) => {
        const apiError = err as { code?: string; message?: string };
        if (apiError.code === "pin_lama_salah") {
          setError("PIN lama salah");
        } else if (apiError.code === "pin_lemah") {
          setError(apiError.message ?? "PIN terlalu lemah");
        } else {
          setError(apiError.message ?? "Gagal mengganti PIN");
        }
      },
    });
  };

  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 safe-top safe-bottom">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">PIN Berhasil Diubah</h1>
          <p className="mt-2 text-gray-500 dark:text-gray-400">Mengarahkan ke dashboard...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 safe-top safe-bottom">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <svg className="w-16 h-16 mx-auto text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-gray-100">Ganti PIN</h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400">Login pertama memerlukan ganti PIN keamanan</p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 dark:bg-red-900/30 dark:border-red-800 dark:text-red-200 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="pinLama" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              PIN Lama
            </label>
            <div className="relative">
              <input
                id="pinLama"
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={pinLama}
                onChange={(e) => setPinLama(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors touch-target pr-12"
                placeholder="••••••"
                disabled={isPending}
                required
                maxLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                aria-label={showPin ? "Sembunyikan PIN" : "Tampilkan PIN"}
              >
                {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="pinBaru" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              PIN Baru (6 angka)
            </label>
            <div className="relative">
              <input
                id="pinBaru"
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="new-password"
                value={pinBaru}
                onChange={(e) => setPinBaru(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors touch-target pr-12"
                placeholder="••••••"
                disabled={isPending}
                required
                maxLength={6}
              />
            </div>
          </div>

          <div>
            <label htmlFor="konfirmasiPin" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Konfirmasi PIN Baru
            </label>
            <div className="relative">
              <input
                id="konfirmasiPin"
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="new-password"
                value={konfirmasiPin}
                onChange={(e) => setKonfirmasiPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors touch-target pr-12"
                placeholder="••••••"
                disabled={isPending}
                required
                maxLength={6}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-3 px-4 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-target flex items-center justify-center gap-2"
          >
            {isPending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Menyimpan...
              </>
            ) : (
              "Simpan PIN Baru"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Tips: Gunakan kombinasi angka yang sulit ditebak, hindari tanggal lahir atau pola berurutan.
        </p>
      </div>
    </main>
  );
}