import { memo, useCallback } from 'react';

interface OverlayHeaderProps {
  onMinimize: () => void;
}

/**
 * Header component that serves as drag handle for react-rnd.
 * The className "overlay-drag-handle" is referenced by Rnd dragHandleClassName.
 * Memoized to prevent re-renders when parent state changes.
 */
export const OverlayHeader = memo(function OverlayHeader({ onMinimize }: OverlayHeaderProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent drag when clicking button
      onMinimize();
    },
    [onMinimize]
  );
  return (
    <div
      className="overlay-drag-handle flex items-center justify-between px-3 py-2 border-b border-white/10 cursor-move select-none"
    >
      <span className="font-medium text-white/90 text-sm">
        AI Interview Assistant
      </span>
      <button
        onClick={handleClick}
        className="text-white/50 hover:text-white/90 text-lg leading-none px-2 py-1 rounded hover:bg-white/10 transition-colors"
        title="Minimize"
        aria-label="Minimize overlay"
      >
        −
      </button>
    </div>
  );
});
