---
phase: 02-audio-pipeline
plan: 04
subsystem: audio
tags: [popup-ui, capture-controls, end-to-end, user-gesture, cleanup]

# Dependency graph
requires:
  - phase: 02-audio-pipeline
    plan: 02
    provides: Tab audio capture with passthrough
  - phase: 02-audio-pipeline
    plan: 03
    provides: Microphone capture with PCM processing
provides:
  - Start/Stop capture controls in Popup UI
  - Complete end-to-end audio capture flow
  - Resource cleanup on extension unload
  - User gesture initiation for capture (AUD-05 requirement)
affects: [03-transcription, 07-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - React useState for capture state management
    - beforeunload cleanup for resource release
    - Popup-to-background messaging for capture control

key-files:
  created: []
  modified:
    - entrypoints/popup/App.tsx
    - entrypoints/offscreen/main.ts

key-decisions:
  - "User clicks Start in popup to initiate capture (user gesture requirement)"
  - "Tab and mic capture started via separate messages for independent control"
  - "beforeunload event for cleanup on extension unload/reload"

patterns-established:
  - "Popup capture controls: Start/Stop buttons with status display"
  - "Resource cleanup: beforeunload event + explicit stop functions"

# Metrics
duration: 12min
completed: 2026-01-29
---

# Phase 2 Plan 04: Popup Start/Stop UI Summary

**Complete audio capture UI with Start/Stop buttons in Popup, verified end-to-end flow from user click to PCM chunks with audio passthrough**

## Performance

- **Duration:** 12 min
- **Started:** 2026-01-29T15:00:00Z
- **Completed:** 2026-01-29T15:12:00Z
- **Tasks:** 3 (2 auto, 1 human-verify)
- **Files modified:** 2

## Accomplishments

- Added Start/Stop capture buttons to Popup UI with status display
- Implemented capture state management (isCapturing, captureStatus)
- Added resource cleanup on extension unload via beforeunload event
- Verified complete end-to-end audio flow with human testing
- Confirmed all Phase 2 success criteria pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Start/Stop capture controls to Popup** - `85d9135` (feat)
2. **Task 2: Add cleanup on extension unload** - `dfd5d20` (feat)
3. **Task 3: End-to-end verification checkpoint** - Human verified (no commit)

## Files Created/Modified

- `entrypoints/popup/App.tsx` - Added Audio Capture section with Start/Stop buttons, status display, and message handlers
- `entrypoints/offscreen/main.ts` - Added beforeunload event listener for cleanup, null checks in stop functions

## Decisions Made

1. **User gesture from popup**: Start capture requires user click in popup, satisfying Chrome's user gesture requirement for tabCapture
2. **Separate start messages**: Tab and mic capture use separate START_CAPTURE and START_MIC_CAPTURE messages for independent control
3. **beforeunload for cleanup**: Window beforeunload event ensures streams are released on extension reload/unload

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - implementation proceeded smoothly with existing message infrastructure from Plans 02 and 03.

## User Setup Required

None - no external service configuration required.

## Phase 2 Complete

All Phase 2 success criteria verified by human testing:

| Criteria | Status |
|----------|--------|
| User clicks Start button and capture begins | PASS |
| User can hear tab audio while capturing (passthrough) | PASS |
| Console shows PCM chunks being generated | PASS |
| Microphone capture works separately | PASS |
| User clicks Stop and resources are released | PASS |

## Next Phase Readiness

- Audio pipeline complete and ready for transcription
- Tab audio (interviewer) and mic audio (user) both produce 16kHz mono PCM
- Phase 3 (Transcription) can consume audio chunks from message system
- Capture lifecycle is user-controlled via Popup buttons

---
*Phase: 02-audio-pipeline*
*Completed: 2026-01-29*
