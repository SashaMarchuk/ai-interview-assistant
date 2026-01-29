---
phase: 04
plan: 01
subsystem: llm-integration
tags: [openrouter, streaming, sse, prompts, eventsource-parser]
dependency-graph:
  requires:
    - phase-6 (store/types with PromptTemplate)
    - src/utils/promptSubstitution
  provides:
    - src/services/llm module with streaming client
    - prompt building for dual-stream requests
  affects:
    - phase-04-02 (streaming handler integration)
    - background.ts (will consume LLM service)
tech-stack:
  added:
    - eventsource-parser@3.0.6
  patterns:
    - SSE streaming with callback-based token delivery
    - Prompt variable substitution pattern
    - Dual-prompt differentiation (fast hint vs full answer)
key-files:
  created:
    - src/services/llm/types.ts
    - src/services/llm/OpenRouterClient.ts
    - src/services/llm/PromptBuilder.ts
    - src/services/llm/index.ts
  modified:
    - package.json (added eventsource-parser)
decisions:
  - id: eventsource-parser-v3
    choice: eventsource-parser@3.0.6 with EventSourceMessage type
    rationale: v3 API uses EventSourceMessage instead of ParsedEvent
metrics:
  duration: ~5 minutes
  completed: 2026-01-29
---

# Phase 04 Plan 01: LLM Service Foundation Summary

OpenRouter SSE streaming client with prompt building for dual-stream LLM requests using eventsource-parser.

## What Was Built

### Task 1: Install eventsource-parser and create LLM types
**Commit:** 3d218b4

- Installed eventsource-parser@3.0.6 for SSE stream parsing
- Created `src/services/llm/types.ts` with:
  - `StreamOptions`: Single-stream configuration (model, prompts, maxTokens, callbacks, abortSignal)
  - `DualLLMRequest`: Parallel request structure (question, recentContext, fullTranscript, templateId)
  - `StreamCallbacks`: Callbacks for dual-stream handling (onFastToken, onFullToken, etc.)
  - `OpenRouterChatMessage`: Message format for OpenRouter API
  - `OpenRouterStreamChunk`: SSE response chunk structure with delta.content

### Task 2: Create OpenRouter streaming client
**Commit:** 1585789

- Created `src/services/llm/OpenRouterClient.ts` with:
  - `streamLLMResponse()`: Async function for SSE streaming requests
  - Proper headers: Authorization, Content-Type, HTTP-Referer, X-Title
  - SSE parsing via eventsource-parser's createParser
  - Token callbacks on each delta.content
  - Completion detection via `[DONE]` marker
  - Error handling for HTTP errors and stream errors
  - AbortSignal support for request cancellation

### Task 3: Create prompt builder and barrel export
**Commit:** 35bd169

- Created `src/services/llm/PromptBuilder.ts` with:
  - `buildPrompt()`: Combines request data with template patterns
  - Uses `substituteVariables()` from utils/promptSubstitution
  - Returns `{ system, user, userFull }` for dual-stream requests
  - Fast hint appends instruction for brevity (1-2 sentences)
  - Full answer appends instruction for comprehensive response

- Created `src/services/llm/index.ts` barrel export:
  - Re-exports all types from ./types
  - Re-exports `streamLLMResponse` from ./OpenRouterClient
  - Re-exports `buildPrompt` and `BuildPromptResult` from ./PromptBuilder

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| SSE parser | eventsource-parser@3.0.6 | Robust parser with v3 API using EventSourceMessage type |
| Prompt differentiation | Instruction appendage | Same base prompt with different instructions for fast/full |
| Abort handling | AbortSignal passthrough | Clean cancellation via standard AbortController pattern |

## Verification Results

| Check | Status |
|-------|--------|
| npm run build | PASS |
| src/services/llm/ contains 4 files | PASS |
| eventsource-parser in package.json | PASS |
| Type checking passes | PASS |

## Deviations from Plan

**[Rule 1 - Bug] Fixed eventsource-parser type import**
- **Found during:** Task 2
- **Issue:** Plan specified `ParsedEvent` type which doesn't exist in v3
- **Fix:** Changed to `EventSourceMessage` which is the correct v3 type
- **Files modified:** src/services/llm/OpenRouterClient.ts
- **Commit:** 1585789

## Next Phase Readiness

**Ready for Plan 04-02:** Streaming Handler Integration
- LLM service module complete with clean API surface
- Background.ts can import from `src/services/llm`
- streamLLMResponse ready to be called with parallel AbortControllers for dual-stream

**Dependencies resolved:**
- PromptTemplate from store/types (Phase 6) available
- substituteVariables from utils available
- eventsource-parser installed and typed

---

*Generated: 2026-01-29*
