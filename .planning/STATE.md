# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-09)

**Core value:** Get something useful on screen fast enough to start speaking confidently during interviews
**Current focus:** Milestone v2.0 Enhanced Experience -- Phase 15+16 parallel execution

## Current Position

Phase: 15+16 of 21 (Markdown Rendering + Reasoning Models) -- parallel
Plan: 15-01 complete, 16-01 complete
Status: Executing
Last activity: 2026-02-09 -- Plan 16-01 (Provider Foundation) complete

Progress: [█░░░░░░░░░] 7% (v2.0)

## Performance Metrics

**Velocity:**
- Total plans completed: 39 (30 v1.0 + 7 v1.1 + 2 v2.0)
- v1.0 shipped in 6 days (8 phases, 30 plans)
- v1.1 shipped in ~1 day (6 phases, 7 plans)

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 15-01 | Markdown Components | 5min | 2 | 6 |

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
- [16-01]: ReasoningEffort type defined independently in LLMProvider.ts and store/types.ts to avoid circular dependency
- [16-01]: Non-streaming JSON fallback in streamSSE for reasoning models that don't support SSE
- [15-01]: CodeBlock props typed with react-markdown ExtraProps for type safety
- [15-01]: highlight.js CSS via @import in app.css (Vite resolves node_modules) with transparent background override

### Pending Todos

See .planning/todos/pending/ for captured ideas.

### Blockers/Concerns

- OpenAI Chat Completions file input had September 2025 regression -- test base64 inline early in Phase 19
- o3/o4-mini streaming may require org verification tier -- handle both streaming and non-streaming modes
- Shadow DOM getSelection() behavior needs runtime validation on Google Meet for Phase 21

## Session Continuity

Last session: 2026-02-09
Stopped at: Completed 16-01-PLAN.md (Provider Foundation) -- Phase 16 Plan 02 next
Resume file: .planning/phases/16-reasoning-models/16-02-PLAN.md
