/**
 * Capture Indicator Component
 *
 * Visual indicator shown when user is holding the capture hotkey.
 * Displays a pulsing bar at the top of the overlay.
 */

import { memo } from 'react';
import type { CaptureState } from '../hooks';

interface CaptureIndicatorProps {
  captureState: CaptureState | null;
}

/**
 * Visual indicator for active capture mode.
 * Renders a pulsing red/orange gradient bar when the user is holding the capture hotkey.
 * Memoized to prevent re-renders when other overlay state changes.
 */
export const CaptureIndicator = memo(function CaptureIndicator({
  captureState,
}: CaptureIndicatorProps) {
  // Only render when holding
  if (!captureState?.isHolding) {
    return null;
  }

  return (
    <div
      className="absolute top-0 right-0 left-0 z-10 flex items-center gap-2 px-3 py-2 text-sm font-medium text-white"
      style={{
        background: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
      }}
    >
      {/* Pulsing dot indicator */}
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75"></span>
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white"></span>
      </span>

      <span>Capturing question... Release to send</span>
    </div>
  );
});
