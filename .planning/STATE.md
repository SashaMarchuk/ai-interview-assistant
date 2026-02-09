# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-09)

**Core value:** Get something useful on screen fast enough to start speaking confidently during interviews
**Current focus:** Milestone v2.0 Enhanced Experience -- Phase 20 Plan 01 complete, Plan 02 next

## Current Position

Phase: 20 of 21 (Transcript Editing) -- IN PROGRESS
Plan: 1 of 2 complete
Status: Phase 20 Plan 01 (data layer) complete. TranscriptEdit type, edit overlay map, applyEdits, event listeners, and hotkey guard all wired. Plan 02 (UI components) next.
Last activity: 2026-02-09 -- Phase 20 Plan 01 complete

Progress: [████░░░░░░] 40% (v2.0)

## Performance Metrics

**Velocity:**
- Total plans completed: 46 (30 v1.0 + 7 v1.1 + 9 v2.0)
- v1.0 shipped in 6 days (8 phases, 30 plans)
- v1.1 shipped in ~1 day (6 phases, 7 plans)

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 15-01 | Markdown Components | 5min | 2 | 6 |
| 15-02 | Markdown Integration | 5min | 2 | 2 |
| 16-01 | Provider Foundation | 8min | 3 | 4 |
| 16-02 | Message Types & Background Handler | 11min | 2 | 3 |
| 16-03 | UI Controls & Reasoning Button | 4min | 2 | 5 |
| 17-01 | Types, Pricing & Streaming Pipeline | 3min | 2 | 9 |
| 17-02 | Cost Display UI | 2min | 2 | 3 |
| 20-01 | Transcript Editing Data Layer | 6min | 2 | 3 |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v2.0 roadmap]: Client-side text extraction for files (not OpenAI Files API) -- cross-provider compatible
- [v2.0 roadmap]: IndexedDB for cost records and file content (not Zustand) -- avoids webext-zustand sync bloat
- [v2.0 roadmap]: react-markdown with Tailwind class overrides (not typography plugin) -- Shadow DOM compatible
- [v2.0 roadmap]: recharts for cost charts (SVG-based, no CSP issues) -- loads only in popup context
- [v2.0 roadmap]: Minimum 25K token budget for reasoning models -- prevents empty responses
- [v2.0 roadmap]: Phases 15+16 parallel, then 17 sequential, then 18+19+20 parallel, then 21 sequential
- [15-01]: CodeBlock props typed with react-markdown ExtraProps for type safety
- [15-01]: highlight.js CSS via @import in app.css (Vite resolves node_modules) with transparent background override
- [15-02]: MemoizedMarkdown integrated into ResponsePanel for both fastHint and fullAnswer
- [15-02]: requestAnimationFrame token batching (~16ms windows) for streaming performance
- [16-01]: ReasoningEffort type defined independently in LLMProvider.ts and store/types.ts to avoid circular dependency
- [16-01]: Non-streaming JSON fallback in streamSSE for reasoning models that don't support SSE
- [16-02]: reasoningEffort passed as string from message, cast to ReasoningEffort at streamWithRetry boundary (safe because UI constrains valid values)
- [16-02]: Fast model gets immediate complete status in reasoning mode (UI state machine needs events for both models)
- [16-02]: Reasoning mode sends streaming status for model:'full' only (not 'both') for accurate UI feedback
- [16-03]: isReasoningPending tracked as local state + ref in Overlay to avoid stale closure in event listener
- [16-03]: Purple theme (bg-purple-500/20, text-purple-300) for all reasoning UI elements
- [16-03]: Model grouping in ModelSettings uses isReasoningModel utility from LLM service layer
- [merge]: Reasoning budget only applied for actual reasoning models (isReasoningModel check) to prevent 400 errors on standard models
- [17-01]: OpenAI cost calculated client-side from static pricing table; OpenRouter cost from API response (providerCost)
- [17-01]: onUsage callback threaded through all pipeline layers (streamSSE -> ProviderStreamOptions -> streamWithRetry -> fireModelRequest)
- [17-01]: stream_options: { include_usage: true } added to all OpenAI requests for streaming usage data
- [17-02]: SessionCostEventDetail defined locally in content.tsx to avoid circular imports
- [17-02]: Session cost tracked in-memory (module-level variable), resets on page reload -- matches interview session scope
- [17-02]: Cost badge uses title attribute for fast/full breakdown tooltip -- lightweight, no extra UI complexity
- [20-01]: Edit overlay stored as module-level Map in content.tsx, not in Zustand -- session-scoped, no sync needed
- [20-01]: applyEdits uses reduce to both filter (soft-delete) and transform (edit text) in single pass
- [20-01]: e.target used for input guard instead of document.activeElement -- Shadow DOM boundary makes activeElement unreliable

### Pending Todos

See .planning/todos/pending/ for captured ideas.

### Blockers/Concerns

- OpenAI Chat Completions file input had September 2025 regression -- test base64 inline early in Phase 19
- o3/o4-mini streaming may require org verification tier -- handle both streaming and non-streaming modes
- Shadow DOM getSelection() behavior needs runtime validation on Google Meet for Phase 21

## Session Continuity

Last session: 2026-02-09
Stopped at: Completed 20-01-PLAN.md (Transcript Editing Data Layer)
Resume file: Phase 20 Plan 02 next (Transcript Editing UI components)
