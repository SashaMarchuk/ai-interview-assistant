import type {
  ExtensionMessage,
  PongMessage,
  TabStreamIdMessage,
  StopCaptureMessage,
  StartMicCaptureMessage,
  StopMicCaptureMessage,
  InternalStartTranscriptionMessage,
  StopTranscriptionMessage,
  LLMStreamMessage,
  LLMStatusMessage,
  LLMCostMessage,
  QuickPromptRequestMessage,
  CaptureStateResponse,
} from '../src/types/messages';
import {
  buildPrompt,
  resolveProviderForModel,
  isReasoningModel,
  MIN_REASONING_TOKEN_BUDGET,
  calculateCost,
  type LLMProvider,
  type ProviderId,
  type ReasoningEffort,
  type TokenUsage,
} from '../src/services/llm';
import { useStore } from '../src/store';
import type { TranscriptEntry } from '../src/types/transcript';
import {
  TranscriptBuffer,
  setTranscriptionActive,
  wasTranscriptionActive,
} from '../src/services/transcription/transcriptBuffer';
import {
  circuitBreakerManager,
  setStateChangeCallback,
} from '../src/services/circuitBreaker/circuitBreakerManager';
import { CircuitState } from '../src/services/circuitBreaker/types';
import { encryptionService } from '../src/services/crypto/encryption';
import { storeReadyPromise } from '../src/store';
import { saveCostRecord } from '../src/services/costHistory/costDb';
import type { CostRecord } from '../src/services/costHistory/types';
import { getFileContent } from '../src/services/fileStorage';

// Wire circuit breaker state changes to HealthIndicator via CONNECTION_STATE
setStateChangeCallback((serviceId, state) => {
  const service = serviceId === 'elevenlabs' ? ('stt-tab' as const) : ('llm' as const);

  if (state === CircuitState.OPEN) {
    sendConnectionState(service, 'error', 'Service temporarily unavailable');
  } else if (state === CircuitState.HALF_OPEN) {
    sendConnectionState(service, 'reconnecting', 'Testing service recovery...');
  } else if (state === CircuitState.CLOSED) {
    sendConnectionState(service, 'connected');
  }
});

// Module state for transcript management
const transcriptBuffer = new TranscriptBuffer();
const interimEntries: Map<string, { source: 'tab' | 'mic'; text: string; timestamp: number }> =
  new Map();

// Module state for capture tracking
let isTabCaptureActive = false;
let isTranscriptionActive = false;
let isCaptureStartInProgress = false; // Guard to ignore CAPTURE_STOPPED during START_CAPTURE

// Session ID for cost record grouping (generated on START_CAPTURE, cleared on STOP_CAPTURE)
let currentSessionId: string | null = null;

// Track active LLM requests for cancellation
const activeAbortControllers: Map<string, AbortController> = new Map();

// Track active quick prompt requests separately (not cancelled by regular LLM_REQUEST)
const quickPromptAbortControllers: Map<string, AbortController> = new Map();

/** Check if there are no active streaming requests (LLM or quick prompt) */
function hasNoActiveRequests(): boolean {
  return activeAbortControllers.size === 0 && quickPromptAbortControllers.size === 0;
}

// LLM retry configuration
const MAX_LLM_RETRIES = 3;
const LLM_RETRY_DELAY_MS = 1000;

/**
 * Handle token usage: broadcast cost message and persist to IndexedDB.
 * Shared by both regular LLM requests and quick prompt requests.
 */
function handleTokenUsage(
  usage: TokenUsage,
  modelId: string,
  modelType: 'fast' | 'full',
  responseId: string,
  providerId: ProviderId,
): void {
  const costUSD = calculateCost(
    modelId,
    usage.promptTokens,
    usage.completionTokens,
    usage.providerCost,
  );
  sendLLMMessageToMeet({
    type: 'LLM_COST',
    responseId,
    model: modelType,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    reasoningTokens: usage.reasoningTokens,
    totalTokens: usage.totalTokens,
    costUSD,
  } satisfies LLMCostMessage);

  const costRecord: CostRecord = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    sessionId: currentSessionId ?? `adhoc-${Date.now()}`,
    provider: providerId,
    modelId,
    modelSlot: modelType,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    reasoningTokens: usage.reasoningTokens,
    totalTokens: usage.totalTokens,
    costUSD,
  };
  saveCostRecord(costRecord).catch((err) => {
    console.error('Failed to persist cost record:', err);
  });
}

// Keep service worker alive during streaming
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

function startKeepAlive(): void {
  if (keepAliveInterval) return;
  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {});
  }, 20000);
}

