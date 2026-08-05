import { describe, it, expect } from "vitest";
import { generateToken, verifyToken, validateTokenDetails, TOKEN_EXPIRY_MS } from "./auth";
import { UserSession } from "@shared/api";

describe("Backend Auth Middleware & Strict Token Validation", () => {
  it("should generate a token with a 24-hour expiration payload", () => {
    const user: UserSession = {
      email: "admin@nexora.com",
      name: "Admin User",
      role: "Administrator",
      authenticatedAt: new Date().toISOString(),
    };

    const startTime = Date.now();
    const { token, expiresAt } = generateToken(user);

    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    expect(expiresAt).toBeGreaterThanOrEqual(startTime + TOKEN_EXPIRY_MS - 1000);
    expect(expiresAt).toBeLessThanOrEqual(startTime + TOKEN_EXPIRY_MS + 1000);
  });

  it("should verify valid signed token and extract user details", () => {
    const user: UserSession = {
      email: "analyst@nexora.com",
      name: "Analyst User",
      role: "Report Analyst",
      authenticatedAt: new Date().toISOString(),
    };

    const { token } = generateToken(user);
    const validation = validateTokenDetails(token);

    expect(validation.valid).toBe(true);
    expect(validation.user?.email).toBe("analyst@nexora.com");
    expect(validation.user?.role).toBe("Report Analyst");
  });

  it("should reject non-JWT malformed strings with detailed error", () => {
    const validation = validateTokenDetails("invalid-tampered-token-string");
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain("Malformed token structure");
  });

  it("should reject tokens with modified payload signatures", () => {
    const user: UserSession = {
      email: "user@nexora.com",
      name: "User",
      role: "Report Analyst",
      authenticatedAt: new Date().toISOString(),
    };
    const { token } = generateToken(user);
    const tamperedToken = token.slice(0, -4) + "XXXX";

    const validation = validateTokenDetails(tamperedToken);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain("Invalid token signature");
  });
});
