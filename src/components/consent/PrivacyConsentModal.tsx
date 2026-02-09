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
    <div className="flex w-96 flex-col bg-white p-4">
      {/* Header */}
      <h1 className="mb-1 text-lg font-bold text-gray-900">Welcome to AI Interview Assistant</h1>
      <p className="mb-3 text-sm text-gray-700">
        Please review our privacy policy before using the extension.
      </p>

      {/* Scrollable privacy policy container */}
      <div className="mb-3 max-h-[350px] overflow-y-auto rounded-lg border border-gray-200 p-3">
        <PrivacyPolicyContent />
      </div>

      {/* Accept button - always visible */}
      <button
        onClick={onAccept}
        className="w-full shrink-0 rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 active:bg-blue-800"
      >
        I Accept
      </button>

      {/* Required note */}
      <p className="mt-2 text-center text-xs text-gray-500">
        You must accept to use this extension.
      </p>
    </div>
  );
}
