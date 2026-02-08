# Phase 9: Security Foundation - Research

**Researched:** 2026-02-08
**Domain:** Chrome MV3 Extension -- API Key Security + Service Worker Race Condition
**Confidence:** HIGH

## Summary

Phase 9 addresses two critical bugs in the current codebase: (1) API keys are transmitted in plaintext via `chrome.runtime.sendMessage`, visible in DevTools and interceptable by any extension context, and (2) the background service worker can receive messages before the Zustand store finishes hydrating, causing silent failures or stale-data bugs on cold starts.

The scope is narrow and surgical. No new npm dependencies are needed. Both fixes use only existing APIs and patterns already proven in the codebase. The two requirements (SEC-01 and REL-01) are independent of each other but belong in the same phase because they both modify `entrypoints/background.ts` and should ship atomically.

**Primary recommendation:** Remove the `apiKey` field from `StartTranscriptionMessage`, have the background read ElevenLabs API key from the Zustand store (same pattern already used for LLM keys in `handleLLMRequest`), and wrap the existing synchronous message listener with a queue guard that defers message processing until `storeReadyPromise` resolves.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zustand | ^4.5.7 | State management with API keys in store | Already in use; background reads LLM keys from store (proven pattern) |
| webext-zustand | ^0.2.0 | Cross-context store sync | Already in use; `wrapStore` + `storeReadyPromise` |
| chrome.runtime.sendMessage | MV3 built-in | Message passing between contexts | Already the exclusive IPC mechanism |
| chrome.storage.local | MV3 built-in | Persistent state (via Zustand persist) | Already in use via `chromeStorage` adapter |

### Supporting

No new libraries needed for Phase 9. Everything uses existing dependencies.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zustand store for API key access | Direct `chrome.storage.local.get` in handler | Adds another storage read pattern; Zustand is already the canonical store. Direct reads bypass Zustand's cache and require manual parsing of the persisted JSON structure |
| Queue guard pattern | Lazy `await storeReadyPromise` inside `handleMessage` | Adds latency check to EVERY message, even after init. Queue guard is one-time overhead |
| Queue guard pattern | `useStore.persist.hasHydrated()` check | Internal Zustand API, may not be exposed through webext-zustand's `wrapStore`. Queue guard is more portable |

**Installation:**
```bash
# No new packages needed for Phase 9
```

## Architecture Patterns

### Recommended Changes

```
entrypoints/
  background.ts           # MODIFIED: queue guard + read API keys from store
src/types/
  messages.ts             # MODIFIED: remove apiKey from StartTranscriptionMessage
entrypoints/popup/
  App.tsx                 # MODIFIED: remove apiKey from START_TRANSCRIPTION message
entrypoints/offscreen/
  main.ts                 # MODIFIED: receive apiKey via message from background (internal)
```

### Pattern 1: Queue Guard for Service Worker Init

**What:** Register `chrome.runtime.onMessage.addListener` synchronously at the top level (required by MV3), but queue incoming messages until `storeReadyPromise` resolves. Then drain the queue.

**When to use:** Always, for any MV3 background script that has async initialization (store hydration, encryption init, etc.).

**Why not delay registration:** Chrome MV3 requires event listeners registered in the first turn of the event loop. If the service worker wakes from a message and the listener is not registered synchronously, the message is lost forever with no error.

**Example:**
```typescript
// Source: Chrome MV3 docs + .planning/research/ARCHITECTURE.md pattern
interface QueuedMessage {
  message: ExtensionMessage;
  sender: chrome.runtime.MessageSender;
  sendResponse: (response: unknown) => void;
}

const messageQueue: QueuedMessage[] = [];
let storeReady = false;

// MUST be synchronous, top-level -- MV3 requirement
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Always let webext-zustand handle its own internal messages
  if (message?.type === 'chromex.dispatch' || message?.type === 'chromex.fetch_state') {
    return false;
  }

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
  return true;
});

// Initialize store, then drain queue
storeReadyPromise.then(() => {
  storeReady = true;
  console.log('Store ready, draining', messageQueue.length, 'queued messages');
  for (const { message, sender, sendResponse } of messageQueue) {
    handleMessage(message, sender)
      .then(sendResponse)
      .catch((error) => {
        console.error('Queued message error:', error);
        sendResponse({ error: error.message });
      });
  }
  messageQueue.length = 0;
});
```

