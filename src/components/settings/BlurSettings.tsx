/**
 * Blur Settings Component
 *
 * Allows users to adjust the blur level of the overlay background.
 */

import { useStore } from '../../store';

export default function BlurSettings() {
  const blurLevel = useStore((state) => state.blurLevel);
  const setBlurLevel = useStore((state) => state.setBlurLevel);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-gray-700">Blur Level</label>
        <span className="text-sm text-gray-500">{blurLevel}px</span>
      </div>
      <input
        type="range"
        min="0"
        max="20"
        value={blurLevel}
        onChange={(e) => setBlurLevel(Number(e.target.value))}
        className="w-full h-2 bg-gray-200 rounded-lg cursor-pointer accent-blue-600"
      />
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>Clear</span>
        <span>Heavy blur</span>
      </div>
    </div>
  );
}
