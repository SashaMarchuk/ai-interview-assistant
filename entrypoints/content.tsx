import { createRoot } from 'react-dom/client';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { Overlay } from '../src/overlay';
import { storeReadyPromise, useStore } from '../src/store';
import { useCaptureMode, type CaptureState } from '../src/hooks';
import '../src/assets/app.css';
import type { TranscriptEntry, LLMResponse } from '../src/types/transcript';
import type {
  ExtensionMessage,
  LLMRequestMessage,
  LLMStreamMessage,
  LLMStatusMessage,
  ConnectionService,
  ConnectionStatus,
} from '../src/types/messages';

// Only inject on active Google Meet meeting pages (not landing/join pages)
// Meeting URL pattern: meet.google.com/xxx-xxxx-xxx
const MEET_URL_PATTERN = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i;

// Custom event type for transcript updates
export interface TranscriptUpdateEventDetail {
  entries: TranscriptEntry[];
}

// Custom event type for capture state updates (for visual indicator)
export interface CaptureStateEventDetail {
  state: CaptureState;
}

// Custom event type for LLM response updates
export interface LLMResponseEventDetail {
  response: LLMResponse;
}

// Custom event type for connection state updates (for HealthIndicator)
export interface ConnectionStateEventDetail {
  service: ConnectionService;
  state: ConnectionStatus;
  error?: string;
}

// Module-level transcript state
let currentTranscript: TranscriptEntry[] = [];

// Module-level LLM response state
let currentLLMResponse: LLMResponse | null = null;

// Track the currently active responseId to ignore tokens from cancelled requests
let activeResponseId: string | null = null;

/**
 * Dispatch LLM response update to the React overlay via custom event.
 * The overlay listens for this event to update its response state.
 */
function dispatchLLMResponseUpdate(response: LLMResponse): void {
  currentLLMResponse = response;
  window.dispatchEvent(
    new CustomEvent<LLMResponseEventDetail>('llm-response-update', {
      detail: { response },
    }),
  );
}

/**
 * Initialize a new LLM response with pending status.
 * This also sets the activeResponseId to track which request is current.
 */
function initLLMResponse(responseId: string): void {
  // Set this as the active response - all other responses will be ignored
  activeResponseId = responseId;

  // Clear any existing response state
  const response: LLMResponse = {
    id: responseId,
    questionId: responseId, // Use same ID for now
    fastHint: null,
    fullAnswer: null,
    status: 'pending',
  };
  dispatchLLMResponseUpdate(response);
}

/**
 * Handle LLM stream token message.
 * Ignores tokens from cancelled/old requests.
 */
function handleLLMStream(message: LLMStreamMessage): void {
  // Ignore tokens from cancelled/old requests
  if (activeResponseId && message.responseId !== activeResponseId) {
    return;
  }

  if (!currentLLMResponse || currentLLMResponse.id !== message.responseId) {
    // Initialize if response doesn't exist
    initLLMResponse(message.responseId);
  }

  const response = { ...currentLLMResponse! };
  response.status = 'streaming';

  if (message.model === 'fast') {
    response.fastHint = (response.fastHint || '') + message.token;
  } else if (message.model === 'full') {
    response.fullAnswer = (response.fullAnswer || '') + message.token;
  }

  dispatchLLMResponseUpdate(response);
}

/**
 * Handle LLM status change message.
 * Ignores status updates from cancelled/old requests.
 */
function handleLLMStatus(message: LLMStatusMessage): void {
  // Ignore status updates from cancelled/old requests
  if (activeResponseId && message.responseId !== activeResponseId) {
    return;
  }

  if (!currentLLMResponse || currentLLMResponse.id !== message.responseId) {
    // Initialize if response doesn't exist
    initLLMResponse(message.responseId);
  }

  const response = { ...currentLLMResponse! };

  // Update status based on which model(s) the status applies to
  if (message.status === 'error') {
    response.status = 'error';
    response.error = message.error;
  } else if (message.status === 'complete' && message.model === 'both') {
    response.status = 'complete';
  } else if (message.status === 'streaming') {
    response.status = 'streaming';
  } else if (message.status === 'pending') {
    response.status = 'pending';
  }

  dispatchLLMResponseUpdate(response);
}

/**
 * Get transcript entries since a given timestamp, formatted as string
 */
function getTranscriptSince(timestamp: number): string {
  return currentTranscript
    .filter((e) => e.timestamp >= timestamp && e.isFinal)
    .map((e) => `${e.speaker}: ${e.text}`)
    .join('\n');
}

/**
 * Get recent transcript (last 5 final entries)
 */
function getRecentTranscript(): string {
  return currentTranscript
    .filter((e) => e.isFinal)
    .slice(-5)
    .map((e) => `${e.speaker}: ${e.text}`)
    .join('\n');
}

/**
 * Get full transcript formatted as string
 */
function getFullTranscript(): string {
  return currentTranscript
    .filter((e) => e.isFinal)
    .map((e) => `${e.speaker}: ${e.text}`)
    .join('\n');
}

/**
 * Send LLM request to background service worker
 */
async function sendLLMRequest(question: string, _mode: 'hold' | 'highlight'): Promise<void> {
  const state = useStore.getState();

  if (!state.activeTemplateId) {
    console.warn('AI Interview Assistant: No active template selected');
    return;
  }

  const responseId = crypto.randomUUID();

  // Clear any existing response and initialize fresh state for new request
  // This ensures UI shows only the new response, not mixed content
  currentLLMResponse = null;
  initLLMResponse(responseId);

  const message: LLMRequestMessage = {
    type: 'LLM_REQUEST',
    responseId,
    question,
    recentContext: getRecentTranscript(),
    fullTranscript: getFullTranscript(),
    templateId: state.activeTemplateId,
  };

  try {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.success) {
      console.error(
        'AI Interview Assistant: LLM request failed:',
        response?.error || `Unknown - response: ${JSON.stringify(response)}`,
      );
    }
  } catch (error) {
    console.error('AI Interview Assistant: Failed to send LLM request:', error);
  }
}

