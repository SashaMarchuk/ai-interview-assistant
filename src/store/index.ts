/**
 * Combined Zustand Store
 *
 * Main store combining settings and templates slices with:
 * - Chrome storage persistence via persist middleware
 * - Cross-context synchronization via webext-zustand
 * - Automatic default template seeding on first install
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { wrapStore } from 'webext-zustand';

import type { StoreState } from './types';
import { chromeStorage } from './chromeStorage';
import { createSettingsSlice } from './settingsSlice';
import { createTemplatesSlice } from './templatesSlice';

/**
 * Combined Zustand store with persistence
 *
 * Features:
 * - Persists to chrome.storage.local
 * - Syncs across popup, content script, and service worker
 * - Seeds default templates on first install
 */
export const useStore = create<StoreState>()(
  persist(
    (...a) => ({
      ...createSettingsSlice(...a),
      ...createTemplatesSlice(...a),
    }),
    {
      name: 'ai-interview-settings',
      storage: createJSONStorage(() => chromeStorage),
      // Only persist data, not actions
      partialize: (state) => ({
        apiKeys: state.apiKeys,
        models: state.models,
        blurLevel: state.blurLevel,
        hotkeys: state.hotkeys,
        templates: state.templates,
        activeTemplateId: state.activeTemplateId,
      }),
      // Seed default templates after rehydration if none exist
      onRehydrateStorage: () => (state) => {
        if (state && state.templates.length === 0) {
          state.seedDefaultTemplates();
        }
      },
    }
  )
);

/**
 * Store ready promise for cross-context synchronization
 *
 * Usage:
 * ```ts
 * // In popup or content script
 * import { storeReadyPromise } from '@/store';
 *
 * async function init() {
 *   await storeReadyPromise;
 *   // Store is now synced and ready to use
 * }
 * ```
 */
export const storeReadyPromise = wrapStore(useStore);

// Re-export types for consumers
export type { StoreState } from './types';
export type {
  PromptTemplate,
  TemplateType,
  ApiKeyProvider,
  ModelType,
  HotkeyAction,
  SettingsSlice,
  TemplatesSlice,
  TemplateUpdate,
  NewTemplate,
} from './types';
