/**
 * Consent Slice
 *
 * Zustand slice for user consent state including privacy policy acceptance,
 * per-session recording consent dismissal, and consent reset.
 *
 * All consent fields are persisted via partialize in the combined store
 * so they survive popup close/reopen cycles.
 */

import type { StateCreator } from 'zustand';
import type { ConsentSlice, StoreState } from './types';

/**
 * Create the consent slice
 *
 * Provides state and actions for managing user consent acknowledgments.
 * Uses immutable updates via Zustand's set function.
 */
export const createConsentSlice: StateCreator<StoreState, [], [], ConsentSlice> = (set) => ({
  // State defaults
  privacyPolicyAccepted: false,
  privacyPolicyAcceptedAt: null,
  recordingConsentDismissedPermanently: false,

  // Actions
  acceptPrivacyPolicy: () => {
    set(() => ({
      privacyPolicyAccepted: true,
      privacyPolicyAcceptedAt: new Date().toISOString(),
    }));
  },

  dismissRecordingConsentPermanently: () => {
    set(() => ({
      recordingConsentDismissedPermanently: true,
    }));
  },

  resetAllConsents: () => {
    set(() => ({
      privacyPolicyAccepted: false,
      privacyPolicyAcceptedAt: null,
      recordingConsentDismissedPermanently: false,
    }));
  },
});
