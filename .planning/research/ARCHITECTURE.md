# Architecture Patterns: v1.1 Security & Reliability Integration

**Domain:** Chrome MV3 Extension -- Security Hardening, Compliance, Bug Fixes
**Researched:** 2026-02-08
**Confidence:** HIGH (based on codebase analysis + Chrome MV3 documentation)

---

## Current Architecture Summary

The extension has four execution contexts, each with distinct capabilities:

```
+---------------------------+     +-----------------------------+
| Background Service Worker |     | Offscreen Document          |
| (entrypoints/background)  |     | (entrypoints/offscreen)     |
|                           |     |                             |
| - Message hub             |<--->| - AudioContext + Worklet    |
| - LLM API calls (fetch)   |     | - WebSocket to ElevenLabs   |
| - Tab capture stream IDs  |     | - Mic capture               |
| - Zustand store (primary) |     | - PCM processing            |
| - chrome.storage adapter  |     | - Only chrome.runtime API   |
| - Keep-alive management   |     | - Full DOM access           |
+---------------------------+     +-----------------------------+
       ^        ^                        ^
       |        |                        |
       v        v                        |
+-------------+ +------------------+     |
| Popup       | | Content Script   |     |
| (React)     | | (React/Shadow)   |     |
|             | |                  |     |
| - Settings  | | - Overlay UI     |     |
| - Controls  | | - Transcript     |     |
| - Zustand   | | - LLM responses  |     |
| - Templates | | - Capture mode   |     |
+-------------+ | - Zustand sync   |     |
                +------------------+     |
                                         |
              All connected via chrome.runtime.sendMessage
```

**Key architectural facts from codebase analysis:**

1. **Store:** Single Zustand store (`useStore`) with `persist` middleware writing to `chrome.storage.local` via `chromeStorage` adapter. `webext-zustand` (`wrapStore`) syncs across all contexts.

2. **Transcript state:** Currently module-level variables in `background.ts` (lines 21-23): `mergedTranscript: TranscriptEntry[]` and `interimEntries: Map`. Lost on service worker termination.

3. **API keys:** Currently in plaintext within the Zustand store, persisted to `chrome.storage.local` as part of the `apiKeys` object. Also passed via runtime messages (e.g., `START_TRANSCRIPTION` message contains `apiKey` field -- see `messages.ts:173`).

4. **LLM retry:** Existing manual retry logic in `streamWithRetry()` (background.ts lines 169-213) with `MAX_LLM_RETRIES=3` and exponential backoff. No circuit breaker pattern.

5. **Store init:** `storeReadyPromise` awaited via `.then()` at line 125, but message listeners registered synchronously at line 436. Messages can arrive before store hydration completes.

---

## Integration Analysis: Six New Features

### 1. Encryption Service

**Question:** Where does it initialize? Background only? Shared?

**Answer: Background service worker only.** Initialize encryption in the background context.

