// Checklist List Page - Daftar Shift
"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";
import { useShiftList, useActiveShift, useOpenShift, useJoinShift } from "@/lib/hooks/useShift";
import { Clock, PlayCircle, CheckCircle, AlertCircle, XCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";

export default function ChecklistPage() {
  const { data: user } = useAuth();
  const branchId = user?.cabang[0] ?? "";
  const [statusFilter, setStatusFilter] = useState<"all" | "belum_dibuka" | "berjalan" | "ditutup">("all");

  const { data: shiftsData, isLoading, refetch } = useShiftList(branchId, statusFilter !== "all" ? statusFilter : undefined);
  const { data: activeShift } = useActiveShift(branchId);
  const openShift = useOpenShift();
  const joinShift = useJoinShift();

  const activeShiftId = activeShift?.shift?.id;

  const shifts = shiftsData?.shifts ?? [];

  const formatDate = (iso: string) => {
    try {
      return format(parseISO(iso), "EEEE, dd MMMM yyyy", { locale: localeId });
    } catch {
      return iso;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "berjalan":
        return { label: "Berjalan", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: <PlayCircle className="w-3 h-3" /> };
      case "ditutup":
        return { label: "Ditutup", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: <CheckCircle className="w-3 h-3" /> };
      case "ditutup_paksa":
        return { label: "Ditutup Paksa", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: <AlertCircle className="w-3 h-3" /> };
      case "void":
        return { label: "Void", className: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300", icon: <XCircle className="w-3 h-3" /> };
      default:
        return { label: "Belum Dibuka", className: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300", icon: <Clock className="w-3 h-3" /> };
    }
  };

  const handleOpenShift = async (shiftDefId: string) => {
    try {
      await openShift.mutateAsync({ branch_id: branchId, shift_def_id: shiftDefId });
      refetch();
    } catch (err) {
      // Error handled by mutation
      console.error("Buka shift gagal:", err);
    }
  };

  const handleJoinShift = async (shiftId: string) => {
    try {
      await joinShift.mutateAsync({ branch_id: branchId, shift_id: shiftId });
      refetch();
    } catch (err) {
      console.error("Gabung shift gagal:", err);
    }
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
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Checklist Shift</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Pilih shift untuk memulai</p>
        </div>
      </div>

      {/* Filter Status */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {[
          { value: "all", label: "Semua" },
          { value: "belum_dibuka", label: "Belum Dibuka" },
          { value: "berjalan", label: "Berjalan" },
          { value: "ditutup", label: "Ditutup" },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value as typeof statusFilter)}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              statusFilter === f.value
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Shift List */}
      {shifts.length === 0 ? (
        <div className="text-center py-12">
          <Clock className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">Tidak ada shift</h3>
          <p className="text-gray-500 dark:text-gray-400">Tidak ada shift untuk filter ini</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shifts.map((shift) => {
            const isActive = shift.id === activeShiftId;
            const badge = getStatusBadge(shift.status);
            const canJoin = shift.status === "berjalan" && !isActive;
            const canOpen = shift.status === "belum_dibuka";

            return (
              <Link
                key={shift.id}
                href={shift.status === "berjalan" ? `/checklist/${shift.id}` : `/report/${shift.id}`}
                className={`block p-4 rounded-xl border bg-white dark:bg-gray-800 transition-colors ${
                  isActive ? "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20" : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{shift.shift_definition_id}</h3>
                      {isActive && <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">AKTIF</span>}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">PJ: {shift.pj_name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {formatDate(shift.shift_date)} • Progress: {shift.progress.wajib_selesai}/{shift.progress.wajib_total} wajib
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${badge.className}`}>
                      {badge.icon} {badge.label}
                    </span>
                    {canOpen && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          handleOpenShift(shift.shift_definition_id);
                        }}
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors touch-target"
                      >
                        Buka Shift
                      </button>
                    )}
                    {canJoin && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          handleJoinShift(shift.id);
                        }}
                        className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors touch-target"
                      >
                        Gabung
                      </button>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}