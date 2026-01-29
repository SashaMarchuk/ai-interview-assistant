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
} from '../src/types/messages';
import type { TranscriptEntry } from '../src/types/transcript';

// Module state for transcript management
let mergedTranscript: TranscriptEntry[] = [];
let interimEntries: Map<string, { source: 'tab' | 'mic'; text: string; timestamp: number }> =
  new Map();

/**
 * Add a transcript entry maintaining chronological order.
 * Broadcasts TRANSCRIPT_UPDATE to all contexts.
 */
function addTranscriptEntry(entry: TranscriptEntry): void {
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

  // Broadcast update to all contexts
  chrome.runtime.sendMessage({
    type: 'TRANSCRIPT_UPDATE',
    entries: [...mergedTranscript],
  } satisfies TranscriptUpdateMessage).catch((error) => {
    // Ignore errors if no listeners (e.g., content script not yet loaded)
    console.log('Could not broadcast transcript update:', error);
  });

  console.log(
    'Transcript entry added:',
    entry.speaker,
    entry.text.substring(0, 50) + (entry.text.length > 50 ? '...' : '')
  );
}

// Initialize store in service worker - required for webext-zustand cross-context sync
import { storeReadyPromise } from '../src/store';
storeReadyPromise.then(() => {
  console.log('Store ready in service worker');
});

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
        // Get the active tab
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab?.id) {
          throw new Error('No active tab found');
        }

        // Get stream ID for tab capture (requires user gesture context from popup)
        // Note: getMediaStreamId uses callback API, wrap in Promise
        const streamId = await new Promise<string>((resolve, reject) => {
          chrome.tabCapture.getMediaStreamId({ targetTabId: activeTab.id }, (id) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (!id) {
              reject(new Error('No stream ID returned'));
            } else {
              resolve(id);
            }
          });
        });

        // Ensure offscreen document exists to handle the audio
        await ensureOffscreenDocument();

        // Send stream ID to offscreen document
        await chrome.runtime.sendMessage({
          type: 'TAB_STREAM_ID',
          streamId,
        } satisfies TabStreamIdMessage);

        console.log('Tab capture started, stream ID sent to offscreen');
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown capture error';
        console.error('Tab capture failed:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }

    case 'STOP_CAPTURE': {
      try {
        // Forward stop command to offscreen document
        await chrome.runtime.sendMessage({
          type: 'STOP_CAPTURE',
        } satisfies StopCaptureMessage);
        console.log('Stop capture command sent to offscreen');
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Stop capture failed:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }

    case 'TAB_AUDIO_CHUNK':
      console.log('Tab audio chunk received:', {
        timestamp: message.timestamp,
        size: message.chunk.byteLength,
      });
      // Future: Forward to transcription service
      return { received: true };

    case 'MIC_AUDIO_CHUNK':
      console.log('Mic audio chunk received:', {
        timestamp: message.timestamp,
        size: message.chunk.byteLength,
      });
      // Future: Forward to transcription service
      return { received: true };

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
      console.log('Capture stopped notification received');
      return { received: true };

    case 'CAPTURE_ERROR':
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

        console.log('START_TRANSCRIPTION forwarded to offscreen');
        return { success: true };
      } catch (error) {
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

        console.log('STOP_TRANSCRIPTION forwarded to offscreen');
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Stop transcription failed:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }

    case 'TRANSCRIPTION_STARTED':
      console.log('Transcription started - WebSocket connections established');
      return { received: true };

    case 'TRANSCRIPTION_STOPPED':
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