**Confidence:** HIGH -- This pattern is documented in Chrome's MV3 migration guide and used by Microsoft's Accessibility Insights extension (confirmed in their MV3 migration blog post). Also validated in `.planning/research/ARCHITECTURE.md` section 6.

### Pattern 2: Background Reads API Keys from Store (Not Messages)

**What:** Instead of the popup sending API keys in message payloads, the background reads them directly from the Zustand store using `useStore.getState()`.

**When to use:** For ALL API key access. This pattern is already used for LLM API keys in `handleLLMRequest()` (background.ts line 229).

**Why this works:** The background service worker is the primary Zustand store owner. `useStore.getState()` returns the hydrated, in-memory state synchronously. After the queue guard ensures the store is hydrated before processing messages, `getState()` always returns current data.

**Example:**
```typescript
// Source: Current codebase pattern from handleLLMRequest (background.ts:229)
// CURRENT (LLM - already correct):
async function handleLLMRequest(...) {
  const state = useStore.getState();
  const { apiKeys } = state;
  // Uses apiKeys.openAI and apiKeys.openRouter directly
}

// NEW (Transcription - same pattern):
case 'START_TRANSCRIPTION': {
  const state = useStore.getState();
  const elevenLabsKey = state.apiKeys.elevenLabs;

  if (!elevenLabsKey) {
    return { success: false, error: 'ElevenLabs API key not configured' };
  }

  // Forward to offscreen with key from store (internal message)
  await chrome.runtime.sendMessage({
    type: 'START_TRANSCRIPTION',
    apiKey: elevenLabsKey,
    languageCode: state.transcriptionLanguage || undefined,
    _fromBackground: true,
  });
  // ...
}
```

**Confidence:** HIGH -- This is the exact same pattern already proven for LLM keys in the same file.

### Pattern 3: Internal vs External Message Boundary

