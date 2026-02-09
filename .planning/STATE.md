# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-09)

**Core value:** Get something useful on screen fast enough to start speaking confidently during interviews
**Current focus:** Milestone v2.0 Enhanced Experience — defining requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-02-09 — Milestone v2.0 started

## Performance Metrics

**Velocity:**
- Total plans completed: 37 (30 v1.0 + 7 v1.1)
- v1.0 shipped in 6 days (8 phases, 30 plans)
- v1.1 shipped in ~1 day (6 phases, 7 plans)

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.1 init]: Use chrome.runtime.id + stored salt for encryption key derivation (NOT browser fingerprints)
- [v1.1 init]: Message listener must register synchronously -- queue guard pattern for race condition (NOT delayed registration)
- [v1.1 init]: Only new dependency: idb@^8.0.3 (1.2KB) -- everything else uses native Chrome APIs
- [v1.1 init]: Salt stored in chrome.storage.local (simpler than IndexedDB for single value)
- [09-01]: Widened isMessage type guard constraint to { type: string } to support internal message types without union pollution
- [09-01]: InternalStartTranscriptionMessage kept out of ExtensionMessage union -- internal-only type
- [09-01]: webext-zustand filter must be first check in onMessage listener to prevent hydration deadlock
- [10-01]: Relative imports (not @/ alias) for src/services files -- WXT build fails to resolve @/ in that context
- [10-01]: Plaintext fallback on decryption failure enables seamless migration without explicit migration step
- [10-01]: Encryption init before store rehydration: encryptionService.initialize().then(() => storeReadyPromise)
- [11-01]: Direct chrome.storage.local writes for transcript buffer (not through encryption adapter -- ephemeral session data)
- [11-01]: 2-second debounce window for transcript persistence balances write frequency vs data loss risk
- [11-01]: Recovery flag (_transcription_active) checked during init chain after store hydration
- [12-01]: chrome.alarms for circuit recovery timeout (not setTimeout) -- survives SW restarts
- [12-01]: chrome.storage.session for circuit state persistence -- cleared on browser close
- [12-01]: Circuit breaker wraps AROUND streamWithRetry -- retries exhaust before circuit trips
- [12-01]: State change callback pattern avoids circular imports between manager and background.ts
- [12-01]: Init chain order: encryption -> circuit breaker rehydrate -> store hydration
- [13-01]: Plain Tailwind over prose classes -- project lacks @tailwindcss/typography plugin
- [13-01]: Consent fields NOT reset in onRehydrateStorage to prevent accidental consent loss on popup reopen
- [13-02]: PrivacyConsentModal replaces popup content via early return (not overlay/portal) for simplicity
- [13-02]: doStartCapture/handleStartCapture split keeps consent logic separate from capture implementation
- [13-02]: Inline PrivacyPolicyContent toggle in ConsentSettings satisfies always-accessible policy requirement
- [13-02]: RecordingConsentWarning placed after Audio Capture section for visual proximity to Start button
- [14-01]: ESLint 9 instead of 10 -- eslint-plugin-react-hooks only supports ^9
- [14-01]: Underscore prefix pattern for intentionally unused params (argsIgnorePattern: ^_)
- [14-01]: Overlay health issues refactored from useEffect+setState to useMemo (proper derived state)

### Pending Todos

See .planning/todos/pending/ for captured ideas.

### Blockers/Concerns

- None

## Session Continuity

Last session: 2026-02-09
Stopped at: Milestone v2.0 initialization — defining requirements
Resume file: .planning/ROADMAP.md
