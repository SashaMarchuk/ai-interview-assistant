import { createRoot } from 'react-dom/client';
import { Overlay } from '../src/overlay';
import { storeReadyPromise } from '../src/store';
import '../src/assets/app.css';
import type { TranscriptEntry } from '../src/types/transcript';
import type { ExtensionMessage } from '../src/types/messages';

// Only inject on active Google Meet meeting pages (not landing/join pages)
// Meeting URL pattern: meet.google.com/xxx-xxxx-xxx
const MEET_URL_PATTERN = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i;

// Custom event type for transcript updates
export interface TranscriptUpdateEventDetail {
  entries: TranscriptEntry[];
}

// Module-level transcript state
let currentTranscript: TranscriptEntry[] = [];

/**
 * Dispatch transcript update to the React overlay via custom event.
 * The overlay listens for this event to update its state.
 */
function dispatchTranscriptUpdate(entries: TranscriptEntry[]): void {
  currentTranscript = entries;
  window.dispatchEvent(
    new CustomEvent<TranscriptUpdateEventDetail>('transcript-update', {
      detail: { entries },
    })
  );
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

    // Set up message listener for transcript updates from Service Worker
    chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
      if (message.type === 'TRANSCRIPT_UPDATE') {
        console.log('AI Interview Assistant: Received transcript update', message.entries.length, 'entries');
        dispatchTranscriptUpdate(message.entries);
      }
      // Return false to not keep the channel open (no async response needed)
      return false;
    });

    // Wait for store to sync before rendering (for blur level, etc.)
    await storeReadyPromise;

    // Create UI container using WXT's createShadowRootUi for proper isolation
    const ui = await createShadowRootUi(ctx, {
      name: 'ai-interview-assistant',
      position: 'inline',
      anchor: 'body',
      onMount: (container) => {
        // Create React root inside shadow DOM
        const root = createRoot(container);
        // Render the overlay - it will listen for transcript-update events
        root.render(<Overlay />);
        return root;
      },
      onRemove: (root) => {
        root?.unmount();
      },
    });

    ui.mount();
    console.log('AI Interview Assistant: Overlay injected with drag/resize support');

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
