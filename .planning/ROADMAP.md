# Roadmap: AI Interview Assistant

**Created:** 2026-01-28
**Phases:** 7 (3 parallel tracks + integration)
**Requirements:** 44 mapped
**Depth:** Comprehensive
**Execution:** Parallel tracks supported

## Overview

This roadmap delivers a Chrome MV3 extension providing real-time transcription and dual parallel LLM responses during technical interviews.

**Execution model:** Phase 1 runs first (foundation). Then 3 parallel tracks can run simultaneously in separate terminals. Phase 7 integrates everything.

```
Phase 1 (Foundation) ─── SEQUENTIAL, FIRST
         │
         ├──→ Track A: Phase 2→3→4 (Audio→STT→LLM)  ← Terminal 1
         ├──→ Track B: Phase 5 (Overlay UI)          ← Terminal 2
         └──→ Track C: Phase 6 (Settings/Prompts)    ← Terminal 3
                        │
                        ↓
              Phase 7 (Integration) ─── SEQUENTIAL, LAST
```

**Folder ownership (prevents git conflicts):**
| Track | Folders |
|-------|---------|
| A (Pipeline) | `src/background/`, `src/offscreen/`, `src/services/`, `src/adapters/` |
| B (Overlay) | `src/overlay/`, `src/content/` |
| C (Settings) | `src/popup/`, `src/store/` |
| Shared | `src/types/`, `src/utils/` (coordinate changes) |

| Phase | Track | Name | Goal | Requirements |
|-------|-------|------|------|--------------|
| 1 | — | Foundation | Extension loads and components communicate | INF-01, INF-02, INF-03, INF-04 |
| 2 | A | Audio Pipeline | Tab and microphone audio captured as PCM chunks | AUD-01, AUD-02, AUD-03, AUD-04, AUD-05 |
| 3 | A | Transcription | Live speech-to-text with speaker labels | STT-01, STT-02, STT-03, STT-04, STT-05, STT-06 |
| 4 | A | LLM Integration | Hotkey triggers dual parallel AI responses | LLM-01, LLM-02, LLM-03, LLM-04, LLM-05, LLM-06, KEY-01, KEY-02, KEY-03, KEY-04, KEY-05 |
| 5 | B | Overlay UI | Floating interface with mock data | UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07, UI-08 |
| 6 | C | Prompts & Settings | User configures API keys, models, and prompt templates | PRM-01, PRM-02, PRM-03, PRM-04, PRM-05, SET-01, SET-02, SET-03, SET-04, SET-05 |
| 7 | — | Integration | Wire all tracks together, resolve conflicts, E2E test | — |

---

## Phase Details

### Phase 1: Foundation

**Goal:** Extension loads successfully with working message passing between Service Worker, Content Script, Offscreen Document, and Popup.

**Requirements:**
- INF-01: Chrome MV3 extension with Service Worker
- INF-02: Offscreen Document for WebSocket connections
- INF-03: Message passing between SW, Content Script, Offscreen, Popup
- INF-04: Proper CSP configuration for external WebSocket/API connections

**Success Criteria:**
1. User can install extension via "Load unpacked" and see popup when clicking extension icon
2. Popup can send message to Service Worker and receive response
3. Content Script can inject placeholder UI into Google Meet page
4. Offscreen Document can be created and communicates with Service Worker
5. Extension console shows no CSP errors when loading

**Dependencies:** None

**Research flag:** Standard patterns, no deep research needed

**Plans:** 4 plans

Plans:
- [x] 01-01-PLAN.md — Initialize WXT project with React, TypeScript, Tailwind
- [x] 01-02-PLAN.md — Implement Service Worker, Popup with message passing
- [x] 01-03-PLAN.md — Implement Offscreen Document and Content Script overlay
- [x] 01-04-PLAN.md — Verify extension loads and all components communicate

---

### Phase 2: Audio Pipeline

**Goal:** User clicks start and tab audio is captured as PCM chunks flowing through AudioWorklet while audio remains audible.

**Requirements:**
- AUD-01: Extension captures audio from browser tab via tabCapture API
- AUD-02: Extension captures user's microphone as separate stream
- AUD-03: Tab audio remains audible to user while capturing (passthrough)
- AUD-04: Audio converted to PCM 16-bit 16kHz via AudioWorklet
- AUD-05: User gesture required from popup to initiate capture

**Success Criteria:**
1. User can click "Start" button in popup and tab audio capture begins
2. User continues to hear tab audio normally (no muting occurs)
3. User's microphone is captured as a separate audio stream
4. Console logs show PCM audio chunks being generated at 16kHz
5. Stopping capture releases all audio resources cleanly

**Dependencies:** Phase 1 (message passing, Offscreen Document)

**Research flag:** HIGH PRIORITY - Complex Chrome APIs, AudioWorklet specifics, Offscreen Document lifecycle

**Plans:** 4 plans

