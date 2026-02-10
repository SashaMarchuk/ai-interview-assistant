/**
 * Combined Zustand Store
 *
 * Main store combining settings, templates, and consent slices with:
 * - Chrome storage persistence via persist middleware
 * - Transparent encryption of API keys at rest (AES-GCM-256)
 * - Cross-context synchronization via webext-zustand
 * - Automatic default template seeding on first install
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { wrapStore } from 'webext-zustand';

import type { StoreState } from './types';
import { encryptedChromeStorage } from '../services/crypto/encryptedStorage';
import { createSettingsSlice } from './settingsSlice';
import { createTemplatesSlice } from './templatesSlice';
import { createConsentSlice } from './consentSlice';
import { createQuickPromptsSlice } from './quickPromptsSlice';

/**
 * Combined Zustand store with persistence
 *
 * Features:
 * - Persists to chrome.storage.local with encrypted API keys (AES-GCM-256)
 * - Syncs across popup, content script, and service worker
 * - Seeds default templates on first install
 */
export const useStore = create<StoreState>()(
  persist(
    (...a) => ({
      ...createSettingsSlice(...a),
      ...createTemplatesSlice(...a),
      ...createConsentSlice(...a),
      ...createQuickPromptsSlice(...a),
    }),
    {
      name: 'ai-interview-settings',
      storage: createJSONStorage(() => encryptedChromeStorage),
      // Only persist data, not actions
      partialize: (state) => ({
        apiKeys: state.apiKeys,
        models: state.models,
        blurLevel: state.blurLevel,
        hotkeys: state.hotkeys,
        captureMode: state.captureMode,
        transcriptionLanguage: state.transcriptionLanguage,
        reasoningEffort: state.reasoningEffort,
        templates: state.templates,
        activeTemplateId: state.activeTemplateId,
        privacyPolicyAccepted: state.privacyPolicyAccepted,
        privacyPolicyAcceptedAt: state.privacyPolicyAcceptedAt,
        recordingConsentDismissedPermanently: state.recordingConsentDismissedPermanently,
        quickPrompts: state.quickPrompts,
        quickPromptsEnabled: state.quickPromptsEnabled,
      }),
      // Seed defaults after rehydration if none exist
      onRehydrateStorage: () => (state) => {
        if (state && state.templates.length === 0) {
          state.seedDefaultTemplates();
        }
        if (state && state.quickPrompts.length === 0) {
          state.resetQuickPromptsToDefaults();
        }
      },
    },
  ),
);

/**
 * Store ready promise for cross-context synchronization
 *
 * Lazy initialization to avoid build-time errors when chrome APIs
 * aren't available. Only calls wrapStore in browser context.
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
let _storeReadyPromise: Promise<void> | null = null;

/**
 * Check if we're running in a real browser extension context
 * (not during build where fake-browser is used)
 */
function isExtensionContext(): boolean {
  try {
    // fake-browser throws on getManifest(), real chrome returns manifest
    return !!(typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.());
  } catch {
    return false;
  }
}

export const storeReadyPromise: Promise<void> = new Promise((resolve) => {
  if (isExtensionContext()) {
    _storeReadyPromise = wrapStore(useStore);
    _storeReadyPromise.then(resolve);
  } else {
    // During build or in non-extension context, resolve immediately
    resolve();
  }
});

// Re-export types for consumers
export type { StoreState } from './types';
export type {
  CaptureMode,
  ReasoningEffort,
  PromptTemplate,
  TemplateType,
  ApiKeyProvider,
  ModelType,
  HotkeyAction,
  SettingsSlice,
  TemplatesSlice,
  ConsentSlice,
  QuickPromptsSlice,
  QuickPromptAction,
  TemplateUpdate,
  NewTemplate,
} from './types';
