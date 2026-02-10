/**
 * Encrypted Storage Adapter
 *
 * Wraps the base chromeStorage adapter with transparent encryption/decryption
 * for sensitive fields (apiKeys). Non-sensitive fields pass through unchanged.
 *
 * On read: decrypts apiKeys values (with plaintext fallback for migration)
 * On write: encrypts apiKeys values before storing
 *
 * This adapter composes on top of chromeStorage -- it does NOT replace it.
 * The base chromeStorage.ts remains unchanged.
 */

import type { StateStorage } from 'zustand/middleware';
import { chromeStorage } from '../../store/chromeStorage';
import { encryptionService } from './encryption';

import type { ApiKeyProvider } from '../../store/types';

/** API key field names that should be encrypted */
const ENCRYPTED_FIELDS: readonly ApiKeyProvider[] = ['elevenLabs', 'openRouter', 'openAI'];

interface PersistedStoreData {
  state?: {
    apiKeys?: Record<ApiKeyProvider, string>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Check if chrome.storage APIs are available (false during Vite pre-rendering) */
function hasChromeStorage(): boolean {
  try {
    return !!(typeof chrome !== 'undefined' && chrome.storage?.local);
  } catch {
    return false;
  }
}

/**
 * Ensure encryption service is initialized. Returns false if not possible
 * (non-extension context like Vite pre-rendering).
 */
async function ensureEncryption(): Promise<boolean> {
  if (!hasChromeStorage()) return false;
  try {
    await encryptionService.initialize();
    return true;
  } catch {
    return false;
  }
}

/**
 * Decrypt apiKeys values in parsed state, with plaintext fallback for migration.
 * Waits for encryption service to be ready to prevent race conditions.
 */
async function decryptApiKeys(apiKeys: Record<ApiKeyProvider, string>): Promise<Record<ApiKeyProvider, string>> {
  const result = { ...apiKeys };

  if (!(await ensureEncryption())) return result;

  for (const field of ENCRYPTED_FIELDS) {
    const value = result[field];
    if (!value || value.length === 0) continue;

    try {
      result[field] = await encryptionService.decrypt(value);
    } catch {
      // Decryption failed -- value is likely still plaintext (pre-migration).
      // Pass through as-is; it will be encrypted on next write.
    }
  }

  return result;
}

/**
 * Encrypt apiKeys values in parsed state.
 * Waits for encryption service to be ready.
 */
async function encryptApiKeys(apiKeys: Record<ApiKeyProvider, string>): Promise<Record<ApiKeyProvider, string>> {
  const result = { ...apiKeys };

  if (!(await ensureEncryption())) return result;

  for (const field of ENCRYPTED_FIELDS) {
    const value = result[field];
    if (!value || value.length === 0) continue;

    result[field] = await encryptionService.encrypt(value);
  }

  return result;
}

/**
 * Encrypted StateStorage adapter for Zustand persist middleware.
 *
 * Transparently encrypts apiKeys on write and decrypts on read,
 * while leaving all other fields (models, blurLevel, templates, hotkeys) unchanged.
 */
export const encryptedChromeStorage: StateStorage = {
  /**
   * Get item from storage, decrypting apiKeys if present.
   */
  getItem: async (name: string): Promise<string | null> => {
    const raw = await chromeStorage.getItem(name);
    if (raw === null) return null;

    try {
      const parsed: PersistedStoreData = JSON.parse(raw);

      if (parsed.state?.apiKeys) {
        parsed.state.apiKeys = await decryptApiKeys(parsed.state.apiKeys);
      }

      return JSON.stringify(parsed);
    } catch {
      // JSON parse failed -- return raw string as-is
      return raw;
    }
  },

  /**
   * Set item to storage, encrypting apiKeys if present.
   */
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const parsed: PersistedStoreData = JSON.parse(value);

      if (parsed.state?.apiKeys) {
        parsed.state.apiKeys = await encryptApiKeys(parsed.state.apiKeys);
      }

      await chromeStorage.setItem(name, JSON.stringify(parsed));
    } catch {
      // JSON parse failed -- store raw value as-is (fallback)
      await chromeStorage.setItem(name, value);
    }
  },

  /**
   * Remove item from storage (delegates directly to chromeStorage).
   */
  removeItem: async (name: string): Promise<void> => {
    await chromeStorage.removeItem(name);
  },
};
