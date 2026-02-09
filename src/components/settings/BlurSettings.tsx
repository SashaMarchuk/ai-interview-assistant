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
      <div className="mb-1 flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">Blur Level</label>
        <span className="text-sm text-gray-500">{blurLevel}px</span>
      </div>
      <input
        type="range"
        min="0"
        max="20"
        value={blurLevel}
        onChange={(e) => setBlurLevel(Number(e.target.value))}
        className="h-2 w-full cursor-pointer rounded-lg bg-gray-200 accent-blue-600"
      />
      <div className="mt-1 flex justify-between text-xs text-gray-400">
        <span>Clear</span>
        <span>Heavy blur</span>
      </div>
    </div>
  );
}
