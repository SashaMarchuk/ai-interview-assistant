import { useState, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { useOverlayPosition } from './hooks/useOverlayPosition';
import { OverlayHeader } from './OverlayHeader';
import { TranscriptPanel } from './TranscriptPanel';
import { ResponsePanel } from './ResponsePanel';
import { useStore } from '../store';
import {
  type TranscriptEntry,
  type LLMResponse,
  MOCK_RESPONSE,
} from '../types/transcript';
import type { TranscriptUpdateEventDetail } from '../../entrypoints/content';

interface OverlayProps {
  // Response prop for Phase 7 LLM integration
  response?: LLMResponse | null;
}

// Minimized button dimensions
const MIN_BTN_WIDTH = 56;
const MIN_BTN_HEIGHT = 44;

/**
 * Main overlay container with drag and resize functionality.
 * Uses react-rnd for interaction and persists position/size to chrome.storage.
 *
 * Listens for 'transcript-update' custom events from content script
 * to display real-time transcript data.
 */
export function Overlay({ response }: OverlayProps) {
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

  // Get blur level from settings store
  const blurLevel = useStore((state) => state.blurLevel);

  // Real transcript state - populated by transcript-update events
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  // Mock response for Phase 5/6 - will be replaced in Phase 7
  const [mockResponse] = useState<LLMResponse | null>(MOCK_RESPONSE);

  // Listen for transcript updates from content script
  useEffect(() => {
    function handleTranscriptUpdate(event: Event) {
      const customEvent = event as CustomEvent<TranscriptUpdateEventDetail>;
      setTranscript(customEvent.detail.entries);
    }

    window.addEventListener('transcript-update', handleTranscriptUpdate);
    return () => {
      window.removeEventListener('transcript-update', handleTranscriptUpdate);
    };
  }, []);

  const displayResponse = response ?? mockResponse;

  // Don't render until initial position loaded from storage
  // This prevents flash of default position
  if (!isLoaded) {
    return null;
  }

  // Minimized state: draggable "AI" button
  // Positioned top-right by default (doesn't block Meet navigation)
  if (isMinimized) {
    return (
      <Rnd
        position={minimizedPosition}
        size={{ width: MIN_BTN_WIDTH, height: MIN_BTN_HEIGHT }}
        enableResizing={false}
        bounds="window"
        onDragStop={(e, d) => setMinimizedPosition({ x: d.x, y: d.y })}
        className="z-[999999]"
      >
        <button
          onClick={() => setMinimized(false)}
          className="w-full h-full bg-blue-500/80 backdrop-blur-sm text-white rounded-lg shadow-lg hover:bg-blue-600/90 text-sm font-bold flex items-center justify-center transition-colors cursor-move"
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
      <div
        className="overlay-container h-full flex flex-col bg-black/10 rounded-lg shadow-2xl border border-white/20 overflow-hidden"
        style={{ backdropFilter: `blur(${blurLevel}px)` }}
      >
        <OverlayHeader onMinimize={() => setMinimized(true)} />

        {/* Content area with panels */}
        <div className="flex-1 p-3 overflow-hidden flex flex-col gap-2">
          <TranscriptPanel entries={transcript} />
          <ResponsePanel response={displayResponse} />
        </div>

        {/* Footer with status indicator */}
        <div className="px-3 py-1.5 border-t border-white/10 flex items-center justify-between text-xs text-white/60">
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
