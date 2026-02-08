/**
 * Privacy Consent Modal Component
 *
 * Full-screen blocking modal that replaces the entire popup content
 * on first use. Displays the privacy policy and requires acceptance
 * before any extension functionality is available.
 *
 * Rendered via conditional gate in App.tsx (not as an overlay).
 */

import { PrivacyPolicyContent } from './PrivacyPolicyContent';

interface PrivacyConsentModalProps {
  onAccept: () => void;
}

export function PrivacyConsentModal({ onAccept }: PrivacyConsentModalProps) {
  return (
    <div className="w-full bg-white p-6 flex flex-col">
      {/* Header */}
      <h1 className="text-lg font-bold text-gray-900 mb-1">
        Welcome to AI Interview Assistant
      </h1>
      <p className="text-sm text-gray-700 mb-4">
        Please review our privacy policy before using the extension.
      </p>

      {/* Scrollable privacy policy container */}
      <div className="border border-gray-200 rounded-lg p-3 mb-4 overflow-y-auto flex-1">
        <PrivacyPolicyContent />
      </div>

      {/* Accept button */}
      <button
        onClick={onAccept}
        className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors"
      >
        I Accept
      </button>

      {/* Required note */}
      <p className="text-xs text-gray-500 text-center mt-2">
        You must accept to use this extension.
      </p>
    </div>
  );
}
