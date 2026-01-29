---
phase: 02-audio-pipeline
plan: 02
subsystem: audio
tags: [tab-capture, audio-passthrough, pcm, chrome-extension, offscreen-document]

# Dependency graph
requires:
  - phase: 02-audio-pipeline
    plan: 01
    provides: Audio message types and PCM processor
provides:
  - Tab audio capture via chromeMediaSource constraint
  - Audio passthrough to keep tab audible during capture
  - TAB_AUDIO_CHUNK messages flowing from AudioWorklet
affects: [02-audio-pipeline (plans 03-04), 03-transcription]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - chromeMediaSource constraint for tab capture
    - Audio passthrough via connect(destination)
    - Callback-to-Promise wrapper for tabCapture API

key-files:
  created: []
  modified:
    - entrypoints/background.ts
    - entrypoints/offscreen/main.ts

key-decisions:
  - "Use Promise wrapper for callback-based tabCapture.getMediaStreamId API"
  - "Connect source to destination for audio passthrough before worklet"
  - "Use switch statement for type-safe discriminated union message handling"

patterns-established:
  - "Tab capture flow: popup -> background (getMediaStreamId) -> offscreen (getUserMedia)"
  - "Audio passthrough: source.connect(destination) ensures user hears tab audio"

# Metrics
duration: 6min
completed: 2026-01-29
---

# Phase 2 Plan 02: Tab Audio Capture Summary

**Tab audio capture implementation with chromeMediaSource constraint and audio passthrough ensuring interviewer remains audible during capture**

## Performance

- **Duration:** 6 min
- **Started:** 2026-01-29T03:34:06Z
- **Completed:** 2026-01-29T03:40:39Z
- **Tasks:** 3 (2 executed, 1 already complete)
- **Files modified:** 2

## Accomplishments

- Implemented START_CAPTURE handler in Service Worker with tabCapture.getMediaStreamId
- Created tab audio capture in Offscreen Document with chromeMediaSource constraint
- Added audio passthrough via connect(destination) to keep tab audible
- Integrated PCM processor for TAB_AUDIO_CHUNK message generation
- Verified tabCapture permission already present in manifest

## Task Commits

Each task was committed atomically:

1. **Task 1: Add tab capture handler to Service Worker** - Already in codebase (from prior session)
2. **Task 2: Implement tab audio capture in Offscreen Document** - `7f03fe1` (feat)
3. **Task 3: Add tabCapture permission to manifest** - Already present (no change needed)

## Files Created/Modified

- `entrypoints/background.ts` - Switch-based message handler with START_CAPTURE, STOP_CAPTURE, audio chunk handlers
- `entrypoints/offscreen/main.ts` - Added startTabCapture(), stopTabCapture(), TAB_STREAM_ID handler

## Decisions Made

1. **Promise wrapper for tabCapture API**: The Chrome tabCapture.getMediaStreamId API uses callbacks, wrapped in Promise for async/await consistency
2. **Audio passthrough before processing**: Connect MediaStreamSource to destination FIRST, then to worklet - ensures user can hear tab audio while we capture it
3. **Switch statement for message handling**: Replaced if-chain with switch for proper TypeScript discriminated union narrowing and exhaustive checking

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript type narrowing with discriminated unions**
- **Found during:** Task 1
- **Issue:** The isMessage type guard didn't properly narrow types in if-else chains, causing "property doesn't exist on type 'never'" errors
- **Fix:** Replaced if-chain with switch statement which TypeScript handles correctly for discriminated unions
- **Files modified:** entrypoints/background.ts

**2. [Rule 3 - Blocking] Missing PONG case in exhaustive switch**
- **Found during:** Task 1
- **Issue:** TypeScript exhaustive check failed because PONG message type wasn't handled
- **Fix:** Added case 'PONG' to switch statement
- **Files modified:** entrypoints/background.ts

## Issues Encountered

None beyond the type system fixes documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Tab audio capture ready for real-world testing
- TAB_AUDIO_CHUNK messages flowing to Service Worker
- Microphone capture from Plan 03 ready
- Phase 03 (Transcription) can receive audio chunks once both tab and mic capture are active

## Verification Results

| Check | Status |
|-------|--------|
| TypeScript compiles | PASS |
| Build succeeds | PASS |
| pcm-processor.js in output | PASS |
| tabCapture permission in manifest | PASS |
| chromeMediaSource constraint in offscreen | PASS |
| connect(destination) for passthrough | PASS |

---
*Phase: 02-audio-pipeline*
*Completed: 2026-01-29*
