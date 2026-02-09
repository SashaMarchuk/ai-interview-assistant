---
phase: 17-cost-tracking-capture
plan: 02
subsystem: ui
tags: [cost-display, session-cost, overlay, response-panel, custom-events]

# Dependency graph
requires:
  - phase: 17-cost-tracking-capture
    plan: 01
    provides: LLM_COST message type, cost fields on LLMResponse, background service worker broadcasting
provides:
  - Content script LLM_COST handler that updates LLMResponse cost fields and session total
  - Per-request cost badge in ResponsePanel with fast/full breakdown tooltip
  - Session cost total display in Overlay footer
  - SessionCostEventDetail custom event interface for cross-component communication
affects: [18 (cost analytics/IndexedDB storage), popup (future cost dashboard)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Custom event bridge pattern for session cost (content script -> Overlay via window events)"
    - "Adaptive cost formatting: 4 decimals for sub-cent, 3 for larger amounts"

key-files:
  created: []
  modified:
    - entrypoints/content.tsx
    - src/overlay/ResponsePanel.tsx
    - src/overlay/Overlay.tsx

key-decisions:
  - "SessionCostEventDetail defined locally in content.tsx (not imported from shared types) to avoid circular imports"
  - "Session cost tracked in-memory (module-level variable), resets on page reload -- intentional for interview session scope"
  - "Cost badge uses title attribute for fast/full breakdown tooltip rather than a separate UI element"

patterns-established:
  - "Session-scoped accumulator pattern: module-level variable + custom event dispatch for cross-component updates"

# Metrics
duration: 2min
completed: 2026-02-09
---

# Phase 17 Plan 02: Cost Display UI Summary

**Per-request cost badge in ResponsePanel and running session cost total in Overlay footer via LLM_COST message handler in content script**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-09T11:49:30Z
- **Completed:** 2026-02-09T11:51:08Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Content script handles LLM_COST messages and updates per-model costs (fastCostUSD, fullCostUSD, totalCostUSD) on current LLM response
- Per-request cost badge displays next to status indicator with hover tooltip showing fast/full model breakdown
- Session cost total in Overlay footer accumulates across multiple requests and resets on page reload
- Adaptive cost formatting: 4 decimal places for sub-cent costs (typical), 3 for larger amounts

## Task Commits

Each task was committed atomically:

1. **Task 1: Content script LLM_COST handler and session cost tracking** - `5a914a5` (feat)
2. **Task 2: ResponsePanel cost badge and Overlay session cost footer** - `f85c6f3` (feat)

## Files Created/Modified
- `entrypoints/content.tsx` - Added handleLLMCost function, sessionCostUSD accumulator, SessionCostEventDetail interface, LLM_COST case in message switch
- `src/overlay/ResponsePanel.tsx` - Added per-request cost badge with tooltip in response header
- `src/overlay/Overlay.tsx` - Added session cost state, session-cost-update event listener, session cost display in footer

## Decisions Made
- SessionCostEventDetail defined locally in content.tsx to avoid circular imports (Overlay defines type inline for the event listener)
- Session cost tracked as in-memory module-level variable -- resets on page reload, which aligns with interview session scope
- Cost badge uses HTML title attribute for fast/full breakdown tooltip -- lightweight, no extra UI complexity

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full cost tracking pipeline complete: API response -> usage extraction -> cost calculation -> LLM_COST broadcast -> content script handler -> UI display
- Ready for Phase 18: cost analytics with IndexedDB storage for historical cost data
- Session cost and per-request cost data visible to users during interviews

## Self-Check: PASSED

All 3 modified files verified on disk. Both task commits (5a914a5, f85c6f3) verified in git log. TypeScript compiles cleanly (npx tsc --noEmit: 0 errors).

---
*Phase: 17-cost-tracking-capture*
*Completed: 2026-02-09*
