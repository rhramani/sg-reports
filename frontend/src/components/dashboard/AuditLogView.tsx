import { useEffect, useState, useMemo } from "react";
import {
  Activity,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  FileBarChart,
  FileSpreadsheet,
  Filter,
  Info,
  Lock,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { authFetch, getAuthUser } from "@/lib/apiClient";
import type { AuditLogItem, AuditLogMetrics, AuditLogResponse } from "@shared/api";

const MODULE_OPTIONS = [
  "All",
  "Dashboard",
  "Reports",
  "Approvals",
  "Users",
  "Roles",
  "Permissions",
  "Report types",
  "Auth",
];

const ACTION_OPTIONS = [
  "All",
  "View",
  "Add",
  "Update",
  "Delete",
  "Export",
  "Login",
  "Logout",
];

const ROLE_OPTIONS = [
  "All",
  "Super Admin",
  "Administrator",
  "Report Analyst",
  "Audit Supervisor",
  "Viewer",
];

const DATE_RANGE_OPTIONS = [
  { label: "All Time", value: "all" },
  { label: "Today", value: "today" },
  { label: "Last 7 Days", value: "7days" },
  { label: "Last 30 Days", value: "30days" },
];

export function AuditLogView() {
  const user = getAuthUser();
  const isSuperAdmin = user?.role === "Super Admin";

  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [metrics, setMetrics] = useState<AuditLogMetrics>({
    totalLogs: 0,
    activeUsersToday: 0,
    topModule: "None",
    securityEvents: 0,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Filters state
  const [search, setSearch] = useState("");
  const [selectedModule, setSelectedModule] = useState("All");
  const [selectedAction, setSelectedAction] = useState("All");
  const [selectedRole, setSelectedRole] = useState("All");
  const [selectedDateRange, setSelectedDateRange] = useState("all");

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Detail Modal state
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  // Calculate start date string based on quick range selector
  const startDateFilter = useMemo(() => {
    if (selectedDateRange === "today") {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    if (selectedDateRange === "7days") {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return d.toISOString();
    }
    if (selectedDateRange === "30days") {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d.toISOString();
    }
    return "";
  }, [selectedDateRange]);

  const fetchLogs = () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    setError("");

    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (selectedModule !== "All") params.set("module", selectedModule);
    if (selectedAction !== "All") params.set("action", selectedAction);
    if (selectedRole !== "All") params.set("role", selectedRole);
    if (startDateFilter) params.set("startDate", startDateFilter);
    params.set("page", String(page));
    params.set("limit", "15");

    authFetch(`/api/audit-logs?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP error ${res.status}`);
        }
        return res.json() as Promise<AuditLogResponse>;
      })
      .then((data) => {
        if (data && data.success) {
          setLogs(data.data || []);
          setTotalCount(data.total || 0);
          setTotalPages(data.pages || 1);
          if (data.metrics) {
            setMetrics(data.metrics);
          }
        } else {
          setError(data.error || "Failed to load audit log.");
        }
      })
      .catch((err) => {
        setError(err.message || "Failed to fetch audit log entries.");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchLogs();
  }, [search, selectedModule, selectedAction, selectedRole, selectedDateRange, page]);

  const handleResetFilters = () => {
    setSearch("");
    setSelectedModule("All");
    setSelectedAction("All");
    setSelectedRole("All");
    setSelectedDateRange("all");
    setPage(1);
  };

  // Helper for formatting time ago
  const formatTimeAgo = (isoString: string) => {
    try {
      const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
      if (diff < 60) return "Just now";
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return `${Math.floor(diff / 86400)}d ago`;
    } catch {
      return "";
    }
  };

  // Helper for action badge colors & icons
  const renderActionBadge = (action: string) => {
    switch (action) {
      case "Add":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
            <Plus className="h-3 w-3" /> Add
          </span>
        );
      case "Update":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-400 border border-amber-500/20">
            <RefreshCw className="h-3 w-3" /> Update
          </span>
        );
      case "Delete":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-400 border border-rose-500/20">
            <Trash2 className="h-3 w-3" /> Delete
          </span>
        );
      case "View":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-400 border border-sky-500/20">
            <Eye className="h-3 w-3" /> View
          </span>
        );
      case "Export":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2.5 py-1 text-xs font-semibold text-purple-400 border border-purple-500/20">
            <Download className="h-3 w-3" /> Export
          </span>
        );
      case "Login":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-400 border border-cyan-500/20">
            <LogIn className="h-3 w-3" /> Login
          </span>
        );
      case "Logout":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/10 px-2.5 py-1 text-xs font-semibold text-zinc-300 border border-zinc-500/20">
            <LogOut className="h-3 w-3" /> Logout
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2.5 py-1 text-xs font-semibold text-slate-300 border border-slate-500/20">
            {action}
          </span>
        );
    }
  };

  // Helper for role badge colors
  const renderRoleBadge = (role: string) => {
    const isSuper = role === "Super Admin";
    const isAdmin = role === "Administrator";
    const isSupervisor = role.includes("Supervisor");
    const isAnalyst = role.includes("Analyst");

    let style = "bg-slate-500/10 text-slate-300 border-slate-500/20";
    if (isSuper) style = "bg-purple-500/15 text-purple-300 border-purple-500/30";
    else if (isAdmin) style = "bg-blue-500/15 text-blue-300 border-blue-500/30";
    else if (isSupervisor) style = "bg-amber-500/15 text-amber-300 border-amber-500/30";
    else if (isAnalyst) style = "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";

    return (
      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium border ${style}`}>
        {isSuper && <ShieldCheck className="h-3 w-3 text-purple-400" />}
        {role}
      </span>
    );
  };

  // Render Access Restriction UI if user is not Super Admin
  if (!isSuperAdmin) {
    return (
      <div className="mx-auto max-w-4xl py-12 px-4">
        <div className="rounded-2xl border border-rose-500/20 bg-gradient-to-b from-rose-950/20 to-slate-900/60 p-8 text-center shadow-2xl backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-slate-100">Super Admin Access Required</h2>
          <p className="mt-2 text-sm text-slate-400 max-w-md mx-auto">
            The Activity Log (Audit Log) contains workspace-wide security telemetry, user action trails, and system access records.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-lg bg-rose-500/10 px-4 py-2 text-xs font-medium text-rose-300 border border-rose-500/20">
            <Lock className="h-4 w-4" /> Restricted to Super Admin Role Only
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tracking-wider text-purple-400 uppercase">
              SECURITY & COMPLIANCE AUDIT
            </span>
            <span className="rounded-full bg-purple-500/10 px-2.5 py-0.5 text-xs font-medium text-purple-300 border border-purple-500/20">
              Live Dynamic Log
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Activity Log (Audit Log)
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Track, filter, and inspect user activity across every page and module in real time.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 shadow-sm border border-slate-700 hover:bg-slate-700 hover:text-white transition-all disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-purple-400" : ""}`} />
          Refresh Stream
        </button>
      </div>

      {/* ── Summary Metrics Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Activities</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Activity className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{metrics.totalLogs.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate-500">Recorded system events</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Active Users Today</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <UserCheck className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{metrics.activeUsersToday}</p>
          <p className="mt-1 text-xs text-slate-500">Unique active accounts today</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Top Active Module</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <FileBarChart className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-white truncate">{metrics.topModule}</p>
          <p className="mt-1 text-xs text-slate-500">Highest activity frequency</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Auth & Security Events</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{metrics.securityEvents}</p>
          <p className="mt-1 text-xs text-slate-500">Logins and Logout sessions</p>
        </div>
      </div>

      {/* ── Filter & Search Toolbar ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg backdrop-blur-xl space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* Real-time search */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search user name, email, module, record, IP address..."
              className="w-full rounded-xl border border-slate-800 bg-slate-950/80 pl-10 pr-9 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-purple-500/50 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Quick Date Range Selector */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
            <select
              value={selectedDateRange}
              onChange={(e) => {
                setSelectedDateRange(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-200 focus:border-purple-500/50 focus:outline-none"
            >
              {DATE_RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Dropdown Filters row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-2 border-t border-slate-800/80">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Module / Page</label>
            <select
              value={selectedModule}
              onChange={(e) => {
                setSelectedModule(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-sm text-slate-200 focus:border-purple-500/50 focus:outline-none"
            >
              {MODULE_OPTIONS.map((mod) => (
                <option key={mod} value={mod}>
                  {mod === "All" ? "All Modules" : mod}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Action Performed</label>
            <select
              value={selectedAction}
              onChange={(e) => {
                setSelectedAction(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-sm text-slate-200 focus:border-purple-500/50 focus:outline-none"
            >
              {ACTION_OPTIONS.map((act) => (
                <option key={act} value={act}>
                  {act === "All" ? "All Actions" : act}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">User Role</label>
            <select
              value={selectedRole}
              onChange={(e) => {
                setSelectedRole(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-sm text-slate-200 focus:border-purple-500/50 focus:outline-none"
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {role === "All" ? "All Roles" : role}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Active Filter Indicators & Clear button */}
        {(search || selectedModule !== "All" || selectedAction !== "All" || selectedRole !== "All" || selectedDateRange !== "all") && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Active Filters:</span>
              {search && <span className="rounded bg-slate-800 px-2 py-0.5 text-purple-300">"{search}"</span>}
              {selectedModule !== "All" && <span className="rounded bg-slate-800 px-2 py-0.5 text-purple-300">Module: {selectedModule}</span>}
              {selectedAction !== "All" && <span className="rounded bg-slate-800 px-2 py-0.5 text-purple-300">Action: {selectedAction}</span>}
              {selectedRole !== "All" && <span className="rounded bg-slate-800 px-2 py-0.5 text-purple-300">Role: {selectedRole}</span>}
              {selectedDateRange !== "all" && <span className="rounded bg-slate-800 px-2 py-0.5 text-purple-300">Date: {selectedDateRange}</span>}
            </div>
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 text-xs font-medium text-rose-400 hover:text-rose-300 transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          ⚠️ {error}
        </div>
      )}

      {/* ── Activity Table ─────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/80 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th scope="col" className="px-6 py-4">User</th>
                <th scope="col" className="px-6 py-4">Role</th>
                <th scope="col" className="px-6 py-4">Module</th>
                <th scope="col" className="px-6 py-4">Record / Section Affected</th>
                <th scope="col" className="px-6 py-4">Action</th>
                <th scope="col" className="px-6 py-4">Date & Time</th>
                <th scope="col" className="px-6 py-4">IP Address</th>
                <th scope="col" className="px-4 py-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    <RefreshCw className="mx-auto h-6 w-6 animate-spin text-purple-400 mb-2" />
                    Loading activity stream...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    <Filter className="mx-auto h-8 w-8 text-slate-600 mb-2" />
                    No matching activity logs found. Try adjusting your filters.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const userInitials = (log.userName || "U")
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .substring(0, 2)
                    .toUpperCase();

                  return (
                    <tr
                      key={log.id || log._id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* User */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 font-bold text-xs text-white shadow-inner">
                            {userInitials}
                          </div>
                          <div>
                            <p className="font-semibold text-white group-hover:text-purple-300 transition-colors">
                              {log.userName}
                            </p>
                            <p className="text-xs text-slate-400">{log.userEmail}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {renderRoleBadge(log.userRole)}
                      </td>

                      {/* Module */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-200">
                          <FileBarChart className="h-4 w-4 text-purple-400" />
                          {log.module}
                        </span>
                      </td>

                      {/* Record / Section */}
                      <td className="px-6 py-4 max-w-xs truncate font-medium text-slate-100">
                        {log.section || "—"}
                      </td>

                      {/* Action */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {renderActionBadge(log.action)}
                      </td>

                      {/* Timestamp */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <p className="text-xs font-medium text-slate-200">
                            {new Date(log.timestamp).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {formatTimeAgo(log.timestamp)}
                          </p>
                        </div>
                      </td>

                      {/* IP Address */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-mono text-xs text-slate-400 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                          {log.ipAddress || "127.0.0.1"}
                        </span>
                      </td>

                      {/* Details button */}
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 px-2.5 py-1 rounded-lg border border-purple-500/20 transition-all"
                        >
                          <Info className="h-3.5 w-3.5" /> Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination Footer ────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-6 py-4 bg-slate-950/80 border-t border-slate-800 text-xs text-slate-400">
          <div>
            Showing <span className="font-semibold text-slate-200">{logs.length > 0 ? (page - 1) * 15 + 1 : 0}</span> to{" "}
            <span className="font-semibold text-slate-200">{Math.min(page * 15, totalCount)}</span> of{" "}
            <span className="font-semibold text-slate-200">{totalCount}</span> activity records
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 font-medium text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40 transition-all"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>

            <span className="px-2 font-medium text-slate-300">
              Page {page} of {totalPages}
            </span>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 font-medium text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40 transition-all"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Log Details Modal ────────────────────────────────────────────── */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-purple-400" />
                <h3 className="text-lg font-bold text-white">Audit Log Telemetry Record</h3>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500 uppercase">User Name</span>
                <p className="font-medium text-white">{selectedLog.userName}</p>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500 uppercase">User Email</span>
                <p className="font-medium text-slate-300">{selectedLog.userEmail}</p>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500 uppercase">Role</span>
                <div>{renderRoleBadge(selectedLog.userRole)}</div>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500 uppercase">Module / Page</span>
                <p className="font-medium text-purple-300">{selectedLog.module}</p>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500 uppercase">Action</span>
                <div>{renderActionBadge(selectedLog.action)}</div>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500 uppercase">IP Address</span>
                <p className="font-mono text-xs text-slate-300">{selectedLog.ipAddress || "127.0.0.1"}</p>
              </div>

              <div className="col-span-2 space-y-1">
                <span className="text-xs font-semibold text-slate-500 uppercase">Section / Record Affected</span>
                <p className="font-medium text-white bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  {selectedLog.section}
                </p>
              </div>

              <div className="col-span-2 space-y-1">
                <span className="text-xs font-semibold text-slate-500 uppercase">Date & Exact Timestamp</span>
                <p className="font-mono text-xs text-slate-300 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  {new Date(selectedLog.timestamp).toUTCString()} ({selectedLog.timestamp})
                </p>
              </div>

              {selectedLog.details && (
                <div className="col-span-2 space-y-1">
                  <span className="text-xs font-semibold text-slate-500 uppercase">Additional Context / Details</span>
                  <pre className="font-mono text-xs text-purple-200 bg-slate-950 p-3 rounded-lg border border-slate-800 overflow-x-auto whitespace-pre-wrap">
                    {selectedLog.details}
                  </pre>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="rounded-xl bg-slate-800 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
              >
                Close Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
