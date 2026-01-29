---
phase: "04"
plan: "02"
name: "LLM Message Types and Streaming Handler"
subsystem: "messaging"
tags: ["llm", "streaming", "service-worker", "messages", "openrouter"]

dependency-graph:
  requires: ["04-01"]
  provides: ["LLM message types", "dual parallel streaming handler"]
  affects: ["04-03", "04-04"]

tech-stack:
  added: []
  patterns: ["dual parallel streaming", "abort controller cancellation", "keep-alive interval"]

key-files:
  created: []
  modified:
    - src/types/messages.ts
    - entrypoints/background.ts

decisions:
  - id: "llm-message-types"
    description: "Four message types for complete LLM lifecycle"
    rationale: "REQUEST/STREAM/STATUS/CANCEL cover all request lifecycle states"
  - id: "keep-alive-interval"
    description: "20-second interval calling getPlatformInfo to prevent Service Worker termination"
    rationale: "Service Worker has 30-second idle timeout, keep-alive ensures long streaming responses complete"
  - id: "abort-controller-per-request"
    description: "Each responseId maps to dedicated AbortController"
    rationale: "Enables individual request cancellation without affecting other concurrent requests"
  - id: "parallel-non-blocking-streams"
    description: "Both fast and full model requests fire simultaneously"
    rationale: "Maximizes responsiveness - fast hint arrives quickly while full answer streams"

metrics:
  duration: "2m 6s"
  completed: "2026-01-29"
---

# Phase 04 Plan 02: LLM Message Types and Streaming Handler Summary

LLM message types (REQUEST/STREAM/STATUS/CANCEL) with dual parallel streaming in Service Worker background.ts

## Completed Tasks

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Add LLM message types | 75bc6cb | 4 message types in discriminated union |
| 2 | Implement dual parallel LLM streaming | 8024d7d | handleLLMRequest, keep-alive, abort support |

## Decisions Made

### LLM Message Type Design

Four complementary message types cover the complete request lifecycle:
- **LLM_REQUEST**: Content script -> background, initiates dual parallel streams
- **LLM_STREAM**: Background -> content script, delivers individual tokens
- **LLM_STATUS**: Background -> content script, tracks pending/streaming/complete/error states
- **LLM_CANCEL**: Content script -> background, aborts in-flight requests

Each message includes `responseId` for correlation across the message flow.

### Service Worker Keep-Alive Strategy

Service Workers have a 30-second idle timeout. During long LLM streaming responses:
- Start 20-second interval calling `chrome.runtime.getPlatformInfo()`
- This no-op API call resets the idle timer
- Interval stops when all active requests complete

### Abort Controller Tracking

Each `responseId` maps to a dedicated `AbortController`:
- Stored in `activeAbortControllers` Map
- Passed to both fast and full `streamLLMResponse` calls via `abortSignal`
- LLM_CANCEL triggers `abort()` and cleanup
- Multiple concurrent requests can be cancelled independently

## Technical Implementation

### Message Flow

```
Content Script                     Background
     |                                 |
     |-- LLM_REQUEST ---------------->|
     |                                 |-- streamLLMResponse (fast)
     |                                 |-- streamLLMResponse (full)
     |<-- LLM_STATUS (pending) -------|
     |<-- LLM_STATUS (streaming) -----|
     |                                 |
     |<-- LLM_STREAM (fast, token) ---|
     |<-- LLM_STREAM (fast, token) ---|
     |<-- LLM_STREAM (full, token) ---|
     |<-- LLM_STREAM (fast, token) ---|
     |                                 |
     |<-- LLM_STATUS (fast complete) -|
     |                                 |
     |<-- LLM_STREAM (full, token) ---|
     |<-- LLM_STATUS (full complete) -|
```

### handleLLMRequest Implementation

```typescript
async function handleLLMRequest(
  responseId: string,
  question: string,
  recentContext: string,
  fullTranscript: string,
  templateId: string
): Promise<void> {
  // 1. Get store state for API keys, models, templates
  const state = useStore.getState();

  // 2. Validate API key and template
  // 3. Build prompts using buildPrompt()

  // 4. Create AbortController for cancellation
  const abortController = new AbortController();
  activeAbortControllers.set(responseId, abortController);

  // 5. Start keep-alive
  startKeepAlive();

  // 6. Fire BOTH streams in parallel (non-blocking)
  const fastPromise = streamLLMResponse({...});
  const fullPromise = streamLLMResponse({...});
}
```

### Key Patterns Established

1. **sendLLMMessageToMeet()** - Helper to broadcast to Google Meet tabs
2. **Keep-alive lifecycle** - Start on first request, stop when all complete
3. **Completion tracking** - Both `fastComplete` and `fullComplete` must be true
4. **Error isolation** - One model failing doesn't affect the other

## Files Changed

### src/types/messages.ts
- Added 4 message types to MessageType union
- Added LLMRequestMessage, LLMStreamMessage, LLMStatusMessage, LLMCancelMessage interfaces
- Added all 4 to ExtensionMessage union

### entrypoints/background.ts
- Import streamLLMResponse, buildPrompt from src/services/llm
- Import useStore from src/store
- Added activeAbortControllers Map for cancellation tracking
- Added keepAliveInterval and start/stop helpers
- Added sendLLMMessageToMeet() helper
- Added handleLLMRequest() for dual parallel streaming
- Added switch cases for LLM_REQUEST, LLM_STREAM, LLM_STATUS, LLM_CANCEL

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

| Check | Status |
|-------|--------|
| npm run build passes | PASS |
| 4 message types in ExtensionMessage union | PASS |
| background.ts imports from src/services/llm | PASS |
| handleLLMRequest fires two parallel streams | PASS |
| AbortController enables request cancellation | PASS |

## Next Phase Readiness

Plan 04-03 can now:
- Send LLM_REQUEST messages from content script
- Receive LLM_STREAM tokens for real-time display
- Monitor LLM_STATUS for UI state updates
- Send LLM_CANCEL to abort requests

No blockers identified.
