---
phase: 18-cost-dashboard
plan: 01
subsystem: database
tags: [indexeddb, cost-tracking, aggregation, service-worker]

# Dependency graph
requires:
  - phase: 17-cost-tracking-capture
    provides: "In-memory cost calculation via onUsage callback and calculateCost()"
provides:
  - "CostRecord type with provider/model/session/token/cost fields"
  - "IndexedDB wrapper (costDb.ts) with lazy opening, CRUD, indexed queries"
  - "Aggregation helpers for daily, provider, model, and session groupings"
  - "Background service worker IndexedDB cost persistence on every LLM completion"
  - "Session ID lifecycle tied to START_CAPTURE / STOP_CAPTURE"
affects: [18-02-cost-dashboard-ui, cost-visualization, popup]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Lazy IndexedDB connection caching in service worker", "Fire-and-forget IndexedDB writes in streaming callback", "Map-based accumulation for data aggregation"]

key-files:
  created:
    - src/services/costHistory/types.ts
    - src/services/costHistory/costDb.ts
    - src/services/costHistory/aggregation.ts
  modified:
    - entrypoints/background.ts

key-decisions:
  - "Native IndexedDB API (no idb library) -- zero dependencies, simple CRUD needs"
  - "Lazy database opening to handle SW lifecycle (IndexedDB not available during initialization)"
  - "Fire-and-forget saveCostRecord with .catch() -- non-blocking, doesn't affect LLM streaming"
  - "Session ID as module-level variable, generated on START_CAPTURE, cleared on STOP_CAPTURE"
  - "Fallback adhoc session ID for cost records outside capture sessions"
  - "ProviderId type reused from LLMProvider.ts to keep provider union consistent"

patterns-established:
  - "IndexedDB lazy connection pattern: cache dbPromise at module level, open on first call, reset on error"
  - "Cost aggregation as pure functions taking CostRecord[] -- composable and testable"
  - "Session ID lifecycle tied to capture state machine in background.ts"

# Metrics
duration: 8min
completed: 2026-02-09
---

# Phase 18 Plan 01: Cost History Data Layer Summary

**IndexedDB persistence layer for LLM cost records with lazy connection, CRUD operations, aggregation helpers, and background service worker integration**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-09T12:43:49Z
- **Completed:** 2026-02-09T12:52:07Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- CostRecord type defined with all required fields: id, timestamp, sessionId, provider, modelId, modelSlot, token counts, and costUSD
- IndexedDB wrapper with lazy database opening, 6 exported functions (saveCostRecord, getCostRecordsSince, getAllCostRecords, deleteRecordsBefore, clearAllRecords, getRecordCount), and 4 indexes (timestamp, provider, model, session)
- Four aggregation helpers (aggregateByDay, aggregateByProvider, aggregateByModel, aggregateBySessions) using Map-based accumulation with proper sorting
- Background service worker writes a CostRecord to IndexedDB on every LLM completion via fire-and-forget pattern
- Session ID lifecycle: generated on START_CAPTURE, used in all cost records, cleared on STOP_CAPTURE (both success and error paths)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create CostRecord types, IndexedDB wrapper, and aggregation helpers** - `9f65ccf` (feat)
2. **Task 2: Integrate IndexedDB writes and session ID into background service worker** - `ffd579d` (feat)

## Files Created/Modified
- `src/services/costHistory/types.ts` - CostRecord interface and aggregation result types (DailyCost, ProviderCost, ModelCost, SessionSummary)
- `src/services/costHistory/costDb.ts` - Promise-based IndexedDB wrapper with lazy connection, CRUD operations, and indexed queries
- `src/services/costHistory/aggregation.ts` - Pure aggregation functions for daily, provider, model, and session breakdowns
- `entrypoints/background.ts` - Added imports, currentSessionId state, session ID lifecycle, and saveCostRecord call in onUsage callback

## Decisions Made
- Used native IndexedDB API instead of `idb` library -- the wrapper is simple enough (~140 lines) and avoids adding a dependency
- Lazy database opening pattern addresses Pitfall 1 from research (IndexedDB not available during SW initialization)
- Fire-and-forget `.catch()` pattern for saveCostRecord ensures IndexedDB writes never block the LLM streaming response
- Session ID generated as `session-{timestamp}-{tabId}` provides uniqueness and debuggability
- Fallback `adhoc-{timestamp}` session ID handles edge case of LLM requests outside capture sessions
- Reused `ProviderId` type from LLMProvider.ts to maintain consistent provider union type across codebase
- Used `Intl.DateTimeFormat` for month abbreviation in aggregateByDay (locale-aware, no external dependency)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Branch checkout not persisting between bash tool calls required consolidating git operations into single commands. Resolved by using combined checkout+cherry-pick+commit chains.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Cost data layer is complete and ready for Plan 02 (Cost Dashboard UI)
- IndexedDB shared between popup and service worker -- popup can read cost records directly
- Aggregation helpers produce chart-ready data structures for recharts integration
- `getRecordCount()` and `deleteRecordsBefore()` ready for dashboard stats and 90-day retention cleanup

## Self-Check: PASSED

All files verified on `feature/phase-18-cost-dashboard` branch:
- `src/services/costHistory/types.ts` -- FOUND
- `src/services/costHistory/costDb.ts` -- FOUND
- `src/services/costHistory/aggregation.ts` -- FOUND
- `.planning/phases/18-cost-dashboard/18-01-SUMMARY.md` -- FOUND
- Commit `9f65ccf` (Task 1) -- FOUND
- Commit `ffd579d` (Task 2) -- FOUND

---
*Phase: 18-cost-dashboard*
*Completed: 2026-02-09*
