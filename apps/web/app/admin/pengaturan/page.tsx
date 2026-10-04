// Admin Pengaturan - System Settings
"use client";

import { useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useSystemSettings, useUpdateSystemSettings } from "@/lib/hooks/useAdmin";
import { Save, Loader2, AlertCircle, CheckCircle } from "lucide-react";

interface Settings {
  tolerance_default_minutes: number;
  pin_max_attempts: number;
  pin_lock_minutes: number;
  pin_block_weak: boolean;
  session_days: number;
  incident_link_window_hours: number;
  photo_max_size_kb: number;
  photo_retention_days: number;
  public_show_photos: boolean;
  wa_template: string;
}

export default function PengaturanPage() {
  const { data: user } = useAuth();
  const { data: settingsData, isLoading } = useSystemSettings();
  const updateSettings = useUpdateSystemSettings();

  const settings = settingsData?.settings ?? {
    tolerance_default_minutes: 15,
    pin_max_attempts: 5,
    pin_lock_minutes: 15,
    pin_block_weak: true,
    session_days: 30,
    incident_link_window_hours: 4,
    photo_max_size_kb: 2048,
    photo_retention_days: 90,
    public_show_photos: true,
    wa_template: "Laporan shift {shift_name} cabang {branch_name} tanggal {shift_date}:\n- Checklist: {wajib_selesai}/{wajib_total} wajib selesai\n- Incident: {incident_total} ({incident_open} terbuka)\n- Handover: dibaca {handover_read} orang\nLihat detail: {report_url}",
  };

  const [formData, setFormData] = useState<Settings>(settings);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await updateSettings.mutateAsync(formData);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError("Gagal menyimpan pengaturan");
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Pengaturan Sistem</h1>
          <p className="text-gray-500 dark:text-gray-400">Konfigurasi global aplikasi</p>
        </div>
      </div>

      {saved && (
        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 flex items-center gap-2">
          <CheckCircle className="w-5 h-5" /> Pengaturan berhasil disimpan
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        <section className="bg-white dark:bg-gray-800 rounded-xl border p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">Waktu & Toleransi</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Toleransi Default (menit)</label>
              <input type="number" value={formData.tolerance_default_minutes} onChange={(e) => setFormData({ ...formData, tolerance_default_minutes: Number(e.target.value) })} min={1} max={120} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Jendela Tautan Incident (jam)</label>
              <input type="number" value={formData.incident_link_window_hours} onChange={(e) => setFormData({ ...formData, incident_link_window_hours: Number(e.target.value) })} min={1} max={24} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Maks Percobaan PIN</label>
              <input type="number" value={formData.pin_max_attempts} onChange={(e) => setFormData({ ...formData, pin_max_attempts: Number(e.target.value) })} min={1} max={10} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Durasi Kunci PIN (menit)</label>
              <input type="number" value={formData.pin_lock_minutes} onChange={(e) => setFormData({ ...formData, pin_lock_minutes: Number(e.target.value) })} min={1} max={60} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-xl border p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">PIN & Sesi</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={formData.pin_block_weak} onChange={(e) => setFormData({ ...formData, pin_block_weak: e.target.checked })} className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
              <label className="text-sm text-gray-700 dark:text-gray-300">Blokir PIN Lemah (123456, 000000, dll)</label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Durasi Sesi (hari)</label>
              <input type="number" value={formData.session_days} onChange={(e) => setFormData({ ...formData, session_days: Number(e.target.value) })} min={1} max={365} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-xl border p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">Foto</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ukuran Maks (KB)</label>
              <input type="number" value={formData.photo_max_size_kb} onChange={(e) => setFormData({ ...formData, photo_max_size_kb: Number(e.target.value) })} min={100} max={10240} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Retensi (hari)</label>
              <input type="number" value={formData.photo_retention_days} onChange={(e) => setFormData({ ...formData, photo_retention_days: Number(e.target.value) })} min={1} max={365} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input type="checkbox" checked={formData.public_show_photos} onChange={(e) => setFormData({ ...formData, public_show_photos: e.target.checked })} className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
              <label className="text-sm text-gray-700 dark:text-gray-300">Tampilkan foto di laporan publik</label>
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-xl border p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">Template WhatsApp</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Variabel: {shift_name}, {branch_name}, {shift_date}, {wajib_selesai}, {wajib_total}, {incident_total}, {incident_open}, {handover_read}, {report_url}</p>
          <textarea
            value={formData.wa_template}
            onChange={(e) => setFormData({ ...formData, wa_template: e.target.value })}
            rows={6}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Template untuk berbagi laporan via WhatsApp</p>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-xl border p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">Tautan Publik</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Masa Berlaku Default (jam)</label>
              <input type="number" value={24} readOnly className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400" />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Diatur saat membuat tautan per laporan</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Maks Views per Token</label>
              <input type="number" value={0} readOnly className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400" />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">0 = tidak dibatasi</p>
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-xl border p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">Incident</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Jendela Tautan Otomatis (jam)</label>
              <input type="number" value={formData.incident_link_window_hours} onChange={(e) => setFormData({ ...formData, incident_link_window_hours: Number(e.target.value) })} min={1} max={24} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Severity Default</label>
              <select value="sedang" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="rendah">Rendah</option>
                <option value="sedang">Sedang</option>
                <option value="tinggi">Tinggi</option>
              </select>
            </div>
          </div>
        </section>

        <div className="flex justify-end pt-4 border-t">
          <button type="submit" disabled={updateSettings.isPending} className="px-6 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            {updateSettings.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Simpan Pengaturan"}
          </button>
        </div>
      </form>
    </div>
  );
}