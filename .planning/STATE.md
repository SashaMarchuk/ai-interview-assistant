# Project State

**Last Updated:** 2026-01-29
**Current Phase:** Multi-track execution
**Current Plan:** Track A (2/3 complete), Track B (5/3 complete), Track C (6/3 complete)

## Project Reference

See: .planning/PROJECT.md

**Core value:** Get something useful on screen fast enough to start speaking confidently during interviews

**Current focus:** Parallel track development - Tracks A/B/C running concurrently

## Progress

| Phase | Name | Track | Status | Plans |
|-------|------|-------|--------|-------|
| 1 | Foundation | -- | COMPLETE | 4/4 |
| 2 | Audio Pipeline | A | In Progress | 2/4 |
| 3 | Transcription | A | Pending | 0/0 |
| 4 | LLM Integration | A | Pending | 0/0 |
| 5 | Overlay UI | B | In Progress | 3/? |
| 6 | Prompts & Settings | C | In Progress | 3/? |
| 7 | Integration | -- | Pending | 0/0 |

**Overall:** 1/7 phases complete

**Parallel execution:** Tracks A/B/C running in parallel

```
[██████              ] 30%
```

## Current Position

- **Phase:** Multi-track execution
- **Track A:** Phase 2, Plan 3 complete (Microphone Capture)
- **Track B:** Phase 5, Plan 3 complete (Content Panels)
- **Track C:** Phase 6, Plan 3 complete (Template Manager UI)
- **Blocker:** None

## Performance Metrics

| Metric | Value |
|--------|-------|
| Plans completed | 12 |
| Requirements delivered | 5/44 (Phase 1 success criteria) |
| Phases completed | 1/7 |

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

## Session Continuity

### Last Session

- **Date:** 2026-01-29
- **Activity:** Completed 06-03-PLAN.md (Template Manager UI)
- **Outcome:** Template list/editor UI integrated into popup Templates tab

### Next Actions

1. Track A: Continue Phase 2 Plan 04 (Audio Control & Integration)
2. Track B: Continue Phase 5 (Overlay components)
3. Track C: Phase 6 Template Manager complete - check for remaining plans

---

*State initialized: 2026-01-28*
*Last updated: 2026-01-29*
