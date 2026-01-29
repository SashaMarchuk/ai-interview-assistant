/**
 * Hotkey Settings Component
 *
 * Allows users to customize keyboard shortcuts for extension actions.
 */

import { useStore } from '../../store';

export default function HotkeySettings() {
  const hotkeys = useStore((state) => state.hotkeys);
  const setHotkey = useStore((state) => state.setHotkey);

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
    </div>
  );
}
