import "./global.css";

import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import { Navigate, BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isTokenValid, clearAuthSession } from "@/lib/apiClient";
import { useTokenExpiryWatcher } from "@/hooks/useTokenExpiryWatcher";

const Login = lazy(() => import("./pages/Login"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Reports = lazy(() => import("./pages/Reports"));
const Approvals = lazy(() => import("./pages/Approvals"));
const Users = lazy(() => import("./pages/Users"));
const Roles = lazy(() => import("./pages/Roles"));
const Permissions = lazy(() => import("./pages/Permissions"));
const AuditLogs = lazy(() => import("./pages/AuditLogs"));
const Profile = lazy(() => import("./pages/Profile"));
const JewelleryTransactions = lazy(() => import("./pages/JewelleryTransactions"));
const Categories = lazy(() => import("./pages/Categories"));
const JewelleryTransactionMaster = lazy(() => import("./pages/JewelleryTransactionMaster"));

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: ReactNode }) {
  useTokenExpiryWatcher();

  if (!isTokenValid()) {
    clearAuthSession();
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  if (isTokenValid()) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f7fa]">
      <div className="flex items-center gap-3">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#18476A] border-t-transparent" />
        <span className="text-xs font-semibold text-slate-500">Loading SG Report...</span>
      </div>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <Toaster position="bottom-right" richColors />
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <Login />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <Reports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/approvals"
            element={
              <ProtectedRoute>
                <Approvals />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute>
                <Users />
              </ProtectedRoute>
            }
          />
          <Route
            path="/roles"
            element={
              <ProtectedRoute>
                <Roles />
              </ProtectedRoute>
            }
          />
          <Route
            path="/permissions"
            element={
              <ProtectedRoute>
                <Permissions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/activity-log"
            element={
              <ProtectedRoute>
                <AuditLogs />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/jewellery-transactions"
            element={
              <ProtectedRoute>
                <JewelleryTransactions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/jewellery-transactions/reports"
            element={
              <ProtectedRoute>
                <JewelleryTransactions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/category"
            element={
              <ProtectedRoute>
                <Categories />
              </ProtectedRoute>
            }
          />
          <Route
            path="/master/category"
            element={
              <ProtectedRoute>
                <Categories />
              </ProtectedRoute>
            }
          />
          <Route
            path="/master/jewellery-transactions"
            element={
              <ProtectedRoute>
                <JewelleryTransactionMaster />
              </ProtectedRoute>
            }
          />
          <Route
            path="/master/jewellery-transaction"
            element={
              <ProtectedRoute>
                <JewelleryTransactionMaster />
              </ProtectedRoute>
            }
          />
          <Route
            path="/master/transactions"
            element={
              <ProtectedRoute>
                <JewelleryTransactionMaster />
              </ProtectedRoute>
            }
          />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </QueryClientProvider>
);

createRoot(document.getElementById("root")!).render(<App />);
