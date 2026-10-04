// Incident List Page
"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";
import { useOpenIncidents, useCreateIncident } from "@/lib/hooks/useIncident";
import { AlertTriangle, Plus, ChevronRight, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";

export default function IncidentPage() {
  const { data: user } = useAuth();
  const branchId = user?.cabang[0] ?? "";
  const [showCreate, setShowCreate] = useState(false);

  const { data: incidentsData, isLoading, refetch } = useOpenIncidents(branchId);

  const incidents = incidentsData?.incident_open ?? [];

  const formatDateTime = (iso: string) => {
    try {
      return format(parseISO(iso), "dd MMM HH:mm", { locale: localeId });
    } catch {
      return iso;
    }
  };

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case "tinggi": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      case "sedang": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      default: return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "tinggi": return <AlertTriangle className="w-3 h-3" />;
      case "sedang": return <AlertCircle className="w-3 h-3" />;
      default: return <CheckCircle className="w-3 h-3" />;
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
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Incident</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{incidents.length} incident terbuka</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors touch-target flex items-center gap-2"
        >
          <Plus className="w-5 h-5" /> Buat Incident
        </button>
      </div>

      {/* Incident List */}
      {incidents.length === 0 ? (
        <div className="text-center py-12">
          <AlertTriangle className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">Tidak ada incident terbuka</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">Semua incident sudah ditangani</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors touch-target flex items-center gap-2 mx-auto"
          >
            <Plus className="w-5 h-5" /> Buat Incident Baru
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map((inc) => (
            <Link
              key={inc.incident_id}
              href={`/incident/${inc.incident_id}`}
              className="block p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${inc.severity === "tinggi" ? "bg-red-500" : inc.severity === "sedang" ? "bg-amber-500" : "bg-green-500"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">{inc.category_name}</h3>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${getSeverityStyle(inc.severity)} flex items-center gap-1`}>
                      {getSeverityIcon(inc.severity)} {inc.severity}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">{inc.description}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {formatDateTime(inc.reported_at)} • {inc.reported_by_name}
                    {inc.outside_shift && <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">Di luar shift</span>}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Incident Modal */}
      {showCreate && <CreateIncidentModal onClose={() => setShowCreate(false)} onSuccess={() => { refetch(); setShowCreate(false); }} />}
    </div>
  );
}

// Create Incident Modal Component
function CreateIncidentModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { data: user } = useAuth();
  const branchId = user?.cabang[0] ?? "";
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 16));
  const [severity, setSeverity] = useState<"rendah" | "sedang" | "tinggi">("sedang");
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const createIncident = useCreateIncident();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!categoryId) {
      setError("Kategori wajib dipilih");
      return;
    }
    if (!description.trim()) {
      setError("Deskripsi wajib diisi");
      return;
    }
    if (photos.length > 5) {
      setError("Maksimal 5 foto");
      return;
    }

    // For demo, we'll use placeholder photo_ids
    // In real implementation, upload photos first to get IDs
    try {
      await createIncident.mutateAsync({
        branch_id: branchId,
        category_id: categoryId,
        description: description.trim(),
        occurred_at: new Date(occurredAt).toISOString(),
        photo_ids: photos.map((_, i) => `temp_${i}`), // Placeholder
        severity,
      });
      onSuccess();
    } catch (err) {
      const apiError = err as { message?: string };
      setError(apiError.message ?? "Gagal membuat incident");
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length + photos.length > 5) {
      setError("Maksimal 5 foto");
      return;
    }
    setPhotos((prev) => [...prev, ...files]);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Buat Incident Baru</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kategori *</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
              required
            >
              <option value="">Pilih kategori...</option>
              <option value="cat_1">Kebersihan</option>
              <option value="cat_2">Keselamatan</option>
              <option value="cat_3">Peralatan</option>
              <option value="cat_4">Layanan</option>
              <option value="cat_5">Lainnya</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Deskripsi *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Jelaskan incident yang terjadi..."
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Waktu Kejadian *</label>
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 touch-target"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Severity</label>
            <div className="flex gap-2">
              {(["rendah", "sedang", "tinggi"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverity(s)}
                  className={`flex-1 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors touch-target ${
                    severity === s
                      ? s === "tinggi" ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      : s === "sedang" ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      : "border-green-500 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300"
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Foto (maks 5)</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoChange}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {photos.length > 0 && (
              <div className="flex gap-2 mt-2 overflow-x-auto">
                {photos.map((file, i) => (
                  <div key={i} className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                    <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 touch-target"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={createIncident.isPending}
              className="flex-1 py-3 px-4 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 transition-colors touch-target"
            >
              {createIncident.isPending ? "Membuat..." : "Buat Incident"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}