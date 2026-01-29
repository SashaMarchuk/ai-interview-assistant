# Phase 3: Transcription - Research

**Researched:** 2026-01-29
**Domain:** Real-time speech-to-text transcription via WebSocket (ElevenLabs Scribe v2 Realtime)
**Confidence:** MEDIUM

## Summary

This phase implements real-time speech-to-text transcription using ElevenLabs Scribe v2 Realtime API via WebSocket. The research reveals a critical constraint: **speaker diarization is NOT available in the real-time API** - it's only supported in the batch (non-realtime) Scribe v2 model. This means the architecture must use the audio source (tab vs microphone) as the speaker differentiator rather than relying on automatic speaker detection.

The implementation will maintain two parallel WebSocket connections to ElevenLabs - one for tab audio (interviewer) and one for microphone audio (user). The Offscreen Document (already established in Phase 2) will host these WebSocket connections since Chrome MV3 Service Workers cannot maintain persistent connections. PCM audio chunks from Phase 2 at 16kHz are already in the correct format for ElevenLabs.

Key challenges include WebSocket connection management with automatic reconnection, audio buffering during disconnects, and merging two transcript streams chronologically by timestamp. The context decisions specify interim results displayed in italic with typing indicators, auto-reconnect with 3 attempts and exponential backoff, and speaker labels "You" for microphone and "Speaker N" (or fallback "Interviewer") for tab audio.

**Primary recommendation:** Use two separate ElevenLabs WebSocket connections (one per audio source) with VAD commit strategy, buffer audio during brief disconnects, merge transcripts by timestamp in the Service Worker, and send to UI via chrome.runtime messaging.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native WebSocket | Browser API | WebSocket connection to ElevenLabs | No external library needed; direct control over connection lifecycle |
| ElevenLabs Scribe v2 Realtime | API | Real-time STT with 150ms latency | Already specified in requirements (STT-06), best-in-class accuracy |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| uuid | ^9.0 | Generate unique transcript entry IDs | Already used in project; needed for TranscriptEntry.id |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ElevenLabs | Deepgram | Deepgram has realtime diarization but major issues on non-English |
| ElevenLabs | AssemblyAI | Handles 50 speakers but higher latency |
| Native WebSocket | reconnecting-websocket | Adds reconnection logic but we need custom audio buffering anyway |

**Installation:**
```bash
# No new npm packages needed - using native WebSocket API
# uuid is already installed in the project
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── services/
│   └── transcription/
│       ├── index.ts                # Re-exports
│       ├── types.ts                # Transcription-specific types
│       ├── ElevenLabsConnection.ts # WebSocket wrapper class
│       ├── AudioBuffer.ts          # Audio buffering during disconnect
│       └── TranscriptMerger.ts     # Merge tab + mic streams by timestamp
├── types/
│   ├── messages.ts                 # Add transcription message types
│   └── transcript.ts               # Already exists - extend if needed
└── entrypoints/
    └── offscreen/
        └── main.ts                 # Add WebSocket connection handling
```

### Pattern 1: Dual WebSocket Connection Architecture
**What:** Maintain two separate WebSocket connections to ElevenLabs - one for tab audio, one for microphone audio. Each connection tracks its audio source and labels transcripts accordingly.
**When to use:** Always - this is the core architecture since diarization isn't available in realtime.
**Example:**
```typescript
// Source: Architecture decision based on ElevenLabs API limitations

interface TranscriptionConnection {
  ws: WebSocket | null;
  source: 'tab' | 'mic';
  speakerLabel: string; // "You" for mic, "Interviewer" or "Speaker N" for tab
  isConnected: boolean;
  reconnectAttempts: number;
  audioBuffer: ArrayBuffer[];
}

// Offscreen document maintains both connections
const tabConnection: TranscriptionConnection = {
  ws: null,
  source: 'tab',
  speakerLabel: 'Interviewer',
  isConnected: false,
  reconnectAttempts: 0,
  audioBuffer: [],
};

const micConnection: TranscriptionConnection = {
  ws: null,
  source: 'mic',
  speakerLabel: 'You',
  isConnected: false,
  reconnectAttempts: 0,
  audioBuffer: [],
};
```

