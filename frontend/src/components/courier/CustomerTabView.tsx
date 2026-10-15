import { useEffect, useState, useMemo } from "react";
import {
  Contact2,
  Plus,
  Search,
  Edit2,
  Trash2,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  Phone,
  Download,
} from "lucide-react";
import { authFetch } from "@/lib/apiClient";
import { Pagination } from "@/components/ui/Pagination";
import type { PermissionActions } from "@shared/api";

export interface CourierCustomer {
  _id: string;
  name: string;
  nameAsOnGst: string;
  gstNo: string;
  city: string;
  state: string;
  pincode?: string;
  phone1: string;
  phone2: string;
  address: string;
  createdAt?: string;
  updatedAt?: string;
}

interface CustomerTabViewProps {
  permissions?: PermissionActions;
}

export function CustomerTabView({ permissions }: CustomerTabViewProps) {
  const canAdd = permissions?.add ?? true;
  const canUpdate = permissions?.update ?? true;
  const canDelete = permissions?.delete ?? true;
  const canExport = permissions?.export ?? true;

  const [customers, setCustomers] = useState<CourierCustomer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [cityFilter, setCityFilter] = useState("All");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CourierCustomer | null>(null);

  // 1. name, 2. name as on gst, 3. gst no, 4. city, 5. state, 6. pincode, 7. phone no, 8. phone no 2, 9. address
  const [formName, setFormName] = useState("");
  const [formNameAsOnGst, setFormNameAsOnGst] = useState("");
  const [formGstNo, setFormGstNo] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formState, setFormState] = useState("");
  const [formPincode, setFormPincode] = useState("");
  const [formPhone1, setFormPhone1] = useState("");
  const [formPhone2, setFormPhone2] = useState("");
  const [formAddress, setFormAddress] = useState("");

  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState("");

  // Delete State
  const [deletingCustomer, setDeletingCustomer] = useState<CourierCustomer | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Toast State
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/courier/customers");
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setCustomers(
            json.data.map((item: any) => ({
              _id: item._id,
              name: item.name || "",
              nameAsOnGst: item.nameAsOnGst || item.contactPerson || "",
              gstNo: item.gstNo || item.gstin || "",
              city: item.city || "",
              state: item.state || "",
              pincode: item.pincode || "",
              phone1: item.phone1 || item.phone || "",
              phone2: item.phone2 || "",
              address: item.address || "",
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
            }))
          );
        }
      } else {
        showToast("Failed to fetch customers", "error");
      }
    } catch (err) {
      console.error("Error fetching customers:", err);
      showToast("Could not load customers", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const openAddModal = () => {
    setEditingCustomer(null);
    setFormName("");
    setFormNameAsOnGst("");
    setFormGstNo("");
    setFormCity("");
    setFormState("");
    setFormPincode("");
    setFormPhone1("");
    setFormPhone2("");
    setFormAddress("");
    setModalError("");
    setIsModalOpen(true);
  };

  const openEditModal = (cust: CourierCustomer) => {
    setEditingCustomer(cust);
    setFormName(cust.name || "");
    setFormNameAsOnGst(cust.nameAsOnGst || "");
    setFormGstNo(cust.gstNo || "");
    setFormCity(cust.city || "");
    setFormState(cust.state || "");
    setFormPincode(cust.pincode || "");
    setFormPhone1(cust.phone1 || "");
    setFormPhone2(cust.phone2 || "");
    setFormAddress(cust.address || "");
    setModalError("");
    setIsModalOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setModalError("Name is required.");
      return;
    }

    setModalSubmitting(true);
    setModalError("");

    const payload = {
      name: formName.trim(),
      nameAsOnGst: formNameAsOnGst.trim(),
      gstNo: formGstNo.trim(),
      city: formCity.trim(),
      state: formState.trim(),
      pincode: formPincode.trim(),
      phone1: formPhone1.trim(),
      phone2: formPhone2.trim(),
      address: formAddress.trim(),
    };

    try {
      if (editingCustomer) {
        const res = await authFetch(`/api/courier/customers/${editingCustomer._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          showToast(`Customer "${payload.name}" updated successfully!`);
          setIsModalOpen(false);
          fetchCustomers();
        } else {
          setModalError(data.error || "Failed to update customer.");
        }
      } else {
        const res = await authFetch("/api/courier/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          showToast(`Customer "${payload.name}" created successfully!`);
          setIsModalOpen(false);
          fetchCustomers();
        } else {
          setModalError(data.error || "Failed to create customer.");
        }
      }
    } catch (err: any) {
      setModalError(err.message || "Network error occurred.");
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!deletingCustomer) return;
    setDeleteLoading(true);
    try {
      const res = await authFetch(`/api/courier/customers/${deletingCustomer._id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Customer "${deletingCustomer.name}" deleted successfully.`);
        setDeleteConfirmOpen(false);
        setDeletingCustomer(null);
        fetchCustomers();
      } else {
        showToast(data.error || "Failed to delete customer.", "error");
      }
    } catch {
      showToast("Error deleting customer.", "error");
    } finally {
      setDeleteLoading(false);
    }
  };

  const cities = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((c) => {
      if (c.city && c.city.trim()) set.add(c.city.trim());
    });
    return Array.from(set).sort();
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.nameAsOnGst.toLowerCase().includes(q) ||
        c.gstNo.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.state.toLowerCase().includes(q) ||
        (c.pincode && c.pincode.toLowerCase().includes(q)) ||
        c.phone1.toLowerCase().includes(q) ||
        c.phone2.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q);

      const matchesCity = cityFilter === "All" || c.city.toLowerCase() === cityFilter.toLowerCase();
      return matchesSearch && matchesCity;
    });
  }, [customers, searchQuery, cityFilter]);

  // Reset to page 1 on filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, cityFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const pagedCustomers = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [filteredCustomers, safeCurrentPage, pageSize]);

  const exportCSV = () => {
    if (!filteredCustomers.length) {
      showToast("No data to export", "error");
      return;
    }
    const headers = [
      "name",
      "name as on gst",
      "gst no",
      "city",
      "state",
      "pincode",
      "phone no",
      "phone no",
      "address",
    ];
    const rows = filteredCustomers.map((c) => [
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.nameAsOnGst.replace(/"/g, '""')}"`,
      `"${c.gstNo}"`,
      `"${c.city}"`,
      `"${c.state}"`,
      `"${c.pincode || ""}"`,
      `"${c.phone1}"`,
      `"${c.phone2}"`,
      `"${c.address.replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Customer_Tab_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Customer Tab exported to CSV successfully!");
  };

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#18476A]/10 dark:bg-cyan-500/10 text-[#18476A] dark:text-cyan-400 font-bold shrink-0">
            <Contact2 size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                Customer Tab
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-cyan-100 text-cyan-800 dark:bg-cyan-950/70 dark:text-cyan-300">
                GST Directory
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Customer profile, Name as on GST, GSTIN, location, contact numbers, and delivery address.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={fetchCustomers}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer shadow-2xs"
            title="Refresh Customers"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {canExport && (
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer shadow-2xs"
            >
              <Download size={14} />
              <span>Export CSV</span>
            </button>
          )}

          {canAdd && (
            <button
              onClick={openAddModal}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl bg-[#18476A] text-white hover:bg-[#123955] transition shadow-xs cursor-pointer"
            >
              <Plus size={16} />
              <span>Add Customer</span>
            </button>
          )}
        </div>
      </div>

      {/* Search and City Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, name as on gst, gst no, city, state, phone, address..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#18476A] shadow-2xs"
          />
        </div>

        <div className="w-full sm:w-48 shrink-0">
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-[#18476A] shadow-2xs cursor-pointer"
          >
            <option value="All">All Cities ({customers.length})</option>
            {cities.map((ct) => (
              <option key={ct} value={ct}>
                {ct}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Exact 8 Columns Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[620px] custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-900 shadow-xs">
              <tr className="border-b border-slate-200 dark:border-slate-700 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3.5 w-12 text-center">#</th>
                <th className="px-4 py-3.5 min-w-[170px]">name</th>
                <th className="px-4 py-3.5 min-w-[180px]">name as on gst</th>
                <th className="px-4 py-3.5 min-w-[160px]">gst no</th>
                <th className="px-4 py-3.5 min-w-[120px]">city</th>
                <th className="px-4 py-3.5 min-w-[120px]">state</th>
                <th className="px-4 py-3.5 min-w-[110px]">pincode</th>
                <th className="px-4 py-3.5 min-w-[140px]">phone no</th>
                <th className="px-4 py-3.5 min-w-[140px]">phone no</th>
                <th className="px-4 py-3.5 min-w-[220px]">address</th>
                <th className="px-4 py-3.5 text-right w-20">actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-slate-400">
                    <div className="inline-flex items-center gap-2">
                      <RefreshCw size={16} className="animate-spin text-[#18476A]" />
                      <span>Loading customer tab records...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <Contact2 size={32} className="text-slate-300 dark:text-slate-600" />
                      <span className="font-semibold">No customers found</span>
                      <span className="text-[11px] text-slate-400">
                        {searchQuery ? "Try refining your search keyword" : "Click 'Add Customer' to add a customer"}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                pagedCustomers.map((cust, idx) => (
                  <tr
                    key={cust._id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-center text-slate-400 font-mono text-[11px]">
                      {(safeCurrentPage - 1) * pageSize + idx + 1}
                    </td>

                    {/* 1. name */}
                    <td className="px-4 py-3">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {cust.name}
                      </span>
                    </td>

                    {/* 2. name as on gst */}
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-medium">
                      {cust.nameAsOnGst || "—"}
                    </td>

                    {/* 3. gst no */}
                    <td className="px-4 py-3">
                      {cust.gstNo ? (
                        <span className="inline-block px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200">
                          {cust.gstNo}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* 4. city */}
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-200 font-semibold">
                      {cust.city || "—"}
                    </td>

                    {/* 5. state */}
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {cust.state || "—"}
                    </td>

                    {/* pincode */}
                    <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">
                      {cust.pincode ? (
                        <span className="inline-block px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200">
                          {cust.pincode}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* 6. phone no (1) */}
                    <td className="px-4 py-3 font-mono text-slate-800 dark:text-slate-200">
                      {cust.phone1 ? (
                        <div className="flex items-center gap-1.5">
                          <Phone size={12} className="text-cyan-500 shrink-0" />
                          <span>{cust.phone1}</span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* 7. phone no (2) */}
                    <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">
                      {cust.phone2 ? (
                        <div className="flex items-center gap-1.5">
                          <Phone size={12} className="text-slate-400 shrink-0" />
                          <span>{cust.phone2}</span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* 8. address */}
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      <div className="max-w-[260px] truncate" title={cust.address}>
                        {cust.address || "—"}
                      </div>
                    </td>

                    {/* actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        {canUpdate && (
                          <button
                            onClick={() => openEditModal(cust)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-slate-700 transition cursor-pointer"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => {
                              setDeletingCustomer(cust);
                              setDeleteConfirmOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-700 transition cursor-pointer"
                            title="Delete"
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
          totalCount={filteredCustomers.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
          pageSizeOptions={[10, 25, 50, 100]}
          recordLabel="customers"
          showAlways={true}
        />
      </div>

      {/* Add / Edit Customer Modal - ONLY THE EXACT 8 FIELDS */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-700/80">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#18476A]/10 text-[#18476A] dark:text-cyan-400 font-bold">
                  <Contact2 size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {editingCustomer ? "Edit Customer" : "Add New Customer"}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Customer Tab details
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="p-5 space-y-4">
              {modalError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 text-xs font-semibold">
                  <AlertCircle size={15} />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="space-y-3.5">
                {/* 1. name */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Enter customer name"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#18476A]"
                  />
                </div>

                {/* 2. name as on gst */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Name as on GST
                  </label>
                  <input
                    type="text"
                    value={formNameAsOnGst}
                    onChange={(e) => setFormNameAsOnGst(e.target.value)}
                    placeholder="Enter legal name registered on GST"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#18476A]"
                  />
                </div>

                {/* 3. gst no */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    GST No
                  </label>
                  <input
                    type="text"
                    value={formGstNo}
                    onChange={(e) => setFormGstNo(e.target.value.toUpperCase())}
                    placeholder="e.g. 27AAACT2727Q1ZB"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono uppercase focus:outline-hidden focus:ring-2 focus:ring-[#18476A]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* 4. city */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      value={formCity}
                      onChange={(e) => setFormCity(e.target.value)}
                      placeholder="e.g. Mumbai"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#18476A]"
                    />
                  </div>

                  {/* 5. state */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      State
                    </label>
                    <input
                      type="text"
                      value={formState}
                      onChange={(e) => setFormState(e.target.value)}
                      placeholder="e.g. Maharashtra"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#18476A]"
                    />
                  </div>

                  {/* pincode */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      Pincode
                    </label>
                    <input
                      type="text"
                      value={formPincode}
                      onChange={(e) => setFormPincode(e.target.value)}
                      placeholder="e.g. 400001"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-hidden focus:ring-2 focus:ring-[#18476A]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* 6. phone no */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      Phone No
                    </label>
                    <input
                      type="text"
                      value={formPhone1}
                      onChange={(e) => setFormPhone1(e.target.value)}
                      placeholder="e.g. +91 98201 44521"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#18476A]"
                    />
                  </div>

                  {/* 7. phone no (2) */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      Phone No (Alternate)
                    </label>
                    <input
                      type="text"
                      value={formPhone2}
                      onChange={(e) => setFormPhone2(e.target.value)}
                      placeholder="e.g. +91 22 2844 9911"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#18476A]"
                    />
                  </div>
                </div>

                {/* 8. address */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Address
                  </label>
                  <textarea
                    rows={3}
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    placeholder="Enter complete address"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#18476A]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-[#18476A] hover:bg-[#123955] rounded-xl shadow-xs disabled:opacity-50"
                >
                  {modalSubmitting ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  <span>{editingCustomer ? "Update Customer" : "Save Customer"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && deletingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <AlertCircle size={22} />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete Customer</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mb-5">
              Are you sure you want to delete customer{" "}
              <strong className="text-slate-900 dark:text-white">{deletingCustomer.name}</strong>?
              This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCustomer}
                disabled={deleteLoading}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs disabled:opacity-50"
              >
                {deleteLoading && <RefreshCw size={14} className="animate-spin" />}
                <span>Delete Customer</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
