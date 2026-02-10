import { createRoot } from 'react-dom/client';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { Overlay } from '../src/overlay';
import { storeReadyPromise, useStore } from '../src/store';
import { useCaptureMode, type CaptureState } from '../src/hooks';
import { safeSendMessage, safeMessageListener } from '../src/utils/messaging';
import '../src/assets/app.css';
import type { TranscriptEntry, LLMResponse, TranscriptEdit } from '../src/types/transcript';
import type {
  ExtensionMessage,
  LLMRequestMessage,
  LLMStreamMessage,
  LLMStatusMessage,
  LLMCostMessage,
  QuickPromptRequestMessage,
  ConnectionService,
  ConnectionStatus,
} from '../src/types/messages';

// Only inject on active Google Meet meeting pages (not landing/join pages)
// Meeting URL pattern: meet.google.com/xxx-xxxx-xxx
const MEET_URL_PATTERN = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i;

// Custom event type for reasoning request from overlay
export interface ReasoningRequestEventDetail {
  effort: 'low' | 'medium' | 'high';
}

// Custom event type for transcript updates
export interface TranscriptUpdateEventDetail {
  entries: TranscriptEntry[];
  editedIds: string[]; // IDs of entries that have been edited (for UI indicators)
  deletedIds: string[]; // IDs of soft-deleted entries (for undo UI)
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

// Custom event type for session cost updates
export interface SessionCostEventDetail {
  sessionCost: number;
}

/** Standard response from background service worker for async operations */
interface BackgroundResponse {
  success?: boolean;
  error?: string;
}

// Module-level transcript state
let currentTranscript: TranscriptEntry[] = [];

// Edit overlay map: session-scoped edits layered on top of raw transcript
const transcriptEdits = new Map<string, TranscriptEdit>();

// Module-level LLM response state
let currentLLMResponse: LLMResponse | null = null;

// Track the currently active responseId to ignore tokens from cancelled requests
let activeResponseId: string | null = null;

// Session cost tracking (in-memory, resets on page reload)
let sessionCostUSD = 0;

/** Accumulate cost into session total and dispatch update event for Overlay footer. */
function addSessionCost(costUSD: number): void {
  sessionCostUSD += costUSD;
  window.dispatchEvent(
    new CustomEvent<SessionCostEventDetail>('session-cost-update', {
      detail: { sessionCost: sessionCostUSD },
    }),
  );
}

// Quick prompt response entries (concurrent, independent from main LLM response)
interface QuickPromptResponseEntry {
  id: string; // responseId (prefixed with 'qp-')
  actionLabel: string; // e.g., "Explain"
  textSnippet: string; // First ~50 chars of selected text
  content: string; // Accumulated response text
  status: 'streaming' | 'complete' | 'error';
  error?: string;
  costUSD?: number;
}

const quickPromptResponses: QuickPromptResponseEntry[] = [];
// Map for O(1) lookup of quick prompt responses by responseId
const quickPromptResponseMap = new Map<string, QuickPromptResponseEntry>();

// Token batching for streaming performance
// Accumulates tokens and flushes on animation frame to reduce React re-renders

let pendingFastTokens = '';
let pendingFullTokens = '';
let tokenBatchRafId: number | null = null;

// Quick prompt token batching (separate from main LLM batching)
const pendingQpTokens = new Map<string, string>();

let qpTokenBatchRafId: number | null = null;

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

