import type {
  ExtensionMessage,
  PongMessage,
  TabStreamIdMessage,
  StopCaptureMessage,
  StartMicCaptureMessage,
  StopMicCaptureMessage,
  StartTranscriptionMessage,
  StopTranscriptionMessage,
  TranscriptUpdateMessage,
  GetCaptureStateMessage,
  LLMStreamMessage,
  LLMStatusMessage,
  ConnectionStateMessage,
} from '../src/types/messages';
import { buildPrompt, resolveProviderForModel, type LLMProvider } from '../src/services/llm';
import { useStore } from '../src/store';
import type { TranscriptEntry } from '../src/types/transcript';

// Module state for transcript management
let mergedTranscript: TranscriptEntry[] = [];
let interimEntries: Map<string, { source: 'tab' | 'mic'; text: string; timestamp: number }> =
  new Map();

// Module state for capture tracking
let isTabCaptureActive = false;
let isTranscriptionActive = false;

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
 * Broadcast transcript to all Google Meet content scripts.
 * Includes both final entries and current interim (partial) entries.
 */
async function broadcastTranscript(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });

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

    const message: TranscriptUpdateMessage = {
      type: 'TRANSCRIPT_UPDATE',
      entries: [...mergedTranscript, ...interimAsEntries],
    };

    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch((err) => {
          // Ignore - content script might not be loaded on this tab
          console.log(`Could not send to tab ${tab.id}:`, err.message);
        });
      }
    }

    if (tabs.length > 0) {
      console.log(`Broadcast ${mergedTranscript.length} final + ${interimAsEntries.length} interim entries`);
    }
  } catch (error) {
    console.error('Failed to broadcast transcript:', error);
  }
}

/**
 * Add a transcript entry maintaining chronological order.
 * Broadcasts TRANSCRIPT_UPDATE to content scripts on Google Meet tabs.
 */
async function addTranscriptEntry(entry: TranscriptEntry): Promise<void> {
  // Find correct insertion index to maintain chronological order by timestamp
  let insertIndex = mergedTranscript.length;
  for (let i = mergedTranscript.length - 1; i >= 0; i--) {
    if (mergedTranscript[i].timestamp <= entry.timestamp) {
      insertIndex = i + 1;
      break;
    }
    if (i === 0) {
      insertIndex = 0;
    }
  }

  // Insert entry at the correct position
  mergedTranscript.splice(insertIndex, 0, entry);

  console.log(
    'Transcript entry added:',
    entry.speaker,
    entry.text.substring(0, 50) + (entry.text.length > 50 ? '...' : '')
  );

  // Broadcast updated transcript
  await broadcastTranscript();
}

// Initialize store in service worker - required for webext-zustand cross-context sync
import { storeReadyPromise } from '../src/store';
storeReadyPromise.then(() => {
  console.log('Store ready in service worker');
});

/**
 * Send LLM message to all Google Meet content scripts
 */
async function sendLLMMessageToMeet(message: LLMStreamMessage | LLMStatusMessage): Promise<void> {
  const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {
        // Ignore - content script might not be loaded on this tab
      });
    }
  }
}

/**
 * Send connection state to all Google Meet content scripts
 */
async function sendConnectionState(
  service: 'stt-tab' | 'stt-mic' | 'llm',
  state: 'connected' | 'disconnected' | 'reconnecting' | 'error',
  error?: string
): Promise<void> {
  const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
  const message: ConnectionStateMessage = {
    type: 'CONNECTION_STATE',
    service,
    state,
    error,
  };
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    }
  }
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
  retryCount = 0
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
  templateId: string
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
  const prompts = buildPrompt(
    { question, recentContext, fullTranscript, templateId },
    template
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
          sendLLMMessageToMeet({
            type: 'LLM_STATUS',
            responseId,
            model: 'fast',
            status: 'error',
            error: error.message,
          });
          checkAllComplete();
        },
        abortSignal: abortController.signal,
      },
      'fast',
      responseId
    );
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
          sendLLMMessageToMeet({
            type: 'LLM_STATUS',
            responseId,
            model: 'full',
            status: 'error',
            error: error.message,
          });
          checkAllComplete();
        },
        abortSignal: abortController.signal,
      },
      'full',
      responseId
    );
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

