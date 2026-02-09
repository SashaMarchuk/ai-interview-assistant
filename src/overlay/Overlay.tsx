import { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { Rnd } from 'react-rnd';
import type { DraggableEvent, DraggableData } from 'react-draggable';
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

type TypedCustomEventHandler<T> = (event: CustomEvent<T>) => void;

interface OverlayProps {
  // Optional response prop for testing (real state comes via events)
  response?: LLMResponse | null;
}

// Minimized button dimensions
const MIN_BTN_WIDTH = 56;
const MIN_BTN_HEIGHT = 44;

// Static Rnd configuration objects - defined outside component to avoid recreation on every render
const ENABLE_RESIZING = {
  top: false,
  right: true,
  bottom: true,
  left: false,
  topRight: false,
  bottomRight: true,
  bottomLeft: false,
  topLeft: false,
} as const;

const RESIZE_HANDLE_STYLES = {
  right: { cursor: 'ew-resize' as const },
  bottom: { cursor: 'ns-resize' as const },
  bottomRight: { cursor: 'nwse-resize' as const },
} as const;

const MINIMIZED_SIZE = { width: MIN_BTN_WIDTH, height: MIN_BTN_HEIGHT };

/**
 * Status indicator component for footer.
 * Memoized to prevent re-renders when other overlay state changes.
 */
const StatusIndicator = memo(function StatusIndicator({
  status,
  isReasoningPending,
}: {
  status: LLMResponse['status'] | null;
  isReasoningPending?: boolean;
}) {
  // Show purple reasoning indicator when reasoning mode is active
  if (isReasoningPending && (status === 'streaming' || status === 'pending')) {
    return (
      <span className="flex items-center gap-1">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-purple-400"></span>
        </span>
        Reasoning...
      </span>
    );
  }

  if (status === 'streaming') {
    return (
      <span className="flex items-center gap-1">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-400"></span>
        </span>
        Streaming...
      </span>
    );
  }

  if (status === 'pending') {
    return (
      <span className="flex items-center gap-1">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-400"></span>
        </span>
        Processing...
      </span>
    );
  }

  // Default: Ready (complete, error, or no response)
  return (
    <span className="flex items-center gap-1">
      <span className="h-2 w-2 rounded-full bg-green-400"></span>
      Ready
    </span>
  );
});

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

  // Get blur level, API keys, and reasoning effort from settings store
  const blurLevel = useStore((state) => state.blurLevel);
  const apiKeys = useStore((state) => state.apiKeys);
  const reasoningEffort = useStore((state) => state.reasoningEffort);
  const setReasoningEffort = useStore((state) => state.setReasoningEffort);

  // Real transcript state - populated by transcript-update events
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  // Real LLM response state - populated by llm-response-update events
  const [llmResponse, setLLMResponse] = useState<LLMResponse | null>(null);

  // Capture state for visual indicator
  const [captureState, setCaptureState] = useState<CaptureState | null>(null);

  // Track whether a reasoning request is in progress (for purple indicator)
  const [isReasoningPending, setIsReasoningPending] = useState(false);
  // Use ref to track reasoning state in event listener without stale closures
  const isReasoningPendingRef = useRef(false);

  // Health issues for status display
  const [connectionIssues, setConnectionIssues] = useState<HealthIssue[]>([]);

  // Consolidated event listeners for transcript, LLM response, and capture state
  // Using useCallback to create stable handler references
  useEffect(() => {
    const handleTranscriptUpdate: TypedCustomEventHandler<TranscriptUpdateEventDetail> = (
      event,
    ) => {
      setTranscript(event.detail.entries);
    };

    const handleLLMResponseUpdate: TypedCustomEventHandler<LLMResponseEventDetail> = (event) => {
      setLLMResponse(event.detail.response);
      // Reset reasoning pending when response completes or errors
      if (
        isReasoningPendingRef.current &&
        (event.detail.response.status === 'complete' || event.detail.response.status === 'error')
      ) {
        setIsReasoningPending(false);
        isReasoningPendingRef.current = false;
      }
    };

    const handleCaptureStateUpdate: TypedCustomEventHandler<CaptureStateEventDetail> = (event) => {
      setCaptureState(event.detail.state);
    };

    window.addEventListener('transcript-update', handleTranscriptUpdate as EventListener);
    window.addEventListener('llm-response-update', handleLLMResponseUpdate as EventListener);
    window.addEventListener('capture-state-update', handleCaptureStateUpdate as EventListener);

    return () => {
      window.removeEventListener('transcript-update', handleTranscriptUpdate as EventListener);
      window.removeEventListener('llm-response-update', handleLLMResponseUpdate as EventListener);
      window.removeEventListener('capture-state-update', handleCaptureStateUpdate as EventListener);
    };
  }, []);

  // Listen for connection state updates from background (for HealthIndicator)
  useEffect(() => {
    const serviceNameMap: Record<ConnectionStateEventDetail['service'], string> = {
      'stt-tab': 'Tab STT',
      'stt-mic': 'Mic STT',
      llm: 'LLM-conn',
    };

    const handleConnectionStateUpdate: TypedCustomEventHandler<ConnectionStateEventDetail> = (
      event,
    ) => {
      const { service, state, error } = event.detail;
      const serviceName = serviceNameMap[service];

      setConnectionIssues((prev) => {
        const remaining = prev.filter((i) => i.service !== serviceName);

        if (state === 'connected') return remaining;

        const statusMap: Record<string, HealthIssue['status']> = {
          disconnected: 'warning',
          reconnecting: 'reconnecting',
          error: 'error',
        };
        const messageMap: Record<string, string> = {
          disconnected: 'Disconnected',
          reconnecting: 'Reconnecting...',
          error: error || 'Connection error',
        };

        return [
          ...remaining,
          { service: serviceName, status: statusMap[state], message: messageMap[state] },
        ];
      });
    };

    window.addEventListener(
      'connection-state-update',
      handleConnectionStateUpdate as EventListener,
    );
    return () => {
      window.removeEventListener(
        'connection-state-update',
        handleConnectionStateUpdate as EventListener,
      );
    };
  }, []);

  // Check for missing API keys and build health issues array
  // Per CONTEXT.md: only show issues when there are actual problems
  const apiKeyIssues = useMemo(() => {
    const issues: HealthIssue[] = [];

    // Only add issues for missing keys when we want to inform the user
    if (!apiKeys.elevenLabs) {
      issues.push({
        service: 'STT',
        status: 'warning',
        message: 'ElevenLabs API key not configured',
      });
    }

    // Only show LLM warning when NEITHER OpenRouter nor OpenAI is configured
    if (!apiKeys.openRouter && !apiKeys.openAI) {
      issues.push({
        service: 'LLM',
        status: 'warning',
        message: 'No LLM API key configured',
      });
    }

    return issues;
  }, [apiKeys.elevenLabs, apiKeys.openRouter, apiKeys.openAI]);

  // Combine API key issues with connection issues, memoized to prevent
  // new array creation on every render (avoids unnecessary HealthIndicator re-renders)
  const allHealthIssues = useMemo(
    () => [...apiKeyIssues, ...connectionIssues],
    [apiKeyIssues, connectionIssues],
  );

  // Check if BOTH STT and LLM keys are missing (for setup prompt)
  // Memoize to prevent recalculation on every render
  const bothKeysMissing = useMemo(
    () => !apiKeys.elevenLabs && !apiKeys.openRouter && !apiKeys.openAI,
    [apiKeys.elevenLabs, apiKeys.openRouter, apiKeys.openAI],
  );

  // Use prop if provided (for testing), otherwise use event-driven state
  const displayResponse = response ?? llmResponse;

  // Memoize backdrop filter style to prevent object recreation
  const backdropStyle = useMemo(() => ({ backdropFilter: `blur(${blurLevel}px)` }), [blurLevel]);

  // Stable callback references for Rnd handlers using react-draggable types
  const handleDragStop = useCallback(
    (_e: DraggableEvent, d: DraggableData) => setPosition({ x: d.x, y: d.y }),
    [setPosition],
  );

  const handleResizeStop = useCallback(
    (
      _e: MouseEvent | TouchEvent,
      _dir: string,
      ref: HTMLElement,
      _delta: { width: number; height: number },
      pos: { x: number; y: number },
    ) => {
      setSize({
        width: parseInt(ref.style.width, 10),
        height: parseInt(ref.style.height, 10),
      });
      setPosition(pos);
    },
    [setSize, setPosition],
  );

  const handleMinimizedDragStop = useCallback(
    (_e: DraggableEvent, d: DraggableData) => setMinimizedPosition({ x: d.x, y: d.y }),
    [setMinimizedPosition],
  );

  const handleExpand = useCallback(() => setMinimized(false), [setMinimized]);
  const handleMinimize = useCallback(() => setMinimized(true), [setMinimized]);

  const handleReasoningRequest = useCallback(() => {
    setIsReasoningPending(true);
    isReasoningPendingRef.current = true;
    // Dispatch a custom event that content.tsx will pick up
    window.dispatchEvent(
      new CustomEvent('reasoning-request', {
        detail: { effort: reasoningEffort },
      }),
    );
  }, [reasoningEffort]);

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
        size={MINIMIZED_SIZE}
        enableResizing={false}
        bounds="window"
        onDragStop={handleMinimizedDragStop}
        className="z-[999999]"
      >
        <button
          onClick={handleExpand}
          className="flex h-full w-full cursor-move items-center justify-center rounded-lg bg-blue-500/80 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-blue-600/90"
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
      onDragStop={handleDragStop}
      onResizeStop={handleResizeStop}
      dragHandleClassName="overlay-drag-handle"
      minWidth={280}
      minHeight={200}
      bounds="window"
      enableResizing={ENABLE_RESIZING}
      className="z-[999999]"
      resizeHandleStyles={RESIZE_HANDLE_STYLES}
    >
      <div
        className="overlay-container relative flex h-full flex-col overflow-hidden rounded-lg border border-white/20 bg-black/10 shadow-2xl"
        style={backdropStyle}
      >
        {/* Health indicator at very top (absolute positioned, z-20) */}
        <HealthIndicator issues={allHealthIssues} />

        {/* Capture indicator below health indicator (absolute positioned, z-10) */}
        <CaptureIndicator captureState={captureState} />

        <OverlayHeader
          onMinimize={handleMinimize}
          onReasoningRequest={handleReasoningRequest}
          reasoningEffort={reasoningEffort}
          onReasoningEffortChange={setReasoningEffort}
        />

        {/* Content area with panels */}
        <div className="relative flex flex-1 flex-col gap-2 overflow-hidden p-3">
          <TranscriptPanel entries={transcript} />
          <ResponsePanel response={displayResponse} isReasoningPending={isReasoningPending} />

          {/* Setup prompt overlay when BOTH API keys missing */}
          {bothKeysMissing && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
              <div className="mx-4 rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-center backdrop-blur-sm">
                <div className="mb-1 text-sm font-medium text-white/90">
                  Configure API keys in Settings
                </div>
                <div className="text-xs text-white/60">to use AI features</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer with status indicator */}
        <div className="flex items-center justify-between border-t border-white/10 px-3 py-1.5 text-xs text-white/60">
          <span>AI Interview Assistant</span>
          <StatusIndicator
            status={displayResponse?.status ?? null}
            isReasoningPending={isReasoningPending}
          />
        </div>
      </div>
    </Rnd>
  );
}
