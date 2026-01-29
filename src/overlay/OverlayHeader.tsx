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
      className="overlay-drag-handle flex items-center justify-between px-4 py-2 bg-gray-50 border-b cursor-move select-none"
    >
      <span className="font-medium text-gray-700 text-sm">
        AI Interview Assistant
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation(); // Prevent drag when clicking button
          onMinimize();
        }}
        className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1 rounded hover:bg-gray-200 transition-colors"
        title="Minimize"
        aria-label="Minimize overlay"
      >
        −
      </button>
    </div>
  );
}
