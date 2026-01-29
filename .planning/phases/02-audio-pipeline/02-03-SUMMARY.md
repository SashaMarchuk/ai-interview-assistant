---
phase: 02-audio-pipeline
plan: 03
subsystem: audio
tags: [microphone, webrtc, audioworklet, pcm, getUserMedia]

# Dependency graph
requires:
  - phase: 02-01
    provides: PCM processor AudioWorklet and audio message types
provides:
  - Microphone capture function (startMicCapture/stopMicCapture)
  - MIC_AUDIO_CHUNK message flow
  - Independent mic/tab capture lifecycle
affects: [03-transcription, 07-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Separate AudioContext per capture source
    - getUserMedia with echoCancellation/noiseSuppression

key-files:
  created: []
  modified:
    - entrypoints/offscreen/main.ts
    - entrypoints/background.ts
    - src/types/messages.ts

key-decisions:
  - "Split AudioChunkMessage into TabAudioChunkMessage and MicAudioChunkMessage for proper type narrowing"
  - "Mic not connected to audioContext.destination to prevent feedback"
  - "Tab and mic capture are independent - can be started/stopped separately"

patterns-established:
  - "Separate AudioContext per capture source (mic vs tab)"
  - "Same pcm-processor.js reused for both capture sources"

# Metrics
duration: 15min
completed: 2026-01-29
---

# Phase 02 Plan 03: Microphone Capture Summary

**Microphone capture via getUserMedia with PCM conversion through AudioWorklet, independent from tab capture**

## Performance

- **Duration:** 15 min
- **Started:** 2026-01-29T10:30:00Z
- **Completed:** 2026-01-29T10:45:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Microphone capture with echoCancellation and noiseSuppression enabled
- PCM conversion using same AudioWorklet processor as tab audio
- MIC_AUDIO_CHUNK messages flowing through message system
- Independent mic/tab capture lifecycle (can start/stop separately)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add microphone capture to Offscreen Document** - `729751c` (feat)
2. **Task 2: Add mic message types and handlers** - `ea9eb5c` (feat - included in parallel 06-02 commit)

## Files Created/Modified
- `entrypoints/offscreen/main.ts` - Added startMicCapture/stopMicCapture functions with getUserMedia and AudioWorklet
- `entrypoints/background.ts` - Added START_MIC_CAPTURE, STOP_MIC_CAPTURE, and MIC_AUDIO_CHUNK handlers
- `src/types/messages.ts` - Added mic message types, split AudioChunkMessage into separate types

## Decisions Made
- **Split AudioChunkMessage:** TypeScript type narrowing failed with union type `type: 'TAB_AUDIO_CHUNK' | 'MIC_AUDIO_CHUNK'`. Split into `TabAudioChunkMessage` and `MicAudioChunkMessage` for proper discriminated union support.
- **No mic playback:** Microphone is NOT connected to audioContext.destination to prevent audio feedback (hearing yourself speak).
- **Separate AudioContext:** Mic uses its own AudioContext at 16kHz, independent from any future tab capture AudioContext.
- **Permission error handling:** If getUserMedia fails with NotAllowedError, log helpful message about needing to grant permission via extension settings.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type narrowing with discriminated unions**
- **Found during:** Task 2 (Adding message handlers)
- **Issue:** `isMessage<AudioChunkMessage>` with union type `'TAB_AUDIO_CHUNK' | 'MIC_AUDIO_CHUNK'` caused TypeScript to narrow message to `never` after checking other types
- **Fix:** Split `AudioChunkMessage` into `TabAudioChunkMessage` and `MicAudioChunkMessage` with specific literal types
- **Files modified:** src/types/messages.ts, entrypoints/background.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** ea9eb5c

**2. [Rule 1 - Bug] Fixed isMessage type guard usage without generic parameter**
- **Found during:** Task 2 (Adding message handlers)
- **Issue:** `isMessage(message, 'CREATE_OFFSCREEN')` without explicit type parameter caused incorrect type narrowing
- **Fix:** Changed to direct `message.type === 'CREATE_OFFSCREEN'` checks for simpler cases
- **Files modified:** entrypoints/background.ts
- **Verification:** TypeScript compiles without errors
- **Committed in:** ea9eb5c

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Type system fixes necessary for TypeScript compilation. No scope creep.

## Issues Encountered
- Task 2 changes (message types and background handlers) were committed as part of parallel execution (06-02 commit). This is acceptable as the work is committed and the code functions correctly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Microphone capture ready for transcription integration
- Combined tab + mic capture ready for Phase 03 (Transcription)
- Both capture sources produce 16kHz mono PCM data via same AudioWorklet
- Consider adding combined capture start/stop for convenience

---
*Phase: 02-audio-pipeline*
*Completed: 2026-01-29*
