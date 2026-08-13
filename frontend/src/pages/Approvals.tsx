import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Download,
  MoreVertical,
  Pencil,
  Search,
  Trash2,
  ToggleLeft,
  X,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/lib/usePagination";
import { authFetch } from "@/lib/apiClient";
import { useAppLayout } from "@/lib/AppLayoutContext";

interface ApprovalItem {
  _id: string;
  report: string;
  submittedBy: string;
  submitted: string;
  approvedRows?: number | string;
  priority: string;
  status: string;
}

function ApprovalsContent() {
  const navigate = useNavigate();
  const { getPermissionsForModule } = useAppLayout();
  const permissions = getPermissionsForModule("Approvals");

  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit modal
  const [showEdit, setShowEdit] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editFields, setEditFields] = useState<{ report: string; submittedBy: string }>({
    report: "",
    submittedBy: "",
  });
  const [editError, setEditError] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Delete confirm modal
  const [showDelete, setShowDelete] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Action menu dropdown
  const [notice, setNotice] = useState("");
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 10;

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuIndex(null);
        setMenuPos(null);
      }
    };
    const closeOnScroll = () => {
      setOpenMenuIndex(null);
      setMenuPos(null);
    };
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnScroll);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnScroll);
    };
  }, []);

  const fetchApprovals = () => {
    setLoading(true);
    authFetch("/api/approvals")
      .then(async (res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((res) => {
        if (res && res.success && Array.isArray(res.data)) {
          setItems(res.data);
        }
      })
      .catch((err) => console.warn("Failed to fetch approvals:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  const triggerNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(""), 2200);
  };

  const filteredItems = items.filter((item) =>
    `${item.report} ${item.submittedBy} ${item.priority} ${item.status}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  const {
    pagedData: pagedItems,
    currentPage,
    totalPages,
    totalCount: totalFilteredCount,
    setCurrentPage,
  } = usePagination(filteredItems, PAGE_SIZE, [query]);

  const pageStart = (currentPage - 1) * PAGE_SIZE;

  const handleReportClick = (reportId: string) => {
    navigate("/reports");
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("sg:open-report", { detail: { reportId } }));
    }, 120);
  };

  const openEdit = (index: number) => {
    const item = filteredItems[index];
    if (!item) return;
    setEditIndex(index);
    setEditFields({ report: item.report, submittedBy: item.submittedBy });
    setEditError("");
    setShowEdit(true);
    setOpenMenuIndex(null);
    setMenuPos(null);
  };

  const handleSaveEdit = async () => {
    if (editIndex === null) return;
    const item = filteredItems[editIndex];
    if (!item || !item._id) {
      triggerNotice("Record ID missing — cannot update.");
      return;
    }

    setEditError("");
    setEditLoading(true);
    try {
      const res = await authFetch(`/api/approvals/${item._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editFields),
      });
      const data = await res.json();
      if (data.success) {
        triggerNotice(data.message || "Approval updated successfully.");
        setShowEdit(false);
        fetchApprovals();
      } else {
        setEditError(data.error || "Update failed.");
      }
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setEditLoading(false);
    }
  };

  const handleToggleStatus = async (index: number) => {
    const item = filteredItems[index];
    if (!item || !item._id) {
      triggerNotice("Record ID missing — cannot toggle status.");
      return;
    }
    const cycle: Record<string, string> = { Pending: "Review", Review: "Approved", Approved: "Pending" };
    const nextStatus = cycle[item.status] ?? "Pending";

    setOpenMenuIndex(null);
    setMenuPos(null);
    try {
      const res = await authFetch(`/api/approvals/${item._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (data.success) {
        triggerNotice(data.message || `Status updated to ${nextStatus}.`);
        fetchApprovals();
      } else {
        triggerNotice(data.error || "Status toggle failed.");
      }
    } catch (err) {
      triggerNotice(err instanceof Error ? err.message : "Status toggle failed.");
    }
  };

  const handleDelete = async () => {
    if (deleteIndex === null) return;
    const item = filteredItems[deleteIndex];
    if (!item || !item._id) {
      triggerNotice("Record ID missing — cannot delete.");
      setShowDelete(false);
      return;
    }

    setDeleteLoading(true);
    try {
      const res = await authFetch(`/api/approvals/${item._id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        triggerNotice(data.message || "Approval deleted successfully.");
        setShowDelete(false);
        fetchApprovals();
      } else {
        triggerNotice(data.error || "Delete failed.");
        setShowDelete(false);
      }
    } catch (err) {
      triggerNotice(err instanceof Error ? err.message : "Delete failed.");
      setShowDelete(false);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleExport = () => {
    if (filteredItems.length === 0) {
      triggerNotice("No approval data to export");
      return;
    }
    const header = "Report,Submitted By,Submitted Date,Approved Rows,Priority,Status";
    const body = filteredItems
      .map((item) =>
        [
          item.report,
          item.submittedBy,
          item.submitted ?? "",
          String(item.approvedRows ?? 0),
          item.priority,
          item.status,
        ]
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sg-report-approvals.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    triggerNotice(`Exported ${filteredItems.length} approval records to CSV`);
  };

  const totalCount = items.length;
  const approvedCount = items.filter((i) => i.status === "Approved").length;
  const needsAttentionCount = items.filter((i) => i.status === "Pending" || i.status === "Review").length;

  return (
    <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6">
      {/* Breadcrumb + Header */}
      <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
            <span>Main menu</span>
            <ChevronRight size={12} />
            <span className="text-slate-700">Approvals</span>
          </div>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-950">Approvals</h1>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_3px_15px_rgba(28,25,64,0.03)]">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef6fa] text-[#18476A]">
            <ClipboardCheck size={19} />
          </div>
          <p className="mt-4 text-xs font-semibold text-slate-600">Total approvals</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{totalCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_3px_15px_rgba(28,25,64,0.03)]">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
            <Check size={19} />
          </div>
          <p className="mt-4 text-xs font-semibold text-slate-600">Approved</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{approvedCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_3px_15px_rgba(28,25,64,0.03)]">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600">
            <Clock3 size={19} />
          </div>
          <p className="mt-4 text-xs font-semibold text-slate-600">Needs attention</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{needsAttentionCount}</p>
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_3px_15px_rgba(28,25,64,0.03)]">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:p-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Approvals directory</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-2.5 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search approvals..."
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-[#8fc3e0] focus:ring-2 focus:ring-[#dbeaf2] sm:w-56 text-slate-700"
              />
            </div>
            {permissions.export && (
              <button
                onClick={handleExport}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <Download size={14} />
                Export
              </button>
            )}
          </div>
        </div>

        {/* Approvals Table */}
        <div className="overflow-x-auto max-h-[720px] xl:max-h-[calc(100vh-260px)] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="w-16 px-4 py-3.5 text-center whitespace-nowrap">No.</th>
                <th className="py-3.5 px-4 w-[25%] min-w-[160px]">Report</th>
                <th className="py-3.5 px-4 w-[20%] min-w-[140px]">Submitted by</th>
                <th className="py-3.5 px-4 w-[18%] min-w-[120px]">Submitted</th>
                <th className="py-3.5 px-4 w-[15%] min-w-[110px]">Approved Rows</th>
                <th className="py-3.5 px-4 w-[12%] min-w-[90px]">Priority</th>
                <th className="py-3.5 px-4 w-[10%] min-w-[100px]">Status</th>
                {(permissions.update || permissions.delete) && (
                  <th className="w-24 px-4 py-3.5 text-right whitespace-nowrap">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedItems.map((item, index) => {
                const globalIndex = pageStart + index;
                return (
                  <tr key={item._id || globalIndex} className="group hover:bg-[#eef6fa]/40 transition-colors">
                    <td className="w-16 px-4 py-4 text-center text-xs font-mono text-slate-400 whitespace-nowrap">
                      {String(globalIndex + 1).padStart(2, "0")}
                    </td>
                    <td className="py-4 px-4 text-xs font-medium text-slate-600 align-middle">
                      <button
                        onClick={() => handleReportClick(item._id)}
                        className="font-semibold text-[#18476A] hover:underline underline-offset-2 transition text-left"
                        title={`Open ${item.report} in Reports`}
                      >
                        {item.report}
                      </button>
                    </td>
                    <td className="py-4 px-4 text-xs font-medium text-slate-600 align-middle">
                      {item.submittedBy}
                    </td>
                    <td className="py-4 px-4 text-xs font-medium text-slate-600 align-middle">
                      {item.submitted}
                    </td>
                    <td className="py-4 px-4 text-xs font-medium text-slate-600 align-middle">
                      {item.approvedRows ?? "-"}
                    </td>
                    <td className="py-4 px-4 text-xs font-medium text-slate-600 align-middle">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          item.priority === "High"
                            ? "bg-rose-50 text-rose-700"
                            : item.priority === "Medium"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {item.priority}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-xs font-medium text-slate-600 align-middle">
                      <StatusBadge
                        status={item.status}
                        color={
                          item.status === "Pending"
                            ? "amber"
                            : item.status === "Review"
                            ? "blue"
                            : "emerald"
                        }
                      />
                    </td>
                    {(permissions.update || permissions.delete) && (
                      <td className="w-24 px-4 py-4 text-right align-middle whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            if (openMenuIndex === globalIndex) {
                              setOpenMenuIndex(null);
                              setMenuPos(null);
                            } else {
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setMenuPos({
                                top: rect.bottom + 6,
                                right: window.innerWidth - rect.right,
                              });
                              setOpenMenuIndex(globalIndex);
                            }
                          }}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                        >
                          <MoreVertical size={17} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && pagedItems.length === 0 && (
            <div className="p-10 text-center text-sm font-medium text-slate-600">
              {query ? "No approvals match your search." : "No approvals found."}
            </div>
          )}
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalFilteredCount}
          pageSize={PAGE_SIZE}
          onPageChange={setCurrentPage}
          recordLabel="approvals"
        />
      </div>

      {notice && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-slate-900 px-4 py-3 text-xs font-semibold text-white shadow-xl">
          {notice}
        </div>
      )}

      {/* Row action dropdown */}
      {openMenuIndex !== null && menuPos && (
        <div
          ref={menuRef}
          style={{ top: menuPos.top, right: menuPos.right }}
          className="fixed z-[200] min-w-[168px] rounded-xl border border-slate-200 bg-white py-1 shadow-2xl"
        >
          {permissions.update && (
            <>
              <button
                onClick={() => openEdit(openMenuIndex)}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Pencil size={13} className="text-[#18476A]" />
                Edit
              </button>
              <button
                onClick={() => handleToggleStatus(openMenuIndex)}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <ToggleLeft size={13} className="text-amber-500" />
                Toggle status
              </button>
            </>
          )}
          {permissions.update && permissions.delete && <div className="my-1 border-t border-slate-100" />}
          {permissions.delete && (
            <button
              onClick={() => {
                setDeleteIndex(openMenuIndex);
                setShowDelete(true);
                setOpenMenuIndex(null);
                setMenuPos(null);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
            >
              <Trash2 size={13} />
              Delete
            </button>
          )}
        </div>
      )}

      {/* Edit modal */}
      {showEdit && editIndex !== null && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-5 backdrop-blur-sm">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#18476A]">
                  SG Report workspace
                </p>
                <h3 className="mt-1 text-lg font-bold flex items-center gap-2">
                  <Pencil size={17} className="text-[#18476A]" />
                  Edit approval
                </h3>
              </div>
              <button onClick={() => setShowEdit(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Report name</label>
                <input
                  type="text"
                  value={editFields.report}
                  onChange={(e) => {
                    setEditFields((p) => ({ ...p, report: e.target.value }));
                    setEditError("");
                  }}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#6fa6c4] focus:ring-2 focus:ring-[#dbeaf2]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Submitted by</label>
                <input
                  type="text"
                  value={editFields.submittedBy}
                  onChange={(e) => {
                    setEditFields((p) => ({ ...p, submittedBy: e.target.value }));
                    setEditError("");
                  }}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#6fa6c4] focus:ring-2 focus:ring-[#dbeaf2]"
                />
              </div>
              {editError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">
                  {editError}
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowEdit(false)}
                disabled={editLoading}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editLoading}
                className="rounded-lg bg-[#18476A] px-5 py-2 text-xs font-semibold text-white hover:bg-[#123955] disabled:opacity-60"
              >
                {editLoading ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {showDelete && deleteIndex !== null && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-5 backdrop-blur-sm">
          <div className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-rose-50">
              <Trash2 size={22} className="text-rose-500" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Confirm deletion</h3>
            <p className="mt-1.5 text-sm text-slate-500">
              Are you sure you want to delete &quot;{filteredItems[deleteIndex]?.report}&quot;?
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowDelete(false)}
                disabled={deleteLoading}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="rounded-lg bg-rose-600 px-5 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {deleteLoading ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ApprovalsPage() {
  return (
    <AppLayout>
      <ApprovalsContent />
    </AppLayout>
  );
}
