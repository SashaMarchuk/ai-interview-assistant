import { createRoot } from 'react-dom/client';
import { Overlay } from '../src/overlay';
import '../src/assets/app.css';

// Only inject on active Google Meet meeting pages (not landing/join pages)
// Meeting URL pattern: meet.google.com/xxx-xxxx-xxx
const MEET_URL_PATTERN = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i;

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

    // Create UI container using WXT's createShadowRootUi for proper isolation
    const ui = await createShadowRootUi(ctx, {
      name: 'ai-interview-assistant',
      position: 'inline',
      anchor: 'body',
      onMount: (container) => {
        // Create React root inside shadow DOM
        const root = createRoot(container);
        // Render the full overlay with mock data (Phase 5)
        // In Phase 7, real data will be passed via message handlers
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