/**
 * Dispatch transcript update to the React overlay via custom event.
 * The overlay listens for this event to update its state.
 */
function dispatchTranscriptUpdate(entries: TranscriptEntry[]): void {
  currentTranscript = entries;
  window.dispatchEvent(
    new CustomEvent<TranscriptUpdateEventDetail>('transcript-update', {
      detail: { entries },
    }),
  );
}

// Context to expose capture state to children (for visual indicator)
const CaptureContext = createContext<CaptureState | null>(null);

/**
 * Hook to access capture state from within the overlay
 */
export function useCaptureState(): CaptureState | null {
  return useContext(CaptureContext);
}

interface CaptureProviderProps {
  children: ReactNode;
  onCapture: (text: string, mode: 'hold' | 'highlight') => void;
  getTranscriptSince: (timestamp: number) => string;
  getRecentTranscript: () => string;
  getFullTranscript: () => string;
}

/**
 * Provider component that manages capture mode and exposes state via context.
 * Also dispatches custom events for components outside React tree.
 */
function CaptureProvider({
  children,
  onCapture,
  getTranscriptSince: gts,
  getRecentTranscript: grt,
  getFullTranscript: gft,
}: CaptureProviderProps) {
  const captureState = useCaptureMode({
    onCapture,
    getTranscriptSince: gts,
    getRecentTranscript: grt,
    getFullTranscript: gft,
  });

  // Dispatch custom event when capture state changes
  // This allows the Overlay to update its CaptureIndicator
  /* eslint-disable react-hooks/exhaustive-deps -- intentionally tracking specific fields, not the full object */
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent<CaptureStateEventDetail>('capture-state-update', {
        detail: { state: captureState },
      }),
    );
  }, [captureState.isHolding, captureState.mode]);
  /* eslint-enable react-hooks/exhaustive-deps */

  return <CaptureContext.Provider value={captureState}>{children}</CaptureContext.Provider>;
}

export default defineContentScript({
  matches: ['https://meet.google.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
    // Check if this is an active meeting page (not landing/join page)
    if (!MEET_URL_PATTERN.test(window.location.href)) {
      console.log('AI Interview Assistant: Not a meeting page, skipping injection');
      return;
    }

    console.log('AI Interview Assistant: Content script loaded on Meet page');

    // Set up message listener for messages from Service Worker/Popup
    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
      switch (message.type) {
        case 'TRANSCRIPT_UPDATE':
          dispatchTranscriptUpdate(message.entries);
          return false;

        case 'LLM_STREAM':
          handleLLMStream(message);
          return false;

        case 'LLM_STATUS':
          // Only log errors
          if (message.status === 'error') {
            console.error('AI Interview Assistant: LLM error:', message.error);
          }
          handleLLMStatus(message);
          return false;

        case 'REQUEST_MIC_PERMISSION':
          // Handle mic permission request from popup
          // Content scripts run in the web page context, so permission prompts work properly here
          console.log('AI Interview Assistant: Requesting mic permission from page context');
          navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then((stream) => {
              // Permission granted - immediately stop the stream (we just needed the permission)
              stream.getTracks().forEach((track) => track.stop());
              console.log('AI Interview Assistant: Mic permission granted');
              sendResponse({ success: true });
            })
            .catch((error) => {
              console.error('AI Interview Assistant: Mic permission denied', error);
              sendResponse({ success: false, error: error.message || 'Permission denied' });
            });
          return true; // Keep channel open for async response

        case 'CONNECTION_STATE':
          // Dispatch custom event for Overlay to consume (for HealthIndicator)
          // Only log non-connected states
          if (message.state !== 'connected') {
            console.log(
              'AI Interview Assistant:',
              message.service,
              message.state,
              message.error || '',
            );
          }
          window.dispatchEvent(
            new CustomEvent<ConnectionStateEventDetail>('connection-state-update', {
              detail: {
                service: message.service,
                state: message.state,
                error: message.error,
              },
            }),
          );
          return false;

        default:
          return false;
      }
    });

    // Wait for store to sync before rendering (for blur level, hotkey settings, etc.)
    await storeReadyPromise;

    // Create UI container using WXT's createShadowRootUi for proper isolation
    const ui = await createShadowRootUi(ctx, {
      name: 'ai-interview-assistant',
      position: 'inline',
      anchor: 'body',
      onMount: (container) => {
        // Create React root inside shadow DOM
        const root = createRoot(container);
        // Render the overlay wrapped with CaptureProvider for keyboard handling
        root.render(
          <CaptureProvider
            onCapture={sendLLMRequest}
            getTranscriptSince={getTranscriptSince}
            getRecentTranscript={getRecentTranscript}
            getFullTranscript={getFullTranscript}
          >
            <Overlay />
          </CaptureProvider>,
        );
        return root;
      },
      onRemove: (root) => {
        root?.unmount();
      },
    });

    ui.mount();
    console.log('AI Interview Assistant: Overlay injected with capture mode support');

    // Notify background that UI is ready
    try {
      await chrome.runtime.sendMessage({
        type: 'UI_INJECTED',
        success: true,
      });
    } catch (error) {
      console.warn('Failed to notify UI injection:', error);
    }
  },
});