// Register message listener synchronously at top level - CRITICAL
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Ignore webext-zustand internal sync messages - let the library handle them
  if (message?.type === 'chromex.dispatch') {
    return false; // Don't send response, let other listeners handle it
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

// Async message handler using switch for proper discriminated union narrowing
async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  console.log('Background received:', message.type, 'from:', sender.id);

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
        // Check if capture is already active
        if (isTabCaptureActive) {
          // Force cleanup first
          console.log('Previous capture was active, cleaning up first...');
          try {
            await chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' } satisfies StopCaptureMessage);
          } catch (e) {
            console.log('Cleanup error (may be expected):', e);
          }
          isTabCaptureActive = false;
          // Longer delay to let Chrome fully release the stream and close AudioContext
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        // IMPORTANT: Ensure offscreen document exists FIRST
        // Stream IDs expire quickly, so we need offscreen ready before requesting
        console.log('Ensuring offscreen document is ready...');
        await ensureOffscreenDocument();
        // Give offscreen document a moment to fully initialize
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Get the active tab
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab?.id) {
          throw new Error('No active tab found');
        }

        // Validate tab URL - some tabs can't be captured
        if (!activeTab.url || activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('chrome-extension://')) {
          throw new Error('Cannot capture this tab. Navigate to a regular webpage first.');
        }

        // Get stream ID for tab capture (requires user gesture context from popup)
        // Do NOT specify consumerTabId - the stream will be used by extension's offscreen document
        console.log('Getting stream ID for tab:', activeTab.id, 'URL:', activeTab.url);
        const streamId = await new Promise<string>((resolve, reject) => {
          chrome.tabCapture.getMediaStreamId(
            { targetTabId: activeTab.id },
            (id) => {
              if (chrome.runtime.lastError) {
                console.error('getMediaStreamId error:', chrome.runtime.lastError);
                reject(new Error(chrome.runtime.lastError.message));
              } else if (!id) {
                reject(new Error('No stream ID returned'));
              } else {
                console.log('Got stream ID:', id.substring(0, 20) + '...');
                resolve(id);
              }
            }
          );
        });

        // Mark capture as starting (will be confirmed by CAPTURE_STARTED)
        isTabCaptureActive = true;

        // IMMEDIATELY send stream ID to offscreen document (stream IDs expire quickly!)
        const response = await chrome.runtime.sendMessage({
          type: 'TAB_STREAM_ID',
          streamId,
        } satisfies TabStreamIdMessage);

        // Check if offscreen capture actually succeeded
        if (!response?.success) {
          isTabCaptureActive = false;
          throw new Error(response?.error || 'Tab capture failed in offscreen');
        }

        console.log('Tab capture started, stream ID sent to offscreen');
        return { success: true };
      } catch (error) {
        // Reset state on failure
        isTabCaptureActive = false;
        const errorMessage = error instanceof Error ? error.message : 'Unknown capture error';
        console.error('Tab capture failed:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }

    case 'STOP_CAPTURE': {
      try {
        console.log('STOP_CAPTURE received, forwarding to offscreen...');
        // Forward stop command to offscreen document
        const response = await chrome.runtime.sendMessage({
          type: 'STOP_CAPTURE',
        } satisfies StopCaptureMessage);
        console.log('STOP_CAPTURE response from offscreen:', response);
        isTabCaptureActive = false;
        // Give Chrome extra time to fully release the stream
        await new Promise((resolve) => setTimeout(resolve, 300));
        console.log('Stop capture complete');
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
      // Note: ArrayBuffer cannot be cloned via message passing, so chunk.byteLength will be undefined
      // This is just for logging - actual audio goes directly to transcription in offscreen
      console.log('Tab audio chunk received:', { timestamp: message.timestamp });
      return { received: true };

    case 'MIC_AUDIO_CHUNK':
      // Note: ArrayBuffer cannot be cloned via message passing, so chunk.byteLength will be undefined
      // This is just for logging - actual audio goes directly to transcription in offscreen
      console.log('Mic audio chunk received:', { timestamp: message.timestamp });
      return { received: true };

    case 'GET_CAPTURE_STATE':
      // Return current capture/transcription state for popup sync
      return {
        isCapturing: isTabCaptureActive,
        isTranscribing: isTranscriptionActive,
      };

    case 'START_MIC_CAPTURE': {
      try {
        // Ensure offscreen document exists to handle the audio
        await ensureOffscreenDocument();

        // Forward start mic capture command to offscreen document
        const response = await chrome.runtime.sendMessage({
          type: 'START_MIC_CAPTURE',
        } satisfies StartMicCaptureMessage);

        console.log('Mic capture start response:', response);
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
        } satisfies StopMicCaptureMessage);

        console.log('Mic capture stop response:', response);
        return response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Stop mic capture failed:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }

    case 'CAPTURE_STARTED':
      console.log('Capture started notification received');
      return { received: true };

    case 'CAPTURE_STOPPED':
      isTabCaptureActive = false;
      console.log('Capture stopped notification received');
      return { received: true };

    case 'CAPTURE_ERROR':
      isTabCaptureActive = false;
      console.error('Capture error:', message.error);
      return { received: true };

    case 'TAB_STREAM_ID':
      // This should only go to offscreen, not back to background
      console.warn('Received TAB_STREAM_ID in background - unexpected');
      return { received: true };

    case 'INJECT_UI':
    case 'UI_INJECTED':
      // These are for content script communication
      console.log('UI message received:', message.type);
      return { received: true };

    case 'PONG':
      // PONG is a response, not typically received by background
      console.log('PONG received in background - unexpected');
      return { received: true };

    // Transcription lifecycle messages
    case 'START_TRANSCRIPTION': {
      try {
        // Ensure offscreen document exists
        await ensureOffscreenDocument();

        // Clear transcript state for new session
        mergedTranscript = [];
        interimEntries.clear();

        // Forward to offscreen document to initiate WebSocket connections
        await chrome.runtime.sendMessage({
          type: 'START_TRANSCRIPTION',
          apiKey: message.apiKey,
        } satisfies StartTranscriptionMessage);

        isTranscriptionActive = true;
        console.log('START_TRANSCRIPTION forwarded to offscreen');
        return { success: true };
      } catch (error) {
        isTranscriptionActive = false;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Start transcription failed:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }

    case 'STOP_TRANSCRIPTION': {
      try {
        // Forward to offscreen document to close WebSocket connections
        await chrome.runtime.sendMessage({
          type: 'STOP_TRANSCRIPTION',
        } satisfies StopTranscriptionMessage);

        isTranscriptionActive = false;
        console.log('STOP_TRANSCRIPTION forwarded to offscreen');
        return { success: true };
      } catch (error) {
        isTranscriptionActive = false;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Stop transcription failed:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }

    case 'TRANSCRIPTION_STARTED':
      isTranscriptionActive = true;
      console.log('Transcription started - WebSocket connections established');
      return { received: true };

    case 'TRANSCRIPTION_STOPPED':
      isTranscriptionActive = false;
      console.log('Transcription stopped - WebSocket connections closed');
      return { received: true };

    case 'TRANSCRIPTION_ERROR':
      console.error(
        'Transcription error:',
        message.source,
        message.error,
        'canRetry:',
        message.canRetry
      );
      return { received: true };

    case 'TRANSCRIPT_PARTIAL':
      // Store interim entry for this source
      interimEntries.set(message.source, {
        source: message.source,
        text: message.text,
        timestamp: message.timestamp,
      });
      console.log('Partial transcript from', message.source + ':', message.text);
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

      console.log('Final transcript from', message.source + ':', message.speaker, message.text);
      return { received: true };
    }

    case 'TRANSCRIPT_UPDATE':
      // This is outbound only, but handle for exhaustive check
      console.log('Transcript update message (outbound):', message.entries.length, 'entries');
      return { received: true };

    case 'REQUEST_MIC_PERMISSION':
      // This goes directly to content script via chrome.tabs.sendMessage, not here
      console.log('REQUEST_MIC_PERMISSION received in background (unexpected)');
      return { received: true };

    // LLM request lifecycle messages
    case 'LLM_REQUEST': {
      // Fire dual parallel LLM requests (non-blocking)
      handleLLMRequest(
        message.responseId,
        message.question,
        message.recentContext,
        message.fullTranscript,
        message.templateId
      );
      console.log('LLM_REQUEST received, starting dual parallel streams:', message.responseId);
      return { success: true };
    }

    case 'LLM_STREAM':
      // This is outbound only (background -> content script)
      console.log('LLM_STREAM received in background (outbound only)');
      return { received: true };

    case 'LLM_STATUS':
      // This is outbound only (background -> content script)
      console.log('LLM_STATUS received in background (outbound only)');
      return { received: true };

    case 'LLM_CANCEL': {
      // Cancel active request
      const abortController = activeAbortControllers.get(message.responseId);
      if (abortController) {
        abortController.abort();
        activeAbortControllers.delete(message.responseId);
        console.log('LLM request cancelled:', message.responseId);
        // Stop keep-alive if no other active requests
        if (activeAbortControllers.size === 0) {
          stopKeepAlive();
        }
      } else {
        console.log('LLM_CANCEL: no active request found for:', message.responseId);
      }
      return { success: true };
    }

    case 'CONNECTION_STATE': {
      // Forward connection state to content scripts for UI display
      const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, message).catch(() => {});
        }
      }
      console.log('CONNECTION_STATE forwarded:', message.service, message.state);
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
