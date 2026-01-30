---
phase: 07-integration
plan: 02
type: summary

# Dependency Graph
requires:
  - "Phase 4 (LLM Integration)"
  - "Phase 3 (Transcription)"
provides:
  - "Connection state message type"
  - "STT connection state broadcasting"
  - "LLM retry logic (3 retries with backoff)"
  - "Content script connection state events"
affects:
  - "07-01 (HealthIndicator consumes connection-state-update events)"
  - "07-03 (Settings wiring may use similar patterns)"

# Tech Tracking
tech-stack:
  added: []
  patterns:
    - "streamWithRetry wrapper for automatic retry with exponential backoff"
    - "broadcastConnectionState helper for unified connection state broadcasting"
    - "Custom events (connection-state-update) for React component communication"

# File Tracking
key-files:
  created: []
  modified:
    - "src/types/messages.ts (CONNECTION_STATE type)"
    - "entrypoints/background.ts (retry logic, connection state forwarding)"
    - "entrypoints/offscreen/main.ts (STT connection state broadcasting)"
    - "entrypoints/content.tsx (CONNECTION_STATE handler)"

# Decisions
decisions:
  - id: "retry-pattern"
    choice: "Recursive retry with exponential backoff"
    rationale: "Allows clean async retry logic with configurable delays"
  - id: "connection-state-flow"
    choice: "Offscreen -> Background -> Content -> Overlay (via custom event)"
    rationale: "Follows existing message flow pattern, keeps components decoupled"
  - id: "retry-count"
    choice: "3 retries with 1s base delay"
    rationale: "Balance between recovery and avoiding long waits on persistent failures"

# Metrics
metrics:
  duration: "~4m"
  completed: "2026-01-30"
---

# Phase 7 Plan 02: Connection State and Retry Logic Summary

**One-liner:** Added CONNECTION_STATE message type, STT connection broadcasting from offscreen, LLM retry logic (3 attempts with backoff), and content script event dispatching for HealthIndicator.

## What Was Built

### 1. Connection State Message Type
Added `CONNECTION_STATE` to the message type system:
- Service: `'stt-tab' | 'stt-mic' | 'llm'`
- State: `'connected' | 'disconnected' | 'reconnecting' | 'error'`
- Optional error message

### 2. STT Connection State Broadcasting (Offscreen)
The offscreen document now broadcasts connection state changes:
- **Connected:** When WebSocket successfully connects
- **Reconnecting:** When error occurs but retry is possible (canRetry=true)
- **Error:** When error occurs and no retry possible (canRetry=false)
- **Disconnected:** When stopTranscription() is called

### 3. LLM Retry Logic (Background)
Added automatic retry for LLM requests:
- **MAX_LLM_RETRIES:** 3 attempts
- **LLM_RETRY_DELAY_MS:** 1000ms base delay (exponential)
- Sends retry status to UI: "Retrying (1/3)..."
- Broadcasts LLM error state after max retries exceeded

### 4. Content Script Connection Events
Content script handles `CONNECTION_STATE` messages and dispatches custom events:
- Event: `connection-state-update`
- Detail: `ConnectionStateEventDetail` (service, state, error)
- Allows Overlay/HealthIndicator to react without direct coupling

## Technical Details

### Data Flow

```
STT Flow:
  ElevenLabsConnection -> offscreen (broadcastConnectionState)
    -> background (forwards) -> content (custom event) -> Overlay

LLM Flow:
  streamWithRetry (on failure) -> retry loop -> sendConnectionState
    -> content (custom event) -> Overlay
```

### Key Code Patterns

```typescript
// Retry wrapper pattern
async function streamWithRetry(
  params: StreamWithRetryParams,
  modelType: 'fast' | 'full',
  responseId: string,
  retryCount = 0
): Promise<void> {
  try {
    await streamLLMResponse(params);
  } catch (error) {
    if (retryCount < MAX_LLM_RETRIES && !params.abortSignal?.aborted) {
      // Send retry status, wait with backoff, retry
      await new Promise(r => setTimeout(r, LLM_RETRY_DELAY_MS * (retryCount + 1)));
      return streamWithRetry(params, modelType, responseId, retryCount + 1);
    }
    // Broadcast error state and call original error handler
  }
}
```

## Commits

| Hash | Description |
|------|-------------|
| 4f84dfa | feat(07-02): add CONNECTION_STATE message type for service health |
| 649b762 | feat(07-02): broadcast STT connection state from offscreen |
| 9e60788 | feat(07-02): add LLM retry logic and content script connection state |

## Success Criteria Met

1. [x] New message type CONNECTION_STATE defined
2. [x] Offscreen broadcasts when STT WebSocket connects/disconnects/reconnects
3. [x] Background forwards connection state and has LLM retry logic
4. [x] Content script receives connection state and dispatches to Overlay
5. [x] Build succeeds with no TypeScript errors

## Deviations from Plan

None - plan executed exactly as written.

## Integration Notes

- The `connection-state-update` custom event is now available for the HealthIndicator component (from Plan 07-01) to consume
- LLM retry shows status updates in UI via existing LLM_STATUS messages
- Connection state forwarding uses the same pattern as TRANSCRIPT_UPDATE forwarding

---

*Generated: 2026-01-30*
