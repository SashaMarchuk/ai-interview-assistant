# Phase 11: Transcript Resilience - Research

**Researched:** 2026-02-08
**Domain:** Chrome MV3 Service Worker Data Persistence / chrome.storage.local
**Confidence:** HIGH

## Summary

The core problem is straightforward: transcript data (`mergedTranscript` array and `interimEntries` map) lives exclusively in module-level variables in `entrypoints/background.ts` (lines 21-23). When Chrome terminates the service worker (30-second idle timeout, low memory, or forced kill), all in-memory transcript state is lost permanently. The offscreen document (which handles audio capture and WebSocket transcription) survives service worker termination independently, but the background script that accumulates the merged transcript does not.

The solution is debounced writes of the transcript buffer to `chrome.storage.local`, plus a keep-alive mechanism during active transcription (the existing keep-alive only covers LLM streaming, not transcription). Chrome's storage API has a 10MB quota (sufficient for hours of transcript data at ~1KB per segment), no write rate limits for `chrome.storage.local`, and the API is fully async-compatible with service workers.

**Primary recommendation:** Create a `TranscriptBuffer` class that wraps the in-memory array with debounced persistence to `chrome.storage.local`. On service worker restart, rehydrate from storage. Add keep-alive interval during active transcription to prevent unnecessary termination. Flush buffer on `STOP_TRANSCRIPTION`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| chrome.storage.local | Built-in | Persistent key-value storage | Native Chrome API, 10MB quota, survives SW restarts, already used by store |
| chrome.runtime.onMessage | Built-in | Message passing (already in use) | Synchronous listener registration pattern already established |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| chrome.storage.session | Built-in | Fast in-memory storage surviving SW restarts | NOT recommended here -- 10MB quota same as local, but lost on browser close; local is better for data safety |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| chrome.storage.local | IndexedDB | IndexedDB supports larger data + queries, but overkill for a single transcript buffer; IndexedDB planned for v2.1 persistent transcripts feature |
| chrome.storage.local | chrome.storage.session | Session storage is faster (in-memory) but lost on browser close; local provides better safety for interview data |
| Custom debounce | lodash.debounce | No need for a dependency; 5-line debounce is sufficient and avoids adding packages |

**Installation:**
```bash
# No new dependencies required -- all native Chrome APIs
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  services/
    transcription/
      transcriptBuffer.ts   # NEW: Debounced persistent transcript buffer
entrypoints/
  background.ts              # MODIFIED: Use TranscriptBuffer instead of bare array
```

### Pattern 1: Debounced Write-Through Buffer
**What:** An in-memory array backed by periodic persistence to chrome.storage.local. Every mutation schedules a debounced save. On service worker restart, the buffer loads from storage before processing new transcript messages.
**When to use:** When data must survive service worker termination but immediate write on every update would be wasteful.
**Why debounce instead of immediate:** Transcript segments arrive frequently (every 0.5-2 seconds from ElevenLabs VAD). Immediate `chrome.storage.local.set()` on every segment is unnecessary overhead. A 2-3 second debounce batches multiple segments per write while keeping worst-case data loss to a few seconds of transcript.

```typescript
// Debounced write-through pattern
class TranscriptBuffer {
  private entries: TranscriptEntry[] = [];
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly DEBOUNCE_MS = 2000;
  private readonly STORAGE_KEY = '_transcript_buffer';

  async load(): Promise<void> {
    const result = await chrome.storage.local.get(this.STORAGE_KEY);
    if (result[this.STORAGE_KEY]) {
      this.entries = result[this.STORAGE_KEY];
    }
  }

  add(entry: TranscriptEntry): void {
    // Insert in chronological order (same logic as current addTranscriptEntry)
    let insertIndex = this.entries.length;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].timestamp <= entry.timestamp) {
        insertIndex = i + 1;
        break;
      }
      if (i === 0) insertIndex = 0;
    }
    this.entries.splice(insertIndex, 0, entry);
    this.dirty = true;
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), this.DEBOUNCE_MS);
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    await chrome.storage.local.set({ [this.STORAGE_KEY]: this.entries });
    this.dirty = false;
  }

  getEntries(): TranscriptEntry[] { return this.entries; }

  async clear(): Promise<void> {
    this.entries = [];
    this.dirty = false;
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    await chrome.storage.local.remove(this.STORAGE_KEY);
  }
}
```

