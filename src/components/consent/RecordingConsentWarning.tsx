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
    <div className="border-2 border-amber-300 bg-amber-50 rounded-lg p-4">
      {/* Header */}
      <h3 className="text-sm font-semibold text-amber-900 mb-2">
        Recording Consent
      </h3>

      {/* Warning text */}
      <p className="text-sm text-amber-800 mb-3">
        This will capture audio from your browser tab and microphone. Audio is
        transcribed in real-time and sent to your configured AI services. No audio
        is recorded or stored.
      </p>

      {/* Don't show again checkbox */}
      <label className="flex items-center gap-2 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={dontShowAgain}
          onChange={(e) => setDontShowAgain(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-700">Don't show this again</span>
      </label>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 rounded-lg font-medium text-sm border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onProceed(dontShowAgain)}
          className="flex-1 px-4 py-2 rounded-lg font-medium text-sm bg-green-600 text-white hover:bg-green-700 active:bg-green-800 transition-colors"
        >
          Proceed
        </button>
      </div>
    </div>
  );
}
