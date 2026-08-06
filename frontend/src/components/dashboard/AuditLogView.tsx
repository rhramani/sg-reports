import { useEffect, useState, useMemo } from "react";
import {
  Activity,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  FileBarChart,
  Filter,
  Globe,
  Info,
  Laptop,
  Lock,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import { authFetch, getAuthUser } from "@/lib/apiClient";
import type { AuditSessionLog, AuditLogMetrics, AuditLogResponse, AuditTimelineAction } from "@shared/api";

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

const DATE_RANGE_OPTIONS = [
  { label: "All Time", value: "all" },
  { label: "Today", value: "today" },
  { label: "Last 7 Days", value: "7days" },
  { label: "Last 30 Days", value: "30days" },
];

export function AuditLogView() {
  const user = getAuthUser();
  const isSuperAdmin = user?.role === "Super Admin";

  const [logs, setLogs] = useState<AuditSessionLog[]>([]);
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
  const [roleOptions, setRoleOptions] = useState<string[]>(["All"]);

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Detail Modal state
  const [selectedSession, setSelectedSession] = useState<AuditSessionLog | null>(null);

  // Fetch dynamic roles from backend
  useEffect(() => {
    authFetch("/api/roles")
      .then(async (res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((json) => {
        if (json && json.success && Array.isArray(json.data) && json.data.length > 0) {
          const names: string[] = json.data.map((r: { role: string }) => r.role);
          const combined = Array.from(new Set(["All", ...names]));
          setRoleOptions(combined);
        }
      })
      .catch(() => {});
  }, []);

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
          setError(data.error || "Failed to load audit session logs.");
        }
      })
      .catch((err) => {
        setError(err.message || "Failed to fetch activity session logs.");
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

  // Helper for action badge colors & icons
  const renderActionBadge = (action: string) => {
    switch (action) {
      case "Add":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200/80">
            <Plus className="h-3 w-3" /> Add
          </span>
        );
      case "Update":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200/80">
            <RefreshCw className="h-3 w-3" /> Update
          </span>
        );
      case "Delete":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200/80">
            <Trash2 className="h-3 w-3" /> Delete
          </span>
        );
      case "View":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 border border-sky-200/80">
            <Eye className="h-3 w-3" /> View
          </span>
        );
      case "Export":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700 border border-purple-200/80">
            <Download className="h-3 w-3" /> Export
          </span>
        );
      case "Login":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-0.5 text-xs font-semibold text-cyan-700 border border-cyan-200/80">
            <LogIn className="h-3 w-3" /> Login
          </span>
        );
      case "Logout":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200/80">
            <LogOut className="h-3 w-3" /> Logout
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200/80">
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

    let style = "bg-slate-100 text-slate-700 border-slate-200";
    if (isSuper) style = "bg-purple-50 text-purple-700 border-purple-200/80";
    else if (isAdmin) style = "bg-blue-50 text-blue-700 border-blue-200/80";
    else if (isSupervisor) style = "bg-amber-50 text-amber-700 border-amber-200/80";
    else if (isAnalyst) style = "bg-emerald-50 text-emerald-700 border-emerald-200/80";

    return (
      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold border ${style}`}>
        {isSuper && <ShieldCheck className="h-3 w-3 text-purple-600" />}
        {role}
      </span>
    );
  };

  // Helper for user agent string format
  const formatUserAgent = (ua?: string) => {
    if (!ua) return "Browser Client";
    if (ua.includes("Chrome")) return "Chrome Browser";
    if (ua.includes("Firefox")) return "Firefox Browser";
    if (ua.includes("Safari")) return "Safari Browser";
    if (ua.includes("Edge")) return "Edge Browser";
    return ua.substring(0, 20);
  };

  // Render Access Restriction UI if user is not Super Admin
  if (!isSuperAdmin) {
    return (
      <div className="mx-auto max-w-4xl py-12 px-4">
        <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 border border-rose-200 text-rose-600">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-900">Super Admin Access Required</h2>
          <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
            The Activity Log contains user session telemetry, session timelines, and system access trails.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 border border-rose-200">
            <Lock className="h-4 w-4" /> Restricted to Super Admin Role Only
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 sm:p-8 lg:p-10 space-y-6 max-w-[1500px] mx-auto">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
            <span>Administration</span>
            <ChevronRight size={12} />
            <span className="text-slate-600">Activity Log</span>
          </div>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Activity Log
          </h1>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#18476A] px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-md shadow-[#18476A]/20 hover:bg-[#123955] transition-all disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-white/80" : ""}`} />
          Refresh Stream
        </button>
      </div>

      {/* ── Summary Metrics Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total User Sessions</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
              <Activity className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{metrics.totalLogs.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate-400">Recorded user login sessions</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Users Today</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <UserCheck className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{metrics.activeUsersToday}</p>
          <p className="mt-1 text-xs text-slate-400">Unique accounts active today</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Top Active Module</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <FileBarChart className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900 truncate">{metrics.topModule}</p>
          <p className="mt-1 text-xs text-slate-400">Most visited workspace area</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Auth & Session Events</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 border border-cyan-100">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{metrics.securityEvents}</p>
          <p className="mt-1 text-xs text-slate-400">Logins and Logout sessions</p>
        </div>
      </div>

      {/* ── Filter & Search Toolbar ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* Real-time search */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search user name, email, role, action, module, IP address..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-9 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:border-[#18476A] focus:outline-none focus:ring-2 focus:ring-[#18476A]/20 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
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
              className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-xs font-semibold text-slate-700 focus:bg-white focus:border-[#18476A] focus:outline-none transition-all"
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-3 border-t border-slate-100">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">Module / Page Visited</label>
            <select
              value={selectedModule}
              onChange={(e) => {
                setSelectedModule(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-xs font-semibold text-slate-700 focus:bg-white focus:border-[#18476A] focus:outline-none transition-all"
            >
              {MODULE_OPTIONS.map((mod) => (
                <option key={mod} value={mod}>
                  {mod === "All" ? "All Modules" : mod}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">Action Included</label>
            <select
              value={selectedAction}
              onChange={(e) => {
                setSelectedAction(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-xs font-semibold text-slate-700 focus:bg-white focus:border-[#18476A] focus:outline-none transition-all"
            >
              {ACTION_OPTIONS.map((act) => (
                <option key={act} value={act}>
                  {act === "All" ? "All Actions" : act}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">User Role</label>
            <select
              value={selectedRole}
              onChange={(e) => {
                setSelectedRole(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-xs font-semibold text-slate-700 focus:bg-white focus:border-[#18476A] focus:outline-none transition-all"
            >
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role === "All" ? "All Roles" : role}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Active Filter Indicators & Clear button */}
        {(search || selectedModule !== "All" || selectedAction !== "All" || selectedRole !== "All" || selectedDateRange !== "all") && (
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-bold text-slate-700">Active Filters:</span>
              {search && <span className="rounded-lg bg-blue-50 border border-blue-200/80 px-2.5 py-1 text-xs font-semibold text-[#18476A]">"{search}"</span>}
              {selectedModule !== "All" && <span className="rounded-lg bg-blue-50 border border-blue-200/80 px-2.5 py-1 text-xs font-semibold text-[#18476A]">Module: {selectedModule}</span>}
              {selectedAction !== "All" && <span className="rounded-lg bg-blue-50 border border-blue-200/80 px-2.5 py-1 text-xs font-semibold text-[#18476A]">Action: {selectedAction}</span>}
              {selectedRole !== "All" && <span className="rounded-lg bg-blue-50 border border-blue-200/80 px-2.5 py-1 text-xs font-semibold text-[#18476A]">Role: {selectedRole}</span>}
              {selectedDateRange !== "all" && <span className="rounded-lg bg-blue-50 border border-blue-200/80 px-2.5 py-1 text-xs font-semibold text-[#18476A]">Date: {selectedDateRange}</span>}
            </div>
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1 rounded-lg transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 font-medium">
          ⚠️ {error}
        </div>
      )}

      {/* ── User Session Table ─────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="bg-slate-50/90 text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th scope="col" className="px-6 py-4">User</th>
                <th scope="col" className="px-6 py-4">Role</th>
                <th scope="col" className="px-6 py-4">Session Started</th>
                <th scope="col" className="px-6 py-4">Session Ended / Status</th>
                <th scope="col" className="px-6 py-4">Duration</th>
                <th scope="col" className="px-6 py-4">Total Actions</th>
                <th scope="col" className="px-6 py-4">IP & Device</th>
                <th scope="col" className="px-4 py-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    <RefreshCw className="mx-auto h-6 w-6 animate-spin text-[#18476A] mb-2" />
                    Loading activity session logs...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    <Filter className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                    No matching user session logs found. Try adjusting your filters.
                  </td>
                </tr>
              ) : (
                logs.map((session) => {
                  const userInitials = (session.userName || "U")
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .substring(0, 2)
                    .toUpperCase();

                  const isActive = session.status === "Active" || !session.logoutTime;

                  return (
                    <tr
                      key={session.id || session._id || session.sessionId}
                      className="hover:bg-slate-50/70 transition-colors group"
                    >
                      {/* User */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#18476A] font-bold text-xs text-white shadow-sm">
                            {userInitials}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 group-hover:text-[#18476A] transition-colors">
                              {session.userName}
                            </p>
                            <p className="text-xs text-slate-500">{session.userEmail}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {renderRoleBadge(session.userRole)}
                      </td>

                      {/* Login Time */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                          <Clock className="h-3.5 w-3.5 text-[#18476A]" />
                          {new Date(session.loginTime).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </td>

                      {/* Logout Time / Status */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            Active Session
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-slate-600">
                            {new Date(session.logoutTime!).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </td>

                      {/* Duration */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                          {session.duration || "Active session"}
                        </span>
                      </td>

                      {/* Total Actions */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#18476A] border border-blue-200">
                          {session.totalActions || (session.timeline ? session.timeline.length : 1)} actions
                        </span>
                      </td>

                      {/* IP & Device */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="space-y-0.5">
                          <p className="font-mono text-xs text-slate-700 flex items-center gap-1">
                            <Globe className="h-3 w-3 text-slate-400" />
                            {session.ipAddress || "127.0.0.1"}
                          </p>
                          <p className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Laptop className="h-3 w-3 text-slate-400" />
                            {formatUserAgent(session.userAgent)}
                          </p>
                        </div>
                      </td>

                      {/* Details button */}
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setSelectedSession(session)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#18476A] hover:bg-[#18476A] hover:text-white bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200 transition-all shadow-sm"
                        >
                          <Info className="h-3.5 w-3.5" /> View Session Timeline
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-6 py-4 bg-slate-50/70 border-t border-slate-200 text-xs text-slate-500">
          <div>
            Showing <span className="font-bold text-slate-800">{logs.length > 0 ? (page - 1) * 15 + 1 : 0}</span> to{" "}
            <span className="font-bold text-slate-800">{Math.min(page * 15, totalCount)}</span> of{" "}
            <span className="font-bold text-slate-800">{totalCount}</span> user session logs
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 transition-all shadow-sm"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>

            <span className="px-2 font-semibold text-slate-700">
              Page {page} of {totalPages}
            </span>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 transition-all shadow-sm"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Session Audit Timeline Modal ────────────────────────────────────────────── */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden text-slate-800">
            {/* Modal Top Banner */}
            <div className="p-6 border-b border-slate-100 bg-slate-50/70 flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-[#18476A]" />
                  <h3 className="text-lg font-bold text-slate-900">
                    User Session Activity Audit Timeline
                  </h3>
                </div>
                <p className="text-xs text-slate-500">
                  Session ID: <span className="font-mono text-slate-700">{selectedSession.sessionId || selectedSession.id}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedSession(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-200 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Session Summary Metadata Header */}
            <div className="px-6 py-4 bg-white border-b border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="block font-bold text-slate-400 uppercase tracking-wider text-[10px]">User</span>
                <p className="font-bold text-slate-900 mt-0.5">{selectedSession.userName}</p>
                <p className="text-[11px] text-slate-500">{selectedSession.userEmail}</p>
              </div>

              <div>
                <span className="block font-bold text-slate-400 uppercase tracking-wider text-[10px]">Role</span>
                <div className="mt-0.5">{renderRoleBadge(selectedSession.userRole)}</div>
              </div>

              <div>
                <span className="block font-bold text-slate-400 uppercase tracking-wider text-[10px]">Session Start</span>
                <p className="font-semibold text-slate-800 mt-0.5">
                  {new Date(selectedSession.loginTime).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </p>
                <p className="text-[10px] text-slate-400">
                  {new Date(selectedSession.loginTime).toLocaleDateString()}
                </p>
              </div>

              <div>
                <span className="block font-bold text-slate-400 uppercase tracking-wider text-[10px]">Duration & Status</span>
                <p className="font-semibold text-[#18476A] mt-0.5">
                  {selectedSession.duration || "Active session"}
                </p>
                <p className="text-[10px] font-mono text-slate-500">{selectedSession.ipAddress || "127.0.0.1"}</p>
              </div>
            </div>

            {/* Session Timeline Body (Scrollable) */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-white">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Chronological Action Timeline ({selectedSession.timeline ? selectedSession.timeline.length : 0} Actions)
                </h4>
                <span className="text-xs text-slate-400 font-medium">
                  {selectedSession.status === "Active" ? "🟢 Session is currently active" : "🔴 Session ended"}
                </span>
              </div>

              {!selectedSession.timeline || selectedSession.timeline.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 italic">
                  No detailed actions recorded in this session timeline yet.
                </div>
              ) : (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {selectedSession.timeline.map((act: AuditTimelineAction, index: number) => (
                    <div key={act.id || index} className="relative group">
                      {/* Timeline Dot Marker */}
                      <div className="absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white ring-4 ring-white border-2 border-[#18476A]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#18476A]" />
                      </div>

                      {/* Action Entry Card */}
                      <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-3.5 space-y-2 hover:border-slate-300 transition-all">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {renderActionBadge(act.action)}
                            <span className="font-bold text-xs text-slate-900 flex items-center gap-1">
                              <FileBarChart className="h-3.5 w-3.5 text-[#18476A]" />
                              {act.module}
                            </span>
                          </div>
                          <span className="font-mono text-[11px] text-slate-400 font-medium">
                            {new Date(act.timestamp).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </span>
                        </div>

                        <div className="text-xs space-y-1">
                          <p className="font-semibold text-slate-700">
                            Section / Record: <span className="text-slate-900">{act.section}</span>
                          </p>
                          {act.details && (
                            <p className="text-slate-600 bg-white p-2 rounded-lg border border-slate-200/80 font-mono text-[11px] whitespace-pre-wrap">
                              {act.details}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex justify-end">
              <button
                onClick={() => setSelectedSession(null)}
                className="rounded-xl bg-[#18476A] px-5 py-2 text-xs font-bold text-white shadow-md shadow-[#18476A]/20 hover:bg-[#123955] transition-colors"
              >
                Close Session Log
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
