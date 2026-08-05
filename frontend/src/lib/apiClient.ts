import { UserSession } from "@shared/api";

export const AUTH_TOKEN_KEY = "nexora-token";
export const AUTH_USER_KEY = "nexora-user";
export const AUTH_FLAG_KEY = "nexora-auth";

export interface ParsedJwtPayload {
  email?: string;
  name?: string;
  role?: string;
  authenticatedAt?: string;
  expiresAt?: number;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

export function parseJwtPayload(token: string): ParsedJwtPayload | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (base64.length % 4)) % 4;
    const paddedBase64 = base64 + "=".repeat(padLength);

    let decodedString = "";
    if (typeof window !== "undefined" && typeof window.atob === "function") {
      decodedString = window.atob(paddedBase64);
    } else if (typeof Buffer !== "undefined") {
      decodedString = Buffer.from(paddedBase64, "base64").toString("utf-8");
    } else {
      return null;
    }

    const jsonPayload = decodeURIComponent(
      decodedString
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload) as ParsedJwtPayload;
  } catch {
    return null;
  }
}

export function validateToken(token: string | null): { valid: boolean; reason?: string; payload?: ParsedJwtPayload } {
  if (!token || typeof token !== "string" || !token.trim()) {
    return { valid: false, reason: "No token provided." };
  }

  const payload = parseJwtPayload(token);
  if (!payload) {
    return { valid: false, reason: "Invalid JWT token structure." };
  }

  if (!payload.email) {
    return { valid: false, reason: "Token missing email claim." };
  }

  // Check 24-hour timestamp limit
  if (payload.expiresAt && typeof payload.expiresAt === "number") {
    if (Date.now() >= payload.expiresAt) {
      return { valid: false, reason: "Token expired. Exceeded 24-hour validity." };
    }
  }

  // Check standard JWT exp claim
  if (payload.exp && typeof payload.exp === "number") {
    if (Math.floor(Date.now() / 1000) >= payload.exp) {
      return { valid: false, reason: "Token expired. Exceeded JWT exp timestamp." };
    }
  }

  return { valid: true, payload };
}

export function getAuthToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getAuthUser(): UserSession | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserSession;
  } catch {
    return null;
  }
}

export function isTokenValid(): boolean {
  const token = getAuthToken();
  const validation = validateToken(token);
  if (!validation.valid) return false;

  const user = getAuthUser();
  if (!user) return false;

  if (user.expiresAt && typeof user.expiresAt === "number") {
    if (Date.now() >= user.expiresAt) {
      return false;
    }
  }

  return true;
}

export function setAuthSession(token: string, user: UserSession) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  localStorage.setItem(AUTH_FLAG_KEY, "true");
}

export function clearAuthSession() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_FLAG_KEY);
}

export async function verifyServerSession(): Promise<boolean> {
  const token = getAuthToken();
  if (!isTokenValid() || !token) {
    clearAuthSession();
    return false;
  }

  try {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      return Boolean(data.success);
    }
    clearAuthSession();
    return false;
  } catch {
    return isTokenValid();
  }
}

export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const token = getAuthToken();

  if (!isTokenValid()) {
    clearAuthSession();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    return Promise.reject(new Error("Authentication required or session expired."));
  }

  const headers = new Headers(init?.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    clearAuthSession();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }

  return response;
}
