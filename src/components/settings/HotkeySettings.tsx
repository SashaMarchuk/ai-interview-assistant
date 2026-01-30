/**
 * Hotkey Settings Component
 *
 * Allows users to customize keyboard shortcuts for extension actions.
 * Includes capture mode selection (hold vs toggle).
 */

import { useStore } from '../../store';
import type { CaptureMode } from '../../store';

export default function HotkeySettings() {
  const hotkeys = useStore((state) => state.hotkeys);
  const setHotkey = useStore((state) => state.setHotkey);
  const captureMode = useStore((state) => state.captureMode);
  const setCaptureMode = useStore((state) => state.setCaptureMode);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Capture Hotkey</label>
      <input
        type="text"
        value={hotkeys.capture}
        onChange={(e) => setHotkey('capture', e.target.value)}
        placeholder="Ctrl+Shift+Space"
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
      <p className="mt-1 text-xs text-gray-500">
        Use format like Ctrl+Shift+Space or Alt+H
      </p>

      {/* Capture Mode Selection */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Capture Mode
        </label>
        <div className="space-y-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="captureMode"
              value="hold"
              checked={captureMode === 'hold'}
              onChange={() => setCaptureMode('hold')}
              className="mt-0.5"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">Hold to capture</span>
              <p className="text-xs text-gray-500">
                Hold hotkey while speaking, release to send
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="captureMode"
              value="toggle"
              checked={captureMode === 'toggle'}
              onChange={() => setCaptureMode('toggle')}
              className="mt-0.5"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">Toggle mode</span>
              <p className="text-xs text-gray-500">
                Press once to start capture, press again to stop and send
              </p>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