### Pattern 2: Exponential Backoff Reconnection
**What:** On WebSocket disconnect, attempt reconnection with exponential delay and jitter.
**When to use:** Always for WebSocket connections to handle network issues gracefully.
**Example:**
```typescript
// Source: https://dev.to/hexshift/robust-websocket-reconnection-strategies-in-javascript-with-exponential-backoff-40n1

const MAX_RECONNECT_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 5000;

function getBackoffDelay(attempt: number): number {
  const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * 500; // Prevent thundering herd
  return Math.min(exponentialDelay + jitter, MAX_DELAY_MS);
}

async function reconnect(connection: TranscriptionConnection): Promise<void> {
  if (connection.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    // Notify UI of connection failure
    chrome.runtime.sendMessage({
      type: 'TRANSCRIPTION_ERROR',
      source: connection.source,
      error: 'Max reconnection attempts reached',
    });
    return;
  }

  const delay = getBackoffDelay(connection.reconnectAttempts);
  connection.reconnectAttempts++;

  await new Promise((resolve) => setTimeout(resolve, delay));
  connect(connection);
}
```

### Pattern 3: Audio Buffering During Disconnect
**What:** Buffer audio chunks locally when WebSocket is disconnected, send on reconnect.
**When to use:** To avoid losing audio during brief network interruptions.
**Example:**
```typescript
// Source: Architecture decision from CONTEXT.md requirements

const MAX_BUFFER_CHUNKS = 100; // ~6 seconds at typical chunk rate

function handleAudioChunk(
  connection: TranscriptionConnection,
  chunk: ArrayBuffer
): void {
  if (!connection.isConnected || !connection.ws) {
    // Buffer during disconnect
    if (connection.audioBuffer.length < MAX_BUFFER_CHUNKS) {
      connection.audioBuffer.push(chunk);
    }
    return;
  }

  // Send buffered audio first
  while (connection.audioBuffer.length > 0) {
    const bufferedChunk = connection.audioBuffer.shift()!;
    sendAudioChunk(connection.ws, bufferedChunk);
  }

  // Send current chunk
  sendAudioChunk(connection.ws, chunk);
}
```

### Pattern 4: Transcript Merging by Timestamp
**What:** Merge transcript entries from both sources into a single chronologically-ordered list.
**When to use:** In Service Worker when forwarding to UI.
**Example:**
```typescript
// Source: Architecture decision

interface TranscriptEntry {
  id: string;
  speaker: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
  source: 'tab' | 'mic';
  confidence?: number;
}

// Service Worker maintains merged transcript
let mergedTranscript: TranscriptEntry[] = [];

function addTranscriptEntry(entry: TranscriptEntry): void {
  // Find insertion point to maintain chronological order
  let insertIndex = mergedTranscript.length;
  for (let i = mergedTranscript.length - 1; i >= 0; i--) {
    if (mergedTranscript[i].timestamp <= entry.timestamp) {
      insertIndex = i + 1;
      break;
    }
    if (i === 0) {
      insertIndex = 0;
    }
  }

  mergedTranscript.splice(insertIndex, 0, entry);

  // Notify UI
  chrome.runtime.sendMessage({
    type: 'TRANSCRIPT_UPDATE',
    transcript: mergedTranscript,
  });
}
```

### Anti-Patterns to Avoid
- **Single WebSocket for both streams:** Don't try to multiplex both audio sources into one connection - ElevenLabs expects distinct sessions per audio source.
- **Polling for transcript updates:** Use message passing, not polling intervals.
- **Storing full transcript in content script:** Keep transcript state in Service Worker; content script should only receive updates via messages.
- **Reconnecting without backoff:** Will overwhelm the server and get rate-limited.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Unique IDs | Custom ID generator | `crypto.randomUUID()` | Browser-native, guaranteed uniqueness |
| Base64 encoding | Custom encoder | `btoa()` / Buffer.from().toString('base64') | Built-in, well-tested |
| Timestamp formatting | Custom formatter | `Date.toLocaleTimeString()` | Handles localization, already in browser |
| Audio format conversion | Custom PCM encoder | Existing AudioWorklet from Phase 2 | Already done, 16kHz PCM output |

