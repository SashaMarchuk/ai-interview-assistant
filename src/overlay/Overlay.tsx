import { Rnd } from 'react-rnd';
import { useOverlayPosition } from './hooks/useOverlayPosition';
import { OverlayHeader } from './OverlayHeader';

interface OverlayProps {
  children?: React.ReactNode;
}

/**
 * Main overlay container with drag and resize functionality.
 * Uses react-rnd for interaction and persists position/size to chrome.storage.
 */
export function Overlay({ children }: OverlayProps) {
  const {
    position,
    size,
    isMinimized,
    isLoaded,
    setPosition,
    setSize,
    setMinimized,
  } = useOverlayPosition();

  // Don't render until initial position loaded from storage
  // This prevents flash of default position
  if (!isLoaded) {
    return null;
  }

  // Minimized state: render small expandable button
  if (isMinimized) {
    return (
      <Rnd
        position={position}
        size={{ width: 140, height: 36 }}
        enableResizing={false}
        bounds="window"
        onDragStop={(e, d) => setPosition({ x: d.x, y: d.y })}
        className="z-[999999]"
      >
        <button
          onClick={() => setMinimized(false)}
          className="w-full h-full bg-blue-500 text-white rounded-lg shadow-lg hover:bg-blue-600 text-sm font-medium px-3 flex items-center justify-center gap-2 transition-colors"
          title="Expand AI Assistant"
        >
          <span>AI Assistant</span>
          <span className="text-blue-200">+</span>
        </button>
      </Rnd>
    );
  }

  // Full expanded state with drag/resize
  return (
    <Rnd
      position={position}
      size={size}
      onDragStop={(e, d) => setPosition({ x: d.x, y: d.y })}
      onResizeStop={(e, dir, ref, delta, pos) => {
        setSize({
          width: parseInt(ref.style.width, 10),
          height: parseInt(ref.style.height, 10),
        });
        setPosition(pos);
      }}
      dragHandleClassName="overlay-drag-handle"
      minWidth={280}
      minHeight={200}
      maxWidth={700}
      maxHeight={900}
      bounds="window"
      enableResizing={{
        top: false,
        right: true,
        bottom: true,
        left: false,
        topRight: false,
        bottomRight: true,
        bottomLeft: false,
        topLeft: false,
      }}
      className="z-[999999]"
      resizeHandleStyles={{
        right: { cursor: 'ew-resize' },
        bottom: { cursor: 'ns-resize' },
        bottomRight: { cursor: 'nwse-resize' },
      }}
    >
      <div className="overlay-container h-full flex flex-col bg-white/90 backdrop-blur-sm rounded-lg shadow-xl border border-gray-200 overflow-hidden">
        <OverlayHeader onMinimize={() => setMinimized(true)} />

        {/* Content area */}
        <div className="flex-1 p-4 overflow-hidden flex flex-col gap-3">
          {children || (
            <div className="text-sm text-gray-400 italic">
              Content will be added in Plan 03
            </div>
          )}
        </div>

        {/* Footer with status indicator */}
        <div className="px-4 py-2 bg-gray-50 border-t flex items-center justify-between text-xs text-gray-400">
          <span>Phase 5 - Overlay UI</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-green-400 rounded-full"></span>
            Ready
          </span>
        </div>
      </div>
    </Rnd>
  );
}