Plans:
- [ ] 02-01-PLAN.md — Message types and PCM AudioWorklet processor
- [ ] 02-02-PLAN.md — Tab audio capture with passthrough in Offscreen Document
- [ ] 02-03-PLAN.md — Microphone capture as separate stream
- [ ] 02-04-PLAN.md — Popup Start/Stop UI and end-to-end verification

---

### Phase 3: Transcription

**Goal:** User speaks or interviewer speaks and live transcript appears with speaker differentiation.

**Requirements:**
- STT-01: Real-time streaming transcription with < 500ms latency
- STT-02: Partial/interim results displayed before finalization
- STT-03: Speaker diarization for tab audio (Speaker 0, 1, 2...)
- STT-04: Microphone stream labeled as "Me" in transcript
- STT-05: Tab and mic transcripts merged by timestamp
- STT-06: WebSocket connection to ElevenLabs maintained via Offscreen Document

**Success Criteria:**
1. User sees transcript text appearing within 500ms of spoken words
2. Partial (interim) text shows in a distinct style before finalizing
3. Tab audio transcript shows speaker labels (Speaker 1, Speaker 2)
4. User's own speech appears labeled as "Me" in transcript
5. Tab and microphone transcripts appear interlaced chronologically

**Dependencies:** Phase 2 (audio PCM chunks flowing)

**Research flag:** Standard patterns, ElevenLabs API well-documented

---

### Phase 4: LLM Integration

**Goal:** User holds hotkey to capture question, releases to get fast hint immediately plus comprehensive answer streaming.

**Requirements:**
- LLM-01: Dual parallel LLM requests on hotkey trigger (fast + full)
- LLM-02: Fast response streams 1-2 sentence hint
- LLM-03: Full response streams comprehensive answer
- LLM-04: Both responses stream to overlay simultaneously
- LLM-05: Context variables work in prompts ($highlighted, $recent, $transcript)
- LLM-06: OpenRouter API with SSE streaming
- KEY-01: Hold-to-capture mode (press and hold, release to send) as default
- KEY-02: Highlight-to-send mode (select transcript text, press key to send)
- KEY-03: Toggle mode available in settings (press to start/stop capture)
- KEY-04: Visual indicator when capture is active
- KEY-05: Captured text extracted and sent to LLM pipeline

**Success Criteria:**
1. User can hold hotkey and see visual indicator that capture is active
2. User releases hotkey and fast hint appears within 2-3 seconds
3. Full comprehensive answer streams in simultaneously alongside fast hint
4. User can highlight transcript text and press hotkey to send that specific text
5. Both responses complete successfully with clear end-of-stream indication

**Dependencies:** Phase 3 (transcript text available for LLM context)

**Research flag:** MEDIUM PRIORITY - Dual parallel SSE streams, cancellation handling

---

### Phase 5: Overlay UI (Track B — can run parallel)

**Goal:** User sees professional floating overlay with transcript and dual response panels that can be positioned and resized. Uses mock data during development.

**Requirements:**
- UI-01: Floating overlay injected via Shadow DOM
- UI-02: Overlay draggable to any screen position
- UI-03: Overlay resizable with size persisted between sessions
- UI-04: Transparent background with blur effect
- UI-05: Minimize/expand toggle to collapse overlay
- UI-06: Live transcript panel with speaker labels
- UI-07: Dual response panel (fast hint + full answer)
- UI-08: Auto-scroll follows new transcript text

**Success Criteria:**
1. User sees floating overlay on Google Meet page isolated from page styles
2. User can drag overlay to any screen position and it stays there
3. User can resize overlay and size persists after page refresh
4. Overlay has transparent blurred background that shows page beneath
5. User can minimize overlay to small bar and expand it back

**Dependencies:** Phase 1 only (content script injection)

**Parallel execution notes:**
- Build with mock transcript data and mock LLM responses
- Define clear interfaces for real data (hooked up in Phase 7)
- Folder ownership: `src/overlay/`, `src/content/`

**Research flag:** Standard patterns, Shadow DOM CSS isolation

**Plans:** 4 plans

Plans:
- [ ] 05-01-PLAN.md — Install deps, create types, hooks, Tailwind Shadow DOM fixes
- [ ] 05-02-PLAN.md — Overlay container with react-rnd drag/resize
- [ ] 05-03-PLAN.md — TranscriptPanel and ResponsePanel components
- [ ] 05-04-PLAN.md — Integration with mock data and visual verification

---

### Phase 6: Prompts & Settings (Track C — can run parallel)

**Goal:** User configures API keys, selects models, and switches between prompt templates for different interview types.