**Key insight:** The tricky parts in this phase are connection lifecycle management and stream merging - not data transformation. PCM encoding is already solved in Phase 2.

## Common Pitfalls

### Pitfall 1: WebSocket in Service Worker
**What goes wrong:** Service Workers terminate after 30s of inactivity, killing WebSocket connections.
**Why it happens:** Chrome MV3 design - Service Workers are not meant for persistent connections.
**How to avoid:** Keep WebSocket connections in the Offscreen Document, not Service Worker. Offscreen Document with USER_MEDIA reason has no automatic timeout.
**Warning signs:** WebSocket connections dropping every ~30 seconds during idle periods.

### Pitfall 2: Message Size Limits
**What goes wrong:** Chrome message passing has limits; large ArrayBuffer chunks may fail.
**Why it happens:** `chrome.runtime.sendMessage` serializes data, creating overhead.
**How to avoid:** Keep audio chunks reasonably sized (128-256 samples per chunk is typical). The Phase 2 AudioWorklet already produces appropriate chunk sizes.
**Warning signs:** "Message length exceeded" errors in console.

### Pitfall 3: Race Conditions on Reconnect
**What goes wrong:** Multiple reconnection attempts create duplicate connections.
**Why it happens:** Async reconnection logic without proper state guarding.
**How to avoid:** Track connection state with `isConnecting` flag; check before starting reconnection.
**Warning signs:** Multiple "session_started" messages from ElevenLabs for same source.

### Pitfall 4: Interim Results Not Updating
**What goes wrong:** UI shows stale interim text or duplicates.
**Why it happens:** Not properly replacing interim entries when finals arrive.
**How to avoid:** Track interim entries by a session-local ID; replace when `partial_transcript` becomes `committed_transcript`.
**Warning signs:** Same text appearing multiple times, or interim text staying after final.

### Pitfall 5: Audio Buffer Memory Leak
**What goes wrong:** Memory grows unbounded during extended disconnects.
**Why it happens:** Buffering audio without limit during reconnection attempts.
**How to avoid:** Cap buffer size (e.g., 100 chunks); drop oldest if exceeded.
**Warning signs:** Tab memory increasing continuously during testing.