### Pattern 2: Keep-Alive During Active Transcription
**What:** A `setInterval` that calls `chrome.runtime.getPlatformInfo()` every 20 seconds to keep the service worker alive during active transcription. This prevents Chrome's 30-second idle timeout from killing the worker while the user is in an interview.
**When to use:** Whenever transcription is active (`isTranscriptionActive === true`).
**Existing code:** The keep-alive pattern already exists in `background.ts` (lines 38-52) for LLM streaming. The same `startKeepAlive()`/`stopKeepAlive()` functions should be called on `START_TRANSCRIPTION`/`STOP_TRANSCRIPTION` as well.

```typescript
// In START_TRANSCRIPTION handler (background.ts):
isTranscriptionActive = true;
startKeepAlive(); // <-- ADD THIS

// In STOP_TRANSCRIPTION handler (background.ts):
isTranscriptionActive = false;
// Only stop keep-alive if no LLM requests active either
if (activeAbortControllers.size === 0) {
  stopKeepAlive();
}
```

### Pattern 3: Rehydration on Service Worker Restart
**What:** When the service worker restarts (after termination), check for an existing transcript buffer in storage and restore it before processing new messages.
**When to use:** On every service worker startup, after store is ready.
**Key consideration:** The service worker has no "I was terminated" event. It simply starts fresh. The queue guard pattern (already in background.ts) queues messages until the store is ready. The transcript buffer load should happen as part of this init chain.

```typescript
// In the init chain (background.ts):
encryptionService.initialize()
  .then(() => storeReadyPromise)
  .then(() => transcriptBuffer.load())  // <-- ADD THIS
  .then(() => {
    storeReady = true;
    // drain queue...
  });
```

### Pattern 4: Session Marker for Active Transcription
**What:** Store a flag in `chrome.storage.local` indicating whether transcription was active when the service worker was last running. On restart, this flag tells the worker whether it needs to recover the transcript buffer.
**When to use:** To distinguish between a fresh start (no transcript needed) and a recovery scenario (service worker was killed during active transcription).

```typescript
// On START_TRANSCRIPTION:
await chrome.storage.local.set({ _transcription_active: true });

// On STOP_TRANSCRIPTION:
await chrome.storage.local.remove('_transcription_active');

// On service worker startup (during init):
const { _transcription_active } = await chrome.storage.local.get('_transcription_active');
if (_transcription_active) {
  await transcriptBuffer.load();
  isTranscriptionActive = true; // Restore state flag
  startKeepAlive(); // Re-enable keep-alive
}
```

### Anti-Patterns to Avoid
- **Writing to storage on every segment without debounce:** Wastes I/O. Transcript segments arrive every 0.5-2 seconds. A 2-second debounce is safe because the keep-alive prevents termination during normal operation.
- **Using chrome.storage.session instead of chrome.storage.local:** Session storage is lost when the browser closes. If Chrome crashes during an interview, the user loses everything. Local storage survives browser restarts.
- **Relying solely on keep-alive without persistence:** Keep-alive prevents *normal* termination but cannot prevent forced termination (DevTools kill, Chrome update, crash, low memory). Persistence is the true safety net.
- **Loading transcript buffer synchronously at module top-level:** `chrome.storage.local.get()` is async. Must be part of the init chain, not a top-level await.
- **Encrypting transcript data:** The encryption layer (Phase 10) only encrypts API keys. Transcript data is not sensitive configuration -- it is ephemeral session data that should NOT go through the encryption adapter. Write directly to `chrome.storage.local`, not through the Zustand store.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Persistent key-value storage | Custom file storage or IndexedDB wrapper | `chrome.storage.local` | Native API, 10MB quota, async, built for extensions |
| Debounce function | npm debounce package | Inline 5-line setTimeout/clearTimeout | No dependency needed for a single debounce use case |
| Keep-alive mechanism | Custom event-based keep-alive | Existing `startKeepAlive()`/`stopKeepAlive()` in background.ts | Already implemented and tested for LLM streaming |

