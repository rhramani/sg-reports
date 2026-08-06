import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileBarChart,
  FileSpreadsheet,
  LayoutDashboard,
  Menu,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Settings2,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  ToggleLeft,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { DynamicReportViewer } from "@/components/dashboard/DynamicReportViewer";
import { PermissionsView } from "@/components/dashboard/PermissionsView";
import { AuditLogView } from "@/components/dashboard/AuditLogView";
import { ProfileView } from "@/components/profile/ProfileView";
import { SGReportLogo } from "@/components/SGReportLogo";
import { authFetch, getAuthUser, clearAuthSession } from "@/lib/apiClient";
import type { PermissionActions } from "@shared/api";

const navGroups = [
  {
    label: "Main menu",
    items: [
      { label: "Dashboard", icon: LayoutDashboard },
      { label: "Reports", icon: FileBarChart },
      { label: "Approvals", icon: ClipboardCheck },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users", icon: Users },
      { label: "Roles", icon: Shield },
      { label: "Permissions", icon: ShieldCheck },
      { label: "Report types", icon: FileSpreadsheet },
    ],
  },
];

const moduleConfig: Record<
  string,
  {
    eyebrow: string;
    description: string;
    action: string;
    icon: LucideIcon;
    endpoint: string;
    columns: string[];
  }
> = {
  Reports: {
    eyebrow: "REPORT OPERATIONS",
    description: "Upload, review, and export dynamic reports with automatically detected columns.",
    action: "Upload report",
    icon: FileBarChart,
    endpoint: "/api/reports",
    columns: ["Report name", "Type", "Owner", "Records", "Status"],
  },
  Approvals: {
    eyebrow: "WORKFLOW CONTROL",
    description: "Review report rows waiting for approval and keep a complete audit trail.",
    action: "Review queue",
    icon: ClipboardCheck,
    endpoint: "/api/approvals",
    columns: ["Report", "Submitted by", "Submitted", "Priority", "Status"],
  },
  Users: {
    eyebrow: "ACCESS DIRECTORY",
    description: "Manage workspace members, account status, and assigned roles.",
    action: "Create user",
    icon: Users,
    endpoint: "/api/users",
    columns: ["User", "Email", "Role", "Last active", "Status"],
  },
  Roles: {
    eyebrow: "ROLE MANAGEMENT",
    description: "Define workspace roles, member counts, and active status.",
    action: "Create role",
    icon: Shield,
    endpoint: "/api/roles",
    columns: ["Role", "Members", "Created", "Status"],
  },
  Permissions: {
    eyebrow: "DYNAMIC ACCESS MATRIX",
    description: "Configure dynamic action-level access across all sidebar modules for any workspace role.",
    action: "Manage permissions",
    icon: ShieldCheck,
    endpoint: "/api/roles",
    columns: [],
  },
  "Report types": {
    eyebrow: "REPORT CATALOG",
    description: "Report categories are automatically created and kept in sync with uploaded reports.",
    action: "Add report type",
    icon: FileSpreadsheet,
    endpoint: "/api/report-types",
    columns: ["Name", "Code", "Reports", "Last updated", "Status"],
  },
};

// ── Per-module field labels & placeholder helpers ──────────────────────────
function getEditFields(module: string) {
  switch (module) {
    case "Reports":
      return [
        { key: "name", label: "Report name", placeholder: "e.g. Q4 Financial Audit", type: "text" },
        { key: "type", label: "Report type", placeholder: "e.g. Financial Report", type: "text" },
        { key: "owner", label: "Owner", placeholder: "e.g. Sarah Jenkins", type: "text" },
      ];
    case "Users":
      return [
        { key: "name", label: "Full name", placeholder: "e.g. Sarah Jenkins", type: "text" },
        { key: "email", label: "Work email", placeholder: "sarah@company.com", type: "email" },
      ];
    case "Roles":
      return [
        { key: "role", label: "Role name", placeholder: "e.g. Audit Supervisor", type: "text" },
      ];
    case "Report types":
      return [
        { key: "name", label: "Type name", placeholder: "e.g. Financial Report", type: "text" },
        { key: "code", label: "Code", placeholder: "e.g. FIN_REPORT", type: "text" },
      ];
    case "Approvals":
      return [
        { key: "report", label: "Report name", placeholder: "e.g. Q2 Sales", type: "text" },
        { key: "submittedBy", label: "Submitted by", placeholder: "e.g. Admin", type: "text" },
      ];
    default:
      return [];
  }
}