function stopKeepAlive(): void {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

/**
 * Cached Meet tab IDs for fast broadcast.
 * Avoids chrome.tabs.query() on every message (expensive for high-frequency streaming).
 * Cache is refreshed every 5 seconds and on tab lifecycle events.
 */
let cachedMeetTabIds: number[] = [];
let tabCacheTimestamp = 0;
const TAB_CACHE_TTL_MS = 5000;

/** Refresh the cached Meet tab IDs */
async function refreshMeetTabCache(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
    cachedMeetTabIds = tabs.filter((t) => t.id != null).map((t) => t.id!);
    tabCacheTimestamp = Date.now();
  } catch {
    // Keep stale cache on error
  }
}

// Invalidate cache on tab lifecycle events
chrome.tabs.onRemoved.addListener((tabId) => {
  cachedMeetTabIds = cachedMeetTabIds.filter((id) => id !== tabId);
});
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  // Only invalidate on URL changes (navigation)
  if (changeInfo.url) {
    tabCacheTimestamp = 0; // Force refresh on next broadcast
  }
});

/**
 * Broadcast a message to all Google Meet content scripts.
 * Uses cached tab IDs for performance; refreshes cache when stale.
 * Silently ignores tabs where content script is not loaded.
 */
async function broadcastToMeetTabs(message: ExtensionMessage): Promise<void> {
  try {
    // Refresh cache if stale
    if (Date.now() - tabCacheTimestamp > TAB_CACHE_TTL_MS) {
      await refreshMeetTabCache();
    }
    for (const tabId of cachedMeetTabIds) {
      chrome.tabs.sendMessage(tabId, message).catch(() => {
        // Ignore - content script might not be loaded on this tab
      });
    }
  } catch (error) {
    console.error('Failed to broadcast to Meet tabs:', error);
  }
}

/**
 * Broadcast transcript to all Google Meet content scripts.
 * Includes both final entries and current interim (partial) entries.
 */
async function broadcastTranscript(): Promise<void> {
  // Build entries array: final entries + current interim entries
  const interimAsEntries: TranscriptEntry[] = [];
  for (const [source, interim] of interimEntries) {
    interimAsEntries.push({
      id: `interim-${source}`,
      speaker: source === 'mic' ? 'You' : 'Interviewer',
      text: interim.text,
      timestamp: interim.timestamp,
      isFinal: false,
    });
  }

  // Sort interim by timestamp and append after final entries
  interimAsEntries.sort((a, b) => a.timestamp - b.timestamp);

  await broadcastToMeetTabs({
    type: 'TRANSCRIPT_UPDATE',
    entries: [...transcriptBuffer.getEntries(), ...interimAsEntries],
  });
}

/**
 * Add a transcript entry maintaining chronological order.
 * Delegates insertion to TranscriptBuffer which handles persistence.
 * Broadcasts TRANSCRIPT_UPDATE to content scripts on Google Meet tabs.
 */
async function addTranscriptEntry(entry: TranscriptEntry): Promise<void> {
  transcriptBuffer.add(entry);
  await broadcastTranscript();
}

// Guard: only run init chain in real extension context (skip during Vite pre-rendering)
const isRealExtension = (() => {
  try {
    return !!(typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.());
  } catch {
    return false;
  }
})();

// Initialize encryption before store rehydration, then initialize store
(isRealExtension ? encryptionService.initialize() : Promise.resolve())
  .then(() => (isRealExtension ? circuitBreakerManager.rehydrate() : undefined))
  .then(() => storeReadyPromise)
  .then(async () => {
    // Check if recovering from SW termination during active transcription
    const wasActive = await wasTranscriptionActive();
    if (wasActive) {
      await transcriptBuffer.load();
      isTranscriptionActive = true;
      startKeepAlive();
    }

    storeReady = true;
    for (const { message, sender, sendResponse } of messageQueue) {
      handleMessage(message, sender)
        .then(sendResponse)
        .catch((error) => {
          console.error('Queued message handling error:', error);
          sendResponse({ error: error.message });
        });
    }
    messageQueue.length = 0;
  })
  .catch((error) => {
    console.error('Initialization failed:', error);
  });

// Safety net: if store fails to hydrate within 10 seconds, drain queue with errors
setTimeout(() => {
  if (!storeReady) {
    console.error('Store hydration timeout after 10 seconds -- draining queue with errors');
    storeReady = true; // Prevent further queuing
    for (const { sendResponse } of messageQueue) {
      sendResponse({ error: 'Store initialization timeout' });
    }
    messageQueue.length = 0;
  }
}, 10_000);

/**
 * Send LLM message to all Google Meet content scripts
 */
async function sendLLMMessageToMeet(
  message: LLMStreamMessage | LLMStatusMessage | LLMCostMessage,
): Promise<void> {
  await broadcastToMeetTabs(message);
}

/**
 * Send connection state to all Google Meet content scripts
 */
async function sendConnectionState(
  service: 'stt-tab' | 'stt-mic' | 'llm',
  state: 'connected' | 'disconnected' | 'reconnecting' | 'error',
  error?: string,
): Promise<void> {
  await broadcastToMeetTabs({
    type: 'CONNECTION_STATE',
    service,
    state,
    error,
  });
}

