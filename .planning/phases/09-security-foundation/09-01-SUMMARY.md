---
phase: 09-security-foundation
plan: 01
subsystem: security
tags: [chrome-runtime-messages, api-key-security, store-hydration, queue-guard]

# Dependency graph
requires: []
provides:
  - "Secure message channel: popup sends START_TRANSCRIPTION without API key"
  - "InternalStartTranscriptionMessage type for background-to-offscreen internal use"
  - "Queue guard pattern for store hydration with 10s timeout"
  - "Background reads ElevenLabs key from Zustand store, not from messages"
affects: [10-encryption-layer, 11-transcript-resilience]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Queue guard for service worker store hydration"
    - "Internal message types for trusted extension-origin communication"
    - "Security boundary in background (store-based key read) vs UX boundary in popup (key presence check)"

key-files:
  created: []
  modified:
    - "src/types/messages.ts"
    - "entrypoints/popup/App.tsx"
    - "entrypoints/background.ts"
    - "entrypoints/offscreen/main.ts"

key-decisions:
  - "Widened isMessage type guard constraint from ExtensionMessage to { type: string } to support InternalStartTranscriptionMessage without adding it to union"
  - "InternalStartTranscriptionMessage NOT added to ExtensionMessage union -- internal-only type"
  - "webext-zustand messages bypass queue guard to prevent hydration deadlock"

patterns-established:
  - "Queue guard pattern: messages queued before storeReady, drained after hydration"
  - "Internal message types: separate interface with _fromBackground marker for trusted internal communication"
  - "Dual validation: popup checks key for UX, background checks key for security"

# Metrics
duration: 4min
completed: 2026-02-08
---

# Phase 9 Plan 1: Remove API Keys from Messages + Queue Guard Summary

**API keys removed from popup-to-background messages, background reads keys from Zustand store, queue guard prevents message loss during service worker cold starts**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-08T15:01:52Z
- **Completed:** 2026-02-08T15:06:04Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Removed `apiKey` field from `StartTranscriptionMessage` type -- API keys no longer visible in Chrome DevTools message inspector
- Added `InternalStartTranscriptionMessage` for trusted background-to-offscreen communication
- Background reads ElevenLabs API key from `useStore.getState().apiKeys.elevenLabs` instead of message payload
- Queue guard buffers messages until Zustand store hydrates, with 10-second safety timeout
- webext-zustand sync messages (`chromex.dispatch`, `chromex.fetch_state`) bypass queue to prevent hydration deadlock

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove apiKey from external StartTranscriptionMessage and update popup** - `9ab4fa0` (feat)
2. **Task 2: Add queue guard infrastructure for store hydration** - `e96b58a` (feat)
3. **Task 3: Read ElevenLabs API key from store instead of message** - `bf528e1` (feat)

## Files Created/Modified
- `src/types/messages.ts` - Removed apiKey from StartTranscriptionMessage, added InternalStartTranscriptionMessage, widened isMessage constraint
- `entrypoints/popup/App.tsx` - Removed apiKey from handleStartTranscription sendMessage call
- `entrypoints/background.ts` - Queue guard infrastructure + store-based API key read for START_TRANSCRIPTION
- `entrypoints/offscreen/main.ts` - Updated type guard to use InternalStartTranscriptionMessage

## Decisions Made
- Widened `isMessage<T>` generic constraint from `T extends ExtensionMessage` to `T extends { type: string }` to support `InternalStartTranscriptionMessage` without polluting the ExtensionMessage union
- `InternalStartTranscriptionMessage` kept out of `ExtensionMessage` union -- it is only used for type-safe casting in background.ts and type guard in offscreen
- webext-zustand filter positioned as first check in onMessage listener (line 469), before queue guard (line 490), to prevent deadlock where queuing sync messages prevents the store from ever hydrating

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed offscreen type guard for InternalStartTranscriptionMessage**
- **Found during:** Task 1 (Remove apiKey from StartTranscriptionMessage)
- **Issue:** Removing `apiKey` from `StartTranscriptionMessage` broke `entrypoints/offscreen/main.ts` which used `isMessage<StartTranscriptionMessage>` to access `message.apiKey`. The offscreen only receives internal messages (with `_fromBackground: true`), so it needs the internal type.
- **Fix:** Changed offscreen import from `StartTranscriptionMessage` to `InternalStartTranscriptionMessage` and updated the type guard call. Also widened `isMessage` constraint from `T extends ExtensionMessage` to `T extends { type: string }` since `InternalStartTranscriptionMessage` is not in the union.
- **Files modified:** `entrypoints/offscreen/main.ts`, `src/types/messages.ts`
- **Verification:** `npx tsc --noEmit` passes (only expected background.ts error remaining, fixed in Task 3)
- **Committed in:** `9ab4fa0` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix -- without it, removing apiKey from StartTranscriptionMessage would break the offscreen document. The plan mentioned "offscreen is NOT modified" but this was incorrect since offscreen uses the type that was changed. No scope creep.

## Issues Encountered
None beyond the deviation documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SEC-01 (no API keys in messages) and REL-01 (queue guard for store hydration) are complete
- Ready for Phase 10 (Encryption Layer) which will encrypt API keys at rest in storage
- The queue guard pattern established here will be needed by the encryption layer (init order: encryption -> store hydration -> message processing)

## Self-Check: PASSED

- All 4 modified files exist
- All 3 task commits verified (9ab4fa0, e96b58a, bf528e1)
- InternalStartTranscriptionMessage present in messages.ts
- storeReady and messageQueue present in background.ts
- message.apiKey has 0 references in background.ts
- Build passes with zero type errors

---
*Phase: 09-security-foundation*
*Completed: 2026-02-08*