**Rationale:**
- `crypto.subtle` (WebCrypto API) is available in service workers -- confirmed via [Chromium Extensions discussion](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/VCXF9rZXr5Y) and [MDN SubtleCrypto docs](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto). Access via `crypto.subtle` (not `window.crypto.subtle` since there is no `window` in service workers).
- The background is where API keys are consumed (LLM calls in `handleLLMRequest`, transcription start forwarded to offscreen). No other context needs to decrypt keys.
- Salt storage in IndexedDB is accessible from the background service worker -- confirmed via [Microsoft's MV3 migration learnings](https://devblogs.microsoft.com/engineering-at-microsoft/learnings-from-migrating-accessibility-insights-for-web-to-chromes-manifest-v3/).

**Integration point -- modify `chromeStorage.ts`:**

The current `chromeStorage` adapter wraps `chrome.storage.local.get/set/remove`. The encryption layer wraps this adapter, encrypting only the `apiKeys` portion of the persisted state before writing and decrypting after reading.

```
Current flow:
  Zustand persist → chromeStorage.setItem(JSON string) → chrome.storage.local

New flow:
  Zustand persist → encryptedChromeStorage.setItem(JSON string)
                   → parse → encrypt apiKeys fields → stringify
                   → chrome.storage.local
```

**New files:**
- `src/services/crypto/encryption.ts` -- EncryptionService class (singleton)

**Modified files:**
- `src/store/chromeStorage.ts` -- wrap get/set to handle encryption
- `entrypoints/background.ts` -- initialize encryption before store init

**Initialization order (critical):**
```
1. EncryptionService.initialize()  -- derive key, load/create salt from IndexedDB
2. Store rehydration               -- now chromeStorage can decrypt
3. wrapStore() for cross-context sync
4. Register message listeners
```

**Confidence:** HIGH -- WebCrypto and IndexedDB both confirmed available in MV3 service workers.

---

### 2. IndexedDB for Persistent Transcripts

**Question:** Which context can access it? Background + offscreen?

**Answer: Background service worker for writes. Popup and offscreen share the same origin so technically can read, but route everything through background for consistency.**

**Key facts:**
- IndexedDB is accessible in service workers -- confirmed via [Chrome storage docs](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies): "The IndexedDB and Cache Storage APIs are accessible in service workers."
- Extension storage (including IndexedDB) is shared across the extension's origin: service worker, popup, offscreen -- confirmed via same source.
- Content scripts CANNOT access extension IndexedDB -- they run in the web page's origin (meet.google.com), so their IndexedDB is the page's, not the extension's. Confirmed via [Chrome content script docs](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies): "In content scripts, calling web storage APIs accesses data from the host page."

**Architecture decision: Write from background, read from background or popup directly.**

```
Offscreen (transcript segments arrive)
  → chrome.runtime.sendMessage(TRANSCRIPT_FINAL)
  → Background receives
  → Background writes to in-memory mergedTranscript[] (existing)
  → Background ALSO writes to IndexedDB via TranscriptDB service (NEW)

Popup (session history view -- future)
  → Can query IndexedDB directly (same origin)
  → OR message background for query results

Content script (overlay needs transcript)
  → Receives via broadcast from background (existing TRANSCRIPT_UPDATE)
  → NO direct IndexedDB access (different origin)
```

**For v1.1 scope (transcript buffer persistence, not full session history):**

The immediate need (todo `20260208-fix-transcript-persistence`) is preventing data loss when the service worker terminates. The approach:

1. Create `TranscriptBuffer` class that mirrors in-memory state to `chrome.storage.local` with debounced writes (1s interval).
2. On service worker restart, reload from `chrome.storage.local`.
3. This is a stopgap. Full IndexedDB session history (todo `20260208-persistent-transcripts`) is v2.1 scope.

**Why `chrome.storage.local` for v1.1 instead of IndexedDB:**
- Simpler API, already used throughout the codebase
- No schema management needed
- Adequate for single active session (~1MB for 30-min interview)
- IndexedDB reserved for v2.1 when session history, search, and export are needed

**New files:**
- `src/services/transcription/transcriptBuffer.ts` -- TranscriptBuffer class

**Modified files:**
- `entrypoints/background.ts` -- use TranscriptBuffer instead of raw array

**Confidence:** HIGH -- chrome.storage.local is proven in this codebase. IndexedDB access patterns verified via Chrome docs.

---

### 3. Circuit Breaker

**Question:** Per-service instances, where do they live?

**Answer: Background service worker only. One CircuitBreaker instance per external service.**

**Rationale:**
- All API calls originate from the background service worker:
  - LLM calls: `handleLLMRequest()` in background.ts calls `provider.streamResponse()`
  - Transcription: Background forwards `START_TRANSCRIPTION` to offscreen, but the API key is passed through. The actual ElevenLabs WebSocket lives in offscreen.
- The offscreen's ElevenLabs connection already has its own reconnection logic (`ElevenLabsConnection` class with `MAX_RECONNECT_ATTEMPTS=3` and exponential backoff).

**Circuit breaker placement:**

```
Background service worker:
  circuitBreakers = {
    llm:        new CircuitBreaker({ failureThreshold: 5, timeout: 60_000 }),
    sttToken:   new CircuitBreaker({ failureThreshold: 3, timeout: 30_000 }),
  }
```

**Note on service worker termination and circuit breaker state:**

Circuit breaker state (failure counts, current state) is in-memory. When the service worker terminates, this state is lost. This is actually acceptable:
- If the service worker dies and restarts, the circuit resets to CLOSED (healthy default).
- The worst case is re-attempting a few failures before re-opening the circuit.
- Persisting circuit state to storage would add complexity with minimal benefit.

**LLM circuit breaker -- wraps existing retry logic:**

Currently `streamWithRetry()` does linear retry. The circuit breaker wraps this:

```
LLM_REQUEST arrives
  → circuitBreakers.llm.execute(async () => {
      → streamWithRetry(params)   // existing retry logic inside
    })
  → If circuit OPEN, fail fast with user-friendly message
```

**STT token circuit breaker -- wraps token endpoint:**

The offscreen document's `ElevenLabsConnection.obtainToken()` calls `POST /v1/single-use-token/realtime_scribe`. This is the point to protect:
- Option A: Circuit breaker in background, wrapping the `START_TRANSCRIPTION` forwarding.
- Option B: Circuit breaker in the `ElevenLabsConnection` class itself (offscreen context).

**Recommendation: Option B** -- the `ElevenLabsConnection` already manages its own reconnection. Adding a circuit breaker at the token acquisition level in the same class keeps failure handling co-located. The offscreen document is long-lived, so circuit breaker state persists for the session.

**New files:**
- `src/services/api/circuitBreaker.ts` -- generic CircuitBreaker class

**Modified files:**
- `entrypoints/background.ts` -- wrap LLM calls with circuit breaker
- `src/services/transcription/ElevenLabsConnection.ts` -- circuit breaker for token requests

**Confidence:** HIGH -- pattern is straightforward, no MV3 constraints.

---

### 4. Consent / Privacy UI

**Question:** Popup components or overlay?

**Answer: Popup only. Not the overlay.**

**Rationale:**
- The consent flow gates access to recording functionality. The popup is where "Start Capture" and "Start Transcription" buttons live (see `App.tsx` lines 161-233 and 282-309).
- The overlay (content script) is injected on meet.google.com and shows transcript/LLM results. It does not initiate recording -- it consumes data.
- First-time legal warning must be blocking (cannot use extension without acknowledgment). This is naturally a popup modal.
- Per-session consent check happens when user clicks "Start" in popup, before sending `START_CAPTURE` message.

**Component placement:**

```
entrypoints/popup/
  components/
    RecordingWarning.tsx    -- First-time legal warning modal (NEW)
    ConsentDialog.tsx       -- Per-session consent checklist (NEW)
  App.tsx                   -- Integration: show warning/consent before capture

src/store/
  types.ts                  -- Add consent state fields
  settingsSlice.ts          -- Add consent tracking actions
```

**Consent state storage:**

Store consent acknowledgment in `chrome.storage.local` directly (not in the Zustand store) because:
1. It is a one-time flag, not a reactive setting that UI components watch.
2. Zustand persist serializes/deserializes the whole store; consent state is simpler as standalone keys.
3. The popup reads it on mount with `chrome.storage.local.get('recording_warning_acknowledged')`.

```
chrome.storage.local keys:
  recording_warning_acknowledged: boolean  -- one-time legal warning accepted
  recording_warning_date: number           -- when accepted
  skip_consent_dialog: boolean             -- per-session dialog suppressed
  skip_consent_date: number                -- when suppressed
  last_recording_consent: number           -- timestamp of last consent
```

**Privacy Policy page:**

Add `entrypoints/privacy.html` as a standalone extension page (already have `entrypoints/permissions.html` as precedent). Link from popup privacy notice and settings.

**New files:**
- `entrypoints/popup/components/RecordingWarning.tsx`
- `entrypoints/popup/components/ConsentDialog.tsx`
- `PRIVACY.md` (repository root)

**Modified files:**
- `entrypoints/popup/App.tsx` -- integrate consent flow before capture start

**Confidence:** HIGH -- standard React component work, no MV3 constraints.

---

### 5. Transcript Buffer Persistence

**Question:** How to handle service worker lifecycle for transcript state?

**Answer: Debounced writes to `chrome.storage.local` + recovery on restart.**

**Current problem (background.ts lines 21-23):**
```typescript
let mergedTranscript: TranscriptEntry[] = [];
let interimEntries: Map<string, {...}> = new Map();
```
These are module-level variables. When Chrome terminates the service worker (30s idle timeout, low memory, etc.), ALL transcript data is lost.

**Existing mitigation:** The `startKeepAlive()` function (line 40-45) pings every 20s during LLM streaming. But this only runs during active LLM requests, not during the entire recording session.

**Solution: TranscriptBuffer service with debounced persistence.**

```
TranscriptBuffer
  |
  |-- addEntry(entry)
  |     |-- push to in-memory array
  |     |-- schedule debounced save (1s)
  |
  |-- save()
  |     |-- chrome.storage.local.set({ transcript_<sessionId>: entries })
  |
  |-- load(sessionId)
  |     |-- chrome.storage.local.get(transcript_<sessionId>)
  |     |-- populate in-memory array
  |
  |-- clear()
        |-- reset in-memory array
        |-- chrome.storage.local.remove(transcript_<sessionId>)
```

**Keep-alive strategy for active recording:**

Extend the existing `startKeepAlive()` to also run during active transcription (not just LLM streaming). Currently:
- `startKeepAlive()` called in `handleLLMRequest()` (line 279)
- `stopKeepAlive()` called when both LLM models complete (line 290)

Modification: Also call `startKeepAlive()` when transcription starts (`START_TRANSCRIPTION` handler) and `stopKeepAlive()` when transcription stops. This keeps the service worker alive during the entire interview session, which is the expected behavior.

**Recovery flow when service worker restarts mid-session:**

```
1. Service worker starts
2. Check chrome.storage.local for 'active_session_id'
3. If found:
   a. Load TranscriptBuffer from storage
   b. Resume keep-alive
   c. Broadcast recovered transcript to content scripts
4. If not found: clean start
```

**Storage quota considerations:**
- `chrome.storage.local.QUOTA_BYTES` = 5,242,880 bytes (~5MB)
- Average transcript entry: ~200 bytes (id, speaker, text, timestamp, isFinal)
- 30-minute interview: ~200 entries = ~40KB
- 2-hour interview: ~800 entries = ~160KB
- Well within quota for single active session

**New files:**
- `src/services/transcription/transcriptBuffer.ts`

**Modified files:**
- `entrypoints/background.ts` -- replace raw array with TranscriptBuffer, extend keep-alive

**Confidence:** HIGH -- `chrome.storage.local` is proven in this codebase. Pattern is straightforward.

---

### 6. Store Initialization Ordering (Race Condition Fix)

**Question:** How to fix the race condition where messages arrive before store is ready?

**Current problem:**

```typescript
// Line 124-127: Store init is async, non-blocking
storeReadyPromise.then(() => {
  console.log('Store ready in service worker');
});

// Line 436: Message listener registered SYNCHRONOUSLY (same tick)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Can receive messages BEFORE storeReadyPromise resolves
  // handleMessage() calls useStore.getState() which may have stale/default state
});
```

**Why we CANNOT simply await store before registering listeners:**

Chrome MV3 requires event listeners to be registered synchronously in the first turn of the event loop. If the service worker is woken by an event (e.g., a message), and the listener is not registered in that first turn, the event is lost. This is [documented by Chrome](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle): "Always register listeners at the top level."

**Solution: Register listener immediately, queue or guard store access.**

```typescript
// Option A: Queue + Drain (Recommended)
const messageQueue: QueuedMessage[] = [];
let storeReady = false;

// Register SYNCHRONOUSLY at top level (required by MV3)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!storeReady) {
    // Queue the message for processing after store init
    messageQueue.push({ message, sender, sendResponse });
    return true; // keep channel open
  }
  handleMessage(message, sender).then(sendResponse);
  return true;
});

// Initialize store and drain queue
storeReadyPromise.then(() => {
  storeReady = true;
  // Process any messages that arrived during init
  for (const { message, sender, sendResponse } of messageQueue) {
    handleMessage(message, sender).then(sendResponse);
  }
  messageQueue.length = 0;
});
```

**Why not Option B (lazy store access per message)?**

```typescript
// Option B: Check in every handler -- works but repetitive
async function handleMessage(message, sender) {
  if (!useStore.persist.hasHydrated?.()) {
    await storeReadyPromise;
  }
  // proceed...
}
```
This adds latency to every message (the check), and the `hasHydrated` method is internal to Zustand persist middleware and may not be exposed by webext-zustand's `wrapStore`. Option A is simpler and deterministic.

**Integration with encryption init (ordering):**

The encryption service must initialize BEFORE store rehydration, because the chromeStorage adapter needs to decrypt API keys during rehydration.

```
1. Register message listener (sync, top-level, with queue guard)
2. EncryptionService.initialize()        -- async, derives key
3. await storeReadyPromise               -- store rehydrates, decrypts via chromeStorage
4. storeReady = true; drain queue
```

**Modified files:**
- `entrypoints/background.ts` -- restructure initialization
- `src/store/index.ts` -- verify `storeReadyPromise` export behavior

**Confidence:** HIGH -- the queuing pattern is a well-documented solution for MV3 service worker async init. See [Chromium Extensions discussion](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/bnH_zx2LjQY).

---

## Recommended Architecture: After v1.1

```
+---------------------------------------------------------------+
| Background Service Worker                                     |
|                                                               |
|  INITIALIZATION (ordered):                                    |
|  1. Register message listener with queue guard                |
|  2. EncryptionService.initialize()                            |
|  3. await storeReadyPromise (decrypt + rehydrate)             |
|  4. TranscriptBuffer.load() (recover active session)          |
|  5. storeReady = true; drain message queue                    |
|                                                               |
|  SERVICES:                                                    |
|  - EncryptionService (singleton)     -- WebCrypto AES-GCM     |
|  - TranscriptBuffer (per-session)    -- debounced persistence |
|  - CircuitBreaker (per-LLM-provider) -- fail-fast on outage   |
|  - LLM request handler              -- uses circuit breaker   |
|  - Keep-alive manager                -- active during sessions |
|                                                               |
|  STORE:                                                       |
|  - Zustand + persist + webext-zustand                         |
|  - chromeStorage adapter (now with encryption layer)          |
|  - API keys encrypted at rest                                 |
|  - API keys NEVER in runtime messages                         |
+---------------------------------------------------------------+
         ^                    ^
         |                    |
         v                    v
+------------------+  +-----------------------------+
| Popup (React)    |  | Offscreen Document          |
|                  |  |                             |
| NEW COMPONENTS:  |  | MODIFIED:                   |
| - RecordingWarn  |  | - ElevenLabsConnection      |
| - ConsentDialog  |  |   + circuit breaker for     |
| - PrivacyNotice  |  |     token acquisition       |
|                  |  |                             |
| MODIFIED:        |  | UNCHANGED:                  |
| - App.tsx        |  | - AudioContext/Worklet      |
|   (consent flow  |  | - Mic capture               |
|    before start) |  | - Audio processing          |
|                  |  +-----------------------------+
| - No apiKey in   |
|   messages       |
+------------------+
         ^
         |
         v
+------------------+
| Content Script   |
| (Shadow DOM)     |
|                  |
| UNCHANGED:       |
| - Overlay UI     |
| - Transcript     |
|   display        |
| - LLM responses  |
| - No IndexedDB   |
|   access         |
+------------------+
```

---

## Component Boundaries

| Component | Responsibility | Communicates With | v1.1 Changes |
|-----------|---------------|-------------------|-------------|
| Background SW | Message hub, API orchestration, state management | All contexts via `chrome.runtime` | + Encryption init, + TranscriptBuffer, + CircuitBreaker, + message queue guard, - apiKey from messages |
| Offscreen | Audio capture, WebSocket STT, PCM processing | Background only | + CircuitBreaker for ElevenLabs token, no apiKey from messages (reads from store or receives from background) |
| Popup | Settings UI, capture controls, consent | Background via messages, Zustand sync | + RecordingWarning, + ConsentDialog, + PrivacyNotice, - apiKey in START_TRANSCRIPTION message |
| Content Script | Overlay rendering, transcript display, hotkey capture | Background via messages, Zustand sync | No changes in v1.1 |

---

## Data Flow Changes

### Before v1.1 (Current)

```
[API Key Flow - INSECURE]
User enters key → Zustand store → chrome.storage.local (PLAINTEXT)
User clicks Start → Popup sends START_TRANSCRIPTION { apiKey: "sk-..." }
                   → Background forwards to Offscreen
                   → Offscreen uses key for ElevenLabs

[Transcript Flow - FRAGILE]
Offscreen → TRANSCRIPT_FINAL → Background → mergedTranscript[] (IN MEMORY ONLY)
                                           → broadcast to content scripts
Service worker dies → mergedTranscript = [] (DATA LOST)
```

### After v1.1

```
[API Key Flow - SECURE]
User enters key → Zustand store → EncryptedChromeStorage → chrome.storage.local (ENCRYPTED)
User clicks Start → ConsentDialog (if first time) → Popup sends START_TRANSCRIPTION (NO apiKey)
                   → Background reads key from encrypted store
                   → Background forwards key to Offscreen (internal message)

[Transcript Flow - RESILIENT]
Offscreen → TRANSCRIPT_FINAL → Background → TranscriptBuffer
                                           |→ in-memory array (fast access)
                                           |→ debounced chrome.storage.local (persistence)
                                           → broadcast to content scripts
Service worker dies → service worker restarts → TranscriptBuffer.load() → data RECOVERED

[LLM Flow - RESILIENT]
Content → LLM_REQUEST → Background → CircuitBreaker.execute(
                                       → streamWithRetry(provider.streamResponse())
                                     )
                                   → If circuit OPEN: fail fast, notify UI
```

---

## Patterns to Follow

### Pattern 1: Layered Storage Adapter

**What:** Wrap the existing `chromeStorage` adapter with an encryption layer rather than modifying it directly.

**Why:** Separation of concerns. The storage adapter does get/set/remove. The encryption layer transforms data. Composable and testable independently.

```typescript
// src/services/crypto/encryptedStorage.ts
import { chromeStorage } from '@/store/chromeStorage';
import { encryptionService } from './encryption';

export const encryptedChromeStorage: StateStorage = {
  getItem: async (name: string) => {
    const raw = await chromeStorage.getItem(name);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.state?.apiKeys) {
        // Decrypt API keys
        parsed.state.apiKeys = await decryptApiKeys(parsed.state.apiKeys);
      }
      return JSON.stringify(parsed);
    } catch {
      return raw; // fallback for non-JSON or migration
    }
  },
  setItem: async (name: string, value: string) => {
    // Encrypt API keys before storing
    const parsed = JSON.parse(value);
    if (parsed.state?.apiKeys) {
      parsed.state.apiKeys = await encryptApiKeys(parsed.state.apiKeys);
    }
    await chromeStorage.setItem(name, JSON.stringify(parsed));
  },
  removeItem: chromeStorage.removeItem,
};
```

### Pattern 2: Service Worker Init Queue

**What:** Register event listeners synchronously, queue processing until async init completes.

**Why:** MV3 mandates synchronous listener registration. Store/encryption init is async. Queue bridges the gap.

```typescript
interface QueuedMessage {
  message: ExtensionMessage;
  sender: chrome.runtime.MessageSender;
  sendResponse: (response: unknown) => void;
}

const messageQueue: QueuedMessage[] = [];
let initialized = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Always let webext-zustand handle its own messages
  if (message?.type === 'chromex.dispatch' || message?.type === 'chromex.fetch_state') {
    return false;
  }
  if (!initialized) {
    messageQueue.push({ message, sender, sendResponse });
    return true;
  }
  handleMessage(message, sender).then(sendResponse).catch(/*...*/);
  return true;
});
```

### Pattern 3: Circuit Breaker as Wrapper

**What:** Wrap existing API call functions with circuit breaker, do not replace them.

**Why:** Existing retry logic in `streamWithRetry()` works well. Circuit breaker adds a higher-level protection (stop trying entirely after too many failures) without changing the inner retry mechanism.

```typescript
// In handleLLMRequest:
try {
  await llmCircuitBreaker.execute(async () => {
    await streamWithRetry(params, modelType, responseId);
  });
} catch (error) {
  if (error instanceof CircuitOpenError) {
    // Service is known-down, fail fast with user message
    await sendLLMMessageToMeet({ type: 'LLM_STATUS', /*...*/ status: 'error',
      error: 'Service temporarily unavailable. Will retry automatically in 60 seconds.' });
  }
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Encryption in Every Context

**What:** Initializing EncryptionService in popup, content script, AND background.

**Why bad:** Multiple encryption instances with potentially different keys (if browser fingerprint varies between contexts). Increases attack surface. Salt stored in IndexedDB could have race conditions.

**Instead:** Initialize once in background. Other contexts get decrypted values via Zustand store sync (webext-zustand). Popup writes encrypted API keys by sending them to the background for storage, or by using the Zustand store action which persists through the encrypted adapter.

### Anti-Pattern 2: IndexedDB in Content Script for Transcripts

**What:** Having the content script write directly to IndexedDB for transcript persistence.

**Why bad:** Content scripts run in the web page's origin (meet.google.com). Their IndexedDB is the PAGE's IndexedDB, not the extension's. Data would be scoped to meet.google.com and potentially visible to the host page.

**Instead:** All transcript persistence goes through background service worker messages. Content script receives data via broadcast, does not store it.

### Anti-Pattern 3: Awaiting Store Before Listener Registration

**What:** `await storeReadyPromise; chrome.runtime.onMessage.addListener(...)`.

**Why bad:** Chrome MV3 will not deliver the waking event to a listener registered after the first turn of the event loop. If a message wakes the service worker, the handler misses it.

**Instead:** Register synchronously, queue messages, drain after init.

### Anti-Pattern 4: Persisting Circuit Breaker State to Storage

**What:** Writing circuit breaker failure counts and state to `chrome.storage.local` to survive service worker termination.

**Why bad:** Adds write overhead on every API call. Circuit breaker state is ephemeral by nature. Resetting to CLOSED on restart is the correct default (assume service recovered).

**Instead:** Keep circuit breaker state in memory. Accept that it resets on restart.

---

## New vs Modified Files Summary

### New Files

| File | Purpose | Context |
|------|---------|---------|
| `src/services/crypto/encryption.ts` | EncryptionService -- WebCrypto AES-GCM wrapper | Background SW |
| `src/services/crypto/encryptedStorage.ts` | Encrypted StateStorage adapter | Background SW |
| `src/services/api/circuitBreaker.ts` | Generic CircuitBreaker class | Background SW + Offscreen |
| `src/services/transcription/transcriptBuffer.ts` | TranscriptBuffer -- debounced persistence | Background SW |
| `entrypoints/popup/components/RecordingWarning.tsx` | First-time legal warning modal | Popup |
| `entrypoints/popup/components/ConsentDialog.tsx` | Per-session consent checklist | Popup |
| `PRIVACY.md` | Privacy policy document | Repository root |

### Modified Files

| File | Changes | Risk |
|------|---------|------|
| `entrypoints/background.ts` | Init order (encryption -> store -> queue drain), TranscriptBuffer integration, circuit breaker wrapping, keep-alive extension, remove apiKey from message handling | HIGH -- central hub, many changes |
| `src/store/chromeStorage.ts` or `src/store/index.ts` | Switch to encryptedChromeStorage adapter | MEDIUM -- affects all store persistence |
| `src/types/messages.ts` | Remove `apiKey` field from `StartTranscriptionMessage` | LOW -- type-only change |
| `entrypoints/popup/App.tsx` | Add consent flow before capture, remove apiKey from messages | MEDIUM -- UI flow change |
| `src/services/transcription/ElevenLabsConnection.ts` | Add circuit breaker for token requests | LOW -- isolated change |

---

## Build Order (Dependency-Based)

```
Phase 1: Foundation (no feature deps, enables all others)
  1a. Store race condition fix (message queue guard)
  1b. Remove apiKey from messages (security, simple refactor)

Phase 2: Encryption (depends on 1a for init ordering)
  2a. EncryptionService
  2b. Encrypted storage adapter
  2c. Migration from plaintext

Phase 3: Persistence (depends on 1a for init ordering)
  3a. TranscriptBuffer service
  3b. Keep-alive during transcription
  3c. Recovery on restart

Phase 4: Resilience (independent, can parallelize with Phase 3)
  4a. CircuitBreaker class
  4b. Wrap LLM calls
  4c. Wrap ElevenLabs token requests

Phase 5: Compliance UI (independent of 2-4, but builds on 1b)
  5a. RecordingWarning component
  5b. ConsentDialog component
  5c. Privacy policy document
  5d. Integrate consent flow in App.tsx
```

**Why this order:**
- Phase 1 fixes the init race condition that all other features depend on (encryption init, transcript buffer loading, etc.).
- Phase 2 must come before Phase 3 because the encrypted storage adapter must be in place before any new storage writes.
- Phase 4 is independent of 2 and 3 (circuit breaker wraps API calls, does not touch storage).
- Phase 5 is independent UI work that can be done anytime after Phase 1b (since consent gates the capture flow that no longer sends apiKey).

---

## Scalability Considerations

| Concern | Current (v1.0) | After v1.1 | At v2.1 (IndexedDB) |
|---------|----------------|------------|---------------------|
| Transcript storage | In-memory only (~unlimited RAM) | chrome.storage.local (~5MB, ~50 sessions) | IndexedDB (~100MB+, hundreds of sessions) |
| API key security | Plaintext in chrome.storage | AES-GCM encrypted at rest | Same |
| Service worker death | Total data loss | Recovery from storage | Recovery from IndexedDB |
| API failure handling | Simple retry (3 attempts) | Circuit breaker + retry | Same |
| Legal compliance | None | Consent UI + Privacy Policy | Same |

---

## Sources

- [Chrome Extension Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) -- event listener registration requirements
- [Chrome Storage and Cookies](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies) -- IndexedDB availability, content script storage isolation
- [Chrome Offscreen Documents API](https://developer.chrome.com/docs/extensions/reference/api/offscreen) -- API restrictions in offscreen context
- [WebCrypto in MV3 Service Workers](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/VCXF9rZXr5Y) -- `crypto.subtle` availability confirmed
- [MDN SubtleCrypto](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto) -- AES-GCM patterns
- [MV3 Async Init Race Condition](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/bnH_zx2LjQY) -- message queuing workaround
- [Microsoft MV3 Migration Learnings](https://devblogs.microsoft.com/engineering-at-microsoft/learnings-from-migrating-accessibility-insights-for-web-to-chromes-manifest-v3/) -- IndexedDB in service workers for persistence
- [Circuit Breaker Pattern (Martin Fowler)](https://martinfowler.com/bliki/CircuitBreaker.html) -- CLOSED/OPEN/HALF_OPEN state machine
