import { useState, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { useOverlayPosition } from './hooks/useOverlayPosition';
import { OverlayHeader } from './OverlayHeader';
import { TranscriptPanel } from './TranscriptPanel';
import { ResponsePanel } from './ResponsePanel';
import { CaptureIndicator } from './CaptureIndicator';
import { HealthIndicator, type HealthIssue } from './HealthIndicator';
import { useStore } from '../store';
import type { TranscriptEntry, LLMResponse } from '../types/transcript';
import type { CaptureState } from '../hooks';
import type {
  TranscriptUpdateEventDetail,
  CaptureStateEventDetail,
  LLMResponseEventDetail,
  ConnectionStateEventDetail,
} from '../../entrypoints/content';

interface OverlayProps {
  // Optional response prop for testing (real state comes via events)
  response?: LLMResponse | null;
}

// Minimized button dimensions
const MIN_BTN_WIDTH = 56;
const MIN_BTN_HEIGHT = 44;

/**
 * Status indicator component for footer
 */
function StatusIndicator({ status }: { status: LLMResponse['status'] | null }) {
  if (status === 'streaming') {
    return (
      <span className="flex items-center gap-1">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400"></span>
        </span>
        Streaming...
      </span>
    );
  }

  if (status === 'pending') {
    return (
      <span className="flex items-center gap-1">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400"></span>
        </span>
        Processing...
      </span>
    );
  }

  // Default: Ready (complete, error, or no response)
  return (
    <span className="flex items-center gap-1">
      <span className="w-2 h-2 bg-green-400 rounded-full"></span>
      Ready
    </span>
  );
}

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

  // Get blur level and API keys from settings store
  const blurLevel = useStore((state) => state.blurLevel);
  const apiKeys = useStore((state) => state.apiKeys);

  // Real transcript state - populated by transcript-update events
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  // Real LLM response state - populated by llm-response-update events
  const [llmResponse, setLLMResponse] = useState<LLMResponse | null>(null);

  // Capture state for visual indicator
  const [captureState, setCaptureState] = useState<CaptureState | null>(null);

  // Health issues for status display
  const [healthIssues, setHealthIssues] = useState<HealthIssue[]>([]);

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

  // Listen for LLM response updates from content script
  useEffect(() => {
    function handleLLMResponseUpdate(event: Event) {
      const customEvent = event as CustomEvent<LLMResponseEventDetail>;
      setLLMResponse(customEvent.detail.response);
    }

    window.addEventListener('llm-response-update', handleLLMResponseUpdate);
    return () => {
      window.removeEventListener('llm-response-update', handleLLMResponseUpdate);
    };
  }, []);

  // Listen for capture state updates (for visual indicator)
  useEffect(() => {
    function handleCaptureStateUpdate(event: Event) {
      const customEvent = event as CustomEvent<CaptureStateEventDetail>;
      setCaptureState(customEvent.detail.state);
    }

    window.addEventListener('capture-state-update', handleCaptureStateUpdate);
    return () => {
      window.removeEventListener('capture-state-update', handleCaptureStateUpdate);
    };
  }, []);

  // Listen for connection state updates from background (for HealthIndicator)
  useEffect(() => {
    function handleConnectionStateUpdate(event: Event) {
      const customEvent = event as CustomEvent<ConnectionStateEventDetail>;
      const { service, state, error } = customEvent.detail;

      setHealthIssues((prev) => {
        // Remove existing issue for this service (keep API key warnings)
        const filtered = prev.filter(
          (i) => i.service !== service && i.service !== 'Tab STT' && i.service !== 'Mic STT' && i.service !== 'LLM-conn'
        );

        // Re-add API key warnings (they should persist)
        const apiKeyIssues = prev.filter((i) => i.service === 'STT' || i.service === 'LLM');

        // Only add connection issue if not connected
        if (state !== 'connected') {
          const statusMap: Record<string, 'warning' | 'error' | 'reconnecting'> = {
            disconnected: 'warning',
            reconnecting: 'reconnecting',
            error: 'error',
          };
          const messageMap: Record<string, string> = {
            disconnected: 'Disconnected',
            reconnecting: 'Reconnecting...',
            error: error || 'Connection error',
          };

          const serviceName =
            service === 'stt-tab' ? 'Tab STT' : service === 'stt-mic' ? 'Mic STT' : 'LLM-conn';

          return [
            ...apiKeyIssues,
            {
              service: serviceName,
              status: statusMap[state] || 'error',
              message: messageMap[state] || state,
            },
          ];
        }

        // If connected, just return API key issues (connection issue removed)
        return apiKeyIssues;
      });
    }

    window.addEventListener('connection-state-update', handleConnectionStateUpdate);
    return () => {
      window.removeEventListener('connection-state-update', handleConnectionStateUpdate);
    };
  }, []);

  // Check for missing API keys and build health issues array
  // Per CONTEXT.md: only show issues when there are actual problems
  useEffect(() => {
    const issues: HealthIssue[] = [];

    // Only add issues for missing keys when we want to inform the user
    // Note: Real-time service status (reconnecting, etc.) will be added in plan 02
    if (!apiKeys.elevenLabs) {
      issues.push({
        service: 'STT',
        status: 'warning',
        message: 'ElevenLabs API key not configured',
      });
    }

    if (!apiKeys.openRouter) {
      issues.push({
        service: 'LLM',
        status: 'warning',
        message: 'OpenRouter API key not configured',
      });
    }

    setHealthIssues(issues);
  }, [apiKeys.elevenLabs, apiKeys.openRouter]);

  // Check if BOTH API keys are missing (for setup prompt)
  const bothKeysMissing = !apiKeys.elevenLabs && !apiKeys.openRouter;

  // Use prop if provided (for testing), otherwise use event-driven state
  const displayResponse = response ?? llmResponse;

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
        className="overlay-container relative h-full flex flex-col bg-black/10 rounded-lg shadow-2xl border border-white/20 overflow-hidden"
        style={{ backdropFilter: `blur(${blurLevel}px)` }}
      >
        {/* Health indicator at very top (absolute positioned, z-20) */}
        <HealthIndicator issues={healthIssues} />

        {/* Capture indicator below health indicator (absolute positioned, z-10) */}
        <CaptureIndicator captureState={captureState} />

        <OverlayHeader onMinimize={() => setMinimized(true)} />

        {/* Content area with panels */}
        <div className="flex-1 p-3 overflow-hidden flex flex-col gap-2 relative">
          <TranscriptPanel entries={transcript} />
          <ResponsePanel response={displayResponse} />

          {/* Setup prompt overlay when BOTH API keys missing */}
          {bothKeysMissing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
              <div className="text-center px-4 py-3 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 mx-4">
                <div className="text-white/90 text-sm font-medium mb-1">
                  Configure API keys in Settings
                </div>
                <div className="text-white/60 text-xs">
                  to use AI features
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer with status indicator */}
        <div className="px-3 py-1.5 border-t border-white/10 flex items-center justify-between text-xs text-white/60">
          <span>AI Interview Assistant</span>
          <StatusIndicator status={displayResponse?.status ?? null} />
        </div>
      </div>
    </Rnd>
  );
}
