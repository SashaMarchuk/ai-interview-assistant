# Project State

**Last Updated:** 2026-01-29
**Current Phase:** Multi-track execution
**Current Plan:** Track A (4/2 - 04-02 complete), Track B (5/4 COMPLETE), Track C (6/4 COMPLETE)

## Project Reference

See: .planning/PROJECT.md

**Core value:** Get something useful on screen fast enough to start speaking confidently during interviews

**Current focus:** Parallel track development - Tracks A/B/C running concurrently

## Progress

| Phase | Name | Track | Status | Plans |
|-------|------|-------|--------|-------|
| 1 | Foundation | -- | COMPLETE | 4/4 |
| 2 | Audio Pipeline | A | COMPLETE | 4/4 |
| 3 | Transcription | A | COMPLETE | 3/3 |
| 4 | LLM Integration | A | In Progress | 2/4 |
| 5 | Overlay UI | B | COMPLETE | 4/4 |
| 6 | Prompts & Settings | C | COMPLETE | 4/4 |
| 7 | Integration | -- | Pending | 0/0 |

**Overall:** 5/7 phases complete (Phase 3 complete, Phase 4 started)

**Parallel execution:** Tracks A/B/C running in parallel

```
[██████████████░     ] 70%
```

## Current Position

- **Phase:** Multi-track execution
- **Track A:** Phase 4 (LLM Integration) in progress - 04-02 complete
- **Track B:** Phase 5 COMPLETE - all overlay components integrated
- **Track C:** Phase 6 COMPLETE - settings and templates fully functional
- **Blocker:** None

## Performance Metrics

| Metric | Value |
|--------|-------|
| Plans completed | 20 |
| Requirements delivered | 15/44 |
| Phases completed | 5/7 |

## Accumulated Context

