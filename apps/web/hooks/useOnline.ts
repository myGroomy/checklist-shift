// Hook untuk deteksi online/offline
// Menggunakan navigator.onLine + event listener + ping periodik ke API

import { useState, useEffect, useCallback } from "react";

interface OnlineState {
  isOnline: boolean;
  wasOffline: boolean; // True jika pernah offline sejak mount
  lastOnlineAt: Date | null;
  lastOfflineAt: Date | null;
}

export function useOnline(options?: { pingInterval?: number; pingUrl?: string }): OnlineState {
  const { pingInterval = 30000, pingUrl = "/api/health" } = options ?? {};

  const [state, setState] = useState<OnlineState>({
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    wasOffline: false,
    lastOnlineAt: typeof navigator !== "undefined" && navigator.onLine ? new Date() : null,
    lastOfflineAt: null,
  });

  const checkOnline = useCallback(async (): Promise<boolean> => {
    if (!navigator.onLine) return false;
    try {
      const res = await fetch(pingUrl, {
        method: "HEAD",
        cache: "no-store",
        credentials: "include",
        // Timeout manual via AbortController
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, [pingUrl]);

  useEffect(() => {
    let mounted = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const handleOnline = async () => {
      const online = await checkOnline();
      if (!mounted) return;
      setState((prev) => {
        if (prev.isOnline === online) return prev;
        return {
          isOnline: online,
          wasOffline: prev.wasOffline || !online,
          lastOnlineAt: online ? new Date() : prev.lastOnlineAt,
          lastOfflineAt: !online ? new Date() : prev.lastOfflineAt,
        };
      });
    };

    const handleOffline = () => {
      if (!mounted) return;
      setState((prev) => {
        if (!prev.isOnline) return prev;
        return {
          isOnline: false,
          wasOffline: true,
          lastOnlineAt: prev.lastOnlineAt,
          lastOfflineAt: new Date(),
        };
      });
    };

    // Event listeners
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Periodic ping untuk mendeteksi koneksi lambat/terputus
    intervalId = setInterval(handleOnline, pingInterval);

    // Initial check
    handleOnline();

    return () => {
      mounted = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (intervalId) clearInterval(intervalId);
    };
  }, [checkOnline, pingInterval]);

  return state;
}

// Hook sederhana hanya boolean
export function useIsOnline(): boolean {
  return useOnline().isOnline;
}