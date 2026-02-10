---
phase: 21-text-selection
plan: 01
subsystem: store, background
tags: [zustand, chrome-extension, llm, streaming, quick-prompts]

# Dependency graph
requires:
  - phase: 16-reasoning-models
    provides: "streamWithRetry, resolveProviderForModel, fireModelRequest pattern"
  - phase: 17-cost-tracking-capture
    provides: "calculateCost, saveCostRecord, onUsage pipeline"
provides:
  - "QuickPromptAction and QuickPromptsSlice types"
  - "quickPromptsSlice with CRUD, reorder, reset-to-defaults"
  - "QUICK_PROMPT_REQUEST and QUICK_PROMPT_CANCEL message types"
  - "Concurrent quick prompt handler in background.ts"
  - "4 default quick prompt actions seeded on install"
affects: [21-02, 21-03]

# Tech tracking
tech-stack:
  added: ["@floating-ui/react-dom"]
  patterns: ["Concurrent abort controller maps for non-interfering request streams"]

key-files:
  created:
    - src/store/quickPromptsSlice.ts
  modified:
    - src/store/types.ts
    - src/store/index.ts
    - src/types/messages.ts
    - entrypoints/background.ts

key-decisions:
  - "Separate quickPromptAbortControllers map to isolate quick prompt lifecycle from regular LLM requests"
  - "Quick prompts always use fast model only with 1024 max tokens for short concise responses"
  - "Max 4 quick prompts enforced silently (addQuickPrompt is a no-op at capacity)"
  - "Simple system prompt for quick prompts: 'You are a helpful assistant. Be concise and clear.'"

patterns-established:
  - "Concurrent request maps: separate abort controller maps for non-interfering request types"
  - "Quick prompt template interpolation: {{selection}} placeholder replaced with selected text"

# Metrics
duration: 6min
completed: 2026-02-10
---

# Phase 21 Plan 01: Quick Prompts Data Layer Summary

**QuickPromptsSlice with 4 default actions, QUICK_PROMPT_REQUEST message type, and concurrent background handler using separate abort controller tracking**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-10T15:06:44Z
- **Completed:** 2026-02-10T15:12:39Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- QuickPromptAction and QuickPromptsSlice types with full CRUD, reorder, and reset-to-defaults
- QUICK_PROMPT_REQUEST and QUICK_PROMPT_CANCEL message types integrated into discriminated union
- Background handler that fires fast-model-only LLM streams without cancelling active requests
- Quick prompt abort controllers tracked separately with correct keep-alive lifecycle
- 4 default quick prompts (Explain, Elaborate, Summarize, Counter) seeded on first install

## Task Commits

Each task was committed atomically:

1. **Task 1: Quick Prompt types, message types, and Zustand slice** - `b1b97a7` (feat)
2. **Task 2: Background handler for concurrent quick prompt requests** - `e58ad21` (feat)

**Plan metadata:** [pending] (docs: complete plan)

## Files Created/Modified
- `src/store/types.ts` - QuickPromptAction interface, QuickPromptsSlice interface, StoreState union update
- `src/store/quickPromptsSlice.ts` - Zustand slice with 4 defaults, CRUD, reorder, reset-to-defaults
- `src/store/index.ts` - Slice integration, persistence via partialize, default seeding on rehydrate
- `src/types/messages.ts` - QUICK_PROMPT_REQUEST/CANCEL message types and interfaces
- `entrypoints/background.ts` - handleQuickPromptRequest function, switch cases, separate abort map
- `package.json` - @floating-ui/react-dom dependency added
- `package-lock.json` - Lock file updated

## Decisions Made
- Separate `quickPromptAbortControllers` map ensures LLM_REQUEST cancel-all never affects quick prompts
- Quick prompts use fast model only with 1024 max tokens (concise responses for text selection)
- Max 4 quick prompts enforced silently -- `addQuickPrompt` is a no-op at capacity
- Simple system prompt ("You are a helpful assistant. Be concise and clear.") rather than template-based
- All keep-alive checks (checkAllComplete, LLM_CANCEL, STOP_TRANSCRIPTION, QUICK_PROMPT_CANCEL) updated to consider both controller maps

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Prior partial execution attempt left stale files (SelectionTooltip.tsx, globals.d.ts changes) -- cleaned up before verification

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Quick prompt data layer is complete and ready for Plan 02 (tooltip UI)
- QUICK_PROMPT_REQUEST/CANCEL messages are handled -- content script can send them
- Store persists quick prompt configs across browser restarts
- Shadow DOM getSelection() behavior still needs runtime validation on Google Meet (documented blocker)

## Self-Check: PASSED

All 5 created/modified files verified on disk. Both task commits (b1b97a7, e58ad21) verified in git log. TypeScript compilation passes. ESLint passes on all modified files.

---
*Phase: 21-text-selection*
*Completed: 2026-02-10*