**Key insight:** This phase requires no new libraries. Everything needed is already available in the Chrome extension APIs and the existing codebase. The TranscriptBuffer is a thin wrapper around an array + `chrome.storage.local.set/get`.

## Common Pitfalls

### Pitfall 1: Debounce Timer Lost on Service Worker Termination
**What goes wrong:** `setTimeout` used for debouncing is cleared when the service worker terminates. If a segment was added but the debounce timer hadn't fired yet, that segment is lost.
**Why it happens:** Service worker termination clears all timers (setTimeout, setInterval). The debounced write never executes.
**How to avoid:** The keep-alive mechanism prevents normal termination during active transcription. For forced termination, the worst case is losing 0-2 seconds of transcript (the debounce window). This is acceptable because: (a) keep-alive makes forced termination rare during active use, and (b) losing 1-2 seconds of transcript is far better than losing the entire session.
**Warning signs:** Transcription is active but `keepAliveInterval` is null -- means keep-alive wasn't started.

### Pitfall 2: Race Between Buffer Load and Incoming Messages
**What goes wrong:** Service worker restarts and receives `TRANSCRIPT_FINAL` messages before the transcript buffer has finished loading from storage. New entries are added to an empty buffer, then the load overwrites them.
**Why it happens:** Buffer load is async; message handling can start before load completes.
**How to avoid:** The queue guard pattern already handles this. Messages are queued until `storeReady === true`, and the buffer load happens before `storeReady` is set to `true`. New transcript messages will only be processed after the buffer is loaded.
**Warning signs:** Transcript entries appear to "disappear" after service worker restart.

### Pitfall 3: Storage Quota Exceeded on Long Interviews
**What goes wrong:** A very long interview (2+ hours) generates thousands of transcript entries. At ~500 bytes per entry, 2000 entries = ~1MB. Storage has 10MB total shared with the Zustand store (~5KB).
**Why it happens:** No cleanup of old data, no size monitoring.
**How to avoid:** Monitor entry count. At 5000 entries (~2.5MB), log a warning. At 8000 entries (~4MB), trim oldest entries. In practice, this is unlikely -- a 2-hour interview at one entry per 3 seconds is ~2400 entries (~1.2MB). Well within quota.
**Warning signs:** `chrome.storage.local.set()` throws a quota error.

### Pitfall 4: Stale Transcript Buffer After Normal Stop
**What goes wrong:** User stops transcription (normal flow), but the transcript buffer remains in storage. Next time the service worker restarts for any reason, it loads the old transcript from a previous session.
**Why it happens:** Buffer not cleared on `STOP_TRANSCRIPTION`.
**How to avoid:** On `STOP_TRANSCRIPTION`: flush buffer to storage (for final persistence), clear the `_transcription_active` flag, but do NOT delete the buffer data immediately. The content script still has the data. Clear the buffer storage only on `START_TRANSCRIPTION` (when a new session begins).
**Warning signs:** Old transcript from a previous session appears when starting a new one.

### Pitfall 5: Not Updating broadcastTranscript to Use Buffer
**What goes wrong:** `broadcastTranscript()` still reads from the old `mergedTranscript` module variable instead of the buffer.
**Why it happens:** Incomplete refactoring -- buffer is added but broadcast function isn't updated to use it.
**How to avoid:** Replace `mergedTranscript` with `transcriptBuffer.getEntries()` in all places: `broadcastTranscript()`, `addTranscriptEntry()`, and `START_TRANSCRIPTION` handler (which clears the array).
**Warning signs:** Transcript displays correctly but doesn't persist.

## Code Examples

