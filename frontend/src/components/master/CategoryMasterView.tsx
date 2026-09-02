import { useEffect, useState, useMemo } from "react";
import {
  FolderKanban,
  Plus,
  Search,
  Edit2,
  Trash2,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  ShieldAlert,
  Layers,
  IndianRupee,
  Coins,
  Calculator,
  Tag,
  Sparkles,
  Filter,
} from "lucide-react";
import { authFetch } from "@/lib/apiClient";
import type { PermissionActions } from "@shared/api";

export interface CategoryItem {
  _id: string;
  name: string;
  baseMetal?: string;
  description?: string;
  costing?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface CategoryMasterViewProps {
  permissions?: PermissionActions;
}

export function CategoryMasterView({ permissions }: CategoryMasterViewProps) {
  const canAdd = permissions?.add ?? true;
  const canUpdate = permissions?.update ?? true;
  const canDelete = permissions?.delete ?? true;

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [dynamicBaseMetals, setDynamicBaseMetals] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [query, setQuery] = useState("");
  const [metalFilter, setMetalFilter] = useState("All");

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formBaseMetal, setFormBaseMetal] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCosting, setFormCosting] = useState("");
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState("");

  // Quick Inline Costing Edit State
  const [editingCostingId, setEditingCostingId] = useState<string | null>(null);
  const [tempCostingVal, setTempCostingVal] = useState<string>("");

  // Delete State
  const [deletingCategory, setDeletingCategory] = useState<CategoryItem | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Toast Notification
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/categories");
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setCategories(json.data);
          if (Array.isArray(json.baseMetals)) {
            setDynamicBaseMetals(json.baseMetals);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load categories:", err);
      showToast("Could not load categories", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleSyncFromTransactions = async () => {
    setSyncing(true);
    try {
      const res = await authFetch("/api/categories/sync-from-transactions", {
        method: "POST",
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast(json.message || "Categories synchronized successfully!");
        fetchCategories();
      } else {
        showToast(json.error || "Failed to sync categories", "error");
      }
    } catch (err: any) {
      showToast("Sync error: " + err.message, "error");
    } finally {
      setSyncing(false);
    }
  };

  const openAddModal = () => {
    setEditingCategory(null);
    setFormName("");
    setFormBaseMetal("");
    setFormDescription("");
    setFormCosting("");
    setModalError("");
    setIsModalOpen(true);
  };

  const openEditModal = (cat: CategoryItem) => {
    setEditingCategory(cat);
    setFormName(cat.name);
    setFormBaseMetal(cat.baseMetal || "");
    setFormDescription(cat.description || "");
    setFormCosting(
      cat.costing !== undefined && cat.costing !== null ? String(cat.costing) : ""
    );
    setModalError("");
    setIsModalOpen(true);
  };

  const handleSaveInlineCosting = async (id: string) => {
    const parsed = parseFloat(tempCostingVal) || 0;
    try {
      const res = await authFetch(`/api/categories/${id}/costing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costing: parsed }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCategories((prev) =>
          prev.map((c) => (c._id === id ? { ...c, costing: parsed } : c))
        );
        showToast("Costing updated successfully!");
      } else {
        showToast(data.error || "Failed to update costing", "error");
      }
    } catch {
      showToast("Failed to update costing", "error");
    } finally {
      setEditingCostingId(null);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setModalError("Category name is required.");
      return;
    }

    setModalSubmitting(true);
    setModalError("");

    try {
      const parsedCosting = formCosting.trim() ? parseFloat(formCosting.trim()) || 0 : 0;
      const payload = {
        name: formName.trim(),
        baseMetal: formBaseMetal.trim(),
        description: formDescription.trim(),
        costing: parsedCosting >= 0 ? parsedCosting : 0,
      };

      if (editingCategory) {
        const res = await authFetch(`/api/categories/${editingCategory._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          showToast(`Category "${payload.name}" updated successfully!`);
          setIsModalOpen(false);
          fetchCategories();
        } else {
          setModalError(data.error || "Failed to update category.");
        }
      } else {
        const res = await authFetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          showToast(`Category "${payload.name}" added successfully!`);
          setIsModalOpen(false);
          fetchCategories();
        } else {
          setModalError(data.error || "Failed to add category.");
        }
      }
    } catch (err: any) {
      setModalError(err.message || "Network error occurred.");
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deletingCategory) return;
    setDeleteLoading(true);
    try {
      const res = await authFetch(`/api/categories/${deletingCategory._id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Category "${deletingCategory.name}" deleted successfully.`);
        setDeleteConfirmOpen(false);
        setDeletingCategory(null);
        fetchCategories();
      } else {
        showToast(data.error || "Failed to delete category.", "error");
      }
    } catch (err) {
      showToast("Error deleting category.", "error");
    } finally {
      setDeleteLoading(false);
    }
  };

  // Distinct dynamic base metals from uploaded dataset & categories
  const availableMetals = useMemo(() => {
    const set = new Set<string>();
    dynamicBaseMetals.forEach((m) => {
      if (m && m.trim()) set.add(m.trim());
    });
    categories.forEach((c) => {
      if (c.baseMetal && c.baseMetal.trim()) set.add(c.baseMetal.trim());
    });
    return Array.from(set).sort();
  }, [dynamicBaseMetals, categories]);

  const filteredCategories = useMemo(() => {
    let list = categories;

    if (metalFilter !== "All") {
      list = list.filter((cat) => (cat.baseMetal || "").trim().toLowerCase() === metalFilter.toLowerCase());
    }

    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (cat) =>
          cat.name.toLowerCase().includes(q) ||
          (cat.baseMetal || "").toLowerCase().includes(q) ||
          (cat.description || "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [categories, query, metalFilter]);

  return (
    <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-2xl transition-all ${
            toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"
          }`}
        >
          {toast.type === "success" ? <Check size={18} /> : <AlertCircle size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#18476A]/10 dark:bg-[#18476A]/30 text-[#18476A] dark:text-cyan-400">
              <FolderKanban size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#18476A] dark:text-cyan-400">
                  Master
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                Category Master
              </h1>
            </div>
          </div>
          <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Manage your master list of jewellery categories, metal variants (e.g. 22K, Rose Gold, 24K), and custom Costing values.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleSyncFromTransactions}
            disabled={syncing}
            title="Auto-sync categories and base metals from transaction sheet"
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-cyan-200 dark:border-cyan-800 bg-cyan-50/70 dark:bg-cyan-950/40 text-[#18476A] dark:text-cyan-300 text-xs font-bold hover:bg-cyan-100 transition cursor-pointer shadow-2xs"
          >
            <Sparkles size={14} className={syncing ? "animate-spin" : "text-amber-500"} />
            <span>{syncing ? "Syncing..." : "Sync from Transactions"}</span>
          </button>

          <button
            onClick={fetchCategories}
            title="Refresh"
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer shadow-2xs"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>

          {canAdd && (
            <button
              onClick={openAddModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#18476A] hover:bg-[#123955] text-white text-xs font-bold transition shadow-sm cursor-pointer"
            >
              <Plus size={16} />
              <span>Add Category</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI & Search Bar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        {/* KPI Cards */}
        <div className="md:col-span-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* 1. Total Count Card */}
          <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-bold shrink-0">
              <Layers size={18} />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
                Total Pairs
              </span>
              <div className="text-lg font-black text-slate-900 dark:text-white">
                {categories.length}
              </div>
            </div>
          </div>

          {/* 2. Base Metal Types */}
          <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold shrink-0">
              <Tag size={18} />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
                Base Metals
              </span>
              <div className="text-lg font-black text-slate-900 dark:text-white">
                {availableMetals.length} Types
              </div>
            </div>
          </div>

          {/* 3. Costing Configured */}
          <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold shrink-0">
              <IndianRupee size={18} />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
                With Costing
              </span>
              <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 truncate">
                {categories.filter((c) => (c.costing || 0) > 0).length} / {categories.length}
              </div>
            </div>
          </div>
        </div>

        {/* Search & Base Metal Filter */}
        <div className="md:col-span-6 flex flex-col sm:flex-row items-center gap-3">
          {/* Base Metal Dropdown Filter */}
          {availableMetals.length > 0 && (
            <div className="w-full sm:w-48 shrink-0">
              <select
                value={metalFilter}
                onChange={(e) => setMetalFilter(e.target.value)}
                className="w-full px-3.5 py-3 rounded-2xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-[#18476A] shadow-2xs cursor-pointer"
              >
                <option value="All">All Base Metals ({categories.length})</option>
                {availableMetals.map((m) => (
                  <option key={m} value={m}>
                    {m} ({categories.filter((c) => (c.baseMetal || "").trim().toLowerCase() === m.toLowerCase()).length})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search category or base metal..."
              className="w-full pl-10 pr-4 py-3 rounded-2xl text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#18476A] shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* Table View */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[620px] custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-900 shadow-xs">
              <tr className="border-b border-slate-200 dark:border-slate-700 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="px-5 py-3.5 w-16 text-center whitespace-nowrap">#</th>
                <th className="px-5 py-3.5 w-1/3">Category Name</th>
                <th className="px-5 py-3.5 w-44">Base Metal</th>
                <th className="px-5 py-3.5 w-48">Costing (End Value ₹)</th>
                <th className="px-5 py-3.5">Description</th>
                <th className="px-5 py-3.5 text-right w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    <div className="inline-flex items-center gap-2">
                      <RefreshCw size={16} className="animate-spin text-[#18476A]" />
                      <span>Loading Categories & Base Metals...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-14 text-center text-slate-400">
                    <FolderKanban size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="font-bold text-sm text-slate-700 dark:text-slate-300">
                      {query || metalFilter !== "All" ? "No matching category records found" : "No categories added yet"}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {query || metalFilter !== "All"
                        ? "Try resetting your search or metal filter"
                        : "Click 'Add Category' or 'Sync from Transactions' to populate."}
                    </p>
                    {canAdd && !query && metalFilter === "All" && (
                      <button
                        onClick={openAddModal}
                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#18476A] hover:bg-[#123955] text-white text-xs font-bold transition shadow-sm cursor-pointer"
                      >
                        <Plus size={15} />
                        <span>Add Category Now</span>
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredCategories.map((cat, index) => {
                  const isEditingCosting = editingCostingId === cat._id;

                  return (
                    <tr
                      key={cat._id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-750/50 transition duration-150"
                    >
                      <td className="px-5 py-4 font-mono text-slate-400 font-bold text-center whitespace-nowrap">
                        {index + 1}
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-bold text-slate-900 dark:text-white text-sm">
                          {cat.name}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {cat.baseMetal ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-extrabold bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60 shadow-2xs">
                            <Tag size={11} className="text-amber-600 dark:text-amber-400" />
                            <span>{cat.baseMetal}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">All Metals</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {isEditingCosting ? (
                          <div className="flex items-center gap-1.5">
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                autoFocus
                                value={tempCostingVal}
                                onChange={(e) => setTempCostingVal(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveInlineCosting(cat._id);
                                  if (e.key === "Escape") setEditingCostingId(null);
                                }}
                                className="w-28 pl-6 pr-2 py-1 text-xs font-bold bg-white dark:bg-slate-900 border border-[#18476A] dark:border-cyan-400 rounded-lg text-slate-900 dark:text-white focus:outline-hidden ring-2 ring-[#18476A]/20"
                              />
                            </div>
                            <button
                              onClick={() => handleSaveInlineCosting(cat._id)}
                              className="p-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition cursor-pointer"
                              title="Save Costing"
                            >
                              <Check size={13} />
                            </button>
                            <button
                              onClick={() => setEditingCostingId(null)}
                              className="p-1 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 transition cursor-pointer"
                              title="Cancel"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => {
                              if (canUpdate) {
                                setEditingCostingId(cat._id);
                                setTempCostingVal(cat.costing !== undefined && cat.costing !== null ? String(cat.costing) : "0");
                              }
                            }}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs transition ${
                              cat.costing && cat.costing > 0
                                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-900/60"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700"
                            } ${canUpdate ? "cursor-pointer hover:border-[#18476A] hover:bg-cyan-50/40 dark:hover:bg-cyan-950/30" : ""}`}
                            title={canUpdate ? "Click to quickly edit costing value" : undefined}
                          >
                            <IndianRupee size={12} className={cat.costing && cat.costing > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"} />
                            <span>
                              {cat.costing !== undefined && cat.costing !== null
                                ? Number(cat.costing).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : "0.00"}
                            </span>
                            {canUpdate && (
                              <Edit2 size={10} className="text-slate-400 ml-0.5 opacity-60 group-hover:opacity-100" />
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {cat.description ? (
                          <span className="text-slate-600 dark:text-slate-300 font-medium">
                            {cat.description}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">No description provided</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canUpdate && (
                            <button
                              onClick={() => openEditModal(cat)}
                              title="Edit Category & Metal"
                              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                            >
                              <Edit2 size={15} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => {
                                setDeletingCategory(cat);
                                setDeleteConfirmOpen(true);
                              }}
                              title="Delete Category"
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Category Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50 dark:bg-slate-850">
              <div className="flex items-center gap-2">
                <FolderKanban size={18} className="text-[#18476A] dark:text-cyan-400" />
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  {editingCategory ? "Edit Category & Base Metal" : "Add New Category Variant"}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="p-6 space-y-4">
              {modalError && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 p-3 text-xs font-semibold text-rose-600 dark:text-rose-400">
                  <AlertCircle size={16} />
                  <span>{modalError}</span>
                </div>
              )}

              {/* 1. Category Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Category Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. MANGALSUTRA, GENTS PENDANT, CUBAN CHAIN..."
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#18476A]"
                />
              </div>

              {/* 2. Base Metal */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Base Metal (Purity / Type)
                </label>
                <input
                  type="text"
                  value={formBaseMetal}
                  onChange={(e) => setFormBaseMetal(e.target.value)}
                  placeholder="e.g. G22KT, G18 ROSE, 24K, G18KT YELLOW..."
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#18476A]"
                />
                {/* Dynamic Quick Selection Pills from uploaded BaseMetal column */}
                {availableMetals.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="text-[10px] text-slate-400 font-medium">From Uploaded Dataset:</span>
                    {availableMetals.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setFormBaseMetal(m)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                          formBaseMetal.toLowerCase() === m.toLowerCase()
                            ? "bg-[#18476A] text-white"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. Costing */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Costing (₹ / End Value)</span>
                  <span className="text-[10px] text-emerald-600 font-bold">Used in Profit formula</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formCosting}
                    onChange={(e) => setFormCosting(e.target.value)}
                    placeholder="e.g. 2.00"
                    className="w-full pl-8 pr-3.5 py-2.5 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#18476A]"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Formula: Actual Profit = Costing + (BaseMetalClarity &times; NetWt).
                </p>
              </div>

              {/* 4. Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Enter category description or notes..."
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#18476A]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#18476A] hover:bg-[#123955] text-white text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {modalSubmitting ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  <span>{editingCategory ? "Update Category" : "Save Category"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && deletingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl text-center space-y-4">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600">
              <ShieldAlert size={24} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Delete Category Variant?
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Are you sure you want to delete{" "}
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  "{deletingCategory.name} {deletingCategory.baseMetal ? `(${deletingCategory.baseMetal})` : ""}"
                </span>
                ?
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeletingCategory(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCategory}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                {deleteLoading ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
