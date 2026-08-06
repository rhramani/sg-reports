import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  encryptData,
  decryptData,
  secureLocalStorage,
  secureSessionStorage,
  SecureStorageWrapper,
} from "./secureStorage";

function createMockStorage() {
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
    key(index: number) {
      return Object.keys(store)[index] || null;
    },
    get length() {
      return Object.keys(store).length;
    },
  };
}

describe("Secure Storage Encryption & Decryption Module", () => {
  beforeEach(() => {
    const mockLocal = createMockStorage();
    const mockSession = createMockStorage();
    vi.stubGlobal("localStorage", mockLocal);
    vi.stubGlobal("sessionStorage", mockSession);
  });

  it("should encrypt text and produce ciphertext starting with version prefix", () => {
    const plainText = "my-secret-jwt-token-12345";
    const encrypted = encryptData(plainText);

    expect(encrypted).not.toBe(plainText);
    expect(encrypted).toContain("ENC::v1::");
    expect(encrypted.length).toBeGreaterThan(15);
  });

  it("should decrypt encrypted ciphertext back to exact original plaintext", () => {
    const original = JSON.stringify({ userId: 42, role: "Administrator", token: "abc.xyz.123" });
    const encrypted = encryptData(original);
    const decrypted = decryptData(encrypted);

    expect(decrypted).toBe(original);
  });

  it("should handle plain text values gracefully (backward compatibility)", () => {
    const legacyPlainValue = "legacy-unencrypted-token";
    const decrypted = decryptData(legacyPlainValue);

    expect(decrypted).toBe(legacyPlainValue);
  });

  it("should return null for tampered or invalid ciphertexts", () => {
    const invalidCiphertext = "ENC::v1::invalid_corrupted_cipher_data!!!";
    const decrypted = decryptData(invalidCiphertext);

    expect(decrypted).toBeNull();
  });

  it("should correctly set and get encrypted data in secureLocalStorage", () => {
    const tokenKey = "auth-token";
    const tokenVal = "header.payload.signature";

    secureLocalStorage.setItem(tokenKey, tokenVal);

    // Verify raw storage contains encrypted string
    const rawInStorage = localStorage.getItem(tokenKey);
    expect(rawInStorage).not.toBeNull();
    expect(rawInStorage).not.toBe(tokenVal);
    expect(rawInStorage).toContain("ENC::v1::");

    // Verify secureLocalStorage getItem retrieves decrypted string
    const retrieved = secureLocalStorage.getItem(tokenKey);
    expect(retrieved).toBe(tokenVal);
  });

  it("should migrate unencrypted legacy items to encrypted format on getItem", () => {
    const legacyKey = "legacy-key";
    const legacyVal = "legacy-unencrypted-value";

    // Set item directly in mock localStorage (unencrypted)
    localStorage.setItem(legacyKey, legacyVal);

    // secureLocalStorage getItem reads legacy value and encrypts it back into storage
    const retrieved = secureLocalStorage.getItem(legacyKey);
    expect(retrieved).toBe(legacyVal);

    // Verify localStorage now contains encrypted string
    const updatedRaw = localStorage.getItem(legacyKey);
    expect(updatedRaw).not.toBe(legacyVal);
    expect(updatedRaw).toContain("ENC::v1::");
  });

  it("should support secureSessionStorage", () => {
    const sessionKey = "session-state";
    const sessionVal = "active";

    secureSessionStorage.setItem(sessionKey, sessionVal);
    expect(sessionStorage.getItem(sessionKey)).toContain("ENC::v1::");
    expect(secureSessionStorage.getItem(sessionKey)).toBe(sessionVal);

    secureSessionStorage.removeItem(sessionKey);
    expect(secureSessionStorage.getItem(sessionKey)).toBeNull();
  });
});
