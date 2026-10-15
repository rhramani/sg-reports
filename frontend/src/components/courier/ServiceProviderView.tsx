import { useEffect, useState, useMemo } from "react";
import {
  Truck,
  Plus,
  Search,
  Edit2,
  Trash2,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  Calendar,
} from "lucide-react";
import { authFetch } from "@/lib/apiClient";
import { Pagination } from "@/components/ui/Pagination";
import type { PermissionActions } from "@shared/api";

export interface CourierServiceProvider {
  _id: string;
  name: string;
  description?: string;
  code?: string;
  city?: string;
  serviceTypes?: string[];
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ServiceProviderViewProps {
  permissions?: PermissionActions;
}

export function ServiceProviderView({ permissions }: ServiceProviderViewProps) {
  const canAdd = permissions?.add ?? true;
  const canUpdate = permissions?.update ?? true;
  const canDelete = permissions?.delete ?? true;

  const [providers, setProviders] = useState<CourierServiceProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modal State (ONLY name and description as requested)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<CourierServiceProvider | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState("");

  // Professional Centered Delete Modal State
  const [deletingProvider, setDeletingProvider] = useState<CourierServiceProvider | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Toast Notification
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchProviders = async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/courier/service-providers");
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setProviders(json.data);
        }
      } else {
        showToast("Failed to fetch service providers", "error");
      }
    } catch (err) {
      console.error("Error fetching service providers:", err);
      showToast("Could not load service providers", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  // Open Add Modal
  const openAddModal = () => {
    setEditingProvider(null);
    setFormName("");
    setFormDescription("");
    setModalError("");
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (p: CourierServiceProvider) => {
    setEditingProvider(p);
    setFormName(p.name || "");
    setFormDescription(p.description || "");
    setModalError("");
    setIsModalOpen(true);
  };

  // Save Provider (Add / Edit) - ONLY name and description
  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setModalError("Service provider name is required.");
      return;
    }

    setModalSubmitting(true);
    setModalError("");

    const payload = {
      name: formName.trim(),
      description: formDescription.trim(),
    };

    try {
      const url = editingProvider
        ? `/api/courier/service-providers/${editingProvider._id}`
        : "/api/courier/service-providers";
      const method = editingProvider ? "PUT" : "POST";

      const res = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to save service provider");
      }

      showToast(
        editingProvider
          ? `Service provider "${json.data?.name || formName}" updated successfully!`
          : `Service provider "${json.data?.name || formName}" created successfully!`
      );
      setIsModalOpen(false);
      fetchProviders();
    } catch (err: any) {
      setModalError(err.message || "Failed to save service provider");
    } finally {
      setModalSubmitting(false);
    }
  };

  // Open Delete Modal
  const openDeleteModal = (p: CourierServiceProvider) => {
    setDeletingProvider(p);
    setDeleteConfirmOpen(true);
  };

  // Execute Delete from Centered Modal
  const handleConfirmDelete = async () => {
    if (!deletingProvider) return;
    setDeleteLoading(true);
    try {
      const res = await authFetch(`/api/courier/service-providers/${deletingProvider._id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to delete service provider");
      }

      showToast(`Service provider "${deletingProvider.name}" deleted successfully!`);
      setDeleteConfirmOpen(false);
      setDeletingProvider(null);
      fetchProviders();
    } catch (err: any) {
      showToast(err.message || "Failed to delete service provider", "error");
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredProviders = useMemo(() => {
    if (!searchQuery.trim()) return providers;
    const q = searchQuery.toLowerCase().trim();
    return providers.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
    );
  }, [providers, searchQuery]);

  // Reset to page 1 on search change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredProviders.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const pagedProviders = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredProviders.slice(start, start + pageSize);
  }, [filteredProviders, safeCurrentPage, pageSize]);

  return (
    <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-semibold shadow-xl border animate-in fade-in slide-in-from-bottom-2 ${
            toast.type === "success"
              ? "bg-emerald-600 text-white border-emerald-500"
              : "bg-rose-600 text-white border-rose-500"
          }`}
        >
          {toast.type === "success" ? <Check size={16} /> : <AlertCircle size={16} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#18476A]/10 dark:bg-cyan-500/10 text-[#18476A] dark:text-cyan-400 font-bold shrink-0">
            <Truck size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                Service Provider
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300">
                Logistics Partners
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Manage your courier and logistics service providers.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={fetchProviders}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer shadow-2xs"
            title="Refresh service providers"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {canAdd && (
            <button
              onClick={openAddModal}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl bg-[#18476A] text-white hover:bg-[#123955] transition shadow-xs cursor-pointer"
            >
              <Plus size={16} />
              <span>Add Service Provider</span>
            </button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      {providers.length > 0 && (
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search provider by name or description..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#18476A] shadow-2xs"
          />
        </div>
      )}

      {/* ── TABLE VIEW: Service Providers ─────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
              <tr className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="px-5 py-3.5 w-14 text-center">#</th>
                <th className="px-5 py-3.5 min-w-[200px]">Service Provider Name</th>
                <th className="px-5 py-3.5 min-w-[320px]">Description</th>
                <th className="px-5 py-3.5 w-36">Date Added</th>
                <th className="px-5 py-3.5 text-right w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    <div className="inline-flex items-center gap-2 font-bold text-xs">
                      <RefreshCw size={16} className="animate-spin text-[#18476A]" />
                      <span>Loading service providers...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredProviders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="h-12 w-12 place-items-center grid rounded-2xl bg-[#18476A]/10 text-[#18476A] dark:bg-cyan-500/10 dark:text-cyan-400 mb-2.5">
                        <Truck size={24} />
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {providers.length === 0
                          ? "No Service Providers Added"
                          : "No Matching Providers Found"}
                      </h4>
                      <p className="text-xs text-slate-400 max-w-sm mt-1 mb-4">
                        {providers.length === 0
                          ? "Click 'Add Service Provider' to add your courier or service partner."
                          : "Try adjusting your search query."}
                      </p>
                      {canAdd && providers.length === 0 && (
                        <button
                          onClick={openAddModal}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-[#18476A] text-white hover:bg-[#123955] transition shadow-xs cursor-pointer"
                        >
                          <Plus size={15} />
                          <span>Add Service Provider</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                pagedProviders.map((p, idx) => (
                  <tr
                    key={p._id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition-colors"
                  >
                    {/* Index */}
                    <td className="px-5 py-3.5 text-center text-slate-400 font-mono text-[11px]">
                      {(safeCurrentPage - 1) * pageSize + idx + 1}
                    </td>

                    {/* Name */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-[#18476A]/10 dark:bg-cyan-500/10 text-[#18476A] dark:text-cyan-400 grid place-items-center font-bold shrink-0">
                          <Truck size={16} />
                        </div>
                        <span className="font-bold text-slate-900 dark:text-white text-xs">
                          {p.name}
                        </span>
                      </div>
                    </td>

                    {/* Description */}
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">
                      {p.description && p.description.trim() ? (
                        <p className="line-clamp-2 leading-relaxed text-xs">
                          {p.description}
                        </p>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">
                          No description provided
                        </span>
                      )}
                    </td>

                    {/* Date Added */}
                    <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap">
                      {p.createdAt ? (
                        <div className="flex items-center gap-1.5">
                          <Calendar size={13} className="text-slate-400 shrink-0" />
                          <span>
                            {new Date(p.createdAt).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {canUpdate && (
                          <button
                            onClick={() => openEditModal(p)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-[#18476A] hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                            title="Edit Service Provider"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}

                        {canDelete && (
                          <button
                            onClick={() => openDeleteModal(p)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-700 transition cursor-pointer"
                            title="Delete Service Provider"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <Pagination
          currentPage={safeCurrentPage}
          totalPages={totalPages}
          totalCount={filteredProviders.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
          pageSizeOptions={[10, 25, 50, 100]}
          recordLabel="providers"
          showAlways={true}
        />
      </div>

      {/* ── ADD / EDIT MODAL (ONLY NAME AND DESCRIPTION) ────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-700/80">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#18476A]/10 text-[#18476A] dark:text-cyan-400 font-bold">
                  <Truck size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {editingProvider ? "Edit Service Provider" : "Add Service Provider"}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Enter provider name and description
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveProvider} className="p-5 space-y-4">
              {modalError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 text-xs font-semibold">
                  <AlertCircle size={15} />
                  <span>{modalError}</span>
                </div>
              )}

              {/* 1. Name */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Sequel Logistics, Blue Dart, etc."
                  className="w-full px-3.5 py-2.5 text-xs font-medium rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#18476A]"
                />
              </div>

              {/* 2. Description */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Description
                </label>
                <textarea
                  rows={4}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Enter details, service notes, or description..."
                  className="w-full px-3.5 py-2.5 text-xs font-medium rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#18476A] resize-none"
                />
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer shadow-2xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-[#18476A] hover:bg-[#123955] rounded-xl shadow-xs disabled:opacity-50 transition cursor-pointer"
                >
                  {modalSubmitting ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  <span>{editingProvider ? "Update Provider" : "Save Provider"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── PROFESSIONAL CENTERED DELETE CONFIRMATION MODAL ──────────────── */}
      {deleteConfirmOpen && deletingProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="h-10 w-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 grid place-items-center shrink-0">
                <Trash2 size={20} className="text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Delete Service Provider
                </h3>
                <span className="text-[11px] text-slate-400 font-medium">
                  Confirm permanent removal
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 my-4 leading-relaxed bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
              Are you sure you want to delete service provider{" "}
              <strong className="text-slate-900 dark:text-white font-bold">
                {deletingProvider.name}
              </strong>? This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeletingProvider(null);
                }}
                disabled={deleteLoading}
                className="px-4 py-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 transition cursor-pointer shadow-2xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleteLoading}
                className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl text-white bg-rose-600 hover:bg-rose-700 transition shadow-sm disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
              >
                {deleteLoading ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
                <span>Delete Provider</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
