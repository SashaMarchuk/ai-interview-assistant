import type { ExtensionMessage, PingMessage, PongMessage } from '../src/types/messages';
import { isMessage } from '../src/types/messages';

// Register message listener synchronously at top level - CRITICAL
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

// Async message handler
async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  console.log('Background received:', message.type, 'from:', sender.id);

  if (isMessage<PingMessage>(message, 'PING')) {
    return {
      type: 'PONG',
      timestamp: message.timestamp,
      receivedAt: Date.now(),
    } satisfies PongMessage;
  }

  if (isMessage(message, 'CREATE_OFFSCREEN')) {
    await ensureOffscreenDocument();
    return { type: 'OFFSCREEN_READY' };
  }

  if (isMessage(message, 'OFFSCREEN_READY')) {
    console.log('Offscreen document is ready');
    return { received: true };
  }

  console.warn('Unknown message type:', message);
  return { error: 'Unknown message type' };
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
