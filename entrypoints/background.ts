import type {
  ExtensionMessage,
  PongMessage,
  TabStreamIdMessage,
  StopCaptureMessage,
  StartMicCaptureMessage,
  StopMicCaptureMessage,
} from '../src/types/messages';

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
