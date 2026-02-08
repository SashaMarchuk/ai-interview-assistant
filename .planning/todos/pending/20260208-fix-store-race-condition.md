---
created: 2026-02-08
title: Fix Race Condition in Store Sync
area: bug
priority: P0
version: v1.1
complexity: low
estimate: 0.5 days
files:
  - entrypoints/background.ts
  - src/store/index.ts
---

## Problem

**CRITICAL BUG:** Race condition in background script initialization.

**Location:**
- `entrypoints/background.ts:124-127`

**Current code:**
```typescript
// ❌ RACE CONDITION
storeReadyPromise.then(() => {
  console.log('[Background] Store synced and ready');
});

// Message handlers registered immediately
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // LLM requests may arrive BEFORE store is ready
  if (message.type === 'SEND_TO_LLM') {
    const settings = settingsStore.getState();  // May be undefined!
    // ...
  }
});
```

**Problem:**
1. Store sync is asynchronous (`storeReadyPromise.then()`)
2. Message handlers registered immediately (synchronous)
3. Messages can arrive **before** store sync completes
4. Accessing store state returns `undefined` or stale data
5. API calls fail or use wrong configuration

## User Impact

- **Failures:** LLM requests fail immediately after extension install/update
- **Wrong config:** Uses default/stale settings instead of user's
- **Inconsistent behavior:** Works on subsequent attempts but not first
- **Poor UX:** Confusing errors, user has to retry

## Solution

### Wait for Store Before Registering Handlers

**Correct pattern:**

```typescript
// entrypoints/background.ts

import { storeReadyPromise } from '@/store';

// ✅ Wait for store before registering handlers
async function initializeBackground() {
  console.log('[Background] Waiting for store sync...');

  // CRITICAL: Await store sync
  await storeReadyPromise;

  console.log('[Background] Store ready, registering handlers');

  // Now safe to register message handlers
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender, sendResponse);
    return true; // Keep channel open for async response
  });

  console.log('[Background] Background script initialized');
}

// Message handler (runs after store ready)
async function handleMessage(
  message: Message,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void
) {
  try {
    switch (message.type) {
      case 'SEND_TO_LLM': {
        // ✅ Store guaranteed to be ready
        const settings = settingsStore.getState();
        const apiKey = settings.apiKeys.openai;

        if (!apiKey) {
          sendResponse({ error: 'OpenAI API key not configured' });
          return;
        }

        const response = await llmService.chat(message.messages);
        sendResponse({ success: true, response });
        break;
      }

      case 'START_TRANSCRIPTION': {
        const settings = settingsStore.getState();
        const apiKey = settings.apiKeys.elevenlabs;

        if (!apiKey) {
          sendResponse({ error: 'ElevenLabs API key not configured' });
          return;
        }

        await transcriptionService.start(apiKey);
        sendResponse({ success: true });
        break;
      }

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  } catch (error) {
    console.error('[Background] Message handler error:', error);
    sendResponse({ error: error.message });
  }
}

// Initialize on script load
initializeBackground().catch(error => {
  console.error('[Background] Initialization failed:', error);
});
```

### Store Initialization

**Ensure store exports promise correctly:**

```typescript
// src/store/index.ts

import { create } from 'zustand';
import { createChromeStorageMiddleware } from './chromeStorage';

export const settingsStore = create(/* ... */);
export const transcriptStore = create(/* ... */);

// ✅ Promise that resolves when all stores synced
export const storeReadyPromise = Promise.all([
  settingsStore.persist.rehydrate(),
  transcriptStore.persist.rehydrate()
]).then(() => {
  console.log('[Store] All stores synchronized');
});
```

### Early Message Queuing (Optional Enhancement)

**Queue messages that arrive before store ready:**

```typescript
// entrypoints/background.ts

const messageQueue: Array<{
  message: any;
  sender: chrome.runtime.MessageSender;
  sendResponse: (response: any) => void;
}> = [];

let handlersRegistered = false;

// Temporary handler for early messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!handlersRegistered) {
    console.log('[Background] Queuing early message:', message.type);
    messageQueue.push({ message, sender, sendResponse });
    return true; // Keep channel open
  }

  handleMessage(message, sender, sendResponse);
  return true;
});

async function initializeBackground() {
  await storeReadyPromise;

  handlersRegistered = true;

  // Process queued messages
  console.log(`[Background] Processing ${messageQueue.length} queued messages`);
  for (const { message, sender, sendResponse } of messageQueue) {
    handleMessage(message, sender, sendResponse);
  }
  messageQueue.length = 0; // Clear queue

  console.log('[Background] Background script initialized');
}

initializeBackground();
```

