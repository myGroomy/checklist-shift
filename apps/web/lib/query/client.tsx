// TanStack Query v5 Client & Provider Setup
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 30, // 30 detik
        gcTime: 1000 * 60 * 5, // 5 menit
        retry: (failureCount, error) => {
          // Jangan retry untuk 401, 403, 400
          if (error instanceof Error && "status" in error) {
            const status = (error as { status: number }).status;
            if ([400, 401, 403].includes(status)) return false;
          }
          return failureCount < 3;
        },
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

// Singleton untuk client-side
let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: buat baru setiap request
    return createQueryClient();
  }
  // Client: gunakan singleton
  if (!browserQueryClient) browserQueryClient = createQueryClient();
  return browserQueryClient;
}

// Provider component
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => getQueryClient());

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

// Query Keys Factory - untuk konsistensi & invalidation
export const queryKeys = {
  // Auth
  auth: {
    me: () => ["auth", "me"] as const,
  },

  // Shift
  shift: {
    list: (branchId: string, status?: string) => ["shift", "list", branchId, status ?? "all"] as const,
    detail: (shiftId: string, branchId: string) => ["shift", "detail", shiftId, branchId] as const,
    active: (branchId: string) => ["shift", "active", branchId] as const,
  },

  // Checklist
  checklist: {
    detail: (shiftId: string, branchId: string) => ["checklist", "detail", shiftId, branchId] as const,
    handover: (shiftId: string, branchId: string) => ["checklist", "handover", shiftId, branchId] as const,
  },

  // Incident
  incident: {
    list: (branchId: string, status?: string) => ["incident", "list", branchId, status ?? "open"] as const,
    detail: (id: string, branchId: string) => ["incident", "detail", id, branchId] as const,
    open: (branchId: string) => ["incident", "open", branchId] as const,
  },

  // Report
  report: {
    list: (branchId: string, filters?: Record<string, string>) => ["report", "list", branchId, filters] as const,
    detail: (shiftId: string, branchId: string) => ["report", "detail", shiftId, branchId] as const,
  },

  // Admin
  admin: {
    branches: () => ["admin", "branches"] as const,
    users: (branchId?: string) => ["admin", "users", branchId ?? "all"] as const,
    shiftDefs: (branchId: string) => ["admin", "shiftDefs", branchId] as const,
    categories: (branchId: string, shiftDefId?: string) => ["admin", "categories", branchId, shiftDefId] as const,
    checklistPoints: (branchId: string, categoryId?: string) => ["admin", "checklistPoints", branchId, categoryId] as const,
    handoverFields: (branchId: string, shiftDefId?: string) => ["admin", "handoverFields", branchId, shiftDefId] as const,
    incidentCategories: () => ["admin", "incidentCategories"] as const,
    shiftOps: () => ["admin", "shiftOps"] as const,
    incidents: (branchId?: string) => ["admin", "incidents", branchId ?? "all"] as const,
    stats: (branchId: string, range?: string) => ["admin", "stats", branchId, range] as const,
    auditLog: (filters?: Record<string, string>) => ["admin", "auditLog", filters] as const,
    settings: () => ["admin", "settings"] as const,
  },
} as const;