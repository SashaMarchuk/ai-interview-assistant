interface OverlayHeaderProps {
  onMinimize: () => void;
}

/**
 * Header component that serves as drag handle for react-rnd.
 * The className "overlay-drag-handle" is referenced by Rnd dragHandleClassName.
 */
export function OverlayHeader({ onMinimize }: OverlayHeaderProps) {
  return (
    <div
      className="overlay-drag-handle flex items-center justify-between px-3 py-2 border-b border-white/10 cursor-move select-none"
    >
      <span className="font-medium text-white/90 text-sm">
        AI Interview Assistant
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation(); // Prevent drag when clicking button
          onMinimize();
        }}
        className="text-white/50 hover:text-white/90 text-lg leading-none px-2 py-1 rounded hover:bg-white/10 transition-colors"
        title="Minimize"
        aria-label="Minimize overlay"
      >
        −
      </button>
    </div>
  );
}