### Prevent Service Worker Termination During Init

**Chrome may terminate service worker during slow init:**

```typescript
// Keep service worker alive during initialization
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

async function initializeBackground() {
  // Keep alive during init
  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {
      // No-op, just keeps service worker alive
    });
  }, 20000); // Every 20 seconds

  await storeReadyPromise;

  // Clear keep-alive after init
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }

  // Register handlers...
}
```

### Testing

**Add logging to verify initialization order:**

```typescript
async function initializeBackground() {
  const startTime = Date.now();

  console.log('[Background] [0ms] Starting initialization');

  await storeReadyPromise;

  console.log(`[Background] [${Date.now() - startTime}ms] Store ready`);

  chrome.runtime.onMessage.addListener(/* ... */);

  console.log(`[Background] [${Date.now() - startTime}ms] Handlers registered`);
}
```

### Implementation Steps

1. **Refactor background.ts**
   - Create async `initializeBackground()` function
   - Await `storeReadyPromise` before registering handlers
   - Move message handler logic to separate function

2. **Verify store exports**
   - Ensure `storeReadyPromise` exported correctly
   - Test promise resolves on extension load

3. **Add logging**
   - Log initialization steps with timestamps
   - Log when store ready
   - Log when handlers registered

4. **Test edge cases**
   - Fresh install
   - Extension update
   - Browser restart
   - Rapid message sending

5. **(Optional) Add message queuing**
   - Queue early messages
   - Process after initialization
   - Clear queue

### Files to Update

- `entrypoints/background.ts` - Main fix
- `src/store/index.ts` - Verify promise export
- Test: Install flow, update flow

### Testing Checklist

- [ ] Store sync completes before handlers registered
- [ ] No more "undefined" store state errors
- [ ] Fresh install works (no race condition)
- [ ] Extension update works
- [ ] Browser restart works
- [ ] LLM requests succeed immediately after install
- [ ] Transcription starts immediately after install
- [ ] Logging shows correct initialization order
- [ ] No service worker termination during init

### Error Cases to Handle

**Store sync failure:**
```typescript
async function initializeBackground() {
  try {
    await storeReadyPromise;
  } catch (error) {
    console.error('[Background] Store sync failed:', error);

    // Fallback: Use default settings
    console.warn('[Background] Using default settings');
  }

  // Continue with handler registration
  // ...
}
```

**Timeout on slow devices:**
```typescript
const STORE_SYNC_TIMEOUT = 10000; // 10 seconds

async function initializeBackground() {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Store sync timeout')), STORE_SYNC_TIMEOUT)
  );

  try {
    await Promise.race([storeReadyPromise, timeout]);
  } catch (error) {
    console.error('[Background] Store sync timeout, using defaults');
  }

  // Continue...
}
```

### Performance Impact

**Negligible:**
- Store sync typically completes in 10-50ms
- Handler registration delayed by same amount
- Messages queue if sent during init (rare)

**Benefit:**
- Eliminates race condition bugs
- More reliable first-use experience

### Alternative: Lazy Store Access

**Access store lazily in handlers:**

```typescript
async function handleMessage(message, sender, sendResponse) {
  // Wait for store in handler if needed
  if (!settingsStore.persist.hasHydrated()) {
    await storeReadyPromise;
  }

  const settings = settingsStore.getState();
  // ...
}
```

**Trade-off:** Adds latency to every message vs. waiting once at startup.

### Timeline

- **Code changes:** 1-2 hours
- **Testing:** 1-2 hours
- **Verification on slow devices:** 1 hour

**Total:** 0.5 days

## References

- [Chrome Extension Service Workers](https://developer.chrome.com/docs/extensions/mv3/service_workers/)
- [Zustand Persist Middleware](https://github.com/pmndrs/zustand/blob/main/docs/integrations/persisting-store-data.md)
