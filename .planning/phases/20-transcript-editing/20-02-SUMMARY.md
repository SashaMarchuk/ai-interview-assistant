---
phase: 20-transcript-editing
plan: 02
subsystem: ui
tags: [transcript, editing, inline-edit, soft-delete, undo, auto-scroll, react-memo]

# Dependency graph
requires:
  - phase: 20-transcript-editing plan 01
    provides: TranscriptEdit type, edit overlay map, applyEdits, custom event listeners, hotkey guard
provides:
  - Inline editing UI with double-click activation, Enter/Escape controls
  - Soft-delete with greyed-out row and undo button
  - Undo for both text edits and soft-deletes
  - Visual "(edited)" indicator on modified entries
  - Edit-aware auto-scroll suppression
  - editedIds/deletedIds pipeline from content.tsx through Overlay to TranscriptPanel
affects: [21-text-selection (may need to coordinate with editing state)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline edit pattern: double-click activates input, Enter saves, Escape cancels, onBlur saves"
    - "Hover controls pattern: group/group-hover Tailwind for showing action buttons on entry hover"
    - "Display vs LLM pipeline split: display keeps deleted entries visible for undo, LLM getters filter them"

key-files:
  created: []
  modified:
    - src/overlay/TranscriptPanel.tsx
    - src/overlay/hooks/useAutoScroll.ts
    - entrypoints/content.tsx
    - src/overlay/Overlay.tsx

key-decisions:
  - "Display pipeline keeps deleted entries visible (greyed) for undo UI; LLM context pipeline (applyEdits) still filters them"
  - "editedIds/deletedIds passed via transcript-update event detail rather than separate event listeners in the overlay"
  - "Sets (editedSet/deletedSet) used for O(1) lookup in render loop instead of array .includes()"
  - "Edit input uses block layout (mt-0.5) instead of inline to prevent text reflow issues in narrow panel"

patterns-established:
  - "Display/LLM pipeline split: content.tsx dispatchTranscriptUpdate sends all entries with metadata for display; applyEdits filters for LLM context only"
  - "Hover controls via Tailwind group/group-hover for compact inline buttons"

# Metrics
duration: 3min
completed: 2026-02-09
---

# Phase 20 Plan 02: Transcript Editing UI Summary

**Inline editing, soft-delete, and undo UI in TranscriptPanel with edit-aware auto-scroll suppression and editedIds/deletedIds event pipeline**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-09T12:36:47Z
- **Completed:** 2026-02-09T12:39:40Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- TranscriptEntryRow supports three modes: normal (with hover controls), editing (inline input), and deleted (greyed with undo)
- Double-click activates inline editing; Enter saves, Escape cancels, onBlur saves
- Soft-delete button (x) on hover hides entry visually while keeping it available for undo
- Undo restores original text for both edited and deleted entries
- Auto-scroll suppressed when editing to keep input in view
- editedIds/deletedIds flow from content.tsx through Overlay.tsx to TranscriptPanel for UI indicators
- Entry count shows visible/total when entries are soft-deleted

## Task Commits

Each task was committed atomically:

1. **Task 1: Add edit-aware auto-scroll suppression to useAutoScroll** - `ee55356` (feat)
2. **Task 2: Build inline editing UI in TranscriptPanel** - `8c17de1` (feat)

## Files Created/Modified
- `src/overlay/hooks/useAutoScroll.ts` - Added optional isEditing parameter to suppress auto-scroll during editing
- `src/overlay/TranscriptPanel.tsx` - Full rewrite with inline editing, soft-delete, undo, visual indicators, and three-mode TranscriptEntryRow
- `entrypoints/content.tsx` - Updated TranscriptUpdateEventDetail and dispatchTranscriptUpdate to include editedIds/deletedIds; display pipeline now keeps deleted entries visible
- `src/overlay/Overlay.tsx` - Added editedIds/deletedIds state, passes them from transcript-update event to TranscriptPanel

## Decisions Made
- Display pipeline keeps deleted entries visible (greyed with undo) while LLM context pipeline (applyEdits in getFullTranscript etc.) continues to filter them -- this split ensures users can undo deletes while LLM never sees deleted content
- editedIds/deletedIds passed via the existing transcript-update event detail rather than adding separate event listeners in TranscriptPanel -- avoids redundant state tracking and keeps the overlay component simpler
- Used useMemo to convert editedIds/deletedIds arrays to Sets for O(1) lookup in the render loop
- Edit input uses block layout with mt-0.5 margin instead of inline ml-1 to prevent layout issues in the 280-340px panel width

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All four EDIT requirements (EDIT-01 through EDIT-04) are now fully implemented:
  - EDIT-01: Double-click enables inline editing; Enter saves, Escape cancels
  - EDIT-02: Soft-delete hides from LLM context; greyed row with undo in UI
  - EDIT-03: Edited text flows into LLM requests via applyEdits in content.tsx
  - EDIT-04: Undo restores original text for both edits and soft-deletes
- Phase 20 (Transcript Editing) is complete
- Ready for Phase 21 (Text Selection) or integration into milestone branch

## Self-Check: PASSED

- All 4 modified files exist on disk
- Both task commits (ee55356, 8c17de1) verified in git log
- TypeScript (tsc --noEmit): zero errors
- ESLint: zero errors on all modified files
- Build (npm run build): success

---
*Phase: 20-transcript-editing*
*Completed: 2026-02-09*
