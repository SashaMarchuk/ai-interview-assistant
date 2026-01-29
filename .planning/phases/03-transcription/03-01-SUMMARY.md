---
phase: 03-transcription
plan: 01
subsystem: transcription
tags: [elevenlabs, websocket, stt, realtime]
dependency-graph:
  requires: [02-audio-pipeline]
  provides: [transcription-types, elevenlabs-connection, audio-buffer]
  affects: [03-02, 03-03, 07-integration]
tech-stack:
  added: []
  patterns: [exponential-backoff, audio-buffering, discriminated-unions]
key-files:
  created:
    - src/types/messages.ts (extended)
    - src/services/transcription/types.ts
    - src/services/transcription/ElevenLabsConnection.ts
    - src/services/transcription/AudioBuffer.ts
    - src/services/transcription/index.ts
  modified:
    - entrypoints/background.ts
decisions:
  - crypto.randomUUID() for IDs (browser-native)
  - btoa() for base64 encoding (no library)
  - Speaker labels: 'You' for mic, 'Interviewer' for tab
metrics:
  duration: ~5 minutes
  completed: 2026-01-29
---

# Phase 03 Plan 01: Transcription Types and WebSocket Wrapper Summary

**One-liner:** ElevenLabs Scribe v2 Realtime WebSocket wrapper with exponential backoff reconnection and audio buffering during disconnects.

## What Was Built

### 1. Transcription Message Types

Extended `src/types/messages.ts` with 8 new message types for transcription lifecycle:

| Message Type | Purpose |
|-------------|---------|
| START_TRANSCRIPTION | Initiate transcription with API key |
| STOP_TRANSCRIPTION | Stop transcription |
| TRANSCRIPTION_STARTED | Confirm transcription is active |
| TRANSCRIPTION_STOPPED | Confirm transcription stopped |
| TRANSCRIPTION_ERROR | Error with source, message, canRetry |
| TRANSCRIPT_PARTIAL | Interim text from ElevenLabs |
| TRANSCRIPT_FINAL | Finalized text with speaker/id |
| TRANSCRIPT_UPDATE | Full transcript array update |

All message interfaces follow existing patterns (BaseMessage extension, discriminated unions).

### 2. Transcription Service Module

Created `src/services/transcription/` with 4 files:

**types.ts:**
- `TranscriptionConfig` - API key, model, language, source
- `ServerMessage` - Union type for ElevenLabs WebSocket responses
- `Word` - Word-level timing information
- `ConnectionState` - disconnected/connecting/connected/reconnecting
- `TranscriptCallback` - Callback signature for transcript updates

**AudioBuffer.ts:**
- Circular buffer for audio chunks during disconnect
- Max 100 chunks (~6 seconds at typical chunk rate)
- FIFO eviction when full
- `add()`, `flush()`, `clear()` methods

**ElevenLabsConnection.ts:**
- WebSocket wrapper for ElevenLabs Scribe v2 Realtime API
- Exponential backoff reconnection (max 3 attempts, 500ms base, 5000ms max, jitter)
- Audio buffering during disconnect
- Speaker labels: 'You' (mic) / 'Interviewer' (tab)
- VAD commit strategy with timestamps

**index.ts:**
- Barrel export for clean imports

## Key Implementation Details

### WebSocket URL Construction

```
wss://api.elevenlabs.io/v1/speech-to-text/realtime?
  model_id=scribe_v2_realtime&
  audio_format=pcm_16000&
  commit_strategy=vad&
  include_timestamps=true&
  xi-api-key={apiKey}
```

### Audio Chunk Format

```typescript
{
  message_type: 'input_audio_chunk',
  audio_base_64: string,  // PCM 16kHz, 16-bit, base64 encoded
  commit: false,
  sample_rate: 16000
}
```

### Reconnection Logic

- Max 3 attempts
- Exponential delay: 500ms * 2^attempt
- Jitter: random 0-500ms added
- Max delay capped at 5000ms
- Audio buffered during reconnection

## Commits

| Hash | Description |
|------|-------------|
| `9882b7b` | feat(03-01): add transcription message types |
| `307d8ea` | feat(03-01): create transcription service module |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added background.ts handlers for exhaustive switch**
- **Found during:** Task 1
- **Issue:** TypeScript exhaustive switch in background.ts failed with new message types
- **Fix:** Added placeholder handlers for all 8 new transcription message types
- **Files modified:** entrypoints/background.ts
- **Commit:** 9882b7b

## Verification Results

| Check | Status |
|-------|--------|
| TypeScript type-check passes | PASS |
| Messages.ts contains START_TRANSCRIPTION | PASS |
| Transcription service has 4 files | PASS |
| ElevenLabsConnection exports correctly | PASS |
| AudioBuffer exports correctly | PASS |

## What's Next

**Plan 03-02:** Wire transcription service to offscreen document:
- Initialize ElevenLabsConnection instances in offscreen
- Route audio chunks from AudioWorklet to ElevenLabs
- Forward transcript updates via chrome.runtime messaging

## Dependencies for Future Plans

This plan provides:
- `ElevenLabsConnection` class ready for instantiation
- `AudioBuffer` class for audio chunk buffering
- Message types for transcription lifecycle communication
- Type definitions for ElevenLabs API protocol

Used by:
- **03-02:** Offscreen document wiring
- **03-03:** Transcript merging and state management
- **07:** Integration phase
