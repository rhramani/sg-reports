import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Clock3,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Shield,
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

interface RoleItem {
  _id: string;
  role: string;
  status: string;
}

function RolesContent() {
  const { getPermissionsForModule } = useAppLayout();
  const permissions = getPermissionsForModule("Roles");

  const [query, setQuery] = useState("");
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Role Modal
  const [showCreate, setShowCreate] = useState(false);
  const [roleTitle, setRoleTitle] = useState("");
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  // Edit Role Modal
  const [showEdit, setShowEdit] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editRoleTitle, setEditRoleTitle] = useState("");
  const [editError, setEditError] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Delete Role Modal
  const [showDelete, setShowDelete] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Action Menu
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

  const fetchRoles = () => {
    setLoading(true);
    authFetch("/api/roles")
      .then(async (res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((res) => {
        if (res && res.success && Array.isArray(res.data)) {
          setRoles(res.data);
        }
      })
      .catch((err) => console.warn("Failed to fetch roles:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const triggerNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(""), 2200);
  };

  const filteredRoles = roles.filter((r) =>
    `${r.role} ${r.status}`.toLowerCase().includes(query.toLowerCase())
  );

  const {
    pagedData: pagedRoles,
    currentPage,
    totalPages,
    totalCount: totalFilteredCount,
    setCurrentPage,
  } = usePagination(filteredRoles, PAGE_SIZE, [query]);

  const pageStart = (currentPage - 1) * PAGE_SIZE;

  const handleCreateRole = async () => {
    if (!roleTitle.trim()) {
      setCreateError("Role title is required.");
      return;
    }

    setCreateLoading(true);
    setCreateError("");
    try {
      const res = await authFetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: roleTitle.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        triggerNotice(data.message || `Role "${roleTitle}" created successfully.`);
        setRoleTitle("");
        setShowCreate(false);
        fetchRoles();
      } else {
        setCreateError(data.error || "Failed to create role.");
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create role.");
    } finally {
      setCreateLoading(false);
    }
  };

  const openEdit = (index: number) => {
    const item = filteredRoles[index];
    if (!item) return;
    setEditIndex(index);
    setEditRoleTitle(item.role);
    setEditError("");
    setShowEdit(true);
    setOpenMenuIndex(null);
    setMenuPos(null);
  };

  const handleSaveEdit = async () => {
    if (editIndex === null) return;
    const item = filteredRoles[editIndex];
    if (!item || !item._id) {
      triggerNotice("Role ID missing — cannot update.");
      return;
    }

    setEditError("");
    setEditLoading(true);
    try {
      const res = await authFetch(`/api/roles/${item._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: editRoleTitle }),
      });
      const data = await res.json();
      if (data.success) {
        triggerNotice(data.message || "Role updated successfully.");
        setShowEdit(false);
        fetchRoles();
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
    const item = filteredRoles[index];
    if (!item || !item._id) {
      triggerNotice("Role ID missing — cannot toggle status.");
      return;
    }
    const newStatus = item.status === "Active" ? "Inactive" : "Active";
    setOpenMenuIndex(null);
    setMenuPos(null);
    try {
      const res = await authFetch(`/api/roles/${item._id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        triggerNotice(data.message || `Role status changed to ${newStatus}.`);
        fetchRoles();
      } else {
        triggerNotice(data.error || "Status toggle failed.");
      }
    } catch (err) {
      triggerNotice(err instanceof Error ? err.message : "Status toggle failed.");
    }
  };

  const handleDelete = async () => {
    if (deleteIndex === null) return;
    const item = filteredRoles[deleteIndex];
    if (!item || !item._id) {
      triggerNotice("Role ID missing — cannot delete.");
      setShowDelete(false);
      return;
    }

    setDeleteLoading(true);
    try {
      const res = await authFetch(`/api/roles/${item._id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        triggerNotice(data.message || "Role deleted successfully.");
        setShowDelete(false);
        fetchRoles();
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

  const totalRoles = roles.length;
  const activeRoles = roles.filter((r) => r.status === "Active").length;
  const inactiveRoles = roles.filter((r) => r.status !== "Active").length;

  return (
    <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
            <span>Administration</span>
            <ChevronRight size={12} />
            <span className="text-slate-700">Roles</span>
          </div>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-950">Roles</h1>
        </div>
        {permissions.add && (
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#18476A] px-4 text-sm font-semibold text-white shadow-lg shadow-[#18476A]/20 transition hover:bg-[#18476A]"
          >
            <Plus size={17} />
            Create role
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_3px_15px_rgba(28,25,64,0.03)]">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef6fa] text-[#18476A]">
            <Shield size={19} />
          </div>
          <p className="mt-4 text-xs font-semibold text-slate-600">Total roles</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{totalRoles}</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_3px_15px_rgba(28,25,64,0.03)]">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
            <Check size={19} />
          </div>
          <p className="mt-4 text-xs font-semibold text-slate-600">Active roles</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{activeRoles}</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_3px_15px_rgba(28,25,64,0.03)]">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600">
            <Clock3 size={19} />
          </div>
          <p className="mt-4 text-xs font-semibold text-slate-600">Needs attention</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{inactiveRoles}</p>
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_3px_15px_rgba(28,25,64,0.03)]">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:p-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Roles directory</h3>
          </div>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-2.5 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search roles..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-[#8fc3e0] focus:ring-2 focus:ring-[#dbeaf2] sm:w-56 text-slate-700"
            />
          </div>
        </div>

        {/* Roles Table */}
        <div className="overflow-x-auto max-h-[720px] xl:max-h-[calc(100vh-260px)] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="w-16 px-4 py-3.5 text-center whitespace-nowrap">No.</th>
                <th className="py-3.5 px-4 w-[65%] min-w-[220px]">Role</th>
                <th className="py-3.5 px-4 w-[35%] min-w-[120px]">Status</th>
                {(permissions.update || permissions.delete) && (
                  <th className="w-24 px-4 py-3.5 text-right whitespace-nowrap">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedRoles.map((role, index) => {
                const globalIndex = pageStart + index;
                const isSuper = role.role === "Super Admin";

                return (
                  <tr key={role._id || globalIndex} className="group hover:bg-[#eef6fa]/40 transition-colors">
                    <td className="w-16 px-4 py-4 text-center text-xs font-mono text-slate-400 whitespace-nowrap">
                      {String(globalIndex + 1).padStart(2, "0")}
                    </td>
                    <td className="py-4 px-4 text-xs font-medium text-slate-600 align-middle">
                      <div className="flex items-center gap-3">
                        <div
                          className={`grid h-8 w-8 place-items-center rounded-xl border ${
                            isSuper
                              ? "bg-purple-50 text-purple-600 border-purple-200/80"
                              : "bg-blue-50 text-[#18476A] border-blue-100"
                          }`}
                        >
                          <Shield size={15} />
                        </div>
                        <span className="font-bold text-slate-900">{role.role}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-xs font-medium text-slate-600 align-middle">
                      <StatusBadge
                        status={role.status}
                        color={role.status === "Active" ? "emerald" : "amber"}
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
          {!loading && pagedRoles.length === 0 && (
            <div className="p-10 text-center text-sm font-medium text-slate-600">
              {query ? "No roles match your search." : "No roles found."}
            </div>
          )}
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalFilteredCount}
          pageSize={PAGE_SIZE}
          onPageChange={setCurrentPage}
          recordLabel="roles"
        />
      </div>

      {notice && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-slate-900 px-4 py-3 text-xs font-semibold text-white shadow-xl">
          {notice}
        </div>
      )}

      {/* Action Menu */}
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

      {/* Create Role Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-5 backdrop-blur-sm">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#18476A]">
                  SG Report workspace
                </p>
                <h3 className="mt-1 text-lg font-bold flex items-center gap-2">
                  <Shield size={18} className="text-[#18476A]" />
                  Create new role
                </h3>
              </div>
              <button
                onClick={() => {
                  setRoleTitle("");
                  setCreateError("");
                  setShowCreate(false);
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Role name *</label>
                <input
                  value={roleTitle}
                  onChange={(e) => {
                    setRoleTitle(e.target.value);
                    setCreateError("");
                  }}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#6fa6c4] focus:ring-2 focus:ring-[#dbeaf2]"
                  placeholder="e.g. Audit Supervisor"
                />
              </div>

              {createError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">
                  {createError}
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => {
                  setRoleTitle("");
                  setCreateError("");
                  setShowCreate(false);
                }}
                disabled={createLoading}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRole}
                disabled={createLoading}
                className="rounded-lg bg-[#18476A] px-5 py-2 text-xs font-semibold text-white hover:bg-[#123955] disabled:opacity-60"
              >
                {createLoading ? "Creating..." : "Create role"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
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
                  Edit role
                </h3>
              </div>
              <button onClick={() => setShowEdit(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Role name</label>
                <input
                  type="text"
                  value={editRoleTitle}
                  onChange={(e) => {
                    setEditRoleTitle(e.target.value);
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

      {/* Delete Role Modal */}
      {showDelete && deleteIndex !== null && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-5 backdrop-blur-sm">
          <div className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-rose-50">
              <Trash2 size={22} className="text-rose-500" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Confirm deletion</h3>
            <p className="mt-1.5 text-sm text-slate-500">
              Are you sure you want to delete role &quot;{filteredRoles[deleteIndex]?.role}&quot;?
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

export default function RolesPage() {
  return (
    <AppLayout>
      <RolesContent />
    </AppLayout>
  );
}