  // Reset token batching state
  if (tokenBatchRafId !== null) {
    cancelAnimationFrame(tokenBatchRafId);
    tokenBatchRafId = null;
  }
  pendingFastTokens = '';
  pendingFullTokens = '';

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
 * Flush accumulated streaming tokens to the React overlay.
 * Called on each animation frame during streaming and before status transitions.
 */
function flushPendingTokens(): void {
  tokenBatchRafId = null;
  if (!pendingFastTokens && !pendingFullTokens) return;
  if (!currentLLMResponse) return;

  const response = { ...currentLLMResponse };
  if (pendingFastTokens) {
    response.fastHint = (response.fastHint || '') + pendingFastTokens;
    pendingFastTokens = '';
  }
  if (pendingFullTokens) {
    response.fullAnswer = (response.fullAnswer || '') + pendingFullTokens;
    pendingFullTokens = '';
  }
  response.status = 'streaming';
  dispatchLLMResponseUpdate(response);
}

function ensureLLMResponse(responseId: string): LLMResponse | null {
  if (activeResponseId && responseId !== activeResponseId) {
    return null;
  }
  if (!currentLLMResponse || currentLLMResponse.id !== responseId) {
    initLLMResponse(responseId);
  }
  return { ...currentLLMResponse! };
}

function handleLLMStream(message: LLMStreamMessage): void {
  // Route quick prompt responses separately (responseId starts with 'qp-')
  if (message.responseId.startsWith('qp-')) {
    handleQuickPromptStream(message);
    return;
  }

  // Ensure response exists (initializes if needed, returns null if stale)
  const response = ensureLLMResponse(message.responseId);
  if (!response) return;

  // Accumulate tokens into pending buffers
  if (message.model === 'fast') {
    pendingFastTokens += message.token;
  } else if (message.model === 'full') {
    pendingFullTokens += message.token;
  }

  // Schedule a flush on the next animation frame (if not already scheduled)
  if (tokenBatchRafId === null) {
    tokenBatchRafId = requestAnimationFrame(flushPendingTokens);
  }
}

function handleLLMStatus(message: LLMStatusMessage): void {
  // Route quick prompt responses separately (responseId starts with 'qp-')
  if (message.responseId.startsWith('qp-')) {
    handleQuickPromptStatus(message);
    return;
  }

  // Flush any pending tokens before status transition
  if (tokenBatchRafId !== null) {
    cancelAnimationFrame(tokenBatchRafId);
    flushPendingTokens();
  }

  const response = ensureLLMResponse(message.responseId);
  if (!response) return;

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

function handleLLMCost(message: LLMCostMessage): void {
  // Route quick prompt cost updates separately (responseId starts with 'qp-')
  if (message.responseId.startsWith('qp-')) {
    handleQuickPromptCost(message);
    return;
  }

  if (!currentLLMResponse || currentLLMResponse.id !== message.responseId) return;
  if (activeResponseId && message.responseId !== activeResponseId) return;

  const response = { ...currentLLMResponse };

  // Update cost for the specific model
  if (message.model === 'fast') {
    response.fastCostUSD = message.costUSD;
  } else if (message.model === 'full') {
    response.fullCostUSD = message.costUSD;
  }

  // Calculate total (sum of whichever costs have arrived)
  response.totalCostUSD = (response.fastCostUSD ?? 0) + (response.fullCostUSD ?? 0);

  addSessionCost(message.costUSD);

  dispatchLLMResponseUpdate(response);
}

/**
 * Dispatch quick prompt responses to the React overlay via custom event.
 * Always sends a fresh array copy so React detects changes.
 */
function dispatchQuickPromptUpdate(): void {
  window.dispatchEvent(
    new CustomEvent('quick-prompt-responses-update', {
      detail: { responses: [...quickPromptResponses] },
    }),
  );
}

/**
 * Flush accumulated quick prompt tokens to the React overlay.
 * Called on each animation frame during quick prompt streaming.
 */
function flushPendingQpTokens(): void {
  qpTokenBatchRafId = null;
  if (pendingQpTokens.size === 0) return;

  for (const [responseId, tokens] of pendingQpTokens) {
    const entry = quickPromptResponseMap.get(responseId);
    if (entry) {
      entry.content += tokens;
      entry.status = 'streaming';
    }
  }
  pendingQpTokens.clear();
  dispatchQuickPromptUpdate();
}

/**
 * Handle streaming tokens for quick prompt responses (qp- prefixed).
 * Batches tokens via rAF to reduce React re-renders (same pattern as main LLM stream).
 */
function handleQuickPromptStream(message: LLMStreamMessage): void {
  const entry = quickPromptResponseMap.get(message.responseId);
  if (!entry) return;

  // Accumulate token into pending buffer
  const existing = pendingQpTokens.get(message.responseId) ?? '';
  pendingQpTokens.set(message.responseId, existing + message.token);

  // Schedule flush on next animation frame
  if (qpTokenBatchRafId === null) {
    qpTokenBatchRafId = requestAnimationFrame(flushPendingQpTokens);
  }
}

/**
 * Handle status updates for quick prompt responses (qp- prefixed).
 * Updates status and dispatches both the response update and a status event for the tooltip.
 */
function handleQuickPromptStatus(message: LLMStatusMessage): void {
  // Flush any pending tokens before status transition (same pattern as main LLM)
  if (qpTokenBatchRafId !== null) {
    cancelAnimationFrame(qpTokenBatchRafId);
    flushPendingQpTokens();
  }

  const entry = quickPromptResponseMap.get(message.responseId);
  if (!entry) return;

  if (message.status === 'error') {
    entry.status = 'error';
    entry.error = message.error;
  } else if (message.status === 'complete') {
    entry.status = 'complete';
  } else if (message.status === 'streaming') {
    entry.status = 'streaming';
  }

  dispatchQuickPromptUpdate();

  // Notify the tooltip about status changes (for button spinner/error state)
  window.dispatchEvent(
    new CustomEvent('quick-prompt-response-status', {
      detail: { responseId: message.responseId, status: entry.status },
    }),
  );
}

/**
 * Handle cost updates for quick prompt responses (qp- prefixed).
 */
function handleQuickPromptCost(message: LLMCostMessage): void {
  const entry = quickPromptResponseMap.get(message.responseId);
  if (!entry) return;
  entry.costUSD = (entry.costUSD ?? 0) + message.costUSD;

  addSessionCost(message.costUSD);

  dispatchQuickPromptUpdate();
}

/**
 * Apply edit overlay to raw transcript entries.
 * Filters out soft-deleted entries and replaces text for edited entries.
 * Creates new objects (spread) so React.memo detects changes.
 */
function applyEdits(entries: TranscriptEntry[]): TranscriptEntry[] {
  return entries.reduce<TranscriptEntry[]>((acc, entry) => {
    const edit = transcriptEdits.get(entry.id);
    if (edit?.isDeleted) return acc; // Skip soft-deleted
    if (edit?.editedText != null) {
      acc.push({ ...entry, text: edit.editedText });
    } else {
      acc.push(entry);
    }
    return acc;
  }, []);
}

function formatEntries(entries: TranscriptEntry[]): string {
  return entries.map((e) => `${e.speaker}: ${e.text}`).join('\n');
}

function getTranscriptSince(timestamp: number): string {
  return formatEntries(
    applyEdits(currentTranscript).filter((e) => e.isFinal && e.timestamp >= timestamp),
  );
}

function getRecentTranscript(): string {
  return formatEntries(
    applyEdits(currentTranscript)
      .filter((e) => e.isFinal)
      .slice(-5),
  );
}

function getFullTranscript(): string {
  return formatEntries(applyEdits(currentTranscript).filter((e) => e.isFinal));
}

/**
 * Send LLM request to background service worker.
 * Shared by both standard requests and reasoning requests.
 */
async function sendLLMRequestInternal(message: LLMRequestMessage, label: string): Promise<void> {
  currentLLMResponse = null;
  initLLMResponse(message.responseId);

  try {
    const result = await safeSendMessage<BackgroundResponse>(message);
    if (result.contextInvalid) {
      window.dispatchEvent(new CustomEvent('extension-context-invalidated'));
      return;
    }
    const response = result.data;
    if (!response?.success) {
      console.error(
        `AI Interview Assistant: ${label} failed:`,
        response?.error || `Unknown - response: ${JSON.stringify(response)}`,
      );
    }
  } catch (error) {
    console.error(`AI Interview Assistant: Failed to send ${label}:`, error);
  }
}

/**
 * Send standard LLM request triggered by capture hotkey.
 */
async function sendLLMRequest(question: string, _mode: 'hold' | 'highlight'): Promise<void> {
  const state = useStore.getState();
  if (!state.activeTemplateId) {
    console.warn('AI Interview Assistant: No active template selected');
    return;
  }

  await sendLLMRequestInternal(
    {
      type: 'LLM_REQUEST',
      responseId: crypto.randomUUID(),
      question,
      recentContext: getRecentTranscript(),
      fullTranscript: getFullTranscript(),
      templateId: state.activeTemplateId,
    },
    'LLM request',
  );
}

/**
 * Send reasoning request to background service worker.
 * Uses recent transcript as the question and sends with reasoning flags.
 */
async function sendReasoningRequest(effort: 'low' | 'medium' | 'high'): Promise<void> {
  const state = useStore.getState();
  if (!state.activeTemplateId) {
    console.warn('AI Interview Assistant: No active template selected');
    return;
  }

  const responseId = crypto.randomUUID();
  activeResponseId = responseId;

  await sendLLMRequestInternal(
    {
      type: 'LLM_REQUEST',
      responseId,
      question: getRecentTranscript(),
      recentContext: getRecentTranscript(),
      fullTranscript: getFullTranscript(),
      templateId: state.activeTemplateId,
      isReasoningRequest: true,
      reasoningEffort: effort,
    },
    'Reasoning request',
  );
}

/**
 * Send a quick prompt request to the background service worker.
 * Quick prompts run concurrently with the main LLM request (separate abort controllers).
 */
async function sendQuickPromptRequest(
  selectedText: string,
  promptTemplate: string,
  actionLabel: string,
  actionId: string,
): Promise<void> {
  const responseId = `qp-${crypto.randomUUID()}`;

  // Initialize quick prompt response entry
  const qpResponse: QuickPromptResponseEntry = {
    id: responseId,
    actionLabel,
    textSnippet: selectedText.slice(0, 50) + (selectedText.length > 50 ? '...' : ''),
    content: '',
    status: 'streaming',
  };
  quickPromptResponses.push(qpResponse);
  quickPromptResponseMap.set(responseId, qpResponse);
  dispatchQuickPromptUpdate();

  const message: QuickPromptRequestMessage = {
    type: 'QUICK_PROMPT_REQUEST',
    responseId,
    selectedText,
    promptTemplate,
    actionLabel,
  };

  try {
    const result = await safeSendMessage<BackgroundResponse>(message);
    if (result.contextInvalid) {
      window.dispatchEvent(new CustomEvent('extension-context-invalidated'));
      return;
    }
    const response = result.data;
    if (!response?.success) {
      console.error(
        'AI Interview Assistant: Quick prompt request failed:',
        response?.error || 'Unknown error',
      );
    }
  } catch (error) {
    console.error('AI Interview Assistant: Failed to send quick prompt request:', error);
    // Update entry to error state
    qpResponse.status = 'error';
    qpResponse.error = error instanceof Error ? error.message : 'Request failed';
    dispatchQuickPromptUpdate();
    // Notify tooltip of error
    window.dispatchEvent(
      new CustomEvent('quick-prompt-response-status', {
        detail: { responseId, status: 'error', actionId },
      }),
    );
  }
}

// Cache for edit overlay arrays - only rebuild when edits change
let cachedEditedIds: string[] = [];
let cachedDeletedIds: string[] = [];
let editCacheVersion = 0;
let lastEditCacheVersion = -1;

/** Invalidate the edit cache (call after any edit map mutation) */
function invalidateEditCache(): void {
  editCacheVersion++;
}

/** Rebuild cached editedIds/deletedIds if edit map has changed */
function rebuildEditCacheIfNeeded(): void {
  if (lastEditCacheVersion === editCacheVersion) return;
  lastEditCacheVersion = editCacheVersion;
  cachedEditedIds = [];
  cachedDeletedIds = [];
  transcriptEdits.forEach((edit, id) => {
    cachedEditedIds.push(id);
    if (edit.isDeleted) cachedDeletedIds.push(id);
  });
}

/**
 * Dispatch transcript update to the React overlay via custom event.
 * Raw entries are stored in currentTranscript (needed for undo original text lookup).
 * Display entries: apply text edits but keep deleted entries visible for undo UI.
 * The applyEdits function (which filters deleted) is only used by LLM context getters.
 */
function dispatchTranscriptUpdate(entries: TranscriptEntry[]): void {
  currentTranscript = entries; // Keep raw for undo reference
  // For display: apply text edits but keep deleted entries visible (marked for UI rendering)
  const hasEdits = transcriptEdits.size > 0;
  const displayEntries = hasEdits
    ? entries.map((entry) => {
        const edit = transcriptEdits.get(entry.id);
        if (edit?.editedText != null) {
          return { ...entry, text: edit.editedText };
        }
        return entry;
      })
    : entries;
  rebuildEditCacheIfNeeded();
  window.dispatchEvent(
    new CustomEvent<TranscriptUpdateEventDetail>('transcript-update', {
      detail: { entries: displayEntries, editedIds: cachedEditedIds, deletedIds: cachedDeletedIds },
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

/**
 * Set up listeners for transcript edit events from the overlay.
 * The overlay dispatches these events; content.tsx applies them to the edit map
 * and re-dispatches the transformed transcript.
 */
function setupTranscriptEditListeners(): void {
  window.addEventListener('transcript-edit', ((
    e: CustomEvent<{ id: string; editedText: string }>,
  ) => {
    const { id, editedText } = e.detail;
    const entry = currentTranscript.find((t) => t.id === id);
    if (!entry) return;

    const existing = transcriptEdits.get(id);
    transcriptEdits.set(id, {
      editedText,
      isDeleted: existing?.isDeleted ?? false,
      originalText: existing?.originalText ?? entry.text,
    });
    invalidateEditCache();
    // Re-dispatch with edits applied
    dispatchTranscriptUpdate(currentTranscript);
  }) as EventListener);

  window.addEventListener('transcript-delete', ((e: CustomEvent<{ id: string }>) => {
    const { id } = e.detail;
    const entry = currentTranscript.find((t) => t.id === id);
    if (!entry) return;

    const existing = transcriptEdits.get(id);
    transcriptEdits.set(id, {
      editedText: existing?.editedText ?? null,
      isDeleted: true,
      originalText: existing?.originalText ?? entry.text,
    });
    invalidateEditCache();
    dispatchTranscriptUpdate(currentTranscript);
  }) as EventListener);

  window.addEventListener('transcript-undo', ((e: CustomEvent<{ id: string }>) => {
    const { id } = e.detail;
    transcriptEdits.delete(id);
    invalidateEditCache();
    dispatchTranscriptUpdate(currentTranscript);
  }) as EventListener);
}

export default defineContentScript({
  matches: ['https://meet.google.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
    // Check if this is an active meeting page (not landing/join page)
    if (!MEET_URL_PATTERN.test(window.location.href)) {
      return;
    }

    // Set up message listener for messages from Service Worker/Popup
    chrome.runtime.onMessage.addListener(
      safeMessageListener((_message, _sender, sendResponse) => {
        // Validate message shape before processing
        if (
          typeof _message !== 'object' ||
          _message === null ||
          !('type' in _message) ||
          typeof (_message as { type: unknown }).type !== 'string'
        ) {
          return false;
        }
        const message = _message as ExtensionMessage;
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

          case 'LLM_COST':
            handleLLMCost(message);
            return false;

          case 'REQUEST_MIC_PERMISSION':
            // Handle mic permission request from popup
            // Content scripts run in the web page context, so permission prompts work properly here
            navigator.mediaDevices
              .getUserMedia({ audio: true })
              .then((stream) => {
                // Permission granted - immediately stop the stream (we just needed the permission)
                stream.getTracks().forEach((track) => track.stop());
                sendResponse({ success: true });
              })
              .catch((error) => {
                console.error('AI Interview Assistant: Mic permission denied', error);
                sendResponse({ success: false, error: error.message || 'Permission denied' });
              });
            return true; // Keep channel open for async response

          case 'CONNECTION_STATE':
            // Dispatch custom event for Overlay to consume (for HealthIndicator)
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
      }) as Parameters<typeof chrome.runtime.onMessage.addListener>[0],
    );

    // Set up transcript edit event listeners (edit/delete/undo from overlay)
    setupTranscriptEditListeners();

    // Wait for store to sync before rendering (for blur level, hotkey settings, etc.)
    await storeReadyPromise;

    // Create UI container using WXT's createShadowRootUi for proper isolation
    const ui = await createShadowRootUi(ctx, {
      name: 'ai-interview-assistant',
      position: 'inline',
      anchor: 'body',
      onMount: (container, shadow) => {
        // Create a wrapper div to avoid React warning about rendering on <body>
        const wrapper = document.createElement('div');
        wrapper.id = 'ai-interview-root';
        container.appendChild(wrapper);
        const root = createRoot(wrapper);
        // Render the overlay wrapped with CaptureProvider for keyboard handling
        // Pass shadowRoot to Overlay for Shadow DOM-aware text selection detection
        root.render(
          <CaptureProvider
            onCapture={sendLLMRequest}
            getTranscriptSince={getTranscriptSince}
            getRecentTranscript={getRecentTranscript}
            getFullTranscript={getFullTranscript}
          >
            <Overlay shadowRoot={shadow} />
          </CaptureProvider>,
        );
        return root;
      },
      onRemove: (root) => {
        root?.unmount();
      },
    });

    ui.mount();

    // Listen for reasoning-request events from the overlay's Reason button
    const handleReasoningRequest = ((event: CustomEvent<ReasoningRequestEventDetail>) => {
      sendReasoningRequest(event.detail.effort);
    }) as EventListener;
    window.addEventListener('reasoning-request', handleReasoningRequest);

    // Listen for quick-prompt-request events from the overlay's SelectionTooltip
    const handleQuickPromptRequest = ((
      e: CustomEvent<{
        selectedText: string;
        promptTemplate: string;
        actionLabel: string;
        actionId: string;
      }>,
    ) => {
      sendQuickPromptRequest(
        e.detail.selectedText,
        e.detail.promptTemplate,
        e.detail.actionLabel,
        e.detail.actionId,
      );
    }) as EventListener;
    window.addEventListener('quick-prompt-request', handleQuickPromptRequest);

    // Notify background that UI is ready
    try {
      await safeSendMessage({
        type: 'UI_INJECTED',
        success: true,
      });
    } catch (error) {
      console.warn('Failed to notify UI injection:', error);
    }
  },
});