### Complete TranscriptBuffer Implementation
```typescript
// src/services/transcription/transcriptBuffer.ts
import type { TranscriptEntry } from '../../types/transcript';

const STORAGE_KEY = '_transcript_buffer';
const ACTIVE_FLAG_KEY = '_transcription_active';
const DEBOUNCE_MS = 2000;

export class TranscriptBuffer {
  private entries: TranscriptEntry[] = [];
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private loaded = false;

  /**
   * Load persisted transcript from chrome.storage.local.
   * Called during init chain, before message processing begins.
   */
  async load(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      if (result[STORAGE_KEY] && Array.isArray(result[STORAGE_KEY])) {
        this.entries = result[STORAGE_KEY];
        console.log(`TranscriptBuffer: Loaded ${this.entries.length} entries from storage`);
      }
    } catch (error) {
      console.error('TranscriptBuffer: Load failed, starting fresh:', error);
      this.entries = [];
    }
    this.loaded = true;
  }

  /**
   * Add entry maintaining chronological order by timestamp.
   * Schedules debounced save to storage.
   */
  add(entry: TranscriptEntry): void {
    let insertIndex = this.entries.length;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].timestamp <= entry.timestamp) {
        insertIndex = i + 1;
        break;
      }
      if (i === 0) insertIndex = 0;
    }
    this.entries.splice(insertIndex, 0, entry);
    this.dirty = true;
    this.scheduleSave();
  }

  /** Get all entries (for broadcast to content scripts). */
  getEntries(): TranscriptEntry[] {
    return this.entries;
  }

  /** Schedule debounced save. */
  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), DEBOUNCE_MS);
  }

  /** Immediately flush dirty entries to storage. */
  async flush(): Promise<void> {
    if (!this.dirty) return;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: this.entries });
      this.dirty = false;
    } catch (error) {
      console.error('TranscriptBuffer: Save failed:', error);
    }
  }

  /** Clear buffer and remove from storage (new session start). */
  async clear(): Promise<void> {
    this.entries = [];
    this.dirty = false;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await chrome.storage.local.remove(STORAGE_KEY);
  }

  /** Get entry count. */
  get length(): number {
    return this.entries.length;
  }

  /** Whether buffer has been loaded from storage. */
  get isLoaded(): boolean {
    return this.loaded;
  }
}

/** Set active transcription flag in storage. */
export async function setTranscriptionActive(active: boolean): Promise<void> {
  if (active) {
    await chrome.storage.local.set({ [ACTIVE_FLAG_KEY]: true });
  } else {
    await chrome.storage.local.remove(ACTIVE_FLAG_KEY);
  }
}

/** Check if transcription was active before service worker termination. */
export async function wasTranscriptionActive(): Promise<boolean> {
  const result = await chrome.storage.local.get(ACTIVE_FLAG_KEY);
  return !!result[ACTIVE_FLAG_KEY];
}
```

