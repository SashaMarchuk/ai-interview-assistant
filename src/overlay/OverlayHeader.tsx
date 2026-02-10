import { memo, useCallback } from 'react';
import type { ReasoningEffort } from '../store/types';

interface OverlayHeaderProps {
  onMinimize: () => void;
  onReasoningRequest: () => void;
  reasoningEffort: ReasoningEffort;
  onReasoningEffortChange: (effort: ReasoningEffort) => void;
}

/**
 * Header component that serves as drag handle for react-rnd.
 * The className "overlay-drag-handle" is referenced by Rnd dragHandleClassName.
 * Memoized to prevent re-renders when parent state changes.
 */
export const OverlayHeader = memo(function OverlayHeader({
  onMinimize,
  onReasoningRequest,
  reasoningEffort,
  onReasoningEffortChange,
}: OverlayHeaderProps) {
  const handleMinimizeClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent drag when clicking button
      onMinimize();
    },
    [onMinimize],
  );

  const handleReasoningClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onReasoningRequest();
    },
    [onReasoningRequest],
  );

  const handleEffortChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onReasoningEffortChange(e.target.value as ReasoningEffort);
    },
    [onReasoningEffortChange],
  );

  return (
    <div className="overlay-drag-handle flex cursor-move items-center justify-between border-b border-white/10 px-3 py-2 select-none">
      <span className="text-sm font-medium text-white/90">AI Interview Assistant</span>
      <div className="flex items-center gap-1">
        {/* Reasoning effort selector - small dropdown */}
        <select
          value={reasoningEffort}
          onChange={handleEffortChange}
          onClick={(e) => e.stopPropagation()}
          className="rounded bg-white/10 px-1 py-0.5 text-xs text-white/70 outline-none hover:bg-white/20"
          title="Reasoning effort level"
        >
          <option value="low">Low</option>
          <option value="medium">Med</option>
          <option value="high">High</option>
        </select>
        {/* Reasoning button */}
        <button
          onClick={handleReasoningClick}
          className="rounded bg-purple-500/20 px-2 py-0.5 text-xs text-purple-300 transition-colors hover:bg-purple-500/30"
          title="Send reasoning request"
          aria-label="Reasoning request"
        >
          Reason
        </button>
        {/* Minimize button */}
        <button
          onClick={handleMinimizeClick}
          className="rounded px-2 py-1 text-lg leading-none text-white/50 transition-colors hover:bg-white/10 hover:text-white/90"
          title="Minimize"
          aria-label="Minimize overlay"
        >
          −
        </button>
      </div>
    </div>
  );
});
