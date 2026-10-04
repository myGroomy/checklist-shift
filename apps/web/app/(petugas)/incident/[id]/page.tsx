// Incident Detail Page
"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { useIncidentDetail, useAddIncidentNote } from "@/lib/hooks/useIncident";
import { ArrowLeft, Camera, MessageSquare, AlertTriangle, AlertCircle, CheckCircle, XCircle, Send, RotateCcw } from "lucide-react";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";
import Link from "next/link";

export default function IncidentDetailPage() {
  const params = useParams();
  const incidentId = params.id as string;
  const { data: user } = useAuth();
  const branchId = user?.cabang[0] ?? "";
  const [newNote, setNewNote] = useState("");
  const [showPhotos, setShowPhotos] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);

  const { data: incident, isLoading } = useIncidentDetail(incidentId, branchId);
  const addNote = useAddIncidentNote(incidentId, branchId);

  const formatDateTime = (iso: string | null) => {
    if (!iso) return "";
    try {
      return format(parseISO(iso), "dd MMM yyyy HH:mm", { locale: localeId });
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

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "open": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      default: return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    try {
      await addNote.mutateAsync({
        branch_id: branchId,
        note: newNote.trim(),
      });
      setNewNote("");
      // Refetch would be handled by query invalidation
    } catch (err) {
      console.error("Gagal menambah catatan:", err);
      alert("Gagal menambah catatan");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">Incident tidak ditemukan</h3>
        <Link href="/incident" className="text-blue-600 dark:text-blue-400 hover:underline">Kembali ke daftar incident</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/incident" className="p-1 text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Detail Incident</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">ID: {incident.id.slice(0, 12)}...</p>
        </div>
      </div>

      {/* Incident Header Card */}
      <div className="rounded-xl border bg-white dark:bg-gray-800 overflow-hidden">
        <div className="p-4 border-b bg-gray-50 dark:bg-gray-900/20">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusStyle(incident.status)}`}>
                {incident.status === "open" ? "TERBUKA" : "SELESAI"}
              </span>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityStyle(incident.severity)} flex items-center gap-1`}>
                {incident.severity === "tinggi" && <AlertTriangle className="w-3 h-3" />}
                {incident.severity === "sedang" && <AlertCircle className="w-3 h-3" />}
                {incident.severity === "rendah" && <CheckCircle className="w-3 h-3" />}
                {incident.severity.charAt(0).toUpperCase() + incident.severity.slice(1)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">
                {incident.category_name}
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Description */}
          <div>
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Deskripsi</h3>
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{incident.description}</p>
          </div>

          {/* Meta Info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Kategori</p>
              <p className="font-medium">{incident.category_name}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Pelapor</p>
              <p className="font-medium">{incident.reported_by_name}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Waktu Kejadian</p>
              <p className="font-medium">{formatDateTime(incident.occurred_at)}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Dilaporkan</p>
              <p className="font-medium">{formatDateTime(incident.reported_at)}</p>
            </div>
            {incident.shift_instance_id && (
              <div className="col-span-2">
                <p className="text-gray-500 dark:text-gray-400">Tertaut ke Shift</p>
                <p className="font-medium">{incident.shift_instance_id.slice(0, 12)}... ({incident.link_source})</p>
              </div>
            )}
            {incident.outside_shift && (
              <div className="col-span-2">
                <p className="text-gray-500 dark:text-gray-400">Lokasi</p>
                <p className="font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Di luar shift
                </p>
              </div>
            )}
          </div>

          {/* Photos */}
          {incident.photos && incident.photos.length > 0 && (
            <div>
              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                <Camera className="w-5 h-5" /> Foto ({incident.photos.length})
              </h3>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {incident.photos.map((photo, i) => (
                  <button
                    key={photo.id}
                    onClick={() => { setPhotoIndex(i); setShowPhotos(true); }}
                    className="relative w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700"
                  >
                    <img src={`/api/photos/${photo.file_ref}`} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes Timeline */}
          <div className="border-t pt-4">
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <MessageSquare className="w-5 h-5" /> Catatan ({incident.catatan.length})
            </h3>

            <form onSubmit={handleAddNote} className="mb-4">
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  rows={2}
                  placeholder="Tambah catatan..."
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={!newNote.trim() || addNote.isPending}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 touch-target flex items-center gap-1"
                >
                  <Send className="w-4 h-4" /> Kirim
                </button>
              </div>
            </form>

            <div className="space-y-3">
              {incident.catatan.map((note) => (
                <div key={note.id} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                        {note.author_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{note.author_name}</span>
                        <span className="px-1.5 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                          {note.author_role}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(note.created_at)}</span>
                      </div>
                      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{note.note}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Photo Viewer Modal */}
      {showPhotos && incident.photos && incident.photos.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setShowPhotos(false)}>
          <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowPhotos(false)}
              className="absolute -top-12 right-0 text-white hover:text-gray-300 z-10"
            >
              <XCircle className="w-8 h-8" />
            </button>
            <button
              onClick={() => setPhotoIndex((prev) => (prev === 0 ? incident.photos!.length - 1 : prev - 1))}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 bg-black/50 p-2 rounded-full"
            >
              <RotateCcw className="w-6 h-6 -rotate-90" />
            </button>
            <img
              src={`/api/photos/${incident.photos[photoIndex].file_ref}`}
              alt=""
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
            <button
              onClick={() => setPhotoIndex((prev) => (prev === incident.photos!.length - 1 ? 0 : prev + 1))}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 bg-black/50 p-2 rounded-full"
            >
              <RotateCcw className="w-6 h-6" />
            </button>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm">
              {photoIndex + 1} / {incident.photos.length}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}