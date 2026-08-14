import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Bell,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  FileBarChart,
  LayoutDashboard,
  Menu,
  Shield,
  ShieldCheck,
  Users,
} from "lucide-react";
import { SGReportLogo } from "@/components/SGReportLogo";
import { authFetch, getAuthUser, getAuthToken, setAuthSession, clearAuthSession } from "@/lib/apiClient";
import { AppLayoutContext } from "@/lib/AppLayoutContext";
import type { PermissionActions } from "@shared/api";

// ── Navigation structure ────────────────────────────────────────────────────
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
    ],
  },
];

const moduleToPathMap: Record<string, string> = {
  Dashboard: "/",
  Reports: "/reports",
  Approvals: "/approvals",
  Users: "/users",
  Roles: "/roles",
  Permissions: "/permissions",
  "Report types": "/report-types",
  "Activity Log": "/activity-log",
  Profile: "/profile",
};

const pathToModuleMap: Record<string, string> = {
  "/": "Dashboard",
  "/dashboard": "Dashboard",
  "/reports": "Reports",
  "/approvals": "Approvals",
  "/users": "Users",
  "/roles": "Roles",
  "/permissions": "Permissions",
  "/report-types": "Report types",
  "/activity-log": "Activity Log",
  "/profile": "Profile",
};

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const getModuleFromPath = (pathname: string): string => {
    const cleanPath = pathname.toLowerCase().replace(/\/$/, "") || "/";
    return pathToModuleMap[cleanPath] ?? "Dashboard";
  };

  const activeNav = getModuleFromPath(location.pathname);

  const navigateToModule = (moduleName: string, replace = false) => {
    const targetPath = moduleToPathMap[moduleName] ?? "/";
    navigate(targetPath, { replace });
  };

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sg_sidebar_open");
      if (saved !== null) return saved === "true";
      return window.innerWidth >= 1024;
    }
    return true;
  });

  const [profileOpen, setProfileOpen] = useState(false);
  const [userPermissions, setUserPermissions] = useState<Record<string, PermissionActions>>({});
  const [currentUser, setCurrentUser] = useState(getAuthUser());
  const [profileTab, setProfileTab] = useState<"details" | "security">("details");

  const currentUserEmail = currentUser?.email || "admin@sgreport.com";
  const userRole = currentUser?.role || "Report Analyst";
  const formattedName =
    currentUser?.name ||
    (currentUserEmail.split("@")[0]
      ? currentUserEmail.split("@")[0].charAt(0).toUpperCase() +
        currentUserEmail.split("@")[0].slice(1)
      : "User");
  const avatarUrl = currentUser?.avatar || "";

  const populatePermissionsMap = (modulePermsArray: any[]) => {
    if (!Array.isArray(modulePermsArray)) return;
    const map: Record<string, PermissionActions> = {};
    modulePermsArray.forEach((mp: { module: string; actions: PermissionActions }) => {
      if (mp.module && mp.actions) {
        map[mp.module] = mp.actions;
        map[mp.module.trim().toLowerCase()] = mp.actions;
      }
    });
    setUserPermissions(map);
  };

  const fetchLatestSession = () => {
    authFetch("/api/auth/me")
      .then(async (res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((res) => {
        if (res && res.success && res.user) {
          const token = getAuthToken();
          if (token) {
            setAuthSession(token, res.user);
          }
          setCurrentUser(res.user);
          populatePermissionsMap(res.user.modulePermissions);
        }
      })
      .catch(() => {});
  };

  const refreshUserSession = () => {
    const user = getAuthUser();
    if (user) {
      setCurrentUser(user);
      populatePermissionsMap(user.modulePermissions);
    }
    fetchLatestSession();
  };

  useEffect(() => {
    refreshUserSession();

    const handleUpdated = () => refreshUserSession();
    window.addEventListener("profile-updated", handleUpdated);
    window.addEventListener("role-permissions-updated", handleUpdated);

    return () => {
      window.removeEventListener("profile-updated", handleUpdated);
      window.removeEventListener("role-permissions-updated", handleUpdated);
    };
  }, []);

  const getPermissionsForModule = (moduleName: string): PermissionActions => {
    if (moduleName === "Profile") {
      return { view: true, add: true, update: true, delete: false, export: false };
    }
    const isSuperOrAdmin =
      userRole === "Super Admin" ||
      userRole === "Administrator" ||
      userRole === "Admin" ||
      userRole.toLowerCase().includes("admin");

    if (moduleName === "Permissions" || moduleName === "Activity Log") {
      return {
        view: isSuperOrAdmin,
        add: isSuperOrAdmin,
        update: isSuperOrAdmin,
        delete: isSuperOrAdmin,
        export: isSuperOrAdmin,
      };
    }
    if (isSuperOrAdmin) {
      return { view: true, add: true, update: true, delete: true, export: true };
    }

    const matchKey = Object.keys(userPermissions).find(
      (k) => k.trim().toLowerCase() === moduleName.trim().toLowerCase(),
    );
    if (matchKey && userPermissions[matchKey]) {
      return userPermissions[matchKey];
    }

    const isStandardWorkspaceModule =
      moduleName === "Dashboard" || moduleName === "Reports" || moduleName === "Approvals";

    if (isStandardWorkspaceModule) {
      return { view: true, add: true, update: true, delete: false, export: true };
    }
    return { view: false, add: false, update: false, delete: false, export: false };
  };

  // ── Auto-track page views in Audit Log ─────────────────────────────────────
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
      Object.keys(userPermissions).length > 0 &&
      allPermittedModules.length > 0 &&
      !allPermittedModules.includes(activeNav) &&
      activeNav !== "Profile" &&
      activeNav !== "Activity Log"
    ) {
      navigateToModule(allPermittedModules[0], true);
    }
  }, [userPermissions, activeNav, allPermittedModules]);

  const contextValue = {
    getPermissionsForModule,
    userRole,
    currentUser,
    refreshUserSession,
    navigateToModule,
    profileTab,
    setProfileTab,
  };

  return (
    <AppLayoutContext.Provider value={contextValue}>
      <div className="min-h-screen bg-[#f4f7fa] dark:bg-[#0f172a] text-slate-900 dark:text-slate-100 transition-colors duration-200">
        {sidebarOpen && (
          <button
            aria-label="Close navigation"
            className="fixed inset-0 z-45 bg-slate-950/40 lg:hidden backdrop-blur-xs"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Sidebar ── */}
        <aside
          style={{ backgroundColor: "#18476A" }}
          className={`fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col text-white transition-all duration-300 ease-in-out shadow-2xl ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-[84px] items-center justify-between border-b border-white/10 px-5 py-3">
            <div className="flex-1 flex items-center overflow-hidden">
              <SGReportLogo size="full" variant="light" className="w-full" />
            </div>
          </div>

          <div className="px-4 pt-7">
            {visibleNavGroups.map((group) => (
              <div key={group.label} className="mb-7">
                <p className="mb-2 px-3 text-[11px] font-extrabold uppercase tracking-[0.16em] text-white">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.items.map(({ label, icon: Icon }) => (
                    <button
                      key={label}
                      onClick={() => {
                        navigateToModule(label);
                        if (window.innerWidth < 1024) setSidebarOpen(false);
                      }}
                      className={`group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[13px] transition ${
                        activeNav === label
                          ? "bg-[#123955] text-white font-bold shadow-[inset_3px_0_0_#ffffff]"
                          : "text-white font-medium hover:bg-white/10"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <Icon
                          size={17}
                          className={
                            activeNav === label ? "text-white" : "text-white/70 group-hover:text-white"
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
                  navigateToModule("Activity Log");
                  if (window.innerWidth < 1024) setSidebarOpen(false);
                }}
                className={`group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[13px] transition ${
                  activeNav === "Activity Log"
                    ? "bg-[#123955] text-white font-bold shadow-[inset_3px_0_0_#ffffff]"
                    : "text-white font-medium hover:bg-white/10"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Clock3
                    size={17}
                    className={
                      activeNav === "Activity Log" ? "text-white" : "text-white/70 group-hover:text-white"
                    }
                  />
                  Audit Logs
                </span>
              </button>
            )}
          </div>
        </aside>

        {/* ── Main content ── */}
        <main
          className={`min-h-screen transition-all duration-300 ease-in-out ${
            sidebarOpen ? "lg:pl-[248px]" : "lg:pl-0"
          }`}
        >
          {/* ── Top header ── */}
          <header className="sticky top-0 z-40 flex h-[76px] items-center justify-between border-b border-slate-200/80 dark:border-slate-800 bg-white/85 dark:bg-slate-900/85 px-5 backdrop-blur-xl sm:px-8 lg:px-10">
            <div className="flex items-center gap-4">
              <button
                type="button"
                title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
                className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-xs cursor-pointer"
                onClick={() => {
                  const nextState = !sidebarOpen;
                  setSidebarOpen(nextState);
                  localStorage.setItem("sg_sidebar_open", String(nextState));
                }}
              >
                <Menu size={20} />
              </button>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {/* Profile Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2 rounded-xl p-1.5 pr-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-[#18476A] text-xs font-bold text-white overflow-hidden shadow-xs">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={formattedName} className="w-full h-full object-cover" />
                    ) : (
                      formattedName.substring(0, 2).toUpperCase()
                    )}
                  </div>
                  <span className="hidden text-left sm:block">
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                      {formattedName}
                    </span>
                    <span className="block text-[10px] text-slate-400">{userRole}</span>
                  </span>
                  <ChevronDown size={14} className="hidden text-slate-400 sm:block" />
                </button>

                {profileOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                    <div className="absolute right-0 top-12 z-50 w-52 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-2xl">
                      <button
                        onClick={() => {
                          setProfileTab("details");
                          navigateToModule("Profile");
                          setProfileOpen(false);
                        }}
                        className="w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between"
                      >
                        <span>My profile</span>
                        <span className="text-[10px] text-slate-400 font-mono">({userRole})</span>
                      </button>
                      <button
                        onClick={() => {
                          setProfileTab("security");
                          navigateToModule("Profile");
                          setProfileOpen(false);
                        }}
                        className="w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Change password
                      </button>
                      <button
                        onClick={() => {
                          authFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
                          clearAuthSession();
                          navigate("/login", { replace: true });
                        }}
                        className="mt-1 w-full rounded-lg border-t border-slate-100 dark:border-slate-800 px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      >
                        Log out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          {/* ── Page content ── */}
          {children}
        </main>
      </div>
    </AppLayoutContext.Provider>
  );
}
