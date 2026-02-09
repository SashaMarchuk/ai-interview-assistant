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
    [onMinimize],
  );
  return (
    <div className="overlay-drag-handle flex cursor-move items-center justify-between border-b border-white/10 px-3 py-2 select-none">
      <span className="text-sm font-medium text-white/90">AI Interview Assistant</span>
      <button
        onClick={handleClick}
        className="rounded px-2 py-1 text-lg leading-none text-white/50 transition-colors hover:bg-white/10 hover:text-white/90"
        title="Minimize"
        aria-label="Minimize overlay"
      >
        −
      </button>
    </div>
  );
});
