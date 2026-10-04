// Admin Kategori Incident - Inline Edit Table
"use client";

import { useState } from "react";
import { useIncidentCategories, useCreateIncidentCategory, useUpdateIncidentCategory } from "@/lib/hooks/useAdmin";
import { Plus, Edit, Trash2, Save, X, ChevronUp, ChevronDown } from "lucide-react";

export default function KategoriIncidentPage() {
  const { data: categoriesData, refetch } = useIncidentCategories();
  const categories = categoriesData?.categories ?? [];

  const createCategory = useCreateIncidentCategory();
  const updateCategory = useUpdateIncidentCategory();

  const [formData, setFormData] = useState({ name: "", sort_order: 0, is_active: true });
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createCategory.mutateAsync({ name: formData.name, sort_order: formData.sort_order, is_active: formData.is_active });
      setFormData({ name: "", sort_order: categories.length, is_active: true });
    } catch (err) {
      alert("Gagal membuat kategori");
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      await updateCategory.mutateAsync({ id, ...formData });
      setEditingId(null);
    } catch (err) {
      alert("Gagal update kategori");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Nonaktifkan kategori ini?")) return;
    try {
      await updateCategory.mutateAsync({ id, is_active: false });
      if (editingId === id) setEditingId(null);
    } catch (err) {
      alert("Gagal nonaktifkan kategori");
    }
  };

  const handleReorder = async (newOrder: string[]) => {
    // Update sort_order via individual updates
    for (let i = 0; i < newOrder.length; i++) {
      await updateCategory.mutateAsync({ id: newOrder[i], sort_order: i });
    }
    refetch();
  };

  const moveCategory = (id: string, direction: "up" | "down") => {
    const idx = categories.findIndex((c) => c.id === id);
    if ((direction === "up" && idx === 0) || (direction === "down" && idx === categories.length - 1)) return;
    const newOrder = [...categories];
    [newOrder[idx], newOrder[idx + (direction === "up" ? -1 : 1)]] = [newOrder[idx + (direction === "up" ? -1 : 1)], newOrder[idx]];
    handleReorder(newOrder.map((c) => c.id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Kategori Incident</h1>
          <p className="text-gray-500 dark:text-gray-400">Kelola kategori untuk klasifikasi incident</p>
        </div>
      </div>

      {/* Create Form */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border p-6">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Tambah Kategori Baru</h3>
        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-4 items-end max-w-2xl">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nama Kategori *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Contoh: Kebersihan, Keselamatan, Peralatan"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div className="w-32">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Urutan</label>
            <input
              type="number"
              value={formData.sort_order}
              onChange={(e) => setFormData({ ...formData, sort_order: Number(e.target.value) })}
              min={0}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="w-32">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
            <select
              value={formData.is_active.toString()}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.value === "true" })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="true">Aktif</option>
              <option value="false">Nonaktif</option>
            </select>
          </div>
          <button type="submit" className="h-10 px-4 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" /> Tambah
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border overflow-hidden">
        {categories.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <p>Belum ada kategori incident</p>
            <p className="text-sm mt-1">Tambah kategori pertama di form di atas</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-12">Urutan</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nama Kategori</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-48">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {categories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <td className="px-4 py-3">
                      {editingId === cat.id ? (
                        <input
                          type="number"
                          value={formData.sort_order}
                          onChange={(e) => setFormData({ ...formData, sort_order: Number(e.target.value) })}
                          min={0}
                          className="w-16 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-center"
                        />
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-gray-900 dark:text-gray-100">{cat.sort_order}</span>
                          <button onClick={() => moveCategory(cat.id, "up")} className="p-0.5 text-gray-400 hover:text-blue-600" title="Naik"><ChevronUp className="w-4 h-4" /></button>
                          <button onClick={() => moveCategory(cat.id, "down")} className="p-0.5 text-gray-400 hover:text-blue-600" title="Turun"><ChevronDown className="w-4 h-4" /></button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingId === cat.id ? (
                        <input
                          type="text"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="w-full px-2 py-1 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <span className="font-medium text-gray-900 dark:text-gray-100">{cat.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingId === cat.id ? (
                        <select
                          value={formData.is_active.toString()}
                          onChange={(e) => setFormData({ ...formData, is_active: e.target.value === "true" })}
                          className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                        >
                          <option value="true">Aktif</option>
                          <option value="false">Nonaktif</option>
                        </select>
                      ) : (
                        <span className={`px-2 py-1 text-xs rounded-full ${cat.is_active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"}`}>
                          {cat.is_active ? "Aktif" : "Nonaktif"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingId === cat.id ? (
                        <div className="flex gap-1">
                          <button onClick={() => handleUpdate(cat.id)} className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded" title="Simpan"><Save className="w-4 h-4" /></button>
                          <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Batal"><X className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <button onClick={() => { setFormData({ name: cat.name, sort_order: cat.sort_order, is_active: cat.is_active }); setEditingId(cat.id); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded" title="Edit"><Edit className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(cat.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded" title="Nonaktifkan"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}