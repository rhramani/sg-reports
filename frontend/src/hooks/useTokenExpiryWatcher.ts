import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { isTokenValid, clearAuthSession, getAuthToken } from "@/lib/apiClient";

/**
 * Hook to continuously monitor JWT token 24-hour expiration.
 * Automatically clears session and redirects to /login as soon as token expires.
 */
export function useTokenExpiryWatcher() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Only monitor on protected routes (not on login page)
    if (location.pathname.startsWith("/login")) {
      return;
    }

    // Do nothing if no token exists at all
    const token = getAuthToken();
    if (!token) {
      return;
    }

    const checkTokenStatus = () => {
      // Don't re-check if already on login page
      if (window.location.pathname.startsWith("/login")) {
        return;
      }

      if (!isTokenValid()) {
        clearAuthSession();
        toast.error("Session expired after 24 hours. Please sign in again.");
        navigate("/login", { replace: true });
      }
    };

    // 1. Initial check when hook mounts or route changes
    checkTokenStatus();

    // 2. Periodic interval check (every 5 seconds)
    const intervalId = setInterval(checkTokenStatus, 5000);

    // 3. Re-check when window gains focus or visibility changes
    const handleFocus = () => checkTokenStatus();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkTokenStatus();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [navigate, location.pathname]);
}
