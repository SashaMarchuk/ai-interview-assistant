/**
 * Chrome Storage Adapter
 *
 * Implements Zustand's StateStorage interface using chrome.storage.local
 * for persistent storage across extension contexts.
 */

import type { StateStorage } from 'zustand/middleware';

/**
 * StateStorage adapter for chrome.storage.local
 *
 * Provides async get/set/remove operations for Zustand persist middleware
 * to store state in Chrome's extension storage.
 */
export const chromeStorage: StateStorage = {
  /**
   * Get item from chrome.storage.local
   * @param name - Storage key
   * @returns Stored value as string, or null if not found
   */
  getItem: async (name: string): Promise<string | null> => {
    const result = await chrome.storage.local.get(name);
    return result[name] ?? null;
  },

  /**
   * Set item in chrome.storage.local
   * @param name - Storage key
   * @param value - Value to store (string)
   */
  setItem: async (name: string, value: string): Promise<void> => {
    await chrome.storage.local.set({ [name]: value });
  },

  /**
   * Remove item from chrome.storage.local
   * @param name - Storage key to remove
   */
  removeItem: async (name: string): Promise<void> => {
    await chrome.storage.local.remove(name);
  },
};
