import { describe, it, expect, beforeEach } from "vitest";
import { validateToken, isTokenValid, setAuthSession, clearAuthSession } from "./apiClient";

// Mock localStorage implementation for Node test environment
const mockStorage: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, value: string) => {
    mockStorage[key] = value;
  },
  removeItem: (key: string) => {
    delete mockStorage[key];
  },
  clear: () => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  },
  length: 0,
  key: () => null,
};

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  configurable: true,
  writable: true,
});

if (typeof globalThis.window === "undefined") {
  (globalThis as any).window = {
    location: { hostname: "localhost" },
    atob: (str: string) => Buffer.from(str, "base64").toString("binary"),
  };
}

function createMockJwt(payload: object): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = "mockSignature";
  return `${header}.${body}.${signature}`;
}

describe("JWT Token 24-Hour Expiration Validation", () => {
  beforeEach(() => {
    clearAuthSession();
  });

  it("should validate a token with valid future 24-hour expiration", () => {
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    const token = createMockJwt({
      email: "user@example.com",
      role: "Report Analyst",
      expiresAt,
      exp: Math.floor(expiresAt / 1000),
    });

    const result = validateToken(token);
    expect(result.valid).toBe(true);
  });

  it("should invalidate a token that has passed 24 hours", () => {
    const expiredAt = Date.now() - 1000; // 1 second in past
    const token = createMockJwt({
      email: "user@example.com",
      role: "Report Analyst",
      expiresAt: expiredAt,
      exp: Math.floor(expiredAt / 1000),
    });

    const result = validateToken(token);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Token expired");
  });

  it("should return false for isTokenValid when session has expired", () => {
    const expiredAt = Date.now() - 5000;
    const token = createMockJwt({
      email: "user@example.com",
      role: "Report Analyst",
      expiresAt: expiredAt,
      exp: Math.floor(expiredAt / 1000),
    });

    setAuthSession(token, {
      email: "user@example.com",
      name: "Test User",
      role: "Report Analyst",
      expiresAt: expiredAt,
      authenticatedAt: new Date().toISOString(),
    });

    expect(isTokenValid()).toBe(false);
  });

  it("should return true for isTokenValid when token is active within 24 hours", () => {
    const futureExpiry = Date.now() + 12 * 60 * 60 * 1000; // 12 hours from now
    const token = createMockJwt({
      email: "user@example.com",
      role: "Report Analyst",
      expiresAt: futureExpiry,
      exp: Math.floor(futureExpiry / 1000),
    });

    setAuthSession(token, {
      email: "user@example.com",
      name: "Test User",
      role: "Report Analyst",
      expiresAt: futureExpiry,
      authenticatedAt: new Date().toISOString(),
    });

    expect(isTokenValid()).toBe(true);
  });
});
