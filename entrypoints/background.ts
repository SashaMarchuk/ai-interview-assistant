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
} from '../src/types/messages';
import { buildPrompt, resolveProviderForModel, type LLMProvider } from '../src/services/llm';
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

// Track active LLM requests for cancellation
const activeAbortControllers: Map<string, AbortController> = new Map();

// LLM retry configuration
const MAX_LLM_RETRIES = 3;
const LLM_RETRY_DELAY_MS = 1000;

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
 * Broadcast a message to all Google Meet content scripts.
 * Silently ignores tabs where content script is not loaded.
 */
async function broadcastToMeetTabs(message: ExtensionMessage): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {
          // Ignore - content script might not be loaded on this tab
        });
      }
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

// Initialize encryption before store rehydration, then initialize store
import { encryptionService } from '../src/services/crypto/encryption';
import { storeReadyPromise } from '../src/store';

encryptionService
  .initialize()
  .then(() => circuitBreakerManager.rehydrate())
  .then(() => storeReadyPromise)
  .then(async () => {
    // Check if recovering from SW termination during active transcription
    const wasActive = await wasTranscriptionActive();
    if (wasActive) {
      await transcriptBuffer.load();
      isTranscriptionActive = true;
      startKeepAlive();
      console.log(
        'TranscriptBuffer: Recovered',
        transcriptBuffer.length,
        'entries after SW restart',
      );
    }

    storeReady = true;
    console.log('Store ready in service worker, draining', messageQueue.length, 'queued messages');
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
async function sendLLMMessageToMeet(message: LLMStreamMessage | LLMStatusMessage): Promise<void> {
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
}

async function streamWithRetry(
  params: StreamWithRetryParams,
  modelType: 'fast' | 'full',
  responseId: string,
  retryCount = 0,
): Promise<void> {
  try {
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
 * Handle LLM_REQUEST by firing dual parallel streaming requests
 * Fast model provides quick hints, full model provides comprehensive answers
 * Automatically selects provider based on model ID and configured API keys
 */
async function handleLLMRequest(
  responseId: string,
  question: string,
  recentContext: string,
  fullTranscript: string,
  templateId: string,
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

  // Resolve provider for fast model
  const fastResolution = resolveProviderForModel(models.fastModel, {
    openAI: apiKeys.openAI,
    openRouter: apiKeys.openRouter,
  });

  // Resolve provider for full model
  const fullResolution = resolveProviderForModel(models.fullModel, {
    openAI: apiKeys.openAI,
    openRouter: apiKeys.openRouter,
  });

  // Check if either model couldn't be resolved
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

  // Build prompts using the template
  const prompts = buildPrompt({ question, recentContext, fullTranscript, templateId }, template);

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
      // Stop keep-alive only if no other active requests
      if (activeAbortControllers.size === 0) {
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

  // Fire fast model request (if provider available)
  let fastPromise: Promise<void> = Promise.resolve();
  if (fastResolution) {
    const fastBreaker = circuitBreakerManager.getBreaker(fastResolution.provider.id);
    if (!fastBreaker.allowRequest()) {
      // Circuit is OPEN -- reject immediately without network request
      fastComplete = true;
      await sendLLMMessageToMeet({
        type: 'LLM_STATUS',
        responseId,
        model: 'fast',
        status: 'error',
        error: `${fastResolution.provider.id} service temporarily unavailable`,
      });
    } else {
      fastPromise = streamWithRetry(
        {
          provider: fastResolution.provider,
          model: fastResolution.model,
          systemPrompt: prompts.system,
          userPrompt: prompts.user,
          maxTokens: 300, // Short response for fast hint
          apiKey: fastResolution.provider.id === 'openai' ? apiKeys.openAI : apiKeys.openRouter,
          onToken: (token) => {
            sendLLMMessageToMeet({
              type: 'LLM_STREAM',
              responseId,
              model: 'fast',
              token,
            });
          },
          onComplete: () => {
            fastComplete = true;
            console.log('LLM: Fast model complete');
            sendLLMMessageToMeet({
              type: 'LLM_STATUS',
              responseId,
              model: 'fast',
              status: 'complete',
            });
            checkAllComplete();
          },
          onError: (error) => {
            fastComplete = true;
            console.error('LLM: Fast model error:', error.message);
            sendLLMMessageToMeet({
              type: 'LLM_STATUS',
              responseId,
              model: 'fast',
              status: 'error',
              error: error.message || 'Unknown error',
            });
            checkAllComplete();
          },
          abortSignal: abortController.signal,
        },
        'fast',
        responseId,
      )
        .then(() => {
          fastBreaker.recordSuccess();
        })
        .catch((error) => {
          fastBreaker.recordFailure();
          throw error;
        });
    }
  } else {
    fastComplete = true;
    await sendLLMMessageToMeet({
      type: 'LLM_STATUS',
      responseId,
      model: 'fast',
      status: 'error',
      error: `Model ${models.fastModel} not available with current API keys`,
    });
  }

  // Fire full model request (if provider available)
  let fullPromise: Promise<void> = Promise.resolve();
  if (fullResolution) {
    const fullBreaker = circuitBreakerManager.getBreaker(fullResolution.provider.id);
    if (!fullBreaker.allowRequest()) {
      // Circuit is OPEN -- reject immediately without network request
      fullComplete = true;
      await sendLLMMessageToMeet({
        type: 'LLM_STATUS',
        responseId,
        model: 'full',
        status: 'error',
        error: `${fullResolution.provider.id} service temporarily unavailable`,
      });
    } else {
      fullPromise = streamWithRetry(
        {
          provider: fullResolution.provider,
          model: fullResolution.model,
          systemPrompt: prompts.system,
          userPrompt: prompts.userFull,
          maxTokens: 2000, // Comprehensive response
          apiKey: fullResolution.provider.id === 'openai' ? apiKeys.openAI : apiKeys.openRouter,
          onToken: (token) => {
            sendLLMMessageToMeet({
              type: 'LLM_STREAM',
              responseId,
              model: 'full',
              token,
            });
          },
          onComplete: () => {
            fullComplete = true;
            console.log('LLM: Full model complete');
            sendLLMMessageToMeet({
              type: 'LLM_STATUS',
              responseId,
              model: 'full',
              status: 'complete',
            });
            checkAllComplete();
          },
          onError: (error) => {
            fullComplete = true;
            console.error('LLM: Full model error:', error.message);
            sendLLMMessageToMeet({
              type: 'LLM_STATUS',
              responseId,
              model: 'full',
              status: 'error',
              error: error.message || 'Unknown error',
            });
            checkAllComplete();
          },
          abortSignal: abortController.signal,
        },
        'full',
        responseId,
      )
        .then(() => {
          fullBreaker.recordSuccess();
        })
        .catch((error) => {
          fullBreaker.recordFailure();
          throw error;
        });
    }
  } else {
    fullComplete = true;
    await sendLLMMessageToMeet({
      type: 'LLM_STATUS',
      responseId,
      model: 'full',
      status: 'error',
      error: `Model ${models.fullModel} not available with current API keys`,
    });
  }

  // Send streaming status for both (only if at least one is streaming)
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

type MessageResponse =
  | PongMessage
  | { type: string }
  | { received: boolean }
  | { success: boolean; error?: string }
  | { isCapturing: boolean; isTranscribing: boolean; hasActiveLLMRequest: boolean; isCaptureStartInProgress: boolean }
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
    console.log('Ignoring _fromBackground message:', message.type);
    // Let offscreen handle and respond
    return false;
  }

  // These message types are ONLY for offscreen - background should never handle them
  // Even if _fromBackground check fails, don't process these
  const offscreenOnlyTypes = ['TAB_STREAM_ID', 'START_MIC_CAPTURE', 'STOP_MIC_CAPTURE'];
  if (offscreenOnlyTypes.includes(message?.type) && sender.id === chrome.runtime.id) {
    console.log('Skipping offscreen-only message in background:', message.type);
    return false;
  }

  // Queue guard: if store not ready, queue message for processing after hydration
  if (!storeReady) {
    console.log('Store not ready, queuing message:', message?.type);
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

// Register install listener at top level
chrome.runtime.onInstalled.addListener((details) => {
  console.log(`Extension ${details.reason}:`, details.previousVersion || 'fresh install');
});

// Message types that should be logged (important events only)
const LOGGED_MESSAGE_TYPES = [
  'START_CAPTURE',
  'STOP_CAPTURE',
  'CAPTURE_STARTED',
  'CAPTURE_STOPPED',
  'CAPTURE_ERROR',
  'START_TRANSCRIPTION',
  'STOP_TRANSCRIPTION',
  'TRANSCRIPTION_STARTED',
  'TRANSCRIPTION_STOPPED',
  'TRANSCRIPTION_ERROR',
  'LLM_REQUEST',
  'LLM_CANCEL',
  'CONNECTION_STATE',
];

// Async message handler using switch for proper discriminated union narrowing
async function handleMessage(
  message: ExtensionMessage,
  _sender: chrome.runtime.MessageSender,
): Promise<MessageResponse> {
  // Only log important events to reduce console spam
  if (LOGGED_MESSAGE_TYPES.includes(message.type)) {
    console.log('Background:', message.type);
  }

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
      console.log('Offscreen document is ready');
      return { received: true };

    case 'START_CAPTURE': {
      try {
        // Prevent concurrent START_CAPTURE calls
        if (isCaptureStartInProgress) {
          console.log('START_CAPTURE already in progress, ignoring duplicate');
          return { success: false, error: 'Capture start already in progress' };
        }
        isCaptureStartInProgress = true;

        // Always ensure clean state before starting
        // Check if offscreen thinks capture is active (regardless of our flag)
        try {
          console.log('Ensuring clean state before capture...');
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
        console.log('Requesting stream ID for tab:', activeTab.id);
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

        console.log('Tab capture started successfully');
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
        // Give Chrome extra time to fully release the stream
        await new Promise((resolve) => setTimeout(resolve, 300));
        console.log('Tab capture stopped');
        return { success: true };
      } catch (error) {
        // Reset state even on error
        isTabCaptureActive = false;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Stop capture failed:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }

    case 'TAB_AUDIO_CHUNK':
      // Audio chunks are processed in offscreen - no logging needed (too frequent)
      return { received: true };

    case 'MIC_AUDIO_CHUNK':
      // Audio chunks are processed in offscreen - no logging needed (too frequent)
      return { received: true };

    case 'GET_CAPTURE_STATE':
      // Return current capture/transcription/LLM state for popup sync
      // Include isCaptureStartInProgress so popup can skip updates during startup
      return {
        isCapturing: isTabCaptureActive,
        isTranscribing: isTranscriptionActive,
        hasActiveLLMRequest: activeAbortControllers.size > 0,
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

        if (response?.success) console.log('Mic capture started');
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

        if (response?.success) console.log('Mic capture stopped');
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
        console.log('Ignoring CAPTURE_STOPPED during START_CAPTURE (cleanup)');
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
      // Content script communication - no logging needed
      return { received: true };

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
        console.log('Transcription: Starting...');
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

        // Stop keep-alive only if no active LLM requests
        if (activeAbortControllers.size === 0) {
          stopKeepAlive();
        }

        console.log('Transcription: Stopped');
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
      console.log('Transcription: Connected');
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

      // Log final transcript (speaker + text) for debugging
      console.log(`[${message.speaker}]:`, message.text);
      return { received: true };
    }

    case 'TRANSCRIPT_UPDATE':
      // This is outbound only - no logging
      return { received: true };

    case 'REQUEST_MIC_PERMISSION':
      // This goes directly to content script
      return { received: true };

    // LLM request lifecycle messages
    case 'LLM_REQUEST': {
      // Cancel ALL existing active requests before starting new one
      if (activeAbortControllers.size > 0) {
        console.log('LLM: Cancelling', activeAbortControllers.size, 'previous request(s)');
        for (const [, controller] of activeAbortControllers) {
          controller.abort();
        }
        activeAbortControllers.clear();
      }

      // Fire dual parallel LLM requests (non-blocking)
      handleLLMRequest(
        message.responseId,
        message.question,
        message.recentContext,
        message.fullTranscript,
        message.templateId,
      );
      console.log('LLM: Starting request');
      return { success: true };
    }

    case 'LLM_STREAM':
      // Outbound only - no logging (too frequent)
      return { received: true };

    case 'LLM_STATUS':
      // Outbound only - no logging
      return { received: true };

    case 'LLM_CANCEL': {
      // Cancel active request
      const abortController = activeAbortControllers.get(message.responseId);
      if (abortController) {
        abortController.abort();
        activeAbortControllers.delete(message.responseId);
        console.log('LLM: Cancelled');
        // Stop keep-alive if no other active requests
        if (activeAbortControllers.size === 0) {
          stopKeepAlive();
        }
      }
      return { success: true };
    }

    case 'CONNECTION_STATE': {
      // Forward connection state to content scripts for UI display
      await broadcastToMeetTabs(message);
      // Only log non-connected states
      if (message.state !== 'connected') {
        console.log('Connection:', message.service, message.state);
      }
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
    console.log('Offscreen document already exists');
    return;
  }

  // Prevent race condition
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  console.log('Creating offscreen document...');
  creatingOffscreen = chrome.offscreen.createDocument({
    url: offscreenUrl,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Audio capture and WebSocket for transcription',
  });

  await creatingOffscreen;
  creatingOffscreen = null;
  console.log('Offscreen document created');
}

// WXT export
export default defineBackground(() => {
  console.log('AI Interview Assistant: Service Worker started');
});
