# Phase 7: Integration - Context

**Gathered:** 2026-01-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire all parallel tracks (A, B, C) together, resolve any conflicts, and verify end-to-end functionality. No new features — this phase connects existing implementations:
- Pipeline → Overlay (real transcript replaces mock data)
- Pipeline → Settings (LLM reads API keys and models from store)
- Overlay → Settings (blur level, hotkeys applied)
- Hotkeys → Pipeline → Overlay (full capture-to-response flow)

</domain>

<decisions>
## Implementation Decisions

### Conflict Resolution
- Interface mismatches between tracks: Claude resolves case-by-case based on what makes more sense
- Shared file conflicts (src/types/, src/utils/): Claude determines best merge strategy per file
- Commit granularity: One commit per integration point (transcript wiring, LLM wiring, settings wiring — separate commits)
- Bugs discovered during integration: Fix minor bugs immediately, document major bugs for later

### Data Flow Wiring
- Transcript data to overlay: Claude decides approach (message passing vs Zustand store sync)
- Settings changes (API key, model): Require session restart to apply new values
- Loading state: Show spinner while waiting for real data connection
- Blur level setting: Live update as user drags slider
- Template switching: Keep existing LLM responses until new hotkey press
- Hotkey customization: Apply immediately without page refresh
- Transcript persistence: Survives page refresh during meeting (stored in background)
- Tab return behavior: Resume capture automatically when user returns to Meet tab

### Fallback Behavior
- Missing ElevenLabs API key: Allow start without STT, show warning
- Missing OpenRouter API key: Allow start without LLM (transcription only)
- WebSocket disconnect (STT): Show reconnecting indicator on UI
- LLM request failure: Show error immediately, auto-retry, show retry indicator on UI
- Microphone permission denied: Tab capture still works, show issue indicator on UI
- Model unavailable: Fallback to default model with notice
- Health indicator: Only visible when there are issues (not always on)
- Both API keys missing: Overlay shows "Configure API keys" setup prompt

### Claude's Discretion
- Specific data flow mechanism (messages vs store)
- Technical merge strategies for conflicts
- Error message wording
- Retry timing and backoff logic

</decisions>

<specifics>
## Specific Ideas

- User expects graceful degradation — extension should work partially even if some services unavailable
- Visual feedback is important — user should always know what's happening (reconnecting, retrying, missing config)
- Live updates for visual settings (blur), but require restart for critical settings (API keys, models)

</specifics>

<deferred>
## Deferred Ideas

- **Code review** — systematic code quality review (separate phase)
- **Code optimization** — performance improvements (separate phase)
- **Automated tests** — test suite creation (separate phase)

</deferred>

---

*Phase: 07-integration*
*Context gathered: 2026-01-30*
