// Admin Handover Builder - Drag & Drop Fields
"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  useBranches,
  useShiftDefinitions,
  useHandoverFields,
  useCreateHandoverField,
  useUpdateHandoverField,
  useReorderHandoverFields,
} from "@/lib/hooks/useAdmin";
import {
  Edit,
  Trash2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Type,
  Hash,
  List,
  CheckSquare,
} from "lucide-react";

interface HandoverField {
  id: string;
  label: string;
  field_type: "teks" | "angka" | "pilihan" | "ya_tidak";
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
}

const FIELD_TYPES = [
  { value: "teks", label: "Teks", icon: Type },
  { value: "angka", label: "Angka", icon: Hash },
  { value: "pilihan", label: "Pilihan (dropdown)", icon: List },
  { value: "ya_tidak", label: "Ya / Tidak", icon: CheckSquare },
];

export default function HandoverBuilderPage() {
  const { data: _user } = useAuth();
  const { data: branchesData } = useBranches();
  const branches = branchesData?.branches ?? [];

  const [selectedBranchId, setSelectedBranchId] = useState(branches[0]?.id ?? "");
  const [selectedShiftDefId, setSelectedShiftDefId] = useState("");

  const { data: shiftsData } = useShiftDefinitions(selectedBranchId);
  const shifts = shiftsData?.shifts ?? [];

  const { data: fieldsData } = useHandoverFields(selectedBranchId, selectedShiftDefId);
  const fields = (fieldsData?.fields ?? []) as HandoverField[];

  const createField = useCreateHandoverField();
  const updateField = useUpdateHandoverField();
  const reorderFields = useReorderHandoverFields();

  const [formData, setFormData] = useState({
    label: "",
    field_type: "teks" as "teks" | "angka" | "pilihan" | "ya_tidak",
    options: "",
    is_required: true,
    is_active: true,
  });

  const [editingField, setEditingField] = useState<{ id: string; label: string; field_type: string; options: string[] | null; is_required: boolean; sort_order: number; is_active: boolean } | null>(null);

  useEffect(() => {
    if (editingField) {
      setFormData({
        label: editingField.label,
        field_type: editingField.field_type as "teks" | "angka" | "pilihan" | "ya_tidak",
        options: editingField.options?.join(", ") || "",
        is_required: editingField.is_required,
        is_active: editingField.is_active,
      });
    } else {
      setFormData({ label: "", field_type: "teks", options: "", is_required: true, is_active: true });
    }
  }, [editingField]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const options = formData.field_type === "pilihan"
        ? formData.options.split(",").map((o) => o.trim()).filter(Boolean)
        : null;

      if (editingField) {
        await updateField.mutateAsync({
          id: editingField.id,
          branch_id: selectedBranchId,
          label: formData.label,
          field_type: formData.field_type,
          options,
          is_required: formData.is_required,
          is_active: formData.is_active,
        });
        setEditingField(null);
      } else {
        await createField.mutateAsync({
          branch_id: selectedBranchId,
          shift_definition_id: selectedShiftDefId,
          label: formData.label,
          field_type: formData.field_type,
          options,
          is_required: formData.is_required,
          is_active: formData.is_active,
          sort_order: fields.length,
        });
      }
      setFormData({ label: "", field_type: "teks", options: "", is_required: true, is_active: true });
      setEditingField(null);
    } catch (err) {
      alert("Gagal menyimpan field");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus field ini?")) return;
    try {
      await updateField.mutateAsync({ id, branch_id: selectedBranchId, is_active: false });
      if (editingField?.id === id) setEditingField(null);
    } catch (err) {
      alert("Gagal hapus field");
    }
  };

  const handleReorder = async (newOrder: string[]) => {
    try {
      await reorderFields.mutateAsync({ branch_id: selectedBranchId, shift_definition_id: selectedShiftDefId, field_ids: newOrder });
    } catch (err) {
      alert("Gagal mengubah urutan");
    }
  };

  const moveField = (id: string, direction: "up" | "down") => {
    const idx = fields.findIndex((f) => f.id === id);
    if ((direction === "up" && idx === 0) || (direction === "down" && idx === fields.length - 1)) return;
    const newOrder = [...fields];
    [newOrder[idx], newOrder[idx + (direction === "up" ? -1 : 1)]] = [newOrder[idx + (direction === "up" ? -1 : 1)], newOrder[idx]];
    handleReorder(newOrder.map((f) => f.id));
  };

  const startEdit = (field: typeof fields[0]) => {
    setEditingField({
      id: field.id,
      label: field.label,
      field_type: field.field_type,
      options: field.options,
      is_required: field.is_required,
      sort_order: field.sort_order,
      is_active: field.is_active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingField(null);
    setFormData({ label: "", field_type: "teks", options: "", is_required: true, is_active: true });
  };

  if (!selectedBranchId) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Pilih cabang terlebih dahulu</div>;
  }

  if (!selectedShiftDefId) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Pilih definisi shift terlebih dahulu</div>;
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b bg-white dark:bg-gray-800">
        <div className="flex items-center gap-4">
          <select
            value={selectedBranchId}
            onChange={(e) => { setSelectedBranchId(e.target.value); setSelectedShiftDefId(""); }}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select
            value={selectedShiftDefId}
            onChange={(e) => setSelectedShiftDefId(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Pilih Shift</option>
            {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">{fields.filter((f) => f.is_active).length} field aktif</span>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left: Form */}
        <div className="w-96 flex-shrink-0">
          <div className="bg-white dark:bg-gray-800 rounded-xl border p-6 sticky top-24 h-fit">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {editingField ? "Edit Field" : "Tambah Field Baru"}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Label *</label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="Contoh: Kondisi Kebersihan"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipe Field *</label>
                <div className="grid grid-cols-2 gap-2">
                  {FIELD_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, field_type: t.value as "teks" | "angka" | "pilihan" | "ya_tidak" })}
                      className={`p-3 rounded-lg border-2 text-center transition-colors flex flex-col items-center gap-1 ${formData.field_type === t.value ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30" : "border-gray-200 dark:border-gray-700 hover:border-gray-300"}`}
                    >
                      <t.icon className={`w-5 h-5 ${formData.field_type === t.value ? "text-blue-500" : "text-gray-400"}`} />
                      <span className="text-xs font-medium">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {formData.field_type === "pilihan" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Opsi (pisahkan koma) *</label>
                  <input
                    type="text"
                    value={formData.options}
                    onChange={(e) => setFormData({ ...formData, options: e.target.value })}
                    placeholder="Contoh: Baik, Cukup, Kurang"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Pisahkan setiap opsi dengan koma</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Urutan</label>
                <input
                  type="number"
                  value={fields.length}
                  readOnly
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_required}
                  onChange={(e) => setFormData({ ...formData, is_required: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <label className="text-sm text-gray-700 dark:text-gray-300">Wajib diisi</label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <label className="text-sm text-gray-700 dark:text-gray-300">Aktif</label>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 py-2 px-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                  {editingField ? "Update Field" : "Tambah Field"}
                </button>
                {editingField && (
                  <button type="button" onClick={cancelEdit} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600">Batal</button>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* Right: List */}
        <div className="flex-1">
          <div className="bg-white dark:bg-gray-800 rounded-xl border overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Daftar Field ({fields.filter((f) => f.is_active).length} aktif)</h3>
            </div>

            <div className="overflow-y-auto max-h-[calc(100vh-300px)]">
              {fields.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <p>Belum ada field handover</p>
                  <p className="text-sm mt-1">Tambah field pertama di form di sebelah kiri</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                  {fields.map((field, idx) => (
                    <li key={field.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            // Drag handle visual only - actual reorder via buttons
                          }}
                          className="p-1 text-gray-400 hover:text-blue-600 cursor-grab"
                        >
                          <GripVertical className="w-5 h-5" />
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{field.label}</span>
                            <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded capitalize">{field.field_type}</span>
                            {field.is_required && <span className="px-1.5 py-0.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">Wajib</span>}
                            {!field.is_active && <span className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded">Nonaktif</span>}
                          </div>
                          {field.field_type === "pilihan" && field.options && field.options.length > 0 && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">Opsi: {field.options.join(", ")}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button onClick={() => moveField(field.id, "up")} disabled={idx === 0} className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-30" title="Naik"><ChevronUp className="w-4 h-4" /></button>
                          <button onClick={() => moveField(field.id, "down")} disabled={idx === fields.length - 1} className="p-1 text-gray-400 hover:text-blue-600 disabled:opacity-30" title="Turun"><ChevronDown className="w-4 h-4" /></button>
                          <button onClick={() => startEdit(field)} className="p-1 text-gray-400 hover:text-blue-600" title="Edit"><Edit className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(field.id)} className="p-1 text-gray-400 hover:text-red-600" title="Hapus"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}