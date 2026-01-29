import { useState } from 'react';
import { Rnd } from 'react-rnd';
import { useOverlayPosition } from './hooks/useOverlayPosition';
import { OverlayHeader } from './OverlayHeader';
import { TranscriptPanel } from './TranscriptPanel';
import { ResponsePanel } from './ResponsePanel';
import {
  type TranscriptEntry,
  type LLMResponse,
  MOCK_TRANSCRIPT,
  MOCK_RESPONSE,
} from '../types/transcript';

interface OverlayProps {
  // These props will be used in Phase 7 for real data
  // For now, we use mock data internally
  transcript?: TranscriptEntry[];
  response?: LLMResponse | null;
}

/**
 * Main overlay container with drag and resize functionality.
 * Uses react-rnd for interaction and persists position/size to chrome.storage.
 *
 * In Phase 5, uses mock data for development.
 * In Phase 7, will receive real data via props.
 */
export function Overlay({ transcript, response }: OverlayProps) {
  const {
    position,
    minimizedPosition,
    size,
    isMinimized,
    isLoaded,
    setPosition,
    setSize,
    setMinimized,
    setMinimizedPosition,
  } = useOverlayPosition();

  // Use mock data if no real data provided (Phase 5 development mode)
  const [mockTranscript] = useState<TranscriptEntry[]>(MOCK_TRANSCRIPT);
  const [mockResponse] = useState<LLMResponse | null>(MOCK_RESPONSE);

  const displayTranscript = transcript ?? mockTranscript;
  const displayResponse = response ?? mockResponse;

  // Don't render until initial position loaded from storage
  // This prevents flash of default position
  if (!isLoaded) {
    return null;
  }

  // Minimized state: small draggable "AI" button
  // Positioned top-right by default (doesn't block Meet navigation)
  if (isMinimized) {
    return (
      <Rnd
        position={minimizedPosition}
        size={{ width: 40, height: 40 }}
        enableResizing={false}
        bounds="window"
        onDragStop={(e, d) => setMinimizedPosition({ x: d.x, y: d.y })}
        className="z-[999999]"
      >
        <button
          onClick={() => setMinimized(false)}
          className="w-10 h-10 bg-blue-500 text-white rounded-full shadow-lg hover:bg-blue-600 text-xs font-bold flex items-center justify-center transition-colors cursor-move"
          title="Expand AI Assistant (drag to move)"
        >
          AI
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

        {/* Content area with panels */}
        <div className="flex-1 p-4 overflow-hidden flex flex-col gap-3">
          <TranscriptPanel entries={displayTranscript} />
          <ResponsePanel response={displayResponse} />
        </div>

        {/* Footer with status indicator */}
        <div className="px-4 py-2 bg-gray-50 border-t flex items-center justify-between text-xs text-gray-400">
          <span>AI Interview Assistant</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-green-400 rounded-full"></span>
            Ready
          </span>
        </div>
      </div>
    </Rnd>
  );
}
