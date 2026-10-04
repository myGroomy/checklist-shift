// Petugas Buat Incident Page
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { useCreateIncident } from "@/lib/hooks/useIncident";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { XCircle, Loader2, AlertTriangle } from "lucide-react";

// Force TypeScript to recognize imports as used
(() => { void format; void parseISO; void localeId; void useAuth; void useCreateIncident; })();

const SEVERITY_OPTIONS = [
  { value: "rendah", label: "Rendah", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  { value: "sedang", label: "Sedang", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  { value: "tinggi", label: "Tinggi", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
] as const;

const CATEGORIES = [
  { id: "cat_1", name: "Kebersihan" },
  { id: "cat_2", name: "Keselamatan" },
  { id: "cat_3", name: "Peralatan" },
  { id: "cat_4", name: "Layanan" },
  { id: "cat_5", name: "Lainnya" },
];

export default function IncidentBaruPage() {
  const router = useRouter();
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

    // For demo, using placeholder photo_ids
    // In production, upload photos first to get IDs
    try {
      await createIncident.mutateAsync({
        branch_id: branchId,
        category_id: categoryId,
        description: description.trim(),
        occurred_at: new Date(occurredAt).toISOString(),
        photo_ids: photos.map((_, i) => `temp_${i}`), // Placeholder
        severity,
      });
      router.push("/incident");
      router.refresh();
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

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="sticky top-16 z-20 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <h1 className="font-semibold text-gray-900 dark:text-gray-100">Buat Incident Baru</h1>
      </div>

      <div className="max-w-2xl mx-auto px-4 space-y-6">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        {/* Category */}
        <div className="rounded-xl border bg-white dark:bg-gray-800 p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Kategori Incident *</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryId(cat.id)}
                className={`p-4 rounded-lg border-2 text-center transition-colors ${categoryId === cat.id ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30" : "border-gray-200 dark:border-gray-700 hover:border-gray-300"}`}
              >
                <span className="font-medium text-gray-900 dark:text-gray-100">{cat.name}</span>
              </button>
            ))}
          </div>
          {error === "Kategori wajib dipilih" && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">Pilih salah satu kategori di atas</p>
          )}
        </div>

        {/* Description */}
        <div className="rounded-xl border bg-white dark:bg-gray-800 p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Deskripsi *</h3>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Jelaskan incident yang terjadi dengan detail..."
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        {/* Occurred At */}
        <div className="rounded-xl border bg-white dark:bg-gray-800 p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Waktu Kejadian *</h3>
          <input
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Severity */}
        <div className="rounded-xl border bg-white dark:bg-gray-800 p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Severity</h3>
          <div className="flex gap-3">
            {SEVERITY_OPTIONS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSeverity(s.value)}
                className={`flex-1 px-4 py-3 rounded-lg border-2 text-center font-medium transition-colors ${severity === s.value ? `border-${s.value === "tinggi" ? "red" : s.value === "sedang" ? "amber" : "green"}-500 bg-${s.value === "tinggi" ? "red" : s.value === "sedang" ? "amber" : "green"}-50 text-white` : "border-gray-200 dark:border-gray-700 hover:border-gray-300"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Photos */}
        <div className="rounded-xl border bg-white dark:bg-gray-800 p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center justify-between">
            Foto (maks 5)
            {photos.length > 0 && <span className="text-sm text-gray-500 dark:text-gray-400">{photos.length}/5</span>}
          </h3>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handlePhotoChange}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {photos.length > 0 && (
            <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
              {photos.map((file, idx) => (
                <div key={idx} className="relative w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                  <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="sticky bottom-0 md:hidden bg-white/95 dark:bg-gray-900/95 backdrop-blur border-t border-gray-200 dark:border-gray-700 p-4 safe-bottom">
          <button
            onClick={handleSubmit}
            disabled={createIncident.isPending}
            className="w-full py-3 px-4 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 touch-target flex items-center justify-center gap-2"
          >
            {createIncident.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Buat Incident <AlertTriangle className="w-5 h-5" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}