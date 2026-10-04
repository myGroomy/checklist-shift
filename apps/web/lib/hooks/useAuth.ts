// Auth Hooks - menggunakan TanStack Query untuk state management
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

// Types dari shared package
interface LoginResponse {
  ok: boolean;
  must_change_pin: boolean;
  role: "admin" | "petugas";
  name: string;
}

interface User {
  user_id: string;
  username: string;
  role: "admin" | "petugas";
  name: string;
  cabang: string[];
}

// Get current user (validasi session)
export function useAuth() {
  return useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: () => api.get<User>("/api/auth/siapa"),
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 menit
  });
}

// Login mutation
export function useLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (credentials: { username: string; pin: string }) =>
      api.post<LoginResponse>("/api/auth/login", credentials),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.auth.me(), {
        user_id: "",
        role: data.role,
        name: data.name,
        cabang: [],
      });

      // Redirect berdasarkan role & must_change_pin
      const redirect = searchParams.get("redirect") ?? (data.role === "admin" ? "/admin/dashboard" : "/home");
      if (data.must_change_pin) {
        router.push(`/ganti-pin?redirect=${encodeURIComponent(redirect)}`);
      } else {
        router.push(redirect);
      }
    },
    onError: (error: ApiError) => {
      // Error ditangani di component
      throw error;
    },
  });
}

// Logout mutation
export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post("/api/auth/logout"),
    onSuccess: () => {
      queryClient.clear();
      router.push("/login");
      router.refresh();
    },
  });
}

// Logout semua perangkat
export function useLogoutAll() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post("/api/auth/logout-semua"),
    onSuccess: () => {
      queryClient.clear();
      router.push("/login");
      router.refresh();
    },
  });
}

// Ganti PIN mutation
export function useChangePin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { pin_lama: string; pin_baru: string }) =>
      api.post("/api/auth/ganti-pin", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
      const redirect = searchParams.get("redirect") ?? "/home";
      router.push(redirect);
      router.refresh();
    },
  });
}

// Helper hook untuk cek apakah user adalah admin
export function useIsAdmin() {
  const { data: user } = useAuth();
  return user?.role === "admin";
}

// Helper hook untuk cek akses cabang
export function useBranchAccess(branchId: string) {
  const { data: user } = useAuth();
  return user?.cabang.includes(branchId) ?? false;
}

// Helper hook untuk require auth (redirect jika tidak login)
export function useRequireAuth(redirectTo = "/login") {
  const router = useRouter();
  const { data: user, isLoading, isError } = useAuth();

  useCallback(() => {
    if (!isLoading && (isError || !user)) {
      router.push(`${redirectTo}?redirect=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [isLoading, isError, user, router, redirectTo]);

  return { user, isLoading, isAuthenticated: !!user };
}

// Helper hook untuk require admin
export function useRequireAdmin(redirectTo = "/home") {
  const router = useRouter();
  const { data: user, isLoading, isError } = useAuth();

  useCallback(() => {
    if (!isLoading && (isError || !user || user.role !== "admin")) {
      router.push(redirectTo);
    }
  }, [isLoading, isError, user, router, redirectTo]);

  return { user, isLoading, isAdmin: user?.role === "admin" };
}