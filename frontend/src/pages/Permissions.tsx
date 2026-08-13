import { useEffect, useState } from "react";
import {
  Shield,
  ShieldCheck,
  CheckSquare,
  Square,
  Save,
  Search,
  Users,
  LayoutDashboard,
  FileBarChart,
  ClipboardCheck,
  CheckCircle2,
  AlertCircle,
  Eye,
  PlusCircle,
  Edit3,
  Trash2,
  Download,
  ChevronRight,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { authFetch } from "@/lib/apiClient";
import type { PermissionActions } from "@shared/api";

interface ModulePermission {
  module: string;
  actions: PermissionActions;
}

interface RoleData {
  _id: string;
  role: string;
  members: number;
  status: string;
  created: string;
  modulePermissions?: ModulePermission[];
}

const DEFAULT_MODULE_DEFINITIONS = [
  { name: "Dashboard", icon: LayoutDashboard, category: "Workspace", description: "Main workspace metrics and status overview" },
  { name: "Reports", icon: FileBarChart, category: "Workspace", description: "Report datasets, file uploads, and dynamic viewer" },
  { name: "Approvals", icon: ClipboardCheck, category: "Workspace", description: "Workflow approvals and row status queue" },
  { name: "Users", icon: Users, category: "Administration", description: "Workspace members, roles, and invitations" },
  { name: "Roles", icon: Shield, category: "Administration", description: "Workspace role hierarchy and member assignments" },
  { name: "Permissions", icon: ShieldCheck, category: "Administration", description: "Granular action permissions per role & module" },
];

const ACTION_COLUMNS: { key: keyof PermissionActions; label: string; icon: typeof Eye }[] = [
  { key: "view", label: "View", icon: Eye },
  { key: "add", label: "Add", icon: PlusCircle },
  { key: "update", label: "Update", icon: Edit3 },
  { key: "delete", label: "Delete", icon: Trash2 },
  { key: "export", label: "Export", icon: Download },
];

function PermissionsContent() {
  const [roles, setRoles] = useState<RoleData[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [permissionsState, setPermissionsState] = useState<Record<string, PermissionActions>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [notice, setNotice] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/roles");
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          setRoles(json.data);
          const initialRole = selectedRoleId
            ? json.data.find((r: RoleData) => r._id === selectedRoleId) ?? json.data[0]
            : json.data[0];

          setSelectedRoleId(initialRole._id);
          loadRolePermissions(initialRole);
        }
      }
    } catch (err) {
      console.error("Failed to load roles for permissions page", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const loadRolePermissions = (role: RoleData) => {
    const permMap: Record<string, PermissionActions> = {};

    DEFAULT_MODULE_DEFINITIONS.forEach((mod) => {
      permMap[mod.name] = {
        view: role.role === "Super Admin",
        add: role.role === "Super Admin",
        update: role.role === "Super Admin",
        delete: role.role === "Super Admin",
        export: role.role === "Super Admin",
      };
    });

    if (role.modulePermissions && Array.isArray(role.modulePermissions)) {
      role.modulePermissions.forEach((mp) => {
        if (mp.module && mp.actions) {
          permMap[mp.module] = {
            view: Boolean(mp.actions.view),
            add: Boolean(mp.actions.add),
            update: Boolean(mp.actions.update),
            delete: Boolean(mp.actions.delete),
            export: Boolean(mp.actions.export),
          };
        }
      });
    }

    setPermissionsState(permMap);
  };

  const handleSelectRole = (role: RoleData) => {
    setSelectedRoleId(role._id);
    loadRolePermissions(role);
  };

  const currentRole = roles.find((r) => r._id === selectedRoleId);

  const togglePermission = (moduleName: string, actionKey: keyof PermissionActions) => {
    setPermissionsState((prev) => {
      const current = prev[moduleName] ?? { view: false, add: false, update: false, delete: false, export: false };
      return {
        ...prev,
        [moduleName]: {
          ...current,
          [actionKey]: !current[actionKey],
        },
      };
    });
  };

  const toggleAllModuleActions = (moduleName: string) => {
    setPermissionsState((prev) => {
      const current = prev[moduleName] ?? { view: false, add: false, update: false, delete: false, export: false };
      const allEnabled = Object.values(current).every(Boolean);
      const targetState = !allEnabled;

      return {
        ...prev,
        [moduleName]: {
          view: targetState,
          add: targetState,
          update: targetState,
          delete: targetState,
          export: targetState,
        },
      };
    });
  };

  const toggleColumnAction = (actionKey: keyof PermissionActions) => {
    setPermissionsState((prev) => {
      const allEnabled = DEFAULT_MODULE_DEFINITIONS.every(
        (m) => prev[m.name]?.[actionKey]
      );
      const targetState = !allEnabled;

      const next = { ...prev };
      DEFAULT_MODULE_DEFINITIONS.forEach((m) => {
        next[m.name] = {
          ...(next[m.name] ?? { view: false, add: false, update: false, delete: false, export: false }),
          [actionKey]: targetState,
        };
      });
      return next;
    });
  };

  const handleGrantAll = () => {
    const next: Record<string, PermissionActions> = {};
    DEFAULT_MODULE_DEFINITIONS.forEach((m) => {
      next[m.name] = { view: true, add: true, update: true, delete: true, export: true };
    });
    setPermissionsState(next);
  };

  const handleRevokeAll = () => {
    const next: Record<string, PermissionActions> = {};
    DEFAULT_MODULE_DEFINITIONS.forEach((m) => {
      next[m.name] = { view: false, add: false, update: false, delete: false, export: false };
    });
    setPermissionsState(next);
  };

  const showNotification = (message: string, type: "success" | "error") => {
    setNotice({ message, type });
    setTimeout(() => setNotice(null), 3000);
  };

  const handleSaveChanges = async () => {
    if (!currentRole) return;
    setSaving(true);

    const payload: ModulePermission[] = DEFAULT_MODULE_DEFINITIONS.map((m) => ({
      module: m.name,
      actions: permissionsState[m.name] ?? { view: false, add: false, update: false, delete: false, export: false },
    }));

    try {
      const res = await authFetch(`/api/roles/${currentRole._id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modulePermissions: payload }),
      });

      const json = await res.json();
      if (json.success) {
        showNotification(`Permissions updated successfully for '${currentRole.role}'.`, "success");
        setRoles((prev) =>
          prev.map((r) =>
            r._id === currentRole._id ? { ...r, modulePermissions: payload } : r
          )
        );
      } else {
        showNotification(json.error || "Failed to update permissions.", "error");
      }
    } catch (err) {
      showNotification("Network error occurred while saving permissions.", "error");
    } finally {
      setSaving(false);
    }
  };

  const filteredModules = DEFAULT_MODULE_DEFINITIONS.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {notice && (
        <div
          className={`fixed top-20 right-8 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-md transition-all ${
            notice.type === "success"
              ? "bg-emerald-900/90 border-emerald-700 text-white"
              : "bg-rose-900/90 border-rose-700 text-white"
          }`}
        >
          {notice.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-xs font-semibold">{notice.message}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
            <span>Administration</span>
            <ChevronRight size={12} />
            <span className="text-slate-600">Permissions</span>
          </div>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">
            Permissions
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleGrantAll}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm"
          >
            <CheckSquare size={14} className="text-emerald-600" />
            Grant All
          </button>
          <button
            onClick={handleRevokeAll}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm"
          >
            <Square size={14} className="text-rose-500" />
            Revoke All
          </button>
          <button
            onClick={handleSaveChanges}
            disabled={saving || !currentRole}
            className="inline-flex items-center gap-2 rounded-xl bg-[#18476A] px-5 py-2 text-xs font-bold text-white shadow-md shadow-[#18476A]/20 hover:bg-[#123955] transition disabled:opacity-50"
          >
            <Save size={15} />
            {saving ? "Saving..." : "Save Permissions"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between px-2 pb-3 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Users size={14} className="text-[#18476A]" /> Select Role
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                {roles.length} Roles
              </span>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400 italic">
                Loading roles...
              </div>
            ) : (
              <div className="mt-3 space-y-1.5">
                {roles.map((role) => {
                  const isSelected = role._id === selectedRoleId;
                  return (
                    <button
                      key={role._id}
                      onClick={() => handleSelectRole(role)}
                      className={`group flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left transition-all ${
                        isSelected
                          ? "bg-[#18476A] text-white shadow-md shadow-[#18476A]/20"
                          : "bg-slate-50/70 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <div>
                        <p className="text-xs font-bold flex items-center gap-1.5">
                          <ShieldCheck size={14} className={isSelected ? "text-blue-300" : "text-slate-400"} />
                          {role.role}
                        </p>
                        <p className={`text-[10px] mt-0.5 ${isSelected ? "text-white/70" : "text-slate-400"}`}>
                          {role.members ?? 1} member(s) • {role.status}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-9 space-y-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search modules..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 py-2 text-xs outline-none focus:border-[#6fa6c4] focus:bg-white transition"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">Quick Column Toggle:</span>
              {ACTION_COLUMNS.map((col) => (
                <button
                  key={col.key}
                  onClick={() => toggleColumnAction(col.key)}
                  className="px-2.5 py-1 text-[10px] font-bold rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                >
                  {col.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3.5 px-5 whitespace-nowrap">Sidebar Module / Feature</th>
                    {ACTION_COLUMNS.map((col) => {
                      const Icon = col.icon;
                      return (
                        <th key={col.key} className="py-3.5 px-4 text-center min-w-[100px] whitespace-nowrap">
                          <div className="inline-flex items-center gap-1 justify-center">
                            <Icon size={13} className="text-slate-400" />
                            <span>{col.label}</span>
                          </div>
                        </th>
                      );
                    })}
                    <th className="py-3.5 px-4 text-center whitespace-nowrap">Row Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredModules.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400 italic">
                        No sidebar modules match search.
                      </td>
                    </tr>
                  ) : (
                    filteredModules.map((mod) => {
                      const Icon = mod.icon;
                      const modPerms = permissionsState[mod.name] ?? {
                        view: false,
                        add: false,
                        update: false,
                        delete: false,
                        export: false,
                      };
                      const allChecked = Object.values(modPerms).every(Boolean);
                      const someChecked = Object.values(modPerms).some(Boolean);

                      return (
                        <tr key={mod.name} className="hover:bg-slate-50/60 transition">
                          <td className="py-4 px-5">
                            <div className="flex items-center gap-3">
                              <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-[#18476A]">
                                <Icon size={18} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-800">{mod.name}</span>
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-500">
                                    {mod.category}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-0.5">{mod.description}</p>
                              </div>
                            </div>
                          </td>

                          {ACTION_COLUMNS.map((col) => {
                            const isChecked = Boolean(modPerms[col.key]);
                            return (
                              <td key={col.key} className="py-4 px-4 text-center">
                                <label className="inline-flex items-center justify-center cursor-pointer p-1.5 rounded-lg hover:bg-slate-100 transition">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => togglePermission(mod.name, col.key)}
                                    className="sr-only"
                                  />
                                  <div
                                    className={`h-5 w-5 rounded-md border flex items-center justify-center transition ${
                                      isChecked
                                        ? "bg-[#18476A] border-[#18476A] text-white shadow-sm"
                                        : "border-slate-300 bg-white text-transparent hover:border-slate-400"
                                    }`}
                                  >
                                    <CheckCircle2 size={13} className={isChecked ? "opacity-100" : "opacity-0"} />
                                  </div>
                                </label>
                              </td>
                            );
                          })}

                          <td className="py-4 px-4 text-center">
                            <button
                              onClick={() => toggleAllModuleActions(mod.name)}
                              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition ${
                                allChecked
                                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                  : someChecked
                                  ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}
                            >
                              {allChecked ? "All On" : someChecked ? "Partial" : "Enable All"}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PermissionsPage() {
  return (
    <AppLayout>
      <PermissionsContent />
    </AppLayout>
  );
}
