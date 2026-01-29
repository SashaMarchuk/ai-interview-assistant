# Requirements: AI Interview Assistant

**Defined:** 2026-01-28
**Core Value:** Get something useful on screen fast enough to start speaking confidently during interviews

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Audio Capture

- [x] **AUD-01**: Extension captures audio from browser tab via tabCapture API
- [x] **AUD-02**: Extension captures user's microphone as separate stream
- [x] **AUD-03**: Tab audio remains audible to user while capturing (passthrough)
- [x] **AUD-04**: Audio converted to PCM 16-bit 16kHz via AudioWorklet
- [x] **AUD-05**: User gesture required from popup to initiate capture

### Transcription

- [ ] **STT-01**: Real-time streaming transcription with < 500ms latency
- [ ] **STT-02**: Partial/interim results displayed before finalization
- [ ] **STT-03**: Speaker diarization for tab audio (Speaker 0, 1, 2...)
- [ ] **STT-04**: Microphone stream labeled as "Me" in transcript
- [ ] **STT-05**: Tab and mic transcripts merged by timestamp
- [ ] **STT-06**: WebSocket connection to ElevenLabs maintained via Offscreen Document

### LLM Integration

- [ ] **LLM-01**: Dual parallel LLM requests on hotkey trigger (fast + full)
- [ ] **LLM-02**: Fast response streams 1-2 sentence hint
- [ ] **LLM-03**: Full response streams comprehensive answer
- [ ] **LLM-04**: Both responses stream to overlay simultaneously
- [ ] **LLM-05**: Context variables work in prompts ($highlighted, $recent, $transcript)
- [ ] **LLM-06**: OpenRouter API with SSE streaming

### Hotkey System

- [ ] **KEY-01**: Hold-to-capture mode (press and hold, release to send) as default
- [ ] **KEY-02**: Highlight-to-send mode (select transcript text, press key to send)
- [ ] **KEY-03**: Toggle mode available in settings (press to start/stop capture)
- [ ] **KEY-04**: Visual indicator when capture is active
- [ ] **KEY-05**: Captured text extracted and sent to LLM pipeline

### Overlay UI

- [ ] **UI-01**: Floating overlay injected via Shadow DOM
- [ ] **UI-02**: Overlay draggable to any screen position
- [ ] **UI-03**: Overlay resizable with size persisted between sessions
- [ ] **UI-04**: Transparent background with blur effect
- [ ] **UI-05**: Minimize/expand toggle to collapse overlay
- [ ] **UI-06**: Live transcript panel with speaker labels
- [ ] **UI-07**: Dual response panel (fast hint + full answer)
- [ ] **UI-08**: Auto-scroll follows new transcript text

### Prompt System

- [ ] **PRM-01**: Multiple saved prompt templates (System Design, Coding, Behavioral, custom)
- [ ] **PRM-02**: Variable substitution in prompts ($highlighted, $recent, $transcript)
- [ ] **PRM-03**: Per-template model override (different models for different templates)
- [ ] **PRM-04**: Template switching during active session
- [ ] **PRM-05**: Default templates provided on first install

### Settings

- [ ] **SET-01**: API key management for ElevenLabs and OpenRouter
- [ ] **SET-02**: Model selection for fast and full response models
- [ ] **SET-03**: Hotkey customization (change default bindings)
- [ ] **SET-04**: Blur level adjustment for overlay transparency
- [ ] **SET-05**: Settings persisted via chrome.storage.local

### Infrastructure

- [x] **INF-01**: Chrome MV3 extension with Service Worker
- [x] **INF-02**: Offscreen Document for WebSocket connections
- [x] **INF-03**: Message passing between SW, Content Script, Offscreen, Popup
- [x] **INF-04**: Proper CSP configuration for external WebSocket/API connections

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Session Management

- **SESS-01**: Session history stored locally
- **SESS-02**: Export transcript to TXT format
- **SESS-03**: Export transcript to JSON format
- **SESS-04**: Search through past sessions

### Enhanced Features

- **ENH-01**: Copy answer to clipboard with one click
- **ENH-02**: Keyboard shortcuts for copy operations
- **ENH-03**: Custom themes (dark/light mode)
- **ENH-04**: Audio recording option (opt-in)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Additional STT providers (Whisper, AssemblyAI) | ElevenLabs sufficient for v1, reduces complexity |
| TTS audio feedback | Not needed for interview use case |
| Mobile support | tabCapture API not available on mobile |
| Server-side components | Fully client-side for privacy |
| Screen share invisibility mode | High complexity, ethical concerns, detection tools exist |
| Chrome Web Store distribution | Private use only |
| Auto language detection display | Implicit with ElevenLabs, not user-facing feature |
| Built-in mock interview system | Different product category |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INF-01 | Phase 1 | Complete |
| INF-02 | Phase 1 | Complete |
| INF-03 | Phase 1 | Complete |
| INF-04 | Phase 1 | Complete |
| AUD-01 | Phase 2 | Complete |
| AUD-02 | Phase 2 | Complete |
| AUD-03 | Phase 2 | Complete |
| AUD-04 | Phase 2 | Complete |
| AUD-05 | Phase 2 | Complete |
| STT-01 | Phase 3 | Pending |
| STT-02 | Phase 3 | Pending |
| STT-03 | Phase 3 | Pending |
| STT-04 | Phase 3 | Pending |
| STT-05 | Phase 3 | Pending |
| STT-06 | Phase 3 | Pending |
| LLM-01 | Phase 4 | Pending |
| LLM-02 | Phase 4 | Pending |
| LLM-03 | Phase 4 | Pending |
| LLM-04 | Phase 4 | Pending |
| LLM-05 | Phase 4 | Pending |
| LLM-06 | Phase 4 | Pending |
| KEY-01 | Phase 4 | Pending |
| KEY-02 | Phase 4 | Pending |
| KEY-03 | Phase 4 | Pending |
| KEY-04 | Phase 4 | Pending |
| KEY-05 | Phase 4 | Pending |
| UI-01 | Phase 5 | Pending |
| UI-02 | Phase 5 | Pending |
| UI-03 | Phase 5 | Pending |
| UI-04 | Phase 5 | Pending |
| UI-05 | Phase 5 | Pending |
| UI-06 | Phase 5 | Pending |
| UI-07 | Phase 5 | Pending |
| UI-08 | Phase 5 | Pending |
| PRM-01 | Phase 6 | Pending |
| PRM-02 | Phase 6 | Pending |
| PRM-03 | Phase 6 | Pending |
| PRM-04 | Phase 6 | Pending |
| PRM-05 | Phase 6 | Pending |
| SET-01 | Phase 6 | Pending |
| SET-02 | Phase 6 | Pending |
| SET-03 | Phase 6 | Pending |
| SET-04 | Phase 6 | Pending |
| SET-05 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 44 total
- Mapped to phases: 44
- Unmapped: 0

---
*Requirements defined: 2026-01-28*
*Last updated: 2026-01-29 — Phase 2 complete (AUD-01 through AUD-05)*
