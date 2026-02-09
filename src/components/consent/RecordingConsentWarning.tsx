/**
 * Recording Consent Warning Component
 *
 * Per-session inline warning displayed in the capture tab when the user
 * clicks Start. Informs about audio capture and data transmission.
 * Includes a "Don't show this again" checkbox for permanent dismissal.
 */

import { useState } from 'react';

interface RecordingConsentWarningProps {
  onProceed: (dontShowAgain: boolean) => void;
  onCancel: () => void;
}

export function RecordingConsentWarning({ onProceed, onCancel }: RecordingConsentWarningProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  return (
    <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
      {/* Header */}
      <h3 className="mb-2 text-sm font-semibold text-amber-900">Recording Consent</h3>

      {/* Warning text */}
      <p className="mb-3 text-sm text-amber-800">
        This will capture audio from your browser tab and microphone. Audio is transcribed in
        real-time and sent to your configured AI services. No audio is recorded or stored.
      </p>

      {/* Don't show again checkbox */}
      <label className="mb-4 flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={dontShowAgain}
          onChange={(e) => setDontShowAgain(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-700">Don't show this again</span>
      </label>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100"
        >
          Cancel
        </button>
        <button
          onClick={() => onProceed(dontShowAgain)}
          className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 active:bg-green-800"
        >
          Proceed
        </button>
      </div>
    </div>
  );
}
