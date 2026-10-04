// Public Report Page - /r/[token] (no auth required)
"use client";

import { useParams } from "next/navigation";
import { usePublicReport } from "@/lib/hooks/useReport";
import { CheckCircle, XCircle, AlertTriangle, AlertCircle, MessageSquare, FileText, Clock, Download } from "lucide-react";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";

export default function PublicReportPage() {
  const params = useParams();
  const token = params.token as string;

  const { data: publicReport, isLoading, error } = usePublicReport(token);

  const formatDateTime = (iso: string | null) => {
    if (!iso) return "";
    try {
      return format(parseISO(iso), "dd MMM yyyy HH:mm", { locale: localeId });
    } catch {
      return iso;
    }
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return "";
    try {
      return format(parseISO(iso), "HH:mm", { locale: localeId });
    } catch {
      return iso;
    }
  };

  const getTimingIcon = (label: string | null) => {
    switch (label) {
      case "tepat_waktu": return <CheckCircle className="w-3 h-3 text-green-600 dark:text-green-400" />;
      case "lebih_awal": return <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />;
      case "terlambat": return <AlertTriangle className="w-3 h-3 text-red-600 dark:text-red-400" />;
      default: return null;
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "berjalan": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "ditutup": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "ditutup_paksa": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      case "void": return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
      default: return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  if (error || !publicReport?.ok) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
        <div className="max-w-md text-center">
          <AlertCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Laporan Tidak Dapat Diakses</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            {publicReport?.token_info?.revoked
              ? "Tautan ini telah dicabut oleh admin."
              : publicReport?.token_info?.expires_at
              ? "Tautan ini telah kedaluwarsa."
              : "Tautan tidak valid atau laporan tidak ditemukan."}
          </p>
          <a href="/" className="text-blue-600 dark:text-blue-400 hover:underline">Kembali ke beranda</a>
        </div>
      </main>
    );
  }

  const report = publicReport!.report;
  const isLocked = report.is_locked;

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Laporan Shift</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Akses publik via tautan aman</p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusStyle(report.status)}`}>
              {report.status.toUpperCase()}
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Print Button */}
        <div className="flex justify-end no-print">
          <button onClick={() => window.print()} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 touch-target">
            <Download className="w-4 h-4" /> Cetak / Simpan PDF
          </button>
        </div>

        {/* Report Header */}
        <div className="rounded-xl border bg-white dark:bg-gray-800 overflow-hidden">
          <div className="p-4 border-b bg-gray-50 dark:bg-gray-900/20">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{report.shift_name}</h2>
              {isLocked && (
                <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Terkunci
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-gray-500 dark:text-gray-400">Tanggal Shift</p>
                <p className="font-medium">{formatDateTime(report.opened_at)} - {formatDateTime(report.closed_at)}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Penanggung Jawab</p>
                <p className="font-medium">{report.pj_name}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Tipe Tutup</p>
                <p className="font-medium capitalize">{report.close_type}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Status</p>
                <p className="font-medium capitalize">{report.status.replace("_", " ")}</p>
              </div>
            </div>
          </div>

          {/* Checklist */}
          <div className="p-4 space-y-4">
            {report.checklist.map((cat) => (
              <details key={cat.category_id} className="group">
                <summary className="flex items-center justify-between cursor-pointer list-none p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900/50">
                  <h3 className="font-medium text-gray-900 dark:text-gray-100">{cat.category_name}</h3>
                  <ChevronDown className="w-5 h-5 text-gray-400 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-2 space-y-3 divide-y divide-gray-200 dark:divide-gray-700 pt-3">
                  {cat.items.map((item) => {
                    const isCompleted = item.state === "selesai" || item.state === "skip";
                    return (
                      <div key={item.point_ref} className={`flex items-start gap-3 p-3 rounded-lg ${isCompleted ? "bg-gray-50 dark:bg-gray-900/50 opacity-70" : ""}`}>
                        <div className="flex-shrink-0 mt-1">
                          {item.state === "selesai" && <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />}
                          {item.state === "skip" && <XCircle className="w-6 h-6 text-amber-600 dark:text-amber-400" />}
                          {item.state === "belum" && <div className="w-6 h-6 rounded-lg border-2 border-gray-300 dark:border-gray-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2">
                            <h4 className="font-medium text-gray-900 dark:text-gray-100">{item.judul}</h4>
                            {item.wajib && <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded mt-0.5">Wajib</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
                            {item.target_time && (
                              <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {item.target_time}
                              </span>
                            )}
                            {item.label_waktu && (
                              <span className={`flex items-center gap-1 px-2 py-0.5 rounded ${
                                item.label_waktu === "tepat_waktu" ? "bg-green-100 text-green-700" :
                                item.label_waktu === "lebih_awal" ? "bg-amber-100 text-amber-700" :
                                "bg-red-100 text-red-700"
                              } dark:bg-green-900/30 dark:bg-amber-900/30 dark:bg-red-900/30`}>
                                {getTimingIcon(item.label_waktu)}
                                {item.label_waktu === "tepat_waktu" && "Tepat waktu"}
                                {item.label_waktu === "lebih_awal" && `Lebih awal (${item.timing_delta_minutes}min)`}
                                {item.label_waktu === "terlambat" && `Terlambat (${item.timing_delta_minutes}min)`}
                              </span>
                            )}
                            {item.di_luar_rentang && (
                              <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Di luar rentang
                              </span>
                            )}
                          </div>
                          <div className="mt-2 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                            <span>Oleh: <strong>{item.pengisi || "-"}</strong></span>
                            {item.diisi_pada && <span>• {formatDateTime(item.diisi_pada)}</span>}
                            {item.state === "skip" && item.alasan_skip && (
                              <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded">
                                Skip: {item.alasan_skip}
                              </span>
                            )}
                          </div>
                          {item.nilai && (
                            <div className="mt-2 p-2 rounded bg-gray-100 dark:bg-gray-800 text-sm font-mono text-gray-900 dark:text-gray-100">
                              Nilai: {item.nilai}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        </div>

        {/* Incident */}
        {report.incident.length > 0 && (
          <div className="rounded-xl border bg-white dark:bg-gray-800 overflow-hidden">
            <div className="p-4 border-b bg-gray-50 dark:bg-gray-900/20">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" /> Incident ({report.incident.length})
              </h3>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700 p-4 space-y-4">
              {report.incident.map((inc) => (
                <div key={inc.incident_id}>
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${inc.severity === "tinggi" ? "bg-red-500" : inc.severity === "sedang" ? "bg-amber-500" : "bg-green-500"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100">{inc.category_name}</h4>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${inc.severity === "tinggi" ? "bg-red-100 text-red-700" : inc.severity === "sedang" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"} dark:bg-red-900/30 dark:bg-amber-900/30 dark:bg-green-900/30`}>
                          {inc.severity}
                        </span>
                        {inc.status === "selesai" && (
                          <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded">Selesai</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">{inc.description}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDateTime(inc.occurred_at)} • {inc.reported_by_name}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Handover */}
        {report.handover && (
          <div className="rounded-xl border bg-white dark:bg-gray-800 overflow-hidden">
            <div className="p-4 border-b bg-gray-50 dark:bg-gray-900/20">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Handover
              </h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Diserahkan: <strong>{report.handover.submitted_by}</strong> • {formatDateTime(report.handover.submitted_at)}</p>
              </div>
              {report.handover.free_text && (
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Catatan Bebas</p>
                  <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{report.handover.free_text}</p>
                </div>
              )}
              {report.handover.values && Object.keys(report.handover.values).length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Field Terstruktur</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(report.handover.values).map(([key, value]) => (
                      <div key={key} className="p-2 rounded bg-gray-50 dark:bg-gray-900/50">
                        <p className="text-xs text-gray-500 dark:text-gray-400">{key}</p>
                        <p className="text-sm font-medium">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {report.handover_acks.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sudah Dibaca ({report.handover_acks.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {report.handover_acks.map((ack) => (
                      <span key={ack.user_id} className="px-2 py-1 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">
                        {ack.user_name} ({formatTime(ack.read_at)})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Addenda */}
        {report.addenda.length > 0 && (
          <div className="rounded-xl border bg-white dark:bg-gray-800 overflow-hidden">
            <div className="p-4 border-b bg-gray-50 dark:bg-gray-900/20">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-purple-600 dark:text-purple-400" /> Addendum ({report.addenda.length})
              </h3>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {report.addenda.map((add) => (
                <div key={add.id} className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{add.author_name}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(add.created_at)}</span>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300">{add.note}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Kontribusi */}
        <div className="rounded-xl border bg-white dark:bg-gray-800 overflow-hidden">
          <div className="p-4 border-b bg-gray-50 dark:bg-gray-900/20">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Kontribusi Petugas</h3>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {report.kontribusi.map((k) => (
              <div key={k.user_id} className="p-4">
                <p className="font-medium text-gray-900 dark:text-gray-100">{k.user_name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Aksi: {k.aksi_count} • Selesai: {k.item_selesai} • Skip: {k.item_skip}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 dark:text-gray-400 border-t pt-4">
          <p>Laporan Checklist Shift - Dibuat otomatis</p>
          <p className="mt-1">Tautan ini akan kedaluwarsa pada {publicReport!.token_info.expires_at ? formatDateTime(publicReport.token_info.expires_at) : "tidak ditentukan"}</p>
        </div>
      </div>
    </main>
  );
}

// Static generation not needed - dynamic route
export const dynamic = "force-dynamic";