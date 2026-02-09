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
/** Check if chrome.storage.local is available (false during Vite pre-rendering) */
function hasStorage(): boolean {
  try {
    return !!(typeof chrome !== 'undefined' && chrome.storage?.local);
  } catch {
    return false;
  }
}

export const chromeStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (!hasStorage()) return null;
    const result = await chrome.storage.local.get(name);
    return result[name] ?? null;
  },

  setItem: async (name: string, value: string): Promise<void> => {
    if (!hasStorage()) return;
    await chrome.storage.local.set({ [name]: value });
  },

  removeItem: async (name: string): Promise<void> => {
    if (!hasStorage()) return;
    await chrome.storage.local.remove(name);
  },
};
