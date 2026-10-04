// PWA Install Prompt (Fase 7)
// Native beforeinstallprompt + custom banner fallback

"use client";

import { useState, useEffect, useCallback } from "react";
import { Download, X, Smartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt({ onDismissed }: { onDismissed?: () => void }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  // Cek apakah sudah terinstall (standalone mode)
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsInstalled(standalone);
    setIsIOS(iOS);

    if (standalone) return; // Sudah terinstall, tidak perlu tampilkan

    // Listen for beforeinstallprompt (Chrome/Edge)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Tampilkan custom banner setelah delay kecil
      setTimeout(() => setShowBanner(true), 3000);
    };

    // Listen for appinstalled
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowBanner(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    // Fallback: tampilkan banner untuk iOS atau jika beforeinstallprompt tidak fire
    const fallbackTimer = setTimeout(() => {
      if (!standalone && !deferredPrompt && !isIOS) {
        setShowBanner(true);
      }
      // iOS: tampilkan banner dengan instruksi manual
      if (isIOS) {
        setShowBanner(true);
      }
    }, 5000);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      clearTimeout(fallbackTimer);
    };
  }, [deferredPrompt, isIOS]);

  const handleInstall = useCallback(async () => {
    if (deferredPrompt) {
      // Native prompt
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setShowBanner(false);
        setDeferredPrompt(null);
      }
    } else if (isIOS) {
      // iOS: tidak bisa trigger native, user harus manual
      // Banner akan tetap tampil dengan instruksi
    } else {
      // Fallback: arahkan ke settings browser
      alert("Silakan gunakan menu browser 'Tambah ke Layar Utama' atau 'Install App'");
    }
  }, [deferredPrompt, isIOS]);

  const handleDismiss = useCallback(() => {
    setShowBanner(false);
    onDismissed?.();
  }, [onDismissed]);

  // Jika sudah terinstall atau sudah dismiss permanent, jangan tampilkan
  if (isInstalled || !showBanner) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 md:bottom-20 md:left-auto md:right-4 md:w-96 z-50 animate-slide-up"
      role="dialog"
      aria-label="Pasang aplikasi"
    >
      <div className="bg-white rounded-xl shadow-2xl border p-4 dark:bg-gray-800">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 p-3 rounded-xl bg-blue-100 dark:bg-blue-900/30">
            <Smartphone className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Pasang Aplikasi</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              {isIOS
                ? "Buka menu Safari (bagian bawah) → pilih 'Tambah ke Layar Utama' untuk akses cepat offline."
                : "Pasang Checklist Shift ke layar utama untuk akses offline dan notifikasi push."}
            </p>

            <div className="mt-3 flex gap-2">
              <button
                onClick={handleInstall}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                {isIOS ? "Cara Pasang" : deferredPrompt ? "Pasang Sekarang" : "Buka Pengaturan"}
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                Nanti
              </button>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Instruksi iOS tambahan */}
        {isIOS && (
          <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
              <li>Buka di Safari (bukan Chrome/Firefox)</li>
              <li>Tekan ikon <strong>Bagikan</strong> (persegi + panah atas)</li>
              <li>Gulir ke bawah, pilih <strong>"Tambah ke Layar Utama"</strong></li>
              <li>Tekan <strong>"Tambah"</strong> di kanan atas</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

// Animasi slide up
const style = document.createElement("style");
style.textContent = `
  @keyframes slide-up {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-slide-up { animation: slide-up 0.3s ease-out; }
`;
if (typeof document !== "undefined") {
  document.head.appendChild(style);
}