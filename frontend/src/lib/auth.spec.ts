import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  setAuthSession,
  clearAuthSession,
  getAuthToken,
  getAuthUser,
  isTokenValid,
  validateToken,
  parseJwtPayload,
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  AUTH_FLAG_KEY,
} from "./apiClient";
import { UserSession } from "@shared/api";

function createLocalStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem(key: string) {
      return store[key] || null;
    },
    setItem(key: string, value: string) {
      store[key] = String(value);
    },
    removeItem(key: string) {
      delete store[key];
    },
    clear() {
      store = {};
    },
  };
}

function createDummyJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  const signature = "dummy-signature-hash";
  return `${header}.${body}.${signature}`;
}

describe("Authentication & Authorization Utilities", () => {
  beforeEach(() => {
    const mockStorage = createLocalStorageMock();
    vi.stubGlobal("localStorage", mockStorage);
  });

  it("should return false for isTokenValid when session is empty", () => {
    expect(isTokenValid()).toBe(false);
  });

  it("should parse and validate a valid JWT token structure", () => {
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    const token = createDummyJwt({
      email: "test.admin@nexora.com",
      role: "Administrator",
      expiresAt,
    });

    const parsed = parseJwtPayload(token);
    expect(parsed).not.toBeNull();
    expect(parsed?.email).toBe("test.admin@nexora.com");

    const validation = validateToken(token);
    expect(validation.valid).toBe(true);
  });

  it("should reject malformed non-JWT token strings", () => {
    const invalidToken = "not-a-valid-jwt-token";
    const validation = validateToken(invalidToken);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain("Invalid JWT token structure");
  });

  it("should reject token if expiresAt timestamp is in the past", () => {
    const expiredToken = createDummyJwt({
      email: "expired@nexora.com",
      role: "Report Analyst",
      expiresAt: Date.now() - 1000,
    });

    const validation = validateToken(expiredToken);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain("Token expired");
  });

  it("should store session and pass isTokenValid with valid JWT", () => {
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    const validJwt = createDummyJwt({
      email: "test.admin@nexora.com",
      role: "Administrator",
      expiresAt,
    });

    const mockUser: UserSession = {
      email: "test.admin@nexora.com",
      name: "Test Admin",
      role: "Administrator",
      authenticatedAt: new Date().toISOString(),
      expiresAt,
    };

    setAuthSession(validJwt, mockUser);

    expect(getAuthToken()).toBe(validJwt);
    expect(getAuthUser()).toEqual(mockUser);
    expect(localStorage.getItem(AUTH_FLAG_KEY)).toBe("true");
    expect(isTokenValid()).toBe(true);
  });

  it("should clear session completely on logout", () => {
    const validJwt = createDummyJwt({
      email: "user@company.com",
      role: "Report Analyst",
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });

    const mockUser: UserSession = {
      email: "user@company.com",
      name: "User",
      role: "Report Analyst",
      authenticatedAt: new Date().toISOString(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };

    setAuthSession(validJwt, mockUser);
    expect(getAuthToken()).toBe(validJwt);

    clearAuthSession();

    expect(getAuthToken()).toBeNull();
    expect(getAuthUser()).toBeNull();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_FLAG_KEY)).toBeNull();
    expect(isTokenValid()).toBe(false);
  });
});