### Pitfall 6: No Speaker Diarization in Realtime
**What goes wrong:** Expecting ElevenLabs to label multiple speakers from tab audio.
**Why it happens:** Assuming realtime API has same features as batch API.
**How to avoid:** Use audio source as speaker differentiator. For tab audio, use "Interviewer" as fallback label. If multiple distinct speakers are needed, consider post-processing with batch API (out of scope for real-time requirements).
**Warning signs:** Looking for `speaker_id` in realtime API response (it won't be there).

## Code Examples

Verified patterns from official sources:

### ElevenLabs WebSocket Connection
```typescript
// Source: https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime

const WS_ENDPOINT = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';

interface SessionConfig {
  apiKey: string;
  modelId?: string;
  languageCode?: string;
  commitStrategy?: 'manual' | 'vad';
  vadSilenceThresholdSecs?: number;
}

function buildWebSocketUrl(config: SessionConfig): string {
  const params = new URLSearchParams({
    model_id: config.modelId || 'scribe_v2_realtime',
    audio_format: 'pcm_16000', // Matches Phase 2 output
    commit_strategy: config.commitStrategy || 'vad',
    include_timestamps: 'true',
  });

  if (config.languageCode) {
    params.set('language_code', config.languageCode);
  }
  if (config.vadSilenceThresholdSecs) {
    params.set('vad_silence_threshold_secs', config.vadSilenceThresholdSecs.toString());
  }

  return `${WS_ENDPOINT}?${params.toString()}`;
}

function createConnection(config: SessionConfig): WebSocket {
  const url = buildWebSocketUrl(config);
  const ws = new WebSocket(url);

  // Set API key header (WebSocket API allows header-based auth)
  // Note: Browser WebSocket doesn't support custom headers, use query param instead
  const urlWithAuth = `${url}&xi-api-key=${encodeURIComponent(config.apiKey)}`;

  return new WebSocket(urlWithAuth);
}
```

### Sending Audio Chunks
```typescript
// Source: https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime

interface InputAudioChunk {
  message_type: 'input_audio_chunk';
  audio_base_64: string;
  commit: boolean;
  sample_rate: number;
  previous_text?: string; // Only valid on first chunk
}

function sendAudioChunk(
  ws: WebSocket,
  pcmData: ArrayBuffer,
  options?: { commit?: boolean; previousText?: string }
): void {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }

  // Convert ArrayBuffer to base64
  const uint8Array = new Uint8Array(pcmData);
  const base64 = btoa(String.fromCharCode(...uint8Array));

  const message: InputAudioChunk = {
    message_type: 'input_audio_chunk',
    audio_base_64: base64,
    commit: options?.commit ?? false,
    sample_rate: 16000,
  };

  if (options?.previousText) {
    message.previous_text = options.previousText;
  }

  ws.send(JSON.stringify(message));
}
```

### Handling Server Messages
```typescript
// Source: https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime

type ServerMessage =
  | { message_type: 'session_started'; session_id: string; config: Record<string, unknown> }
  | { message_type: 'partial_transcript'; text: string }
  | { message_type: 'committed_transcript'; text: string }
  | { message_type: 'committed_transcript_with_timestamps'; text: string; words: Word[] }
  | { message_type: 'error'; error_type: string; message: string };

interface Word {
  text: string;
  start: number;
  end: number;
  type: 'word' | 'spacing';
  speaker_id?: string; // Note: Not available in realtime API
  logprob?: number;
}

function handleMessage(
  event: MessageEvent,
  source: 'tab' | 'mic',
  onTranscript: (entry: Partial<TranscriptEntry>) => void
): void {
  const message: ServerMessage = JSON.parse(event.data);

  switch (message.message_type) {
    case 'session_started':
      console.log(`STT session started for ${source}:`, message.session_id);
      break;

    case 'partial_transcript':
      onTranscript({
        text: message.text,
        isFinal: false,
        source,
        timestamp: Date.now(),
      });
      break;

    case 'committed_transcript':
    case 'committed_transcript_with_timestamps':
      onTranscript({
        text: message.text,
        isFinal: true,
        source,
        timestamp: Date.now(),
      });
      break;

    case 'error':
      console.error(`STT error for ${source}:`, message.error_type, message.message);
      // Handle specific errors
      if (message.error_type === 'auth_error') {
        // Notify UI about invalid API key
      }
      break;
  }
}
```

### Message Types Extension
```typescript
// Source: Extension of existing src/types/messages.ts

// Add to MessageType union
export type MessageType =
  // ... existing types ...
  // Transcription lifecycle
  | 'START_TRANSCRIPTION'
  | 'STOP_TRANSCRIPTION'
  | 'TRANSCRIPTION_STARTED'
  | 'TRANSCRIPTION_STOPPED'
  | 'TRANSCRIPTION_ERROR'
  // Transcript updates
  | 'TRANSCRIPT_PARTIAL'
  | 'TRANSCRIPT_FINAL'
  | 'TRANSCRIPT_UPDATE';

// New message interfaces
export interface StartTranscriptionMessage extends BaseMessage {
  type: 'START_TRANSCRIPTION';
  apiKey: string;
}

export interface TranscriptPartialMessage extends BaseMessage {
  type: 'TRANSCRIPT_PARTIAL';
  source: 'tab' | 'mic';
  text: string;
  timestamp: number;
}

export interface TranscriptFinalMessage extends BaseMessage {
  type: 'TRANSCRIPT_FINAL';
  source: 'tab' | 'mic';
  text: string;
  timestamp: number;
  id: string;
  speaker: string;
}

export interface TranscriptUpdateMessage extends BaseMessage {
  type: 'TRANSCRIPT_UPDATE';
  entries: TranscriptEntry[];
}

export interface TranscriptionErrorMessage extends BaseMessage {
  type: 'TRANSCRIPTION_ERROR';
  source: 'tab' | 'mic';
  error: string;
  canRetry: boolean;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Scribe v1 | Scribe v2 Realtime | Jan 2026 | Better accuracy, 150ms latency (down from ~300ms) |
| Manual commit | VAD-based commit | Available since launch | Automatic speech detection reduces complexity |
| @11labs/client | @elevenlabs/client | 2025 | Package renamed; old package deprecated |

**Deprecated/outdated:**
- `scribe_v1` model: Superseded by `scribe_v2_realtime` with better accuracy
- `@11labs/client` npm package: Renamed to `@elevenlabs/client`
- Trying to use `speaker_id` in realtime: Not available; only in batch API

## Open Questions

Things that couldn't be fully resolved:

1. **Speaker diarization for tab audio**
   - What we know: Realtime API does NOT support speaker diarization
   - What's unclear: Whether multiple interviewers speaking can be distinguished
   - Recommendation: Use "Interviewer" as default label per CONTEXT.md fallback decision. If user wants to distinguish multiple interviewers, they can use click-to-rename feature. True diarization would require switching to batch API or a different provider (out of scope).

2. **Exact chunk timing for buffering**
   - What we know: Phase 2 AudioWorklet produces chunks, but exact size/timing not documented here
   - What's unclear: Optimal buffer size in number of chunks
   - Recommendation: Start with 100 chunks max buffer (~5-6 seconds), adjust based on testing.

3. **VAD threshold tuning**
   - What we know: Default VAD threshold is 0.4, silence threshold is 1.5s
   - What's unclear: Whether defaults work well for interview scenarios
   - Recommendation: Use defaults initially; expose settings in Phase 6 if needed.

4. **Browser WebSocket header limitations**
   - What we know: Browser WebSocket API doesn't support custom headers
   - What's unclear: Whether xi-api-key in query string has any security implications
   - Recommendation: Use query parameter auth as documented. For client-side, ElevenLabs recommends single-use tokens, but for extension context (offscreen document), API key in query param is acceptable.

## Sources

### Primary (HIGH confidence)
- [ElevenLabs Realtime STT API Reference](https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime) - WebSocket endpoint, message formats, audio requirements
- [ElevenLabs Models Documentation](https://elevenlabs.io/docs/overview/models) - Model IDs: `scribe_v2_realtime`
- [Chrome Offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen) - Offscreen document lifecycle
- [Chrome WebSockets in Service Workers](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets) - Chrome 116+ WebSocket support

### Secondary (MEDIUM confidence)
- [ElevenLabs Scribe v2 Realtime Announcement](https://elevenlabs.io/blog/introducing-scribe-v2-realtime) - Feature set and limitations
- [WebSocket Reconnection Patterns](https://dev.to/hexshift/robust-websocket-reconnection-strategies-in-javascript-with-exponential-backoff-40n1) - Exponential backoff implementation

### Tertiary (LOW confidence)
- [ElevenLabs Community Discussion](https://elevenlabs.io/blog/meet-scribe) - Confirmation that diarization is batch-only (needs validation)
- [AssemblyAI STT Comparison](https://www.assemblyai.com/blog/best-api-models-for-real-time-speech-recognition-and-transcription) - Ecosystem context

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - ElevenLabs API is well-documented
- Architecture: MEDIUM - Dual WebSocket pattern is logical but not explicitly documented by ElevenLabs
- Pitfalls: MEDIUM - Based on Chrome extension patterns and WebSocket best practices
- Speaker diarization limitation: HIGH - Multiple sources confirm realtime API lacks this feature

**Research date:** 2026-01-29
**Valid until:** 2026-02-28 (30 days - API is stable but features may be added)
