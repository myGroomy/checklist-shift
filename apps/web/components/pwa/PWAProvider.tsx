// PWA Provider - inisialisasi offline DB, sinkronisasi, kalibrasi waktu
// Dipasang di root layout

"use client";

import { useEffect } from "react";
import { useSyncInit } from "@/hooks/useSync";
import { ConnectionIndicator } from "@/components/pwa/ConnectionIndicator";
import { SyncQueueDrawer } from "@/components/pwa/SyncQueueDrawer";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { useSync } from "@/hooks/useSync";
import { useState } from "react";

export function PWAProvider({ children }: { children: React.ReactNode }) {
  useSyncInit();
  const { wasOffline, pendingCount, failedCount } = useSync();
  const [queueOpen, setQueueOpen] = useState(false);
  const [setDismissedInstall] = useState(false);

  // Auto-buka drawer jika ada antigan gagal dan user baru online
  useEffect(() => {
    if (wasOffline && failedCount > 0) {
      setQueueOpen(true);
    }
  }, [wasOffline, failedCount]);

  return (
    <>
      {/* Inisialisasi service worker */}
      <SWRegistration />

      {/* Connection indicator (banner di bawah header) */}
      <ConnectionIndicator />

      {/* Install prompt */}
      <InstallPrompt onDismissed={() => setDismissedInstall(true)} />

      {/* Queue drawer */}
      <SyncQueueDrawer open={queueOpen} onClose={() => setQueueOpen(false)} />

      {/* Main content */}
      {children}

      {/* Floating action button untuk buka queue (opsional) */}
      {(pendingCount > 0 || failedCount > 0) && (
        <button
          onClick={() => setQueueOpen(true)}
          className="fixed bottom-20 right-4 z-40 p-3 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors animate-bounce-in"
          aria-label={`Antrian sinkronisasi: ${pendingCount} menunggu, ${failedCount} gagal`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span className="sr-only">Buka antrian sinkronisasi</span>
          {(pendingCount > 0 || failedCount > 0) && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
              {pendingCount + failedCount}
            </span>
          )}
        </button>
      )}
    </>
  );
}

// Komponen terpisah untuk registrasi SW (hindari re-render)
function SWRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // Serwist akan handle registrasi via next-pwa atau manual
      // Di sini kita hanya pastikan SW aktif
      navigator.serviceWorker.ready.then((reg) => {
        console.log("[PWA] Service Worker ready:", reg.scope);
      });
    }
  }, []);

  return null;
}

// Animasi bounce in
const style = document.createElement("style");
style.textContent = `
  @keyframes bounce-in {
    0% { opacity: 0; transform: scale(0.8) translateY(10px); }
    50% { transform: scale(1.05); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }
  .animate-bounce-in { animation: bounce-in 0.4s ease-out; }
`;
if (typeof document !== "undefined") {
  document.head.appendChild(style);
}