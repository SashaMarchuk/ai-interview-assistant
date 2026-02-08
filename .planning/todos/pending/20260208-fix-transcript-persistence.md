---
created: 2026-02-08
title: Fix Transcript State Persistence in Service Worker
area: bug
priority: P0
version: v1.1
complexity: low
estimate: 0.5-1 day
files:
  - entrypoints/background.ts
  - src/services/transcription/transcriptBuffer.ts
  - src/store/transcriptStore.ts
---

## Problem

**CRITICAL BUG:** Active transcript state lost when service worker terminates.

**Location:**
- `entrypoints/background.ts:21-23`

**Current code:**
```typescript
// ❌ TRANSCRIPT IN MEMORY ONLY
let activeTranscript: TranscriptSegment[] = [];

transcriptionService.on('segment', (segment) => {
  activeTranscript.push(segment);  // Lost on service worker termination
});
```

**Problem:**
1. Service workers can terminate at any time (Chrome's lifecycle management)
2. In-memory state (active transcript) is lost on termination
3. If interview is long, Chrome may terminate worker during session
4. User loses entire transcript history
5. No recovery mechanism

**Chrome service worker lifecycle:**
- Terminates after 30 seconds of inactivity
- Terminates on low memory
- Terminates randomly for resource management
- Cannot prevent termination

## User Impact

- **Data loss:** Active interview transcript disappears
- **Cannot recover:** No way to retrieve lost segments
- **Poor UX:** User must start over or manually transcribe
- **Trust issues:** Reliability concerns

## Solution

### Persist Transcript Segments Immediately

**Architecture change:**

```
Transcription Service → Segment arrives → Save to chrome.storage.local
                                        → Update in-memory cache
```

**Every segment saved immediately = no data loss.**

### Debounced Storage Pattern

```typescript
// src/services/transcription/transcriptBuffer.ts

class TranscriptBuffer {
  private segments: TranscriptSegment[] = [];
  private sessionId: string;
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly DEBOUNCE_MS = 1000; // Save every 1 second max

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.loadFromStorage();
  }

  /**
   * Load existing transcript from storage
   */
  async loadFromStorage(): Promise<void> {
    const key = `transcript_${this.sessionId}`;
    const result = await chrome.storage.local.get(key);

    if (result[key]) {
      this.segments = result[key];
      console.log(`[Transcript] Loaded ${this.segments.length} segments from storage`);
    }
  }

  /**
   * Add segment and persist
   */
  async addSegment(segment: TranscriptSegment): Promise<void> {
    this.segments.push(segment);

    // Immediate save for critical data, debounce for performance
    this.scheduleSave();
  }

  /**
   * Schedule save with debouncing
   */
  private scheduleSave(): void {
    // Clear existing timer
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    // Schedule new save
    this.saveDebounceTimer = setTimeout(() => {
      this.saveToStorage();
    }, this.DEBOUNCE_MS);
  }

  /**
   * Immediately save to storage
   */
  async saveToStorage(): Promise<void> {
    const key = `transcript_${this.sessionId}`;

    try {
      await chrome.storage.local.set({
        [key]: this.segments
      });

      console.log(`[Transcript] Saved ${this.segments.length} segments to storage`);
    } catch (error) {
      console.error('[Transcript] Save failed:', error);

      // Fallback: Try to save subset if quota exceeded
      if (error.message.includes('QUOTA')) {
        await this.saveWithCompression();
      }
    }
  }

  /**
   * Save with compression for large transcripts
   */
  private async saveWithCompression(): Promise<void> {
    // Keep only recent segments if storage full
    const RECENT_SEGMENTS = 100;
    const recentSegments = this.segments.slice(-RECENT_SEGMENTS);

    const key = `transcript_${this.sessionId}`;
    await chrome.storage.local.set({
      [key]: recentSegments,
      [`${key}_truncated`]: true
    });

    console.warn(`[Transcript] Saved recent ${RECENT_SEGMENTS} segments (truncated)`);
  }

  /**
   * Get all segments
   */
  getSegments(): TranscriptSegment[] {
    return this.segments;
  }

  /**
   * Clear transcript (end session)
   */
  async clear(): Promise<void> {
    this.segments = [];
    const key = `transcript_${this.sessionId}`;
    await chrome.storage.local.remove(key);
  }
}
```

### Integration with Background Script

```typescript
// entrypoints/background.ts

import { TranscriptBuffer } from '@/services/transcription/transcriptBuffer';

let activeTranscriptBuffer: TranscriptBuffer | null = null;
let activeSessionId: string | null = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_TRANSCRIPTION') {
    // Create new session and transcript buffer
    activeSessionId = generateUUID();
    activeTranscriptBuffer = new TranscriptBuffer(activeSessionId);

    // Listen for segments
    transcriptionService.on('segment', async (segment) => {
      // ✅ Persist immediately
      await activeTranscriptBuffer.addSegment(segment);

      // Also broadcast to UI
      chrome.runtime.sendMessage({
        type: 'TRANSCRIPT_SEGMENT',
        segment
      });
    });

    sendResponse({ success: true, sessionId: activeSessionId });
  }

  if (message.type === 'STOP_TRANSCRIPTION') {
    // Ensure final save
    if (activeTranscriptBuffer) {
      await activeTranscriptBuffer.saveToStorage();
    }

    activeTranscriptBuffer = null;
    activeSessionId = null;

    sendResponse({ success: true });
  }

  if (message.type === 'GET_TRANSCRIPT') {
    if (activeTranscriptBuffer) {
      const segments = activeTranscriptBuffer.getSegments();
      sendResponse({ success: true, segments });
    } else {
      sendResponse({ success: false, error: 'No active transcript' });
    }
  }

  return true; // Keep channel open
});

// ✅ Recovery on service worker restart
chrome.runtime.onStartup.addListener(async () => {
  console.log('[Background] Service worker restarted, checking for active session');

  // Check if there was an active session before termination
  const result = await chrome.storage.local.get('active_session_id');

  if (result.active_session_id) {
    console.log(`[Background] Recovering session ${result.active_session_id}`);

    activeSessionId = result.active_session_id;
    activeTranscriptBuffer = new TranscriptBuffer(activeSessionId);

    // Notify user of recovery
    chrome.runtime.sendMessage({
      type: 'SESSION_RECOVERED',
      sessionId: activeSessionId
    });
  }
});

// Track active session
async function setActiveSession(sessionId: string) {
  await chrome.storage.local.set({ active_session_id: sessionId });
}

async function clearActiveSession() {
  await chrome.storage.local.remove('active_session_id');
}
```

### Keep-Alive During Active Recording

**Prevent termination during critical operations:**

```typescript
// entrypoints/background.ts

let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

function startRecording() {
  // Keep service worker alive during recording
  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {
      // No-op, just keeps worker alive
    });
  }, 20000); // Every 20 seconds

  // Start transcription...
}

function stopRecording() {
  // Clear keep-alive
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }

  // Stop transcription...
}
```

### Storage Quota Management

**Handle chrome.storage.local quota (5-10MB):**

```typescript
async function checkStorageQuota(): Promise<{
  used: number;
  quota: number;
  available: number;
}> {
  const items = await chrome.storage.local.get(null);
  const used = JSON.stringify(items).length;
  const quota = chrome.storage.local.QUOTA_BYTES || 5242880; // 5MB default

  return {
    used,
    quota,
    available: quota - used
  };
}

async function cleanupOldTranscripts(): Promise<void> {
  const quota = await checkStorageQuota();

  if (quota.available < quota.quota * 0.1) {
    // Less than 10% available
    console.warn('[Storage] Running low on quota, cleaning up');

    const items = await chrome.storage.local.get(null);
    const transcriptKeys = Object.keys(items).filter(key =>
      key.startsWith('transcript_')
    );

    // Sort by timestamp (oldest first)
    transcriptKeys.sort();

    // Remove oldest transcripts until 50% quota available
    let removed = 0;
    for (const key of transcriptKeys) {
      await chrome.storage.local.remove(key);
      removed++;

      const newQuota = await checkStorageQuota();
      if (newQuota.available > quota.quota * 0.5) {
        break;
      }
    }

    console.log(`[Storage] Removed ${removed} old transcripts`);
  }
}
```

### Migration to IndexedDB (Future)

**Note:** This is interim fix. Full solution is **Persistent Transcripts (v2.1)** with IndexedDB.

**Current todo:**
- ✅ Fixes immediate data loss bug
- ✅ Uses chrome.storage.local (limited capacity)
- ✅ Simple implementation

**Future todo (20260208-persistent-transcripts.md):**
- ✅ Unlimited storage with IndexedDB
- ✅ Search and filtering
- ✅ Session history
- ✅ Export functionality

**This todo unblocks v1.1, persistent transcripts enhance v2.1.**

### Implementation Steps

1. **Create TranscriptBuffer class**
   - Manage in-memory + persistent storage
   - Debounced saves
   - Load on init

2. **Update background script**
   - Use TranscriptBuffer instead of array
   - Save on every segment
   - Recovery on restart

3. **Add keep-alive mechanism**
   - Prevent termination during recording
   - Clear after recording stops

4. **Add quota management**
   - Check available space
   - Cleanup old transcripts
   - Handle quota exceeded

5. **Testing**
   - Verify persistence across restarts
   - Test recovery after termination
   - Test with long interviews
   - Test quota exceeded scenario

### Files to Update

- `src/services/transcription/transcriptBuffer.ts` (new)
- `entrypoints/background.ts` (use TranscriptBuffer)
- `src/utils/storage.ts` (quota management helpers)

### Testing Checklist

- [ ] Transcript persists to chrome.storage.local
- [ ] Debouncing works (not saving every 100ms)
- [ ] Recovery after service worker restart
- [ ] Keep-alive prevents termination during recording
- [ ] Quota exceeded handled gracefully
- [ ] Old transcripts cleaned up automatically
- [ ] No data loss in long interviews
- [ ] Performance acceptable (no lag)

### Performance Considerations

**Debouncing:**
- Save every 1 second max (not every segment)
- Batch multiple segments in one save

**Storage size:**
- ~1000 chars per segment = ~1KB
- 100 segments = ~100KB
- 1000 segments = ~1MB (typical 30-min interview)
- chrome.storage.local = 5-10MB (50-100 interviews)

**Acceptable until IndexedDB migration.**

### Error Handling

**Save failures:**
```typescript
try {
  await chrome.storage.local.set({ [key]: segments });
} catch (error) {
  if (error.message.includes('QUOTA')) {
    // Fallback: Save recent segments only
    await saveRecentSegments();
  } else {
    // Log error, continue recording
    console.error('[Transcript] Save failed:', error);
  }
}
```

**Load failures:**
```typescript
try {
  const result = await chrome.storage.local.get(key);
  this.segments = result[key] || [];
} catch (error) {
  console.error('[Transcript] Load failed, starting fresh:', error);
  this.segments = [];
}
```

### Timeline

- **TranscriptBuffer class:** 2-3 hours
- **Background integration:** 1-2 hours
- **Keep-alive + quota:** 1-2 hours
- **Testing:** 1-2 hours

**Total:** 0.5-1 day

## References

- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/storage/)
- [Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/mv3/service_workers/service-worker-lifecycle/)
- [Storage Quota](https://developer.chrome.com/docs/extensions/reference/storage/#property-local-QUOTA_BYTES)