/**
 * Stream LLM response with automatic retry on failure.
 * Retries up to MAX_LLM_RETRIES times with exponential delay.
 */
interface StreamWithRetryParams {
  provider: LLMProvider;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  apiKey: string;
  onToken: (token: string) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
  abortSignal?: AbortSignal;
  /** Optional reasoning effort for reasoning models */
  reasoningEffort?: ReasoningEffort;
  /** Optional callback for token usage data */
  onUsage?: (usage: TokenUsage) => void;
}

async function streamWithRetry(
  params: StreamWithRetryParams,
  modelType: 'fast' | 'full',
  responseId: string,
  retryCount = 0,
): Promise<void> {
  try {
    // Log the full prompt being sent to the LLM for debugging
    console.log(`[AI Assistant] LLM Request (${modelType}):`, {
      provider: params.provider.id,
      model: params.model,
      maxTokens: params.maxTokens,
      reasoningEffort: params.reasoningEffort,
      systemPrompt: params.systemPrompt,
      userPrompt: params.userPrompt,
    });

    await params.provider.streamResponse({
      model: params.model,
      systemPrompt: params.systemPrompt,
      userPrompt: params.userPrompt,
      maxTokens: params.maxTokens,
      apiKey: params.apiKey,
      onToken: params.onToken,
      onComplete: params.onComplete,
      onError: params.onError,
      abortSignal: params.abortSignal,
      reasoningEffort: params.reasoningEffort,
      onUsage: params.onUsage,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    if (retryCount < MAX_LLM_RETRIES && !params.abortSignal?.aborted) {
      // Send retry status to UI
      await sendLLMMessageToMeet({
        type: 'LLM_STATUS',
        responseId,
        model: modelType,
        status: 'error',
        error: `Retrying (${retryCount + 1}/${MAX_LLM_RETRIES})...`,
      });

      // Wait with exponential backoff before retry
      await new Promise((r) => setTimeout(r, LLM_RETRY_DELAY_MS * (retryCount + 1)));

      // Retry recursively
      return streamWithRetry(params, modelType, responseId, retryCount + 1);
    }

    // Max retries exceeded or aborted - broadcast LLM error state
    await sendConnectionState('llm', 'error', err.message);

    // Call the original error handler
    params.onError(err);
  }
}

/**
 * Handle LLM_REQUEST by firing streaming requests.
 * Normal mode: dual parallel streams (fast hint + full answer).
 * Reasoning mode: single stream (full model only) with 25K+ token budget.
 * Automatically selects provider based on model ID and configured API keys.
 */
async function handleLLMRequest(
  responseId: string,
  question: string,
  recentContext: string,
  fullTranscript: string,
  templateId: string,
  isReasoningRequest?: boolean,
  reasoningEffort?: ReasoningEffort,
): Promise<void> {
  // Get store state for settings and templates
  const state = useStore.getState();
  const { apiKeys, models, templates } = state;

  // Find template
  const template = templates.find((t) => t.id === templateId);
  if (!template) {
    await sendLLMMessageToMeet({
      type: 'LLM_STATUS',
      responseId,
      model: 'both',
      status: 'error',
      error: `Template not found: ${templateId}`,
    });
    return;
  }

  // Resolve provider for fast model (not needed in reasoning mode, but resolve for error checking)
  const fastResolution = resolveProviderForModel(models.fastModel, {
    openAI: apiKeys.openAI,
    openRouter: apiKeys.openRouter,
  });

  // Resolve provider for full model
  const fullResolution = resolveProviderForModel(models.fullModel, {
    openAI: apiKeys.openAI,
    openRouter: apiKeys.openRouter,
  });

  // Check if models couldn't be resolved
  if (isReasoningRequest) {
    // Reasoning mode only needs the full model
    if (!fullResolution) {
      await sendLLMMessageToMeet({
        type: 'LLM_STATUS',
        responseId,
        model: 'both',
        status: 'error',
        error:
          'No LLM provider configured for full model. Add an OpenAI or OpenRouter API key in settings.',
      });
      return;
    }
  } else {
    // Normal dual-stream mode needs at least one model
    if (!fastResolution && !fullResolution) {
      await sendLLMMessageToMeet({
        type: 'LLM_STATUS',
        responseId,
        model: 'both',
        status: 'error',
        error: 'No LLM provider configured. Add an OpenAI or OpenRouter API key in settings.',
      });
      return;
    }
  }

  // Read file context from IndexedDB for prompt personalization (Phase 19)
  const [resumeRecord, jdRecord] = await Promise.all([
    getFileContent('resume'),
    getFileContent('jobDescription'),
  ]);
  const fileContext =
    resumeRecord?.text || jdRecord?.text
      ? { resume: resumeRecord?.text, jobDescription: jdRecord?.text }
      : undefined;

  // Build prompts using the template
  const prompts = buildPrompt(
    { question, recentContext, fullTranscript, templateId },
    template,
    fileContext,
  );

  // Create abort controller for cancellation
  const abortController = new AbortController();
  activeAbortControllers.set(responseId, abortController);

  // Start keep-alive to prevent service worker termination
  startKeepAlive();

  // Track completion state
  let fastComplete = false;
  let fullComplete = false;

  const checkAllComplete = () => {
    if (fastComplete && fullComplete) {
      activeAbortControllers.delete(responseId);
      // Stop keep-alive only if no other active requests (including quick prompts)
      if (hasNoActiveRequests()) {
        stopKeepAlive();
      }
    }
  };

  // Send initial pending status
  await sendLLMMessageToMeet({
    type: 'LLM_STATUS',
    responseId,
    model: 'both',
    status: 'pending',
  });

  interface ModelRequestConfig {
    resolution: typeof fastResolution;
    modelType: 'fast' | 'full';
    modelId: string;
    userPrompt: string;
    maxTokens: number;
    onDone: () => void;
    /** Optional reasoning effort for reasoning models */
    reasoningEffort?: ReasoningEffort;
  }

  function fireModelRequest(config: ModelRequestConfig): Promise<void> {
    const {
      resolution,
      modelType,
      modelId,
      userPrompt,
      maxTokens,
      onDone,
      reasoningEffort: effort,
    } = config;

    if (!resolution) {
      onDone();
      return sendLLMMessageToMeet({
        type: 'LLM_STATUS',
        responseId,
        model: modelType,
        status: 'error',
        error: `Model ${modelId} not available with current API keys`,
      }).then(() => {});
    }

    const breaker = circuitBreakerManager.getBreaker(resolution.provider.id);
    if (!breaker.allowRequest()) {
      onDone();
      return sendLLMMessageToMeet({
        type: 'LLM_STATUS',
        responseId,
        model: modelType,
        status: 'error',
        error: `${resolution.provider.id} service temporarily unavailable`,
      }).then(() => {});
    }

    return streamWithRetry(
      {
        provider: resolution.provider,
        model: resolution.model,
        systemPrompt: prompts.system,
        userPrompt,
        maxTokens,
        apiKey: resolution.provider.id === 'openai' ? apiKeys.openAI : apiKeys.openRouter,
        onToken: (token) => {
          sendLLMMessageToMeet({ type: 'LLM_STREAM', responseId, model: modelType, token });
        },
        onComplete: () => {
          onDone();
          sendLLMMessageToMeet({
            type: 'LLM_STATUS',
            responseId,
            model: modelType,
            status: 'complete',
          });
          checkAllComplete();
        },
        onError: (error) => {
          onDone();
          console.error(`LLM: ${modelType} model error:`, error.message);
          sendLLMMessageToMeet({
            type: 'LLM_STATUS',
            responseId,
            model: modelType,
            status: 'error',
            error: error.message || 'Unknown error',
          });
          checkAllComplete();
        },
        abortSignal: abortController.signal,
        reasoningEffort: effort,
        onUsage: (usage: TokenUsage) => {
          handleTokenUsage(usage, modelId, modelType, responseId, resolution!.provider.id);
        },
      },
      modelType,
      responseId,
    )
      .then(() => {
        breaker.recordSuccess();
      })
      .catch((error) => {
        breaker.recordFailure();
        throw error;
      });
  }

  if (isReasoningRequest) {
    // Reasoning mode: single-stream (full model only)
    // Skip fast model entirely -- reasoning models are expensive, no dual-stream
    fastComplete = true;

    // Send fast model status as complete immediately (nothing to show)
    await sendLLMMessageToMeet({
      type: 'LLM_STATUS',
      responseId,
      model: 'fast',
      status: 'complete',
    });

    // Only apply 25K budget for actual reasoning models; standard models keep their normal limit
    const isFullModelReasoning = isReasoningModel(models.fullModel);
    const fullMaxTokens = isFullModelReasoning
      ? Math.max(2000, MIN_REASONING_TOKEN_BUDGET)
      : 2000;

    const fullPromise = fireModelRequest({
      resolution: fullResolution,
      modelType: 'full',
      modelId: models.fullModel,
      userPrompt: prompts.userFull,
      maxTokens: fullMaxTokens,
      onDone: () => {
        fullComplete = true;
      },
      reasoningEffort,
    });

    // Send streaming status
    await sendLLMMessageToMeet({
      type: 'LLM_STATUS',
      responseId,
      model: 'full',
      status: 'streaming',
    });

    // Wait for full model to complete (but don't block message handler return)
    fullPromise.catch((error) => {
      console.error('LLM reasoning request error:', error);
    });
  } else {
    // Normal dual-stream mode: fire both fast and full models in parallel
    const fastPromise = fireModelRequest({
      resolution: fastResolution,
      modelType: 'fast',
      modelId: models.fastModel,
      userPrompt: prompts.user,
      maxTokens: 300,
      onDone: () => {
        fastComplete = true;
      },
    });

    const fullPromise = fireModelRequest({
      resolution: fullResolution,
      modelType: 'full',
      modelId: models.fullModel,
      userPrompt: prompts.userFull,
      maxTokens: 2000,
      onDone: () => {
        fullComplete = true;
      },
    });

    // Send streaming status (only if at least one model is available)
    if (fastResolution || fullResolution) {
      await sendLLMMessageToMeet({
        type: 'LLM_STATUS',
        responseId,
        model: 'both',
        status: 'streaming',
      });
    }

    // Wait for both to complete (but don't block message handler return)
    Promise.all([fastPromise, fullPromise]).catch((error) => {
      console.error('LLM request error:', error);
    });
  }
}

/**
 * Handle QUICK_PROMPT_REQUEST: fire a single fast-model stream.
 * Runs concurrently with active LLM requests -- does NOT cancel them.
 * Uses separate abort controller tracking.
 */
async function handleQuickPromptRequest(
  message: QuickPromptRequestMessage,
  abortController: AbortController,
): Promise<void> {
  const state = useStore.getState();
  const { apiKeys, models } = state;

  // Resolve fast model provider
  const fastResolution = resolveProviderForModel(models.fastModel, {
    openAI: apiKeys.openAI,
    openRouter: apiKeys.openRouter,
  });

  if (!fastResolution) {
    await sendLLMMessageToMeet({
      type: 'LLM_STATUS',
      responseId: message.responseId,
      model: 'fast',
      status: 'error',
      error: 'No LLM provider configured for fast model.',
    });
    quickPromptAbortControllers.delete(message.responseId);
    return;
  }

  // Build prompt from template -- replace {{selection}} with actual text
  const userPrompt = message.promptTemplate.includes('{{selection}}')
    ? message.promptTemplate.replace('{{selection}}', message.selectedText)
    : `${message.promptTemplate}: ${message.selectedText}`;

  // Send streaming status
  await sendLLMMessageToMeet({
    type: 'LLM_STATUS',
    responseId: message.responseId,
    model: 'fast',
    status: 'streaming',
  });

  // Start keep-alive
  startKeepAlive();

  const breaker = circuitBreakerManager.getBreaker(fastResolution.provider.id);
  if (!breaker.allowRequest()) {
    await sendLLMMessageToMeet({
      type: 'LLM_STATUS',
      responseId: message.responseId,
      model: 'fast',
      status: 'error',
      error: `${fastResolution.provider.id} service temporarily unavailable`,
    });
    quickPromptAbortControllers.delete(message.responseId);
    if (hasNoActiveRequests()) {
      stopKeepAlive();
    }
    return;
  }

  try {
    await streamWithRetry(
      {
        provider: fastResolution.provider,
        model: fastResolution.model,
        systemPrompt: 'You are a helpful assistant. Be concise and clear.',
        userPrompt,
        maxTokens: 1024,
        apiKey:
          fastResolution.provider.id === 'openai' ? apiKeys.openAI : apiKeys.openRouter,
        onToken: (token) => {
          sendLLMMessageToMeet({
            type: 'LLM_STREAM',
            responseId: message.responseId,
            model: 'fast',
            token,
          });
        },
        onComplete: () => {
          quickPromptAbortControllers.delete(message.responseId);
          if (hasNoActiveRequests()) {
            stopKeepAlive();
          }
          sendLLMMessageToMeet({
            type: 'LLM_STATUS',
            responseId: message.responseId,
            model: 'fast',
            status: 'complete',
          });
        },
        onError: (error) => {
          quickPromptAbortControllers.delete(message.responseId);
          if (hasNoActiveRequests()) {
            stopKeepAlive();
          }
          sendLLMMessageToMeet({
            type: 'LLM_STATUS',
            responseId: message.responseId,
            model: 'fast',
            status: 'error',
            error: error.message || 'Quick prompt request failed',
          });
        },
        abortSignal: abortController.signal,
        onUsage: (usage: TokenUsage) => {
          handleTokenUsage(usage, models.fastModel, 'fast', message.responseId, fastResolution!.provider.id);
        },
      },
      'fast',
      message.responseId,
    )
      .then(() => {
        breaker.recordSuccess();
      })
      .catch((error) => {
        breaker.recordFailure();
        console.error('Quick prompt request error:', error);
      });
  } catch (error) {
    if (!abortController.signal.aborted) {
      await sendLLMMessageToMeet({
        type: 'LLM_STATUS',
        responseId: message.responseId,
        model: 'fast',
        status: 'error',
        error: error instanceof Error ? error.message : 'Quick prompt request failed',
      });
    }
    quickPromptAbortControllers.delete(message.responseId);
    if (hasNoActiveRequests()) {
      stopKeepAlive();
    }
  }
}

type MessageResponse =
  | PongMessage
  | { type: 'OFFSCREEN_READY' }
  | { received: boolean }
  | { success: boolean; error?: string }
  | CaptureStateResponse
  | { error: string }
  | undefined;

// Queue guard for store hydration -- messages arriving before store is ready are queued
interface QueuedMessage {
  message: ExtensionMessage;
  sender: chrome.runtime.MessageSender;
  sendResponse: (response: MessageResponse) => void;
}
const messageQueue: QueuedMessage[] = [];
let storeReady = false;

// Register message listener synchronously at top level - CRITICAL
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Ignore webext-zustand internal sync messages - let the library handle them
  if (message?.type === 'chromex.dispatch' || message?.type === 'chromex.fetch_state') {
    return false; // Don't send response, let other listeners handle it
  }

  // Messages with _fromBackground marker were sent BY background TO offscreen
  // Background should NOT handle these to prevent race conditions and recursion
  if (message?._fromBackground === true) {
    // Let offscreen handle and respond
    return false;
  }

  // These message types are ONLY for offscreen - background should never handle them
  // Even if _fromBackground check fails, don't process these
  const offscreenOnlyTypes = ['TAB_STREAM_ID', 'START_MIC_CAPTURE', 'STOP_MIC_CAPTURE'];
  if (offscreenOnlyTypes.includes(message?.type) && sender.id === chrome.runtime.id) {
    return false;
  }

  // Queue guard: if store not ready, queue message for processing after hydration
  if (!storeReady) {
    messageQueue.push({ message, sender, sendResponse });
    return true; // Keep channel open for async response
  }

  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      console.error('Message handling error:', error);
      sendResponse({ error: error.message });
    });
  return true; // Keep channel open for async response
});