**What:** Distinguish between external messages (popup/content -> background, which must NEVER contain API keys) and internal messages (background -> offscreen, which can contain API keys because both run in the extension's trusted origin).

**When to use:** The background-to-offscreen channel is internal. The offscreen document needs the ElevenLabs API key to establish WebSocket connections (it calls `ElevenLabsConnection.obtainToken()` which makes an HTTP request with the API key). This key must flow from background to offscreen somehow.

**Critical distinction:**
- **External messages** (popup -> background): User-initiated, logged in DevTools, must NOT contain secrets
- **Internal messages** (background -> offscreen): Already marked with `_fromBackground: true`, within trusted extension origin

**The existing `_fromBackground` marker pattern is exactly right for this.** Background reads the key from store and sends it to offscreen via an internal message. The key never appears in any message initiated by popup or content script.

**Example (current flow, simplified):**
```
Popup sends: { type: 'START_TRANSCRIPTION' }  // NO apiKey
Background receives, reads key from store
Background sends: { type: 'START_TRANSCRIPTION', apiKey: key, _fromBackground: true }
Offscreen receives and uses key
```

**Confidence:** HIGH -- The `_fromBackground` pattern is already established and working for other messages (TAB_STREAM_ID, STOP_CAPTURE, etc.).

### Anti-Patterns to Avoid

- **Delaying listener registration behind `await`:** Chrome MV3 drops events if listeners are not registered synchronously. The current code correctly registers at the top level (line 436). Never move this behind an await.

- **Checking `useStore.persist.hasHydrated()` per message:** This is an internal Zustand API and may not behave correctly when `webext-zustand`'s `wrapStore` is involved. The queue guard pattern is more explicit and reliable.

- **Removing apiKey from the background-to-offscreen internal message:** The offscreen document needs the key to make HTTP/WebSocket requests. The security goal is to remove keys from popup-to-background messages (visible in DevTools), not from internal background-to-offscreen messages (same trusted origin).

- **Reading chrome.storage.local directly instead of using the Zustand store:** The store is the canonical source of truth. Direct storage reads bypass Zustand's persist middleware structure (the data is stored under a specific key with specific JSON structure). Using `useStore.getState()` is correct.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Store hydration check | Custom storage polling loop | Queue guard with `storeReadyPromise` | `storeReadyPromise` already exists and works; polling adds complexity and race conditions |
| API key access | Direct `chrome.storage.local.get` with JSON parsing | `useStore.getState().apiKeys` | Store is already hydrated, synced, and typed. Direct reads are redundant |
| Message filtering | Custom background/offscreen routing logic | Existing `_fromBackground` marker + `offscreenOnlyTypes` filter | Already implemented and working (background.ts lines 444-455) |

**Key insight:** Phase 9 is entirely a refactoring phase. No new services, no new state, no new dependencies. Every building block already exists in the codebase. The work is removing `apiKey` from one message type and adding a queue guard around the existing listener.

## Common Pitfalls

### Pitfall 1: Breaking the Background-to-Offscreen API Key Flow

**What goes wrong:** Removing `apiKey` from ALL messages, including the internal background-to-offscreen `START_TRANSCRIPTION` forward. The offscreen document then has no key to authenticate with ElevenLabs.

**Why it happens:** Overzealous security fix -- treating all messages uniformly instead of distinguishing external (popup -> background) from internal (background -> offscreen).

**How to avoid:** Only remove `apiKey` from the `StartTranscriptionMessage` TYPE DEFINITION (what popup sends). Keep it in the internal forwarding at background.ts line 710-712 (where background adds `_fromBackground: true`). The offscreen's handler at line 507 still expects `message.apiKey`.

**Warning signs:** Transcription fails after the fix with "No API key" error in offscreen console.

### Pitfall 2: Queue Guard Blocks webext-zustand Sync Messages

**What goes wrong:** The queue guard queues `chromex.dispatch` and `chromex.fetch_state` messages (webext-zustand internal sync), preventing the store from ever syncing, which prevents `storeReadyPromise` from resolving. Deadlock.

**Why it happens:** The queue guard intercepts ALL messages before checking type. webext-zustand messages must pass through to their own listener immediately.

**How to avoid:** Always return `false` for webext-zustand messages BEFORE the queue guard check. The current code already does this at line 438-439. The queue guard must preserve this early return.

**Warning signs:** Service worker hangs on startup. `storeReadyPromise` never resolves. All messages stay queued forever.

### Pitfall 3: Queue Guard Keeps sendResponse Channels Open Too Long

**What goes wrong:** Queued messages keep their `sendResponse` channels open via `return true`. If the store takes a long time to hydrate (slow disk, large state), Chrome may close the channel before the queued message is processed. The `sendResponse` call then throws "The message port closed before a response was received."

**Why it happens:** Chrome has a timeout for message channels (no documented limit, but observed at ~5 minutes in practice). Store hydration normally takes <100ms, so this is unlikely but possible on slow devices.

**How to avoid:** Add a timeout to `storeReadyPromise` (e.g., 5 seconds). If the store fails to hydrate, drain the queue with error responses rather than hanging forever.

**Warning signs:** Console shows "The message port closed before a response was received" errors during startup.

### Pitfall 4: LLM API Keys Already Read from Store -- Accidental Regression

**What goes wrong:** During refactoring, someone changes `handleLLMRequest` to also receive API keys via message instead of reading from store, undoing the correct pattern that already exists.

**Why it happens:** Copy-paste from the old transcription pattern (which passes keys in messages) into the LLM handler.

**How to avoid:** After Phase 9, add a code review check: search the codebase for `apiKey` in any message type interface. The only place `apiKey` should appear in message types is `StartTranscriptionMessage` used for the internal background-to-offscreen forward (which has `_fromBackground: true`).

**Warning signs:** New `apiKey` fields appearing in message type definitions during code review.

### Pitfall 5: Offscreen Store Access as Alternative to Message-Based Key Passing

**What goes wrong:** Someone proposes having the offscreen document read the API key directly from the Zustand store instead of receiving it via message. This seems cleaner but has issues.

**Why it happens:** webext-zustand syncs the store across contexts, so theoretically the offscreen could call `useStore.getState().apiKeys.elevenLabs`.

**How to avoid:** The offscreen document does NOT import or initialize the Zustand store. Adding store initialization to the offscreen would require importing `wrapStore`, adding bundle size, and creating another sync point. The current architecture keeps offscreen minimal (only audio/WebSocket). Pass the key via internal message.

**Warning signs:** Adding `import { useStore } from '../../src/store'` to `offscreen/main.ts`.

## Code Examples

Verified patterns from the current codebase:

### Reading API Keys from Store (Existing Pattern)

```typescript
// Source: entrypoints/background.ts:228-253 (current, working)
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

  // Resolve provider for fast model
  const fastResolution = resolveProviderForModel(models.fastModel, {
    openAI: apiKeys.openAI,
    openRouter: apiKeys.openRouter,
  });
  // ... uses apiKeys directly, never from message
}
```

### Internal Message with _fromBackground Marker (Existing Pattern)

```typescript
// Source: entrypoints/background.ts:709-714 (current, to be modified)
// Background reads key from message (CURRENT - insecure for popup origin)
case 'START_TRANSCRIPTION': {
  await chrome.runtime.sendMessage({
    type: 'START_TRANSCRIPTION',
    apiKey: message.apiKey,        // Currently from incoming message
    languageCode: message.languageCode,
    _fromBackground: true,
  });
}

// AFTER Phase 9:
case 'START_TRANSCRIPTION': {
  const state = useStore.getState();
  const elevenLabsKey = state.apiKeys.elevenLabs;
  if (!elevenLabsKey) {
    return { success: false, error: 'ElevenLabs API key not configured' };
  }
  await chrome.runtime.sendMessage({
    type: 'START_TRANSCRIPTION',
    apiKey: elevenLabsKey,           // Now from store, not message
    languageCode: message.languageCode,
    _fromBackground: true,
  });
}
```

### webext-zustand Filter (Existing Pattern -- Must Preserve)

```typescript
// Source: entrypoints/background.ts:437-440 (MUST keep before queue guard)
if (message?.type === 'chromex.dispatch' || message?.type === 'chromex.fetch_state') {
  return false; // Don't send response, let other listeners handle it
}
```

### Popup Sending START_TRANSCRIPTION (Current vs. After)

```typescript
// Source: entrypoints/popup/App.tsx:292-296

// CURRENT (insecure -- apiKey in message):
const response = await chrome.runtime.sendMessage({
  type: 'START_TRANSCRIPTION',
  apiKey: apiKeys.elevenLabs,
  languageCode: transcriptionLanguage || undefined,
} as ExtensionMessage);

// AFTER Phase 9 (secure -- no apiKey):
const response = await chrome.runtime.sendMessage({
  type: 'START_TRANSCRIPTION',
  languageCode: transcriptionLanguage || undefined,
} as ExtensionMessage);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pass API keys via runtime messages | Background reads keys from store | Always was best practice; Phase 9 implements it | API keys no longer visible in DevTools message inspector |
| Await store before listener registration | Synchronous registration + queue guard | Chrome MV3 (2022) | Prevents lost messages on service worker wake |
| `useStore.getState()` without hydration check | Queue guard ensures hydration before any `getState()` call | Phase 9 | Eliminates race condition returning default/stale values |

**Deprecated/outdated:**
- Passing sensitive data in `chrome.runtime.sendMessage` payloads: Never recommended by Chrome security docs but was common in MV2 extensions. MV3's ephemeral service workers make this more dangerous (more frequent restarts = more message traffic = more exposure).

## Exact Files That Need Changes

### SEC-01: Remove API Keys from Messages

| File | Change | Risk |
|------|--------|------|
| `src/types/messages.ts:172-176` | Remove `apiKey` field from `StartTranscriptionMessage` interface. Keep `languageCode`. | LOW -- type-only change, compiler catches all callers |
| `entrypoints/popup/App.tsx:292-296` | Remove `apiKey: apiKeys.elevenLabs` from the `START_TRANSCRIPTION` message sent by popup | LOW -- removing a field |
| `entrypoints/popup/App.tsx:283-287` | Remove the `apiKeys.elevenLabs` check before sending message (background will check) | LOW -- moving validation to background |
| `entrypoints/background.ts:699-725` | In `START_TRANSCRIPTION` handler: read `apiKeys.elevenLabs` from `useStore.getState()` instead of `message.apiKey`. Forward to offscreen with `_fromBackground: true` | MEDIUM -- logic change in message handler |
| `entrypoints/offscreen/main.ts:500-522` | No change needed -- offscreen already reads `message.apiKey` from the internal message. The key now comes from background's store read instead of popup's message | NONE |

**Files that do NOT need changes:**
- `src/services/llm/*` -- LLM providers already receive API keys from `handleLLMRequest` which reads from store. No LLM API key is ever in a message.
- `src/services/transcription/ElevenLabsConnection.ts` -- Receives API key via constructor from offscreen. Source of key changes (store vs message) but the class is unchanged.
- `entrypoints/content.tsx` -- Content script never handles or sends API keys.

### REL-01: Queue Guard for Store Hydration

| File | Change | Risk |
|------|--------|------|
| `entrypoints/background.ts:123-127` | Replace `.then()` with queue drain logic | MEDIUM -- changes init flow |
| `entrypoints/background.ts:436-465` | Wrap existing listener with queue guard (add `storeReady` flag + queue check before `handleMessage`) | MEDIUM -- modifies message routing |

**Key constraint:** The existing webext-zustand filter (lines 438-439) and `_fromBackground` filter (lines 444-446) and `offscreenOnlyTypes` filter (lines 452-455) MUST remain BEFORE the queue guard. These filters handle messages that should never be queued.

### Combined Change Impact

Both changes modify `entrypoints/background.ts`. They should be implemented together in a single plan to avoid merge conflicts.

**Total files changed:** 3 files (`messages.ts`, `App.tsx`, `background.ts`)
**Total files unchanged but verified:** 2 files (`offscreen/main.ts`, `src/store/index.ts`)
**New files:** 0
**New dependencies:** 0

## Open Questions

1. **Should the popup still check for the ElevenLabs API key before sending START_TRANSCRIPTION?**
   - What we know: Currently the popup checks `if (!apiKeys.elevenLabs)` before sending the message (App.tsx:284). After Phase 9, the background validates. Both could check.
   - What's unclear: Whether to keep the popup-side check for UX (immediate feedback) or remove it (single source of truth in background).
   - Recommendation: Keep the popup-side check for UX feedback (show "ElevenLabs API key required" immediately without roundtrip). The background validation is the security boundary; the popup check is the UX boundary. Both are valid.

2. **Should we add a type for "internal" StartTranscriptionMessage (with apiKey + _fromBackground)?**
   - What we know: The current `StartTranscriptionMessage` type includes `apiKey`. After removing it for external messages, the internal background-to-offscreen message still needs an `apiKey` field.
   - What's unclear: Whether to create a separate `InternalStartTranscriptionMessage` type or use a type intersection.
   - Recommendation: Create an `InternalStartTranscriptionMessage` type (or use `StartTranscriptionMessage & { apiKey: string; _fromBackground: true }`) to maintain type safety. The current codebase already uses `as ... & { _fromBackground: true }` casts (e.g., background.ts:572).

3. **Queue guard timeout handling.**
   - What we know: Store hydration normally takes <100ms. Could be slower on first install or slow devices.
   - What's unclear: Whether to add a timeout with fallback.
   - Recommendation: Add a 10-second timeout. If store does not hydrate within 10 seconds, drain queue with error responses. Log the timeout for debugging. This is a safety net, not expected to trigger in practice.

## Sources

### Primary (HIGH confidence)

- **Codebase analysis** -- `entrypoints/background.ts`, `src/store/index.ts`, `src/types/messages.ts`, `entrypoints/popup/App.tsx`, `entrypoints/offscreen/main.ts` -- direct reading of current implementation
- **.planning/research/ARCHITECTURE.md** -- Section 6 "Store Initialization Ordering" -- queue guard pattern documented with rationale
- **.planning/research/PITFALLS.md** -- Pitfall 4 "Store Race Condition Fix Breaks Message Handling" -- confirms synchronous registration requirement
- **.planning/research/STACK.md** -- confirms no new dependencies needed for Phase 9
- [Chrome Extension Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) -- event listener registration requirements
- [MV3 Extension Service Worker Async Init Discussion](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/bnH_zx2LjQY) -- message queuing workaround

### Secondary (MEDIUM confidence)

- **.planning/todos/pending/20260208-security-api-keys-messages.md** -- existing security analysis and proposed solution (partially correct; does not distinguish internal/external messages)
- **.planning/todos/pending/20260208-fix-store-race-condition.md** -- existing race condition analysis (partially correct; proposes delayed registration which would break MV3)
- [Microsoft MV3 Migration Learnings](https://devblogs.microsoft.com/engineering-at-microsoft/learnings-from-migrating-accessibility-insights-for-web-to-chromes-manifest-v3/) -- validates queue guard approach

### Tertiary (LOW confidence)

- None -- all findings verified against codebase or official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing APIs
- Architecture: HIGH -- queue guard pattern well-documented, API key access pattern already proven in codebase for LLM
- Pitfalls: HIGH -- verified against existing codebase analysis and Chrome MV3 documentation

**Research date:** 2026-02-08
**Valid until:** 2026-03-10 (30 days -- stable, no fast-moving dependencies)