### Background Script Integration Points
```typescript
// entrypoints/background.ts -- key changes

// REPLACE module-level variables:
// OLD: let mergedTranscript: TranscriptEntry[] = [];
// NEW:
import { TranscriptBuffer, setTranscriptionActive, wasTranscriptionActive } from '../src/services/transcription/transcriptBuffer';
const transcriptBuffer = new TranscriptBuffer();

// interimEntries Map stays in memory (interim data is ephemeral by nature)

// UPDATE init chain:
encryptionService.initialize()
  .then(() => storeReadyPromise)
  .then(async () => {
    // Check if we're recovering from a service worker termination during transcription
    const wasActive = await wasTranscriptionActive();
    if (wasActive) {
      await transcriptBuffer.load();
      isTranscriptionActive = true;
      startKeepAlive();
      console.log('TranscriptBuffer: Recovered', transcriptBuffer.length, 'entries after SW restart');
    }
    storeReady = true;
    // ... drain queue ...
  });

// UPDATE START_TRANSCRIPTION handler:
// Clear buffer for new session (not load -- this is a new session)
await transcriptBuffer.clear();
interimEntries.clear();
await setTranscriptionActive(true);
startKeepAlive(); // <-- ADD

// UPDATE STOP_TRANSCRIPTION handler:
await transcriptBuffer.flush(); // Final save
await setTranscriptionActive(false);
if (activeAbortControllers.size === 0) stopKeepAlive(); // <-- ADD

// UPDATE TRANSCRIPT_FINAL handler:
// Use transcriptBuffer.add() instead of addTranscriptEntry()

// UPDATE broadcastTranscript():
// Use transcriptBuffer.getEntries() instead of mergedTranscript
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MV2 background pages (persistent) | MV3 service workers (terminable) | Chrome 109 (Jan 2023) | All in-memory state is ephemeral; must persist to survive |
| No keep-alive needed (persistent bg) | Keep-alive via setInterval + API call | Chrome 109 (Jan 2023) | Active operations need explicit keep-alive |
| chrome.storage.local 5MB quota | chrome.storage.local 10MB quota | Chrome 114 (May 2023) | More room for transcript data |
| No session storage | chrome.storage.session (10MB, in-memory) | Chrome 102 (May 2022) | Alternative for data that doesn't need browser-restart survival |
| WebSocket doesn't extend SW lifetime | WebSocket activity resets idle timer | Chrome 116 (Aug 2023) | Offscreen WebSocket keeps SW alive... but our WebSocket is in offscreen, not background |

**Important note on WebSocket keep-alive:** Chrome 116 added WebSocket support for extending service worker lifetimes, but this only applies to WebSockets created *in the service worker itself*. Our WebSockets are in the offscreen document. The offscreen document's WebSocket activity does NOT keep the background service worker alive. This is why we need an explicit keep-alive mechanism.

## Open Questions

1. **Should we broadcast the recovered transcript to content scripts on SW restart?**
   - What we know: After SW restart, content scripts are still alive (they run in page context). They still have their last `currentTranscript` in memory. The background has recovered the transcript from storage.
   - What's unclear: Does the content script's existing transcript become stale after SW restart? It should still be valid since transcript entries are append-only.
   - Recommendation: Yes, broadcast the recovered transcript after load. This ensures content script and background are in sync. Cheap operation -- just one message with the full array.

2. **Should `interimEntries` (partial transcripts) also be persisted?**
   - What we know: Interim entries are ephemeral by nature -- they get replaced by the final committed transcript. They represent "in progress" speech.
   - What's unclear: Whether losing a partial transcript mid-utterance causes user confusion.
   - Recommendation: No. Interim entries are overwritten within seconds by final transcripts. Persisting them adds complexity with no real benefit. After SW restart, the partial will simply not show until the next partial/final arrives from ElevenLabs.

3. **Edge case: Service worker terminated during `flush()` call**
   - What we know: `chrome.storage.local.set()` is async. If SW terminates mid-write, the data may be partially written or not written at all.
   - What's unclear: Chrome's exact behavior on SW termination during pending storage write.
   - Recommendation: Accept this as a very narrow edge case. The keep-alive makes SW termination during flush extremely unlikely. Worst case: lose 0-2 seconds of transcript.

## Sources

### Primary (HIGH confidence)
- [chrome.storage API documentation](https://developer.chrome.com/docs/extensions/reference/api/storage) -- Quota (10MB), API surface, performance notes
- [Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) -- 30-second timeout, keep-alive mechanisms, WebSocket behavior (Chrome 116+)
- [chrome.offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen) -- Offscreen document lifetime independent of service worker
- Codebase analysis: `entrypoints/background.ts`, `src/store/chromeStorage.ts`, `src/services/transcription/` -- Current architecture

### Secondary (MEDIUM confidence)
- [WebSocket in Service Workers](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets) -- WebSocket activity resets idle timer (Chrome 116+), but only for WebSockets in the SW itself
- [Offscreen Document Lifecycle Discussion](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/sDNbgeVHEEw) -- Offscreen documents survive SW termination
- [December 2025 SW keep-alive challenges](https://medium.com/@dzianisv/vibe-engineering-mv3-service-worker-keepalive-how-chrome-keeps-killing-our-ai-agent-9fba3bebdc5b) -- Real-world confirmation of 30-second timeout issues

### Tertiary (LOW confidence)
- None. All findings verified against official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- native Chrome APIs, no libraries, well-documented behavior
- Architecture: HIGH -- debounced write-through buffer is a well-established pattern; codebase analysis confirms exact integration points
- Pitfalls: HIGH -- service worker lifecycle is well-documented; pitfalls confirmed via official docs and community reports

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (stable APIs, unlikely to change)
