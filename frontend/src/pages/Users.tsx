import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  ToggleLeft,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/lib/usePagination";
import { authFetch } from "@/lib/apiClient";
import { useAppLayout } from "@/lib/AppLayoutContext";

interface UserItem {
  _id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

function UsersContent() {
  const { getPermissionsForModule } = useAppLayout();
  const permissions = getPermissionsForModule("Users");

  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Dynamic roles fetched from backend
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  // Create User Modal
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  // Edit User Modal
  const [showEdit, setShowEdit] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editError, setEditError] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Delete User Modal
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

  const fetchUsers = () => {
    setLoading(true);
    authFetch("/api/users")
      .then(async (res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((res) => {
        if (res && res.success && Array.isArray(res.data)) {
          setUsers(res.data);
        }
      })
      .catch((err) => console.warn("Failed to fetch users:", err))
      .finally(() => setLoading(false));
  };

  const fetchRoles = () => {
    setRolesLoading(true);
    authFetch("/api/roles")
      .then(async (res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((res) => {
        if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
          const names: string[] = res.data.map((r: { role: string }) => r.role);
          setAvailableRoles(names);
          setRole((prev) => (prev && names.includes(prev) ? prev : names[0]));
        }
      })
      .catch(() => {})
      .finally(() => setRolesLoading(false));
  };

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, []);

  const triggerNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(""), 2200);
  };

  const filteredUsers = users.filter((u) =>
    `${u.name} ${u.email} ${u.role} ${u.status}`.toLowerCase().includes(query.toLowerCase())
  );

  const {
    pagedData: pagedUsers,
    currentPage,
    totalPages,
    totalCount: totalFilteredCount,
    setCurrentPage,
  } = usePagination(filteredUsers, PAGE_SIZE, [query]);

  const pageStart = (currentPage - 1) * PAGE_SIZE;

  const resetCreateModal = () => {
    setName("");
    setEmail("");
    setPassword("");
    setRole(availableRoles[0] ?? "");
    setShowPassword(false);
    setCreateError("");
    setCreateLoading(false);
    setShowCreate(false);
  };