function getEditUrl(module: string, id: string) {
  if (module === "Reports") return `/api/reports/${id}`;
  if (module === "Users") return `/api/users/${id}`;
  if (module === "Roles") return `/api/roles/${id}`;
  if (module === "Report types") return `/api/report-types/${id}`;
  if (module === "Approvals") return `/api/approvals/${id}`;
  return "";
}

function getStatusUrl(module: string, id: string) {
  if (module === "Reports") return `/api/reports/${id}/status`;
  if (module === "Users") return `/api/users/${id}/status`;
  if (module === "Roles") return `/api/roles/${id}/status`;
  if (module === "Report types") return `/api/report-types/${id}/status`;
  if (module === "Approvals") return `/api/approvals/${id}`; // PATCH same url
  return "";
}

function getStatusCycle(module: string, currentStatus: string): string {
  if (module === "Approvals" || module === "Reports") {
    const cycle: Record<string, string> = { Pending: "Review", Review: "Approved", Approved: "Pending" };
    return cycle[currentStatus] ?? "Pending";
  }
  return currentStatus === "Active" ? "Inactive" : "Active";
}

function ModulePage({
  module,
  query,
  setQuery,
  permissions = { view: true, add: true, update: true, delete: true, export: true },
}: {
  module: string;
  query: string;
  setQuery: (value: string) => void;
  permissions?: PermissionActions;
}) {
  const config = moduleConfig[module] ?? moduleConfig.Reports;
  const Icon = config.icon;

  // ── Create modal state ─────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [itemName, setItemName] = useState("");
  const [itemDetail, setItemDetail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState("");
  const [showUserPassword, setShowUserPassword] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  // ── Dynamic roles fetched from backend ─────────────────────────────────────
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  // ── Table data — rows + their MongoDB _ids ─────────────────────────────────
  const [rows, setRows] = useState<string[][]>([]);
  const [rowIds, setRowIds] = useState<string[]>([]);

  // ── Edit modal state ───────────────────────────────────────────────────────
  const [showEdit, setShowEdit] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [editRole, setEditRole] = useState("");
  const [editError, setEditError] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // ── Delete confirm state ───────────────────────────────────────────────────
  const [showDelete, setShowDelete] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [notice, setNotice] = useState("");
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside or scrolling
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuIndex(null);
        setMenuPos(null);
      }
    };
    const closeOnScroll = () => { setOpenMenuIndex(null); setMenuPos(null); };
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnScroll);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnScroll);
    };
  }, []);

  // ── Fetch roles from /api/roles for dropdowns dynamically ──────────────────
  const fetchDynamicRoles = () => {
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
          setUserRole((prev) => (prev && names.includes(prev) ? prev : names[0]));
        }
      })
      .catch(() => {})
      .finally(() => setRolesLoading(false));
  };

  useEffect(() => {
    fetchDynamicRoles();
  }, []);

  const fetchModuleData = () => {
    authFetch(config.endpoint)
      .then(async (res) => {
        const type = res.headers.get("content-type");
        if (res.ok && type && type.includes("application/json")) {
          return res.json();
        }
        return null;
      })
      .then((res) => {
        if (res && res.success && Array.isArray(res.data)) {
          let mappedRows: string[][] = [];
          const ids: string[] = [];
          if (module === "Reports") {
            res.data.forEach((item: Record<string, string | number>) => {
              ids.push(String(item._id ?? item.reportId ?? ""));
              mappedRows.push([
                String(item.name ?? ""),
                String(item.type ?? ""),
                String(item.owner ?? ""),
                String(item.rowsCount ?? 0),
                String(item.status ?? "Pending"),
              ]);
            });
          } else if (module === "Approvals") {
            res.data.forEach((item: Record<string, string>) => {
              ids.push(item._id ?? "");
              mappedRows.push([
                item.report,
                item.submittedBy,
                item.submitted ?? "",
                item.priority,
                item.status,
              ]);
            });
          } else if (module === "Users") {
            res.data.forEach((item: Record<string, string>) => {
              ids.push(item._id ?? "");
              mappedRows.push([
                item.name,
                item.email,
                item.role,
                item.lastActive,
                item.status,
              ]);
            });
          } else if (module === "Roles") {
            res.data.forEach((item: Record<string, string | number>) => {
              ids.push(String(item._id ?? ""));
              mappedRows.push([
                String(item.role),
                String(item.members ?? 1),
                String(item.created ?? "Today"),
                String(item.status ?? "Active"),
              ]);
            });
          } else if (module === "Report types") {
            res.data.forEach((item: Record<string, string | number>) => {
              ids.push(String(item._id ?? ""));
              mappedRows.push([
                String(item.name),
                String(item.code),
                String(item.reports),
                String(item.lastUpdated),
                String(item.status),
              ]);
            });
          }
          setRows(mappedRows);
          setRowIds(ids);
        }
      })
      .catch((err) => console.warn(`Failed to fetch data for ${module}:`, err));
  };

  useEffect(() => {
    fetchModuleData();
  }, [module]);

  // filtered rows + their corresponding IDs
  const filteredPairs = rows
    .map((row, i) => ({ row, id: rowIds[i] ?? "" }))
    .filter(({ row }) => row.join(" ").toLowerCase().includes(query.toLowerCase()));
  const filteredRows = filteredPairs.map((p) => p.row);
  const filteredIds = filteredPairs.map((p) => p.id);

  const resetModal = () => {
    setItemName("");
    setItemDetail("");
    setUserPassword("");
    setUserRole(availableRoles[0] ?? "");
    setShowUserPassword(false);
    setCreateError("");
    setCreateLoading(false);
    setShowCreate(false);
  };

  const trigger = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  };

  // ── Open edit modal pre-filled ─────────────────────────────────────────────
  const openEdit = (index: number) => {
    const row = filteredRows[index];
    if (!row) return;
    setEditIndex(index);
    setEditError("");

    if (module === "Users") {
      setEditFields({ name: row[0], email: row[1] });
      setEditRole(row[2]);
    } else if (module === "Reports") {
      setEditFields({ name: row[0], type: row[1], owner: row[2] });
    } else if (module === "Roles") {
      setEditFields({ role: row[0] });
    } else if (module === "Report types") {
      setEditFields({ name: row[0], code: row[1] });
    } else if (module === "Approvals") {
      setEditFields({ report: row[0], submittedBy: row[1] });
    }
    setShowEdit(true);
    setOpenMenuIndex(null);
    setMenuPos(null);
  };

  // ── Save edit ──────────────────────────────────────────────────────────────
  const handleSaveEdit = async () => {
    if (editIndex === null) return;
    const id = filteredIds[editIndex];
    if (!id) { trigger("Record ID missing — cannot update."); return; }

    setEditError("");
    setEditLoading(true);
    try {
      let body: Record<string, unknown> = { ...editFields };
      if (module === "Users") body.role = editRole;

      const res = await authFetch(getEditUrl(module, id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        trigger(data.message || "Updated successfully.");
        setShowEdit(false);
        fetchModuleData();
        if (module === "Roles") fetchDynamicRoles();
      } else {
        setEditError(data.error || "Update failed.");
      }
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setEditLoading(false);
    }
  };

  // ── Toggle status ──────────────────────────────────────────────────────────
  const handleToggleStatus = async (index: number) => {
    const id = filteredIds[index];
    const currentStatus = filteredRows[index]?.[filteredRows[index].length - 1] ?? "Active";
    const newStatus = getStatusCycle(module, currentStatus);
    if (!id) { trigger("Record ID missing — cannot toggle status."); return; }
    setOpenMenuIndex(null);
    setMenuPos(null);
    try {
      const res = await authFetch(getStatusUrl(module, id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        trigger(data.message || `Status updated to ${newStatus}.`);
        fetchModuleData();
        if (module === "Roles") fetchDynamicRoles();
      } else {
        trigger(data.error || "Status toggle failed.");
      }
    } catch (err) {
      trigger(err instanceof Error ? err.message : "Status toggle failed.");
    }
  };

  // ── Confirm + execute delete ───────────────────────────────────────────────
  const handleDelete = async () => {
    if (deleteIndex === null) return;
    const id = filteredIds[deleteIndex];
    if (!id) { trigger("Record ID missing — cannot delete."); setShowDelete(false); return; }

    setDeleteLoading(true);
    try {
      const res = await authFetch(getEditUrl(module, id), {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        trigger(data.message || "Deleted successfully.");
        setShowDelete(false);
        fetchModuleData();
        if (module === "Roles") fetchDynamicRoles();
      } else {
        trigger(data.error || "Delete failed.");
        setShowDelete(false);
      }
    } catch (err) {
      trigger(err instanceof Error ? err.message : "Delete failed.");
      setShowDelete(false);
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Save handler: Users use dedicated /api/users/create endpoint ──────────
  const handleSaveNewItem = async () => {
    setCreateError("");

    if (module === "Users") {
      // Validate
      if (!itemName.trim()) { setCreateError("Full name is required."); return; }
      if (!itemDetail.trim()) { setCreateError("Email address is required."); return; }
      if (!userPassword.trim()) { setCreateError("Password is required."); return; }
      if (userPassword.trim().length < 6) { setCreateError("Password must be at least 6 characters."); return; }

      setCreateLoading(true);
      try {
        const res = await authFetch("/api/users/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: itemName.trim(),
            email: itemDetail.trim(),
            password: userPassword.trim(),
            role: userRole,
          }),
        });
        const data = await res.json();
        if (data.success) {
          trigger(data.message || `User "${itemName}" created successfully.`);
          resetModal();
          fetchModuleData();
        } else {
          setCreateError(data.error || "Failed to create user.");
        }
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : "Failed to create user.");
      } finally {
        setCreateLoading(false);
      }
      return;
    }

    // ── All other modules ─────────────────────────────────────────────────────
    if (!itemName.trim()) {
      trigger("Name or identifier is required");
      return;
    }

    try {
      let postUrl = config.endpoint;
      let bodyData: Record<string, unknown> = {};

      if (module === "Roles") {
        postUrl = "/api/roles";
        bodyData = { role: itemName.trim() };
      } else if (module === "Report types") {
        postUrl = "/api/report-types";
        bodyData = { name: itemName.trim(), code: itemDetail.trim() || itemName.toUpperCase().replace(/\s+/g, "_") };
      } else if (module === "Approvals") {
        postUrl = "/api/approvals";
        bodyData = { report: itemName.trim(), submittedBy: "Admin", priority: "Medium" };
      } else if (module === "Reports") {
        postUrl = "/api/reports";
        bodyData = { name: itemName.trim(), type: itemName.trim(), owner: "Admin" };
      }

      const res = await authFetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });

      if (res.status === 403) {
        const errData = await res.json();
        trigger(errData.error || "Access denied. Insufficient permissions.");
        return;
      }

      const data = await res.json();
      if (data.success) {
        trigger(data.message || `${module} item created successfully`);
        setItemName("");
        setItemDetail("");
        setShowCreate(false);
        fetchModuleData();
        if (module === "Roles") fetchDynamicRoles();
      } else {
        trigger(data.error || `${module} operation failed`);
      }
    } catch (err) {
      trigger(err instanceof Error ? err.message : `${module} operation failed`);
      setShowCreate(false);
    }
  };

  const hasRowActions = permissions.update || permissions.delete;

  const isAdminModule = ["Users", "Roles", "Permissions", "Activity Log", "Report types"].includes(module);
  const categoryLabel = isAdminModule ? "Administration" : "Main menu";

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 lg:px-10">
      <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
            <span>{categoryLabel}</span>
            <ChevronRight size={12} />
            <span className="text-slate-600">{module}</span>
          </div>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-950">{module}</h1>
        </div>
        {permissions.add && (
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#18476A] px-4 text-sm font-semibold text-white shadow-lg shadow-[#18476A]/20 transition hover:bg-[#18476A]"
          >
            <Plus size={17} />
            {config.action}
          </button>
        )}
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          [Icon, `Total ${module.toLowerCase()}`, String(rows.length), "bg-[#eef6fa] text-[#18476A]"],
          [Check, "Active / completed", String(rows.filter((r) => r[r.length - 1] === "Active" || r[r.length - 1] === "Approved").length), "bg-emerald-50 text-emerald-600"],
          [Clock3, "Needs attention", String(rows.filter((r) => r[r.length - 1] === "Pending" || r[r.length - 1] === "Review").length), "bg-amber-50 text-amber-600"],
        ].map(([MetricIcon, label, value, tone]) => {
          const LucideMetricIcon = MetricIcon as typeof Icon;
          return (
            <div key={label as string} className="rounded-2xl border border-slate-200/80 bg-white p-5">
              <div className={`grid h-10 w-10 place-items-center rounded-xl ${tone as string}`}>
                <LucideMetricIcon size={19} />
              </div>
              <p className="mt-4 text-xs font-medium text-slate-500">{label as string}</p>
              <p className="mt-1 text-2xl font-bold">{value as string}</p>
            </div>
          );
        })}
      </div>
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_3px_15px_rgba(28,25,64,0.03)]">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:p-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{module} directory</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${module.toLowerCase()}...`}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-[#8fc3e0] focus:ring-2 focus:ring-[#dbeaf2] sm:w-56"
              />
            </div>
            <button
              onClick={() => trigger("Filters applied")}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <SlidersHorizontal size={14} />
              Filters
            </button>
            {permissions.export && (
              <button
                onClick={() => {
                  if (filteredRows.length === 0) {
                    trigger("No data available to export");
                    return;
                  }
                  const header = config.columns.join(",");
                  const body = filteredRows
                    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
                    .join("\n");
                  const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const anchor = document.createElement("a");
                  anchor.href = url;
                  anchor.download = `sg-report-${module.toLowerCase().replace(/\s+/g, "-")}.csv`;
                  anchor.click();
                  URL.revokeObjectURL(url);
                  trigger(`Exported ${filteredRows.length} records to CSV`);
                  authFetch("/api/audit-logs", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      module,
                      section: `${module} List`,
                      action: "Export",
                      details: `Exported ${filteredRows.length} records to CSV format`,
                    }),
                  }).catch(() => {});
                }}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <Download size={14} />
                Export
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                <th className="px-6 py-3.5">#</th>
                {config.columns.map((column) => (
                  <th key={column} className="py-3.5">
                    {column}
                  </th>
                ))}
                {hasRowActions && <th className="px-6 py-3.5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => (
                <tr
                  key={`${row[0]}-${index}`}
                  className="group border-b border-slate-50 hover:bg-[#eef6fa]/30"
                >
                  <td className="px-6 py-4 text-xs text-slate-400">
                    {String(index + 1).padStart(2, "0")}
                  </td>
                  {row.map((value, valueIndex) => (
                    <td key={`${value}-${valueIndex}`} className="py-4 text-xs font-medium text-slate-600">
                      {valueIndex === row.length - 1 ? (
                        <StatusBadge
                          status={value}
                          color={
                            value === "Pending" || value === "Inactive"
                              ? "amber"
                              : value === "Review"
                              ? "blue"
                              : "emerald"
                          }
                        />
                      ) : (
                        value
                      )}
                    </td>
                  ))}
                  {hasRowActions && (
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={(e) => {
                          if (openMenuIndex === index) {
                            setOpenMenuIndex(null);
                            setMenuPos(null);
                          } else {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setMenuPos({
                              top: rect.bottom + 6,
                              right: window.innerWidth - rect.right,
                            });
                            setOpenMenuIndex(index);
                          }
                        }}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                        title="Row actions"
                      >
                        <MoreVertical size={17} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRows.length === 0 && (
            <div className="p-10 text-center text-sm text-slate-400">
              No records match your search.
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3.5">
          <p className="text-[11px] text-slate-400">
            Showing <span className="font-semibold text-slate-600">{filteredRows.length}</span> of{" "}
            {rows.length} records
          </p>
          <button
            onClick={() => trigger("Next page loaded")}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            Next page <ChevronRight size={13} />
          </button>
        </div>
      </div>
      {notice && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-slate-900 px-4 py-3 text-xs font-semibold text-white shadow-xl">
          {notice}
        </div>
      )}

      {/* ── Row action dropdown ── */}
      {openMenuIndex !== null && menuPos && hasRowActions && (
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
          {permissions.update && permissions.delete && (
            <div className="my-1 border-t border-slate-100" />
          )}
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

      {/* ── Edit modal ── */}
      {showEdit && editIndex !== null && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-5 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#18476A]">SG Report workspace</p>
                <h3 className="mt-1 text-lg font-bold flex items-center gap-2">
                  <Pencil size={17} className="text-[#18476A]" />
                  Edit {module === "Roles" ? "role" : module === "Report types" ? "report type" : module.toLowerCase().replace(/ &.*/, "").trim()}
                </h3>
              </div>
              <button onClick={() => setShowEdit(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-3.5">
              {getEditFields(module).map((field) => (
                <div key={field.key}>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">{field.label}</label>
                  <input
                    type={field.type}
                    value={editFields[field.key] ?? ""}
                    onChange={(e) => { setEditFields((p) => ({ ...p, [field.key]: e.target.value })); setEditError(""); }}
                    placeholder={field.placeholder}
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#6fa6c4] focus:ring-2 focus:ring-[#dbeaf2]"
                  />
                </div>
              ))}

              {module === "Users" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Role
                    {rolesLoading && <span className="ml-2 text-[10px] font-normal text-slate-400 italic">Loading…</span>}
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    disabled={rolesLoading}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#6fa6c4] focus:ring-2 focus:ring-[#dbeaf2] disabled:opacity-60"
                  >
                    {availableRoles.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              )}

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
                className="rounded-lg bg-[#18476A] px-5 py-2 text-xs font-semibold text-white hover:bg-[#123955] disabled:opacity-60 disabled:cursor-wait"
              >
                {editLoading ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ── */}
      {showDelete && deleteIndex !== null && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-rose-50">
              <Trash2 size={22} className="text-rose-500" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Confirm deletion</h3>
            <p className="mt-1.5 text-sm text-slate-500">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-slate-800">
                &quot;{filteredRows[deleteIndex]?.[0] ?? "this record"}&quot;
              </span>? This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowDelete(false)}
                disabled={deleteLoading}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="rounded-lg bg-rose-600 px-5 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60 disabled:cursor-wait"
              >
                {deleteLoading ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create User modal (Users module only) ─────────────────────── */}
      {showCreate && module === "Users" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-5 backdrop-blur-sm">
          <div ref={modalRef} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#18476A]">
                  SG Report workspace
                </p>
                <h3 className="mt-1 text-lg font-bold flex items-center gap-2">
                  <UserPlus size={18} className="text-[#18476A]" />
                  Create new user
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">User will be able to log in immediately.</p>
              </div>
              <button onClick={resetModal} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-3.5">
              {/* Full name */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Full name *</label>
                <input
                  value={itemName}
                  onChange={(e) => { setItemName(e.target.value); setCreateError(""); }}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#6fa6c4] focus:ring-2 focus:ring-[#dbeaf2]"
                  placeholder="e.g. Sarah Jenkins"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Work email *</label>
                <input
                  type="email"
                  value={itemDetail}
                  onChange={(e) => { setItemDetail(e.target.value); setCreateError(""); }}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#6fa6c4] focus:ring-2 focus:ring-[#dbeaf2]"
                  placeholder="sarah@company.com"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Password *</label>
                <div className="relative">
                  <input
                    type={showUserPassword ? "text" : "password"}
                    value={userPassword}
                    onChange={(e) => { setUserPassword(e.target.value); setCreateError(""); }}
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 pr-10 text-sm outline-none focus:border-[#6fa6c4] focus:ring-2 focus:ring-[#dbeaf2]"
                    placeholder="min. 6 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowUserPassword(!showUserPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showUserPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Role
                  {rolesLoading && (
                    <span className="ml-2 text-[10px] font-normal text-slate-400 italic">Loading roles…</span>
                  )}
                </label>
                <select
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value)}
                  disabled={rolesLoading}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#6fa6c4] focus:ring-2 focus:ring-[#dbeaf2] disabled:opacity-60 disabled:cursor-wait"
                >
                  {availableRoles.map((roleName) => (
                    <option key={roleName} value={roleName}>{roleName}</option>
                  ))}
                </select>
              </div>

              {/* Error message */}
              {createError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">
                  {createError}
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={resetModal}
                disabled={createLoading}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNewItem}
                disabled={createLoading}
                className="rounded-lg bg-[#18476A] px-5 py-2 text-xs font-semibold text-white hover:bg-[#123955] disabled:opacity-60 disabled:cursor-wait"
              >
                {createLoading ? "Creating..." : "Create user"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Generic create modal (all other modules) ─────────────────── */}
      {showCreate && module !== "Users" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-5">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#18476A]">
                  SG Report workspace
                </p>
                <h3 className="mt-1 text-lg font-bold">{config.action}</h3>
              </div>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-5 space-y-3">
              <label className="block text-xs font-semibold text-slate-600">
                Name / Title
                <input
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#6fa6c4]"
                  placeholder={`Enter ${module.toLowerCase()} name`}
                />
              </label>
              {module !== "Roles" && (
                <label className="block text-xs font-semibold text-slate-600">
                  {module === "Report types" ? "Type Code" : "Detail / Description"}
                  <input
                    value={itemDetail}
                    onChange={(e) => setItemDetail(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#6fa6c4]"
                    placeholder="Enter detail"
                  />
                </label>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNewItem}
                className="rounded-lg bg-[#18476A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#18476A]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Index() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [query, setQuery] = useState("");
  const [notifications, setNotifications] = useState(false);
  const [userPermissions, setUserPermissions] = useState<Record<string, PermissionActions>>({});
  const [currentUser, setCurrentUser] = useState(getAuthUser());
  const [profileTab, setProfileTab] = useState<"details" | "security">("details");

  const currentUserEmail = currentUser?.email || "admin@sgreport.com";
  const userRole = currentUser?.role || "Report Analyst";
  const formattedName = currentUser?.name || (currentUserEmail.split("@")[0] ? currentUserEmail.split("@")[0].charAt(0).toUpperCase() + currentUserEmail.split("@")[0].slice(1) : "User");
  const avatarUrl = currentUser?.avatar || "";

  const refreshUserSession = () => {
    const user = getAuthUser();
    if (user) {
      setCurrentUser(user);
      if (Array.isArray(user.modulePermissions)) {
        const map: Record<string, PermissionActions> = {};
        user.modulePermissions.forEach((mp) => {
          if (mp.module && mp.actions) map[mp.module] = mp.actions;
        });
        setUserPermissions(map);
      }
    }
  };

  useEffect(() => {
    refreshUserSession();

    // Event listener for profile update broadcasts
    const handleProfileUpdated = () => refreshUserSession();
    window.addEventListener("profile-updated", handleProfileUpdated);

    // Refresh active session and live permissions from server
    authFetch("/api/auth/me")
      .then(async (res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((res) => {
        if (res && res.success && res.user) {
          setCurrentUser(res.user);
          if (Array.isArray(res.user.modulePermissions)) {
            const map: Record<string, PermissionActions> = {};
            res.user.modulePermissions.forEach((mp: { module: string; actions: PermissionActions }) => {
              if (mp.module && mp.actions) map[mp.module] = mp.actions;
            });
            setUserPermissions(map);
          }
        }
      })
      .catch(() => {});

    return () => {
      window.removeEventListener("profile-updated", handleProfileUpdated);
    };
  }, []);

  const getPermissionsForModule = (moduleName: string): PermissionActions => {
    if (moduleName === "Profile") {
      return { view: true, add: true, update: true, delete: false, export: false };
    }
    // The "Permissions" and "Activity Log" tabs are strictly restricted to Super Admin only
    if (moduleName === "Permissions" || moduleName === "Activity Log") {
      const isSuper = userRole === "Super Admin";
      return { view: isSuper, add: isSuper, update: isSuper, delete: isSuper, export: isSuper };
    }
    if (userRole === "Super Admin") {
      return { view: true, add: true, update: true, delete: true, export: true };
    }
    if (userPermissions[moduleName]) {
      return userPermissions[moduleName];
    }
    if (moduleName === "Dashboard") {
      return { view: true, add: false, update: false, delete: false, export: false };
    }
    return { view: false, add: false, update: false, delete: false, export: false };
  };

  // ── Auto-track page views in Audit Log ──────────────────────────────────
  useEffect(() => {
    if (activeNav) {
      authFetch("/api/audit-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: activeNav,
          section: `${activeNav} Screen`,
          action: "View",
          details: `Navigated to ${activeNav} module`,
        }),
      }).catch(() => {});
    }
  }, [activeNav]);

  const visibleNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const perms = getPermissionsForModule(item.label);
        return perms.view;
      }),
    }))
    .filter((group) => group.items.length > 0);

  const allPermittedModules = [
    ...visibleNavGroups.flatMap((g) => g.items.map((i) => i.label)),
    ...(getPermissionsForModule("Activity Log").view ? ["Activity Log"] : []),
  ];

  useEffect(() => {
    if (
      allPermittedModules.length > 0 &&
      !allPermittedModules.includes(activeNav) &&
      activeNav !== "Profile" &&
      activeNav !== "Activity Log"
    ) {
      setActiveNav(allPermittedModules[0]);
    }
  }, [userPermissions, activeNav]);

  return (
    <div className="min-h-screen bg-[#f4f7fa] text-slate-900">
      {sidebarOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-[#123955] text-white transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-[84px] items-center justify-between border-b border-white/10 px-5 py-3">
          <div className="flex-1 flex items-center overflow-hidden pr-2">
            <SGReportLogo size="full" variant="light" className="w-full" />
          </div>
          <button
            className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white lg:hidden shrink-0"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-4 pt-7">
          {visibleNavGroups.map((group) => (
            <div key={group.label} className="mb-7">
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items.map(({ label, icon: Icon }) => (
                  <button
                    key={label}
                    onClick={() => {
                      setActiveNav(label);
                      setSidebarOpen(false);
                    }}
                    className={`group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition ${
                      activeNav === label
                        ? "bg-[#18476A] text-white shadow-[inset_3px_0_0_#18476A]"
                        : "text-white/55 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon
                        size={17}
                        className={
                          activeNav === label ? "text-white" : "text-white/40 group-hover:text-white/70"
                        }
                      />
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-auto p-4 border-t border-white/10">
          {getPermissionsForModule("Activity Log").view && (
            <button
              onClick={() => {
                setActiveNav("Activity Log");
                setSidebarOpen(false);
              }}
              className={`group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition ${
                activeNav === "Activity Log"
                  ? "bg-[#18476A] text-white shadow-[inset_3px_0_0_#18476A]"
                  : "text-white/55 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-3">
                <Clock3
                  size={17}
                  className={
                    activeNav === "Activity Log" ? "text-white" : "text-white/40 group-hover:text-white/70"
                  }
                />
                Audit Logs
              </span>
            </button>
          )}
        </div>
      </aside>

      <main className="min-h-screen lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/85 px-5 backdrop-blur-xl sm:px-8 lg:px-10">
          <div className="flex items-center gap-4">
            <button
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => setNotifications(!notifications)}
              className="relative rounded-xl p-2.5 text-slate-500 hover:bg-slate-100"
            >
              <Bell size={19} />
              {notifications && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#18476A] ring-2 ring-white" />
              )}
            </button>
            <div className="hidden h-7 w-px bg-slate-200 sm:block" />
            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 rounded-xl p-1.5 pr-2 hover:bg-slate-50"
              >
                <div className="grid h-8 w-8 place-items-center rounded-full bg-[#18476A] text-xs font-bold text-white overflow-hidden">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={formattedName} className="w-full h-full object-cover" />
                  ) : (
                    formattedName.substring(0, 2).toUpperCase()
                  )}
                </div>
                <span className="hidden text-left sm:block">
                  <span className="block text-xs font-bold text-slate-800">{formattedName}</span>
                  <span className="block text-[10px] text-slate-400">{userRole}</span>
                </span>
                <ChevronDown size={14} className="hidden text-slate-400 sm:block" />
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-12 z-50 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  <button
                    onClick={() => {
                      setProfileTab("details");
                      setActiveNav("Profile");
                      setProfileOpen(false);
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-between"
                  >
                    <span>My profile</span>
                    <span className="text-[10px] text-slate-400 font-mono">({userRole})</span>
                  </button>
                  <button
                    onClick={() => {
                      setProfileTab("security");
                      setActiveNav("Profile");
                      setProfileOpen(false);
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Change password
                  </button>
                  <button
                    onClick={() => {
                      authFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
                      clearAuthSession();
                      navigate("/login", { replace: true });
                    }}
                    className="mt-1 w-full rounded-lg border-t border-slate-100 px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {activeNav === "Dashboard" && <DashboardView />}
        {activeNav === "Reports" && (
          <DynamicReportViewer
            query={query}
            setQuery={setQuery}
            permissions={getPermissionsForModule("Reports")}
          />
        )}
        {activeNav === "Permissions" && <PermissionsView />}
        {activeNav === "Activity Log" && <AuditLogView />}
        {activeNav === "Profile" && (
          <ProfileView initialTab={profileTab} />
        )}
        {activeNav !== "Dashboard" && activeNav !== "Reports" && activeNav !== "Permissions" && activeNav !== "Activity Log" && activeNav !== "Profile" && (
          <ModulePage
            module={activeNav}
            query={query}
            setQuery={setQuery}
            permissions={getPermissionsForModule(activeNav)}
          />
        )}
      </main>
    </div>
  );
}
