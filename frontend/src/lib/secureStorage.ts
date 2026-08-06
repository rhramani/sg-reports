import CryptoJS from "crypto-js";

// Master key derived from environment or fallback key combined with salt
const BASE_SECRET =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_STORAGE_SECRET) ||
  "sg-reports-browser-secure-storage-key-v1-8f92a3";

const PREFIX = "ENC::v1::";

function getStorageSecretKey(): string {
  if (typeof window !== "undefined" && window.location?.hostname) {
    return `${BASE_SECRET}::${window.location.hostname}`;
  }
  return BASE_SECRET;
}

/**
 * Encrypts a plaintext string using AES-256 encryption.
 * Returns the formatted ciphertext with a version prefix.
 */
export function encryptData(plainText: string): string {
  if (typeof plainText !== "string") return plainText;
  if (!plainText) return plainText;

  try {
    const key = getStorageSecretKey();
    const encrypted = CryptoJS.AES.encrypt(plainText, key).toString();
    return `${PREFIX}${encrypted}`;
  } catch (error) {
    console.error("Browser storage encryption failed:", error);
    return plainText;
  }
}

/**
 * Decrypts an encrypted ciphertext string.
 * Transparently returns plaintext if the string is not encrypted (backward compatibility).
 */
export function decryptData(cipherText: string | null): string | null {
  if (!cipherText || typeof cipherText !== "string") {
    return cipherText;
  }

  // Backward compatibility: If the value is not prefixed with our encryption tag,
  // return it as plain text.
  if (!cipherText.startsWith(PREFIX)) {
    return cipherText;
  }

  try {
    const rawCipher = cipherText.slice(PREFIX.length);
    const key = getStorageSecretKey();
    const bytes = CryptoJS.AES.decrypt(rawCipher, key);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);

    if (!decrypted && cipherText.length > PREFIX.length) {
      // Decryption resulted in empty string despite ciphertext existing (e.g., key mismatch or corruption)
      return null;
    }
    return decrypted;
  } catch (error) {
    console.error("Browser storage decryption failed:", error);
    return null;
  }
}

/**
 * Wrapper for Web Storage (localStorage / sessionStorage) that automatically
 * encrypts stored data and decrypts retrieved data.
 */
export class SecureStorageWrapper {
  private get targetStorage(): Storage | null {
    if (typeof localStorage === "undefined") return null;
    return this.storageType === "session" ? sessionStorage : localStorage;
  }

  constructor(private storageType: "local" | "session" = "local") {}

  getItem(key: string): string | null {
    try {
      const storage = this.targetStorage;
      if (!storage) return null;

      const rawValue = storage.getItem(key);
      if (rawValue === null) return null;

      // Handle transparent migration if stored unencrypted
      if (!rawValue.startsWith(PREFIX)) {
        const decrypted = rawValue;
        // Upgrade legacy unencrypted item to encrypted item
        this.setItem(key, decrypted);
        return decrypted;
      }

      return decryptData(rawValue);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      const storage = this.targetStorage;
      if (!storage) return;

      const encrypted = encryptData(value);
      storage.setItem(key, encrypted);
    } catch (error) {
      console.error(`Failed to set item '${key}' in secure storage:`, error);
    }
  }

  removeItem(key: string): void {
    try {
      const storage = this.targetStorage;
      if (!storage) return;
      storage.removeItem(key);
    } catch (error) {
      console.error(`Failed to remove item '${key}' from secure storage:`, error);
    }
  }

  clear(): void {
    try {
      const storage = this.targetStorage;
      if (!storage) return;
      storage.clear();
    } catch (error) {
      console.error("Failed to clear secure storage:", error);
    }
  }

  key(index: number): string | null {
    try {
      const storage = this.targetStorage;
      if (!storage) return null;
      return storage.key(index);
    } catch {
      return null;
    }
  }

  get length(): number {
    try {
      const storage = this.targetStorage;
      return storage ? storage.length : 0;
    } catch {
      return 0;
    }
  }
}

export const secureLocalStorage = new SecureStorageWrapper("local");
export const secureSessionStorage = new SecureStorageWrapper("session");