// Async message handler using switch for proper discriminated union narrowing
async function handleMessage(
  message: ExtensionMessage,
  _sender: chrome.runtime.MessageSender,
): Promise<MessageResponse> {
  switch (message.type) {
    case 'PING':
      return {
        type: 'PONG',
        timestamp: message.timestamp,
        receivedAt: Date.now(),
      } satisfies PongMessage;

    case 'CREATE_OFFSCREEN':
      await ensureOffscreenDocument();
      return { type: 'OFFSCREEN_READY' };

    case 'OFFSCREEN_READY':
      return { received: true };

    case 'START_CAPTURE': {
      try {
        // Prevent concurrent START_CAPTURE calls
        if (isCaptureStartInProgress) {
          return { success: false, error: 'Capture start already in progress' };
        }
        isCaptureStartInProgress = true;

        // Always ensure clean state before starting
        // Check if offscreen thinks capture is active (regardless of our flag)
        try {
          await chrome.runtime.sendMessage({
            type: 'STOP_CAPTURE',
            _fromBackground: true,
          } as StopCaptureMessage & { _fromBackground: true });
          // Wait for Chrome to fully release resources
          await new Promise((resolve) => setTimeout(resolve, 300));
        } catch {
          // Offscreen might not exist yet - that's fine
        }
        isTabCaptureActive = false;

        // IMPORTANT: Ensure offscreen document exists FIRST
        // Stream IDs expire quickly, so we need offscreen ready before requesting
        await ensureOffscreenDocument();
        // Give offscreen document a moment to fully initialize
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Get the active tab
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab?.id) {
          throw new Error('No active tab found');
        }

        // Validate tab URL - some tabs can't be captured
        if (
          !activeTab.url ||
          activeTab.url.startsWith('chrome://') ||
          activeTab.url.startsWith('chrome-extension://')
        ) {
          throw new Error('Cannot capture this tab. Navigate to a regular webpage first.');
        }

        // Get stream ID for tab capture (requires user gesture context from popup)
        // Do NOT specify consumerTabId - the stream will be used by extension's offscreen document
        const streamId = await new Promise<string>((resolve, reject) => {
          chrome.tabCapture.getMediaStreamId({ targetTabId: activeTab.id }, (id) => {
            if (chrome.runtime.lastError) {
              const errMsg = chrome.runtime.lastError.message || 'Tab capture permission denied';
              console.error('getMediaStreamId error:', errMsg);
              reject(new Error(errMsg));
            } else if (!id) {
              reject(new Error('No stream ID returned - try refreshing the page'));
            } else {
              resolve(id);
            }
          });
        });

        // Mark capture as starting (will be confirmed by CAPTURE_STARTED)
        isTabCaptureActive = true;
        currentSessionId = `session-${Date.now()}-${activeTab.id}`;

        // IMMEDIATELY send stream ID to offscreen document (stream IDs expire quickly!)
        const response = await chrome.runtime.sendMessage({
          type: 'TAB_STREAM_ID',
          streamId,
          _fromBackground: true,
        } as TabStreamIdMessage & { _fromBackground: true });

        // Check if offscreen capture actually succeeded
        if (!response?.success) {
          isTabCaptureActive = false;
          throw new Error(response?.error || 'Tab capture failed - try refreshing the page');
        }

        isCaptureStartInProgress = false;
        return { success: true };
      } catch (error) {
        // Reset state on failure
        isTabCaptureActive = false;
        isCaptureStartInProgress = false;
        const errorMessage =
          error instanceof Error ? error.message : 'Tab capture failed - try refreshing the page';
        console.error('Tab capture error:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }

    case 'STOP_CAPTURE': {
      try {
        // Forward stop command to offscreen document
        await chrome.runtime.sendMessage({
          type: 'STOP_CAPTURE',
          _fromBackground: true,
        } as StopCaptureMessage & { _fromBackground: true });
        isTabCaptureActive = false;
        currentSessionId = null;
        // Give Chrome extra time to fully release the stream
        await new Promise((resolve) => setTimeout(resolve, 300));
        return { success: true };
      } catch (error) {
        // Reset state even on error
        isTabCaptureActive = false;
        currentSessionId = null;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Stop capture failed:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }

    case 'TAB_AUDIO_CHUNK':
    case 'MIC_AUDIO_CHUNK':
      return { received: true };

    case 'GET_CAPTURE_STATE':
      // Return current capture/transcription/LLM state for popup sync
      // Include isCaptureStartInProgress so popup can skip updates during startup
      return {
        isCapturing: isTabCaptureActive,
        isTranscribing: isTranscriptionActive,
        hasActiveLLMRequest:
          activeAbortControllers.size > 0 || quickPromptAbortControllers.size > 0,
        isCaptureStartInProgress: isCaptureStartInProgress,
      };

    case 'START_MIC_CAPTURE': {
      try {
        // Ensure offscreen document exists to handle the audio
        await ensureOffscreenDocument();

        // Forward start mic capture command to offscreen document
        const response = await chrome.runtime.sendMessage({
          type: 'START_MIC_CAPTURE',
          _fromBackground: true,
        } as StartMicCaptureMessage & { _fromBackground: true });

        return response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown mic capture error';
        console.error('Mic capture failed:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }

    case 'STOP_MIC_CAPTURE': {
      try {
        // Forward stop mic capture command to offscreen document
        const response = await chrome.runtime.sendMessage({
          type: 'STOP_MIC_CAPTURE',
          _fromBackground: true,
        } as StopMicCaptureMessage & { _fromBackground: true });

        return response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Stop mic capture failed:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }

    case 'CAPTURE_STARTED':
      return { received: true };

    case 'CAPTURE_STOPPED':
      // Ignore CAPTURE_STOPPED during START_CAPTURE (it's from cleanup, not real stop)
      if (isCaptureStartInProgress) {
        return { received: true };
      }
      isTabCaptureActive = false;
      return { received: true };

    case 'CAPTURE_ERROR':
      isTabCaptureActive = false;
      console.error('Capture error:', message.error);
      return { received: true };

    case 'TAB_STREAM_ID':
      // This should only go to offscreen - if we get here, early filter failed
      return undefined;

    case 'INJECT_UI':
    case 'UI_INJECTED':
    case 'PONG':
      return { received: true };

    // Transcription lifecycle messages
    case 'START_TRANSCRIPTION': {
      try {
        // Ensure offscreen document exists
        await ensureOffscreenDocument();

        // Clear transcript state for new session
        await transcriptBuffer.clear();
        interimEntries.clear();
        await setTranscriptionActive(true);

        // Read API key from store (SEC-01: never from message)
        const state = useStore.getState();
        const elevenLabsKey = state.apiKeys.elevenLabs;

        if (!elevenLabsKey) {
          return { success: false, error: 'ElevenLabs API key not configured' };
        }

        // Check ElevenLabs circuit breaker before attempting connection
        const elevenLabsBreaker = circuitBreakerManager.getBreaker('elevenlabs');
        if (!elevenLabsBreaker.allowRequest()) {
          return {
            success: false,
            error: 'ElevenLabs service temporarily unavailable. Will retry automatically.',
          };
        }

        // Forward to offscreen document with API key from store (internal message)
        await chrome.runtime.sendMessage({
          type: 'START_TRANSCRIPTION',
          apiKey: elevenLabsKey,
          languageCode: message.languageCode,
          _fromBackground: true,
        } as InternalStartTranscriptionMessage);

        isTranscriptionActive = true;
        startKeepAlive();
        return { success: true };
      } catch (error) {
        isTranscriptionActive = false;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Transcription start failed:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }

    case 'STOP_TRANSCRIPTION': {
      try {
        // Flush transcript buffer to storage before stopping
        await transcriptBuffer.flush();

        // Forward to offscreen document to close WebSocket connections
        await chrome.runtime.sendMessage({
          type: 'STOP_TRANSCRIPTION',
          _fromBackground: true,
        } as StopTranscriptionMessage & { _fromBackground: true });

        isTranscriptionActive = false;
        await setTranscriptionActive(false);

        // Stop keep-alive only if no active LLM or quick prompt requests
        if (hasNoActiveRequests()) {
          stopKeepAlive();
        }

        return { success: true };
      } catch (error) {
        isTranscriptionActive = false;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Transcription stop failed:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }

    case 'TRANSCRIPTION_STARTED':
      isTranscriptionActive = true;
      circuitBreakerManager.getBreaker('elevenlabs').recordSuccess();
      return { received: true };

    case 'TRANSCRIPTION_STOPPED':
      isTranscriptionActive = false;
      return { received: true };

    case 'TRANSCRIPTION_ERROR':
      circuitBreakerManager.getBreaker('elevenlabs').recordFailure();
      console.error('Transcription error:', message.source, message.error);
      return { received: true };

    case 'TRANSCRIPT_PARTIAL':
      // Store interim entry for this source (no logging - too frequent)
      interimEntries.set(message.source, {
        source: message.source,
        text: message.text,
        timestamp: message.timestamp,
      });
      // Broadcast to show real-time partial transcripts in UI
      broadcastTranscript();
      return { received: true };

    case 'TRANSCRIPT_FINAL': {
      // Clear interim entry for this source
      interimEntries.delete(message.source);

      // Create and add the final transcript entry
      const entry: TranscriptEntry = {
        id: message.id,
        speaker: message.speaker,
        text: message.text,
        timestamp: message.timestamp,
        isFinal: true,
      };
      addTranscriptEntry(entry);

      return { received: true };
    }

    case 'TRANSCRIPT_UPDATE':
    case 'REQUEST_MIC_PERMISSION':
      return { received: true };

    // LLM request lifecycle messages
    case 'LLM_REQUEST': {
      // Cancel ALL existing active requests before starting new one
      if (activeAbortControllers.size > 0) {
        for (const [, controller] of activeAbortControllers) {
          controller.abort();
        }
        activeAbortControllers.clear();
      }

      // Fire LLM request (reasoning=single-stream, normal=dual-stream, non-blocking)
      handleLLMRequest(
        message.responseId,
        message.question,
        message.recentContext,
        message.fullTranscript,
        message.templateId,
        message.isReasoningRequest,
        message.reasoningEffort,
      );
      return { success: true };
    }

    case 'LLM_STREAM':
    case 'LLM_STATUS':
    case 'LLM_COST':
      return { received: true };

    case 'LLM_CANCEL': {
      // Cancel active request
      const abortController = activeAbortControllers.get(message.responseId);
      if (abortController) {
        abortController.abort();
        activeAbortControllers.delete(message.responseId);
        // Stop keep-alive if no other active requests (including quick prompts)
        if (hasNoActiveRequests()) {
          stopKeepAlive();
        }
      }
      return { success: true };
    }

    // Quick prompt lifecycle messages (concurrent with LLM requests)
    case 'QUICK_PROMPT_REQUEST': {
      // Do NOT cancel existing requests -- quick prompts run concurrently
      const qpAbortController = new AbortController();
      quickPromptAbortControllers.set(message.responseId, qpAbortController);

      handleQuickPromptRequest(message, qpAbortController);
      return { success: true };
    }

    case 'QUICK_PROMPT_CANCEL': {
      const qpController = quickPromptAbortControllers.get(message.responseId);
      if (qpController) {
        qpController.abort();
        quickPromptAbortControllers.delete(message.responseId);
        if (hasNoActiveRequests()) {
          stopKeepAlive();
        }
      }
      return { success: true };
    }

    case 'CONNECTION_STATE': {
      // Forward connection state to content scripts for UI display
      await broadcastToMeetTabs(message);
      return { received: true };
    }

    default: {
      // Exhaustive check - TypeScript will error if we miss a case
      const _exhaustiveCheck: never = message;
      console.warn('Unknown message type:', _exhaustiveCheck);
      return { error: 'Unknown message type' };
    }
  }
}

// Offscreen document management
let creatingOffscreen: Promise<void> | null = null;

async function ensureOffscreenDocument(): Promise<void> {
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');

  // Check if already exists (Chrome 116+)
  // Note: Type cast needed due to incomplete @types/chrome definitions
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
    documentUrls: [offscreenUrl],
  });

  if (existingContexts && existingContexts.length > 0) {
    return;
  }

  // Prevent race condition
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: offscreenUrl,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Audio capture and WebSocket for transcription',
  });

  await creatingOffscreen;
  creatingOffscreen = null;
}

// WXT export
export default defineBackground(() => {
  // Service worker initialized
});
