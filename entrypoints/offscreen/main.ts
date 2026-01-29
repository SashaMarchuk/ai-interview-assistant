import type { OffscreenReadyMessage, PingMessage } from '../../src/types/messages';
import { isMessage } from '../../src/types/messages';

// Register message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Offscreen received:', message.type, 'from:', sender.id);

  // Handle messages sent to offscreen document
  if (isMessage<PingMessage>(message, 'PING')) {
    sendResponse({ type: 'PONG', timestamp: message.timestamp, receivedAt: Date.now() });
    return true;
  }

  // Echo back unknown messages
  sendResponse({ received: true, originalType: message.type });
  return true;
});

// Notify background that offscreen is ready
async function notifyReady(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_READY',
    } satisfies OffscreenReadyMessage);
    console.log('Offscreen ready notification response:', response);
  } catch (error) {
    console.error('Failed to notify ready:', error);
  }
}

// Initialize
console.log('Offscreen document loaded');
notifyReady();