  const handleCreateUser = async () => {
    if (!name.trim()) {
      setCreateError("Full name is required.");
      return;
    }
    if (!email.trim()) {
      setCreateError("Work email is required.");
      return;
    }
    if (!password.trim()) {
      setCreateError("Password is required.");
      return;
    }
    if (password.trim().length < 8) {
      setCreateError("Password must be at least 8 characters.");
      return;
    }

    setCreateLoading(true);
    setCreateError("");
    try {
      const res = await authFetch("/api/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password: password.trim(),
          role: role || availableRoles[0],
        }),
      });
      const data = await res.json();
      if (data.success) {
        triggerNotice(data.message || `User "${name}" created successfully.`);
        resetCreateModal();
        fetchUsers();
      } else {
        setCreateError(data.error || "Failed to create user.");
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setCreateLoading(false);
    }
  };

  const openEdit = (index: number) => {
    const user = filteredUsers[index];
    if (!user) return;
    setEditIndex(index);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditRole(user.role);
    setEditError("");
    setShowEdit(true);
    setOpenMenuIndex(null);
    setMenuPos(null);
  };

  const handleSaveEdit = async () => {
    if (editIndex === null) return;
    const user = filteredUsers[editIndex];
    if (!user || !user._id) {
      triggerNotice("User ID missing — cannot update.");
      return;
    }

    setEditError("");
    setEditLoading(true);
    try {
      const res = await authFetch(`/api/users/${user._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          email: editEmail,
          role: editRole,
        }),
      });
      const data = await res.json();
      if (data.success) {
        triggerNotice(data.message || "User updated successfully.");
        setShowEdit(false);
        fetchUsers();
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
    const user = filteredUsers[index];
    if (!user || !user._id) {
      triggerNotice("User ID missing — cannot toggle status.");
      return;
    }
    const newStatus = user.status === "Active" ? "Inactive" : "Active";
    setOpenMenuIndex(null);
    setMenuPos(null);
    try {
      const res = await authFetch(`/api/users/${user._id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        triggerNotice(data.message || `User status changed to ${newStatus}.`);
        fetchUsers();
      } else {
        triggerNotice(data.error || "Status toggle failed.");
      }
    } catch (err) {
      triggerNotice(err instanceof Error ? err.message : "Status toggle failed.");
    }
  };

  const handleDelete = async () => {
    if (deleteIndex === null) return;
    const user = filteredUsers[deleteIndex];
    if (!user || !user._id) {
      triggerNotice("User ID missing — cannot delete.");
      setShowDelete(false);
      return;
    }

    setDeleteLoading(true);
    try {
      const res = await authFetch(`/api/users/${user._id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        triggerNotice(data.message || "User deleted successfully.");
        setShowDelete(false);
        fetchUsers();
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

  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.status === "Active").length;
  const inactiveUsers = users.filter((u) => u.status !== "Active").length;

  return (
    <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
            <span>Administration</span>
            <ChevronRight size={12} />
            <span className="text-slate-700">Users</span>
          </div>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-950">Users</h1>
        </div>
        {permissions.add && (
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#18476A] px-4 text-sm font-semibold text-white shadow-lg shadow-[#18476A]/20 transition hover:bg-[#18476A]"
          >
            <Plus size={17} />
            Create user
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_3px_15px_rgba(28,25,64,0.03)]">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef6fa] text-[#18476A]">
            <Users size={19} />
          </div>
          <p className="mt-4 text-xs font-semibold text-slate-600">Total users</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{totalUsers}</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_3px_15px_rgba(28,25,64,0.03)]">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
            <Check size={19} />
          </div>
          <p className="mt-4 text-xs font-semibold text-slate-600">Active users</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{activeUsers}</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_3px_15px_rgba(28,25,64,0.03)]">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600">
            <Clock3 size={19} />
          </div>
          <p className="mt-4 text-xs font-semibold text-slate-600">Needs attention</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{inactiveUsers}</p>
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_3px_15px_rgba(28,25,64,0.03)]">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:p-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Users directory</h3>
          </div>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-2.5 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-[#8fc3e0] focus:ring-2 focus:ring-[#dbeaf2] sm:w-56 text-slate-700"
            />
          </div>
        </div>

        {/* Users Table */}
        <div className="overflow-x-auto max-h-[720px] xl:max-h-[calc(100vh-260px)] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="w-16 px-4 py-3.5 text-center whitespace-nowrap">No.</th>
                <th className="py-3.5 px-4 w-[30%] min-w-[180px]">User</th>
                <th className="py-3.5 px-4 w-[35%] min-w-[220px]">Email</th>
                <th className="py-3.5 px-4 w-[20%] min-w-[140px]">Role</th>
                <th className="py-3.5 px-4 w-[15%] min-w-[110px]">Status</th>
                {(permissions.update || permissions.delete) && (
                  <th className="w-24 px-4 py-3.5 text-right whitespace-nowrap">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedUsers.map((user, index) => {
                const globalIndex = pageStart + index;
                const initial = (user.name || "U").charAt(0).toUpperCase();
                const isSuper = user.role === "Super Admin";

                return (
                  <tr key={user._id || globalIndex} className="group hover:bg-[#eef6fa]/40 transition-colors">
                    <td className="w-16 px-4 py-4 text-center text-xs font-mono text-slate-400 whitespace-nowrap">
                      {String(globalIndex + 1).padStart(2, "0")}
                    </td>
                    <td className="py-4 px-4 text-xs font-medium text-slate-600 align-middle">
                      <div className="flex items-center gap-3">
                        <div className="grid h-8 w-8 place-items-center rounded-full bg-[#18476A] text-xs font-bold text-white shadow-xs">
                          {initial}
                        </div>
                        <span className="font-semibold text-slate-900">{user.name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-xs font-medium text-slate-600 align-middle">
                      {user.email}
                    </td>
                    <td className="py-4 px-4 text-xs font-medium text-slate-600 align-middle">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold border ${
                          isSuper
                            ? "bg-purple-50 text-purple-700 border-purple-200/80"
                            : "bg-slate-100/90 text-slate-700 border-slate-200/90"
                        }`}
                      >
                        <Shield size={12} className={isSuper ? "text-purple-600" : "text-slate-500"} />
                        {user.role}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-xs font-medium text-slate-600 align-middle">
                      <StatusBadge
                        status={user.status}
                        color={user.status === "Active" ? "emerald" : "amber"}
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
          {!loading && pagedUsers.length === 0 && (
            <div className="p-10 text-center text-sm font-medium text-slate-600">
              {query ? "No users match your search." : "No users found."}
            </div>
          )}
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalFilteredCount}
          pageSize={PAGE_SIZE}
          onPageChange={setCurrentPage}
          recordLabel="users"
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

      {/* Create User Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-5 backdrop-blur-sm">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#18476A]">
                  SG Report workspace
                </p>
                <h3 className="mt-1 text-lg font-bold flex items-center gap-2">
                  <UserPlus size={18} className="text-[#18476A]" />
                  Create new user
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">User will be able to log in with their full name and password.</p>
              </div>
              <button onClick={resetCreateModal} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Full name (Username) *</label>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setCreateError("");
                  }}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#6fa6c4] focus:ring-2 focus:ring-[#dbeaf2]"
                  placeholder="e.g. Sarah Jenkins"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Work email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setCreateError("");
                  }}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#6fa6c4] focus:ring-2 focus:ring-[#dbeaf2]"
                  placeholder="sarah@company.com"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Password *</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setCreateError("");
                    }}
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 pr-10 text-sm outline-none focus:border-[#6fa6c4] focus:ring-2 focus:ring-[#dbeaf2]"
                    placeholder="min. 6 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Role
                  {rolesLoading && (
                    <span className="ml-2 text-[12px] font-normal text-slate-400 italic">Loading roles…</span>
                  )}
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={rolesLoading}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#6fa6c4] focus:ring-2 focus:ring-[#dbeaf2]"
                >
                  {availableRoles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {createError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">
                  {createError}
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={resetCreateModal}
                disabled={createLoading}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                disabled={createLoading}
                className="rounded-lg bg-[#18476A] px-5 py-2 text-xs font-semibold text-white hover:bg-[#123955] disabled:opacity-60"
              >
                {createLoading ? "Creating..." : "Create user"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
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
                  Edit user
                </h3>
              </div>
              <button onClick={() => setShowEdit(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Full name (Username)</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value);
                    setEditError("");
                  }}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#6fa6c4] focus:ring-2 focus:ring-[#dbeaf2]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Work email</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => {
                    setEditEmail(e.target.value);
                    setEditError("");
                  }}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#6fa6c4] focus:ring-2 focus:ring-[#dbeaf2]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#6fa6c4] focus:ring-2 focus:ring-[#dbeaf2]"
                >
                  {availableRoles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
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

      {/* Delete User Modal */}
      {showDelete && deleteIndex !== null && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-5 backdrop-blur-sm">
          <div className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-rose-50">
              <Trash2 size={22} className="text-rose-500" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Confirm deletion</h3>
            <p className="mt-1.5 text-sm text-slate-500">
              Are you sure you want to delete user &quot;{filteredUsers[deleteIndex]?.name}&quot;?
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

export default function UsersPage() {
  return (
    <AppLayout>
      <UsersContent />
    </AppLayout>
  );
}