### Key Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| 7-phase structure with parallel tracks | Phase 1 first, then Tracks A/B/C in parallel, Phase 7 integrates | 2026-01-28 |
| Track A (2->3->4) sequential | Tight coupling: audio required for STT, STT required for LLM context | 2026-01-28 |
| Track B (Phase 5) parallel | Overlay UI uses mock data, doesn't need real pipeline | 2026-01-28 |
| Track C (Phase 6) parallel | Settings/Popup independent of overlay and pipeline | 2026-01-28 |
| Phase 7 Integration | Wire tracks together, resolve conflicts, E2E testing | 2026-01-28 |
| WXT 0.19.x for Node 18 compatibility | Latest WXT 0.20.x requires Node 20+, current env is Node 18 | 2026-01-29 |
| Tailwind v4 with CSS-first config | No tailwind.config.ts needed, uses @import "tailwindcss" | 2026-01-29 |
| Relative imports for WXT entrypoints | Path aliases cause vite-node resolution issues during build | 2026-01-29 |
| Type cast for Chrome 116+ APIs | @types/chrome incomplete for OFFSCREEN_DOCUMENT context type | 2026-01-29 |
| Shadow DOM via createShadowRootUi | CSS isolation from Google Meet page styles | 2026-01-29 |
| URL pattern for active meetings | Only inject on xxx-xxxx-xxx pattern, not landing/lobby pages | 2026-01-29 |
| Split AudioChunkMessage types | TypeScript narrowing failed with union, split into TabAudioChunkMessage and MicAudioChunkMessage | 2026-01-29 |
| Mic not connected to destination | Prevent audio feedback by not routing mic to speakers | 2026-01-29 |
| Separate AudioContext per capture | Mic and tab use independent AudioContexts at 16kHz | 2026-01-29 |
| PCM processor buffer size 1600 | 100ms at 16kHz sample rate for consistent chunk timing | 2026-01-29 |
| Vanilla JS for AudioWorklet | Worklet runs in separate thread without module resolution | 2026-01-29 |
| zustand@4 for webext-zustand | webext-zustand@0.2.0 peer dependency requires zustand@^4 | 2026-01-29 |
| webext-zustand type declarations | Package exports don't resolve TS types, manual .d.ts required | 2026-01-29 |
| crypto.randomUUID() for IDs | No uuid dependency needed, built-in browser API | 2026-01-29 |
| use-chrome-storage for overlay position | React hooks for chrome.storage.local persistence | 2026-01-29 |
| react-rnd for drag/resize | Single library combining react-draggable and react-resizable | 2026-01-29 |
| Tailwind v4 @theme inline for Shadow DOM | @property declarations don't work in Shadow DOM, need explicit px values | 2026-01-29 |
| Speaker colors: You=blue, Interviewer=purple | Color coding for quick speaker identification in transcript | 2026-01-29 |
| Fast hint green, full answer purple | Visual distinction between quick guidance and detailed response | 2026-01-29 |
| Status indicator with pulse animation | Visual feedback for pending/streaming states | 2026-01-29 |
| 500ms debounce on template textareas | Prevents excessive chrome.storage writes while typing | 2026-01-29 |
| Vertical stacked template layout | Popup 384px too narrow for side-by-side list/editor | 2026-01-29 |
| Tab audio passthrough via connect(destination) | Ensures interviewer remains audible during tab capture | 2026-01-29 |
| Switch statement for message handlers | TypeScript discriminated union narrowing works better with switch than if-chain | 2026-01-29 |
| Transparent glassmorphism overlay | bg-black/10 with backdrop-blur-md shows page content through overlay | 2026-01-29 |
| Small draggable AI button for minimized | 56x44 draggable button maintains position consistency | 2026-01-29 |
| Window resize listener for overlay | Repositions overlay within viewport on window resize | 2026-01-29 |
| btoa() for base64 encoding | Browser-native base64, no library needed for WebSocket audio | 2026-01-29 |
| Exponential backoff for WebSocket reconnect | 500ms base, max 5000ms, with jitter to prevent thundering herd | 2026-01-29 |
| Audio buffer max 100 chunks | ~6 seconds of audio buffered during WebSocket disconnect | 2026-01-29 |
| Speaker labels: You/Interviewer | 'You' for mic source, 'Interviewer' for tab source | 2026-01-29 |
| Forward audio in worklet handlers | Immediate forwarding when transcription active, no separate step | 2026-01-29 |
| Chronological insertion with splice | Maintain sorted order by timestamp in mergedTranscript | 2026-01-29 |
| Broadcast on each final entry | Immediate UI updates via TRANSCRIPT_UPDATE message | 2026-01-29 |
| eventsource-parser v3 API | EventSourceMessage type instead of ParsedEvent | 2026-01-29 |
| Four LLM message types | REQUEST/STREAM/STATUS/CANCEL for complete lifecycle | 2026-01-29 |
| Keep-alive interval 20s | Prevents Service Worker termination during long streaming | 2026-01-29 |
| AbortController per request | Enables individual request cancellation via responseId | 2026-01-29 |
| Dual parallel non-blocking streams | Fast and full models fire simultaneously for responsiveness | 2026-01-29 |

### Technical Notes

