---
phase: 17-cost-tracking-capture
plan: 01
subsystem: api
tags: [openai, openrouter, streaming, sse, cost-tracking, token-usage, pricing]

# Dependency graph
requires:
  - phase: 16-reasoning-models
    provides: Streaming SSE pipeline, reasoning model support, provider abstraction
provides:
  - TokenUsage interface for token count data
  - Static OpenAI pricing table with calculateCost function
  - Usage extraction from SSE streaming and JSON fallback responses
  - LLM_COST message type for broadcasting cost data to content scripts
  - Cost fields on LLMResponse interface (fastCostUSD, fullCostUSD, totalCostUSD)
  - Background service worker onUsage pipeline from API to UI
affects: [17-02 (cost UI display), 18 (cost analytics/IndexedDB storage)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "onUsage callback pattern through streaming pipeline layers"
    - "Static pricing table with provider-cost fallback for OpenRouter"
    - "stream_options opt-in for OpenAI usage reporting in streaming mode"

key-files:
  created:
    - src/services/llm/pricing.ts
  modified:
    - src/services/llm/types.ts
    - src/services/llm/providers/LLMProvider.ts
    - src/services/llm/providers/streamSSE.ts
    - src/services/llm/providers/OpenAIProvider.ts
    - src/services/llm/index.ts
    - src/types/messages.ts
    - src/types/transcript.ts
    - entrypoints/background.ts

key-decisions:
  - "OpenAI cost calculated client-side from static pricing table; OpenRouter cost taken directly from API response"
  - "onUsage callback threaded through all pipeline layers (streamSSE -> ProviderStreamOptions -> streamWithRetry -> fireModelRequest)"
  - "stream_options: { include_usage: true } added to all OpenAI requests (required for streaming usage data)"

patterns-established:
  - "Cost pipeline: API response -> onUsage callback -> calculateCost -> LLM_COST broadcast"
  - "Dual cost source: providerCost (OpenRouter) with static table fallback (OpenAI)"

# Metrics
duration: 3min
completed: 2026-02-09
---

# Phase 17 Plan 01: Cost Tracking Capture Summary

**Token usage extraction from SSE/JSON responses with static OpenAI pricing table and LLM_COST message broadcasting through background service worker**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-09T11:45:28Z
- **Completed:** 2026-02-09T11:48:07Z
- **Tasks:** 2
- **Files modified:** 9 (8 modified + 1 created)

## Accomplishments
- Full cost tracking data pipeline from API response through to content script broadcasting
- TokenUsage interface and onUsage callback wired through every layer of the streaming pipeline
- Static pricing table covering all 12 OpenAI models with calculateCost utility function
- LLM_COST message type integrated into the extension message system with exhaustive type checking

## Task Commits

Each task was committed atomically:

1. **Task 1: Types, pricing module, and streaming pipeline extension** - `c38c070` (feat)
2. **Task 2: Background service worker cost calculation and LLM_COST broadcasting** - `24302ba` (feat)

## Files Created/Modified
- `src/services/llm/pricing.ts` - NEW: Static OpenAI pricing table and calculateCost function
- `src/services/llm/types.ts` - Added TokenUsage interface
- `src/services/llm/providers/LLMProvider.ts` - Added onUsage callback to ProviderStreamOptions
- `src/services/llm/providers/streamSSE.ts` - Extended StreamChunk with usage field, added usage extraction in SSE and JSON paths
- `src/services/llm/providers/OpenAIProvider.ts` - Added stream_options: { include_usage: true } to request body
- `src/services/llm/index.ts` - Re-exported calculateCost, OPENAI_PRICING, TokenUsage
- `src/types/messages.ts` - Added LLM_COST message type and LLMCostMessage interface
- `src/types/transcript.ts` - Added fastCostUSD, fullCostUSD, totalCostUSD to LLMResponse
- `entrypoints/background.ts` - Added onUsage callback pipeline, calculateCost integration, LLM_COST broadcasting

## Decisions Made
- OpenAI cost calculated client-side from static pricing table; OpenRouter cost taken directly from API response (providerCost field) -- more accurate for OpenRouter's dynamic pricing
- onUsage callback threaded through all pipeline layers rather than post-hoc extraction -- keeps cost data tightly coupled with the response that generated it
- stream_options: { include_usage: true } added to all OpenAI streaming requests -- required opt-in for OpenAI to include usage data in streaming mode

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added LLM_COST case to background message handler switch in Task 1**
- **Found during:** Task 1 verification (tsc --noEmit)
- **Issue:** Adding LLM_COST to MessageType union caused TypeScript exhaustive check error in background.ts handleMessage switch, blocking compilation
- **Fix:** Added `case 'LLM_COST': return { received: true }` alongside LLM_STREAM and LLM_STATUS cases
- **Files modified:** entrypoints/background.ts
- **Verification:** npx tsc --noEmit passes
- **Committed in:** c38c070 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to maintain type safety. The handler was planned for Task 2 but had to be added in Task 1 for compilation. Task 2 extended background.ts further with the full cost pipeline.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Cost data pipeline complete: usage extracted, cost calculated, LLM_COST messages broadcast to content scripts
- Ready for Plan 02: Content script handler to receive LLM_COST messages and store cost data in overlay state
- Cost fields on LLMResponse ready for UI display in Plan 02

## Self-Check: PASSED

All 9 modified/created files verified on disk. Both task commits (c38c070, 24302ba) verified in git log.

---
*Phase: 17-cost-tracking-capture*
*Completed: 2026-02-09*
