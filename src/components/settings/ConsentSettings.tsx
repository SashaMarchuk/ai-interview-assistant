/**
 * Consent Settings Component
 *
 * Settings section for managing privacy consent state.
 * Shows current consent status, provides "View Privacy Policy" toggle,
 * and a "Reset All Consents" button for re-triggering consent flows.
 *
 * Follows BlurSettings pattern: default export, useStore selectors.
 */

import { useState } from 'react';
import { useStore } from '../../store';
import { PrivacyPolicyContent } from '../consent/PrivacyPolicyContent';

export default function ConsentSettings() {
  const privacyPolicyAccepted = useStore((state) => state.privacyPolicyAccepted);
  const privacyPolicyAcceptedAt = useStore((state) => state.privacyPolicyAcceptedAt);
  const recordingConsentDismissedPermanently = useStore(
    (state) => state.recordingConsentDismissedPermanently
  );
  const resetAllConsents = useStore((state) => state.resetAllConsents);

  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);

  /**
   * Format the acceptance date for display.
   */
  function formatDate(isoString: string | null): string {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return isoString;
    }
  }

  return (
    <div className="space-y-4">
      {/* Current consent status */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Privacy policy</span>
          <span className="text-xs text-gray-500">
            {privacyPolicyAccepted
              ? `Accepted on ${formatDate(privacyPolicyAcceptedAt)}`
              : 'Not accepted'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Recording consent</span>
          <span className="text-xs text-gray-500">
            {recordingConsentDismissedPermanently
              ? 'Permanently dismissed'
              : 'Will show before each session'}
          </span>
        </div>
      </div>

      {/* View Privacy Policy toggle */}
      <div>
        <button
          onClick={() => setShowPrivacyPolicy(!showPrivacyPolicy)}
          className="text-sm text-blue-600 hover:text-blue-800 underline"
        >
          {showPrivacyPolicy ? 'Hide Privacy Policy' : 'View Privacy Policy'}
        </button>
        {showPrivacyPolicy && (
          <div className="mt-2 border border-gray-200 rounded-lg p-3">
            <PrivacyPolicyContent />
          </div>
        )}
      </div>

      {/* Reset section */}
      <div>
        <p className="text-xs text-gray-500 mb-2">
          Resetting consents will immediately show the privacy policy acceptance modal
          and re-enable the per-session recording consent warning.
        </p>
        <button
          onClick={resetAllConsents}
          className="w-full px-4 py-2 rounded-lg font-medium text-sm bg-red-100 text-red-700 hover:bg-red-200 active:bg-red-300 transition-colors"
        >
          Reset All Consents
        </button>
      </div>
    </div>
  );
}
