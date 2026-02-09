---
phase: 12-circuit-breaker
plan: "01"
subsystem: circuit-breaker
tags: [reliability, circuit-breaker, api-protection, chrome-alarms, persistence]
dependency_graph:
  requires: [10-01-encryption]
  provides: [circuit-breaker-service, per-provider-isolation, alarm-recovery]
  affects: [background.ts, llm-requests, transcription-start]
tech_stack:
  added: []
  patterns: [circuit-breaker, state-machine, chrome-storage-session, chrome-alarms]
key_files:
  created:
    - src/services/circuitBreaker/types.ts
    - src/services/circuitBreaker/CircuitBreaker.ts
    - src/services/circuitBreaker/circuitBreakerManager.ts
  modified:
    - wxt.config.ts
    - entrypoints/background.ts
key_decisions:
  - "chrome.alarms for recovery timeout (not setTimeout) -- survives SW restarts"
  - "chrome.storage.session for state persistence -- cleared on browser close, survives SW restarts"
  - "State change callback pattern avoids circular imports between manager and background.ts"
  - "Circuit breaker wraps AROUND streamWithRetry (not inside retries) -- retries exhaust before circuit trips"
  - "Per-provider isolation: openai, openrouter, elevenlabs each have independent circuits"
metrics:
  duration: "4min"
  completed: "2026-02-08"
---

# Phase 12 Plan 01: Circuit Breaker Pattern Summary

Circuit breaker state machine (CLOSED/OPEN/HALF_OPEN) with chrome.storage.session persistence and chrome.alarms-based recovery, protecting openai/openrouter/elevenlabs APIs with per-provider isolation.

## Performance

- **Duration:** ~4 minutes
- **Started:** 2026-02-08T16:06:08Z
- **Completed:** 2026-02-08T16:09:57Z
- **Tasks:** 2/2
- **Files created:** 3
- **Files modified:** 2

## Accomplishments

1. **CircuitBreaker state machine** -- CLOSED/OPEN/HALF_OPEN with configurable failure threshold (3), recovery timeout (60s LLM, 30s STT), and half-open success threshold (1)
2. **chrome.storage.session persistence** -- Circuit state survives service worker restarts without outlasting browser session
3. **chrome.alarms recovery** -- Reliable OPEN-to-HALF_OPEN transition using MV3-safe alarms (not setTimeout)
4. **Per-provider circuit breakers** -- Independent openai, openrouter, elevenlabs instances via circuitBreakerManager
5. **Background.ts integration** -- Circuit checks before LLM streamWithRetry and START_TRANSCRIPTION; success/failure recording at Promise level
6. **HealthIndicator broadcasting** -- State changes emit CONNECTION_STATE (OPEN=error, HALF_OPEN=reconnecting, CLOSED=connected)
7. **Init chain ordering** -- Rehydration runs after encryption init, before store hydration

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create CircuitBreaker service | 085f926 | types.ts, CircuitBreaker.ts, circuitBreakerManager.ts, wxt.config.ts |
| 2 | Integrate into background.ts | 3446a15 | entrypoints/background.ts |

## Files Created

- `src/services/circuitBreaker/types.ts` -- CircuitState enum, CircuitBreakerConfig, PersistedCircuitState interfaces
- `src/services/circuitBreaker/CircuitBreaker.ts` -- State machine with persistence and alarm-based recovery (~140 lines)
- `src/services/circuitBreaker/circuitBreakerManager.ts` -- Per-service instances, alarm listener, rehydrate, state change callback (~100 lines)

## Files Modified

- `wxt.config.ts` -- Added 'alarms' to manifest permissions array
- `entrypoints/background.ts` -- Circuit breaker imports, state change callback, rehydration in init chain, LLM and transcription circuit checks

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| chrome.alarms for recovery | setTimeout doesn't survive SW restarts in MV3 |
| chrome.storage.session for persistence | Auto-cleared on browser close; survives SW restarts |
| State change callback pattern | Avoids circular imports between manager and background.ts |
| Wrap AROUND streamWithRetry | Retries exhaust first, then circuit trips -- avoids premature circuit opening |
| Per-provider isolation | OpenAI outage shouldn't block OpenRouter or ElevenLabs |

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

- Pre-existing TypeScript error in `src/store/index.ts` (missing ConsentSlice from phase 13 compliance UI) -- not related to circuit breaker changes, ignored

## Next Phase Readiness

- Phase 12 is complete
- No blockers for Phase 13 (Compliance UI)
- Circuit breaker is fully operational and will protect all API calls immediately

## Self-Check: PASSED

- FOUND: `src/services/circuitBreaker/types.ts`
- FOUND: `src/services/circuitBreaker/CircuitBreaker.ts`
- FOUND: `src/services/circuitBreaker/circuitBreakerManager.ts`
- FOUND: Task 1 commit `085f926`
- FOUND: Task 2 commit `3446a15`
- BUILD: `wxt build` succeeds
- MANIFEST: `alarms` permission present in built manifest