- Service Worker has 30-second idle timeout - use Offscreen Document for WebSocket
- tabCapture mutes tab audio by default - must route back through AudioContext
- CSP must allow wss://api.elevenlabs.io and https://openrouter.ai
- WXT entrypoints live in entrypoints/ directory
- Shared CSS in src/assets/app.css with Tailwind v4
- Message types use discriminated unions with isMessage type guard
- Service Worker event listeners must be registered synchronously at top level
- Offscreen document creation uses Promise tracking for race condition protection
- Content script uses /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i pattern
- createShadowRootUi with cssInjectionMode: 'ui' handles Shadow DOM CSS injection
- AudioWorklet processors must be vanilla JS in public/ folder
- Transferable ArrayBuffer for zero-copy audio chunk messages
- Zustand store uses chromeStorage adapter for chrome.storage.local persistence
- storeReadyPromise from wrapStore enables cross-context state sync
- useOverlayPosition hook handles -1 sentinel for default bottom-right positioning
- @theme inline provides px-based spacing, :host provides CSS variable fallbacks
- Mic capture uses getUserMedia with echoCancellation and noiseSuppression enabled
- Same pcm-processor.js reused for both tab and mic capture
- Overlay uses controlled react-rnd pattern with position/size from hook
- dragHandleClassName links OverlayHeader to Rnd drag behavior
- isLoaded guard prevents flash of default position on initial render
- TranscriptPanel uses useAutoScroll hook with entries.length as dependency
- Left border accent (border-l-2) pattern for visual section distinction
- Interim transcript results shown at 60% opacity with "..." indicator
- Template type badge colors: system-design=purple, coding=green, behavioral=orange, custom=gray
- useDebouncedCallback pattern for form fields with delayed store updates
- Overlay barrel export at src/overlay/index.ts for clean imports
- Minimized overlay button is draggable Rnd component, not fixed position
- Window resize event triggers boundary repositioning for overlay
- ElevenLabs WebSocket URL: wss://api.elevenlabs.io/v1/speech-to-text/realtime with query params
- VAD commit strategy with include_timestamps=true for ElevenLabs
- ElevenLabsConnection class handles reconnection lifecycle automatically
- Offscreen manages dual ElevenLabsConnection instances (tabTranscription, micTranscription)
- Service Worker maintains mergedTranscript[] and interimEntries Map for state
- Transcription lifecycle: START_TRANSCRIPTION -> TRANSCRIPTION_STARTED -> TRANSCRIPT_* -> STOP_TRANSCRIPTION
- LLM service at src/services/llm/ with barrel export for clean imports
- OpenRouter streaming uses eventsource-parser for SSE parsing
- buildPrompt() differentiates fast hint vs full answer via instruction appendage
- LLM message types: LLM_REQUEST, LLM_STREAM, LLM_STATUS, LLM_CANCEL
- handleLLMRequest() fires dual parallel streams via streamLLMResponse()
- activeAbortControllers Map enables per-request cancellation
- sendLLMMessageToMeet() broadcasts to all Google Meet tabs
- Keep-alive uses chrome.runtime.getPlatformInfo() as no-op to reset idle timer

### Open Questions

None at this time.

### Blockers

None at this time.

## Phase 1 Verification Results

All 5 success criteria verified:

| Criteria | Status |
|----------|--------|
| Extension loads via "Load unpacked" | PASS |
| Popup-to-ServiceWorker messaging | PASS |
| Content Script injects placeholder on Meet | PASS |
| Offscreen Document creation | PASS |
| No CSP errors | PASS |

## Phase 2 Verification Results

All 5 success criteria verified (human + automated):

| Criteria | Status |
|----------|--------|
| User clicks "Start" button and tab audio capture begins | PASS |
| User continues to hear tab audio normally (passthrough) | PASS |
| User's microphone is captured as separate stream | PASS |
| Console shows PCM audio chunks at 16kHz | PASS |
| Stopping capture releases all resources cleanly | PASS |

Requirements AUD-01 through AUD-05 complete.

## Phase 5 Verification Results

All 5 success criteria verified:

| Criteria | Status |
|----------|--------|
| Shadow DOM overlay on Google Meet page | PASS |
| Drag overlay to any position and persists | PASS |
| Resize overlay and size persists after refresh | PASS |
| Transparent blurred background shows page beneath | PASS |
| Minimize to draggable button and expand back | PASS |

Requirements UI-01 through UI-08 complete.

## Session Continuity

### Last Session

- **Date:** 2026-01-29
- **Activity:** Executed Phase 4 Plan 02 - LLM Message Types and Streaming Handler
- **Outcome:** 04-02 COMPLETE - Dual parallel streaming with keep-alive and cancellation

### Next Actions

1. Track A: Continue Phase 4 (LLM Integration) - execute 04-03 (LLM response handling in overlay)
2. Track B: Phase 5 COMPLETE - no further action needed
3. Track C: Phase 6 COMPLETE - no further action needed

---

*State initialized: 2026-01-28*
*Last updated: 2026-01-29*
