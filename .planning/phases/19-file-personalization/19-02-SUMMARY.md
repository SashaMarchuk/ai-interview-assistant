---
phase: 19-file-personalization
plan: 02
subsystem: ui
tags: [react, file-upload, pdf, prompt-injection, indexeddb, personalization]

# Dependency graph
requires:
  - phase: 19-01
    provides: "IndexedDB CRUD service for resume/JD records and PDF text extraction"
provides:
  - "FileUploadSettings React component for resume and JD management in popup"
  - "PromptBuilder file context injection (Candidate Background + Target Role sections)"
  - "background.ts IndexedDB read before every LLM request for personalization"
affects: [background-llm-pipeline, popup-settings]

# Tech tracking
tech-stack:
  added: []
  patterns: [optional file context in system prompt injection, IndexedDB read in service worker before prompt building]

key-files:
  created:
    - src/components/settings/FileUploadSettings.tsx
  modified:
    - entrypoints/popup/App.tsx
    - src/services/llm/PromptBuilder.ts
    - src/services/llm/index.ts
    - entrypoints/background.ts

key-decisions:
  - "FileContext is optional parameter to buildPrompt -- backward compatible, no impact on existing callers"
  - "Resume truncated to 8K chars, JD to 4K chars -- fits comfortably within typical context windows"
  - "File context appended as system prompt sections (## Candidate Background, ## Target Role) not user prompt -- keeps it as persistent context"
  - "Scanned PDF warning at <50 chars extracted -- prevents useless uploads"
  - "Parallel IndexedDB read (Promise.all) for resume + JD in background -- non-blocking"

patterns-established:
  - "System prompt personalization: optional context sections appended after template substitution"
  - "IndexedDB read before prompt building in service worker for per-request data injection"

# Metrics
duration: 7min
completed: 2026-02-09
---

# Phase 19 Plan 02: File Upload UI & Prompt Injection Summary

**FileUploadSettings component with resume PDF/TXT picker and JD textarea in popup, PromptBuilder file context injection with Candidate Background and Target Role system prompt sections**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-09T12:59:03Z
- **Completed:** 2026-02-09T13:06:30Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created FileUploadSettings component with resume file picker (PDF/TXT), JD textarea, text preview, scanned PDF warning, character limits, and delete buttons
- Integrated FileUploadSettings into popup settings under "Personalization" heading between Models and Hotkeys
- Added FileContext interface and optional parameter to buildPrompt for system prompt personalization
- Background service worker reads resume and JD from IndexedDB before every LLM request and passes to buildPrompt

## Task Commits

Each task was committed atomically:

1. **Task 1: Create FileUploadSettings component and add to popup** - `cedd16f` (feat)
2. **Task 2: Modify PromptBuilder and background to inject file context into LLM prompts** - `850dbe1` (feat)

## Files Created/Modified
- `src/components/settings/FileUploadSettings.tsx` - Resume upload (PDF/TXT) and JD textarea with save/delete, preview, character limits, scanned PDF warning
- `entrypoints/popup/App.tsx` - Added FileUploadSettings import and Personalization section in settings tab
- `src/services/llm/PromptBuilder.ts` - FileContext interface, optional parameter to buildPrompt, system prompt section injection
- `src/services/llm/index.ts` - Added FileContext to barrel export
- `entrypoints/background.ts` - Added getFileContent import, IndexedDB read before buildPrompt call, fileContext parameter pass-through

## Decisions Made
- FileContext is optional to buildPrompt -- backward compatible with all existing callers
- Resume capped at 8,000 characters, JD at 4,000 characters -- reasonable for prompt context budgets
- File context appended as structured sections in system prompt (not user prompt) -- persistent background context
- Scanned PDF detection threshold set at 50 characters -- prevents useless uploads of image-only PDFs
- Parallel IndexedDB reads with Promise.all for resume and JD -- non-blocking performance

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Branch switching confusion caused by stash pop -- resolved by explicitly checking out correct branch
- pdfjs-dist DOMMatrix error during `wxt prepare` (known issue from Plan 01) -- does not affect TypeScript compilation, only WXT type generation step

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- File personalization feature is complete end-to-end (upload -> storage -> prompt injection)
- Phase 19 is fully complete (Plan 01: data layer, Plan 02: UI + prompt integration)
- Ready for integration with other parallel phases (18, 20)
- No blockers identified

---
*Phase: 19-file-personalization*
*Completed: 2026-02-09*