**Requirements:**
- PRM-01: Multiple saved prompt templates (System Design, Coding, Behavioral, custom)
- PRM-02: Variable substitution in prompts ($highlighted, $recent, $transcript)
- PRM-03: Per-template model override (different models for different templates)
- PRM-04: Template switching during active session
- PRM-05: Default templates provided on first install
- SET-01: API key management for ElevenLabs and OpenRouter
- SET-02: Model selection for fast and full response models
- SET-03: Hotkey customization (change default bindings)
- SET-04: Blur level adjustment for overlay transparency
- SET-05: Settings persisted via chrome.storage.local

**Success Criteria:**
1. User can enter API keys for ElevenLabs and OpenRouter in settings
2. User can select different models for fast hint vs full answer
3. User can switch between System Design, Coding, and Behavioral templates
4. User can create and save custom prompt templates
5. All settings persist across browser sessions

**Dependencies:** Phase 1 only (popup, chrome.storage)

**Parallel execution notes:**
- Popup settings panel is independent of overlay
- Define Zustand store interfaces for settings (consumed by pipeline in Phase 7)
- Folder ownership: `src/popup/`, `src/store/`

**Research flag:** Standard patterns, chrome.storage API straightforward

**Plans:** 4 plans

Plans:
- [ ] 06-01-PLAN.md — Zustand store with settings slice, templates slice, chrome.storage persistence
- [ ] 06-02-PLAN.md — Settings UI (API keys, models, hotkeys, blur level)
- [ ] 06-03-PLAN.md — Template Manager UI (list, editor, CRUD operations)
- [ ] 06-04-PLAN.md — Human verification of complete settings flow

---

### Phase 7: Integration

**Goal:** Wire all parallel tracks together, resolve any conflicts, and verify end-to-end functionality.

**Requirements:**
- No new requirements — this phase connects existing implementations

**What gets integrated:**
1. **Pipeline → Overlay:** Real transcript data replaces mock data in UI
2. **Pipeline → Settings:** LLM service reads API keys and model selection from store
3. **Overlay → Settings:** Blur level and hotkey bindings applied to overlay
4. **Hotkeys → Pipeline → Overlay:** Full flow from capture to response display

**Success Criteria:**
1. Start recording → see real transcript in overlay (not mock)
2. Hold hotkey → release → see real LLM responses streaming
3. Change API keys in settings → pipeline uses new keys
4. Change blur level → overlay updates immediately
5. Full end-to-end flow works on Google Meet

**Dependencies:** Phases 4, 5, 6 all complete

**Tasks:**
1. Resolve any git conflicts from parallel development
2. Connect Zustand store subscriptions across components
3. Replace mock data providers with real data sources
4. Integration testing on Google Meet
5. Fix any interface mismatches between tracks

**Research flag:** None — integration work

---

## Progress

| Phase | Track | Status | Plans |
|-------|-------|--------|-------|
| 1 - Foundation | — | ✓ Complete | 4/4 |
| 2 - Audio Pipeline | A | ○ Pending | 0/4 |
| 3 - Transcription | A | ○ Pending | 0/0 |
| 4 - LLM Integration | A | ○ Pending | 0/0 |
| 5 - Overlay UI | B | ○ Planned | 0/4 |
| 6 - Prompts & Settings | C | ○ Planned | 0/4 |
| 7 - Integration | — | ○ Pending | 0/0 |

**Parallel execution:** After Phase 1, run Tracks A/B/C in separate terminals. Phase 7 runs after all tracks complete.

---

## Coverage Validation

All 44 v1 requirements mapped to exactly one phase:

| Category | Count | Phase | Track |
|----------|-------|-------|-------|
| Infrastructure (INF) | 4 | Phase 1 | — |
| Audio Capture (AUD) | 5 | Phase 2 | A |
| Transcription (STT) | 6 | Phase 3 | A |
| LLM Integration (LLM) | 6 | Phase 4 | A |
| Hotkey System (KEY) | 5 | Phase 4 | A |
| Overlay UI (UI) | 8 | Phase 5 | B |
| Prompt System (PRM) | 5 | Phase 6 | C |
| Settings (SET) | 5 | Phase 6 | C |

**Total:** 44/44 requirements mapped

**Phase 7 (Integration):** No new requirements — connects implementations from Tracks A/B/C

---

## Parallel Execution Guide

**Step 1:** Complete Phase 1 (Foundation) — all tracks need this

**Step 2:** Open 3 terminals and run in parallel:
```
Terminal 1: /gsd:plan-phase 2  →  /gsd:plan-phase 3  →  /gsd:plan-phase 4
Terminal 2: /gsd:plan-phase 5
Terminal 3: /gsd:plan-phase 6
```

**Step 3:** Before starting each phase, pull latest:
```bash
git pull --rebase
```

**Step 4:** After all 3 tracks complete, run:
```
/gsd:plan-phase 7
```

**Conflict prevention:** Each track owns specific folders. Avoid editing `src/types/` or `src/utils/` without coordination.

---

*Roadmap created: 2026-01-28*
*Last updated: 2026-01-29 — Phases 5 and 6 planned*
