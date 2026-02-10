# Phase 17: Cost Tracking Capture - Research

**Researched:** 2026-02-09
**Domain:** LLM API streaming token usage extraction, cost calculation, Chrome extension message passing
**Confidence:** HIGH

## Summary

Phase 17 requires extracting token usage metadata from the final chunk of SSE streaming responses (and non-streaming JSON fallback), calculating per-request costs based on model pricing, passing that data from the background service worker to the content script overlay, and displaying it in the UI. The two providers (OpenAI and OpenRouter) handle usage differently: OpenRouter includes a `cost` field directly in the usage object; OpenAI returns only token counts, requiring client-side cost calculation from a static pricing table.

The key architectural challenge is that token usage arrives in the *last* SSE chunk (after `[DONE]` marker or in the final chunk with empty choices), but the current `streamSSE` utility discards everything except `delta.content`. The streaming pipeline needs to be extended with a `usage` extraction callback without breaking the existing token flow. No new libraries are needed -- this is pure data extraction and arithmetic.

**Primary recommendation:** Extend `streamSSE` to capture the `usage` object from the final SSE chunk, add an `onUsage` callback to `ProviderStreamOptions`, propagate usage data through existing message channels (new `LLM_COST` message type), and display per-request cost + session total in the overlay.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| No new libraries needed | - | Token usage extraction is built into API responses | OpenAI/OpenRouter both include usage in final streaming chunks |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| No new dependencies | - | All computation is arithmetic (tokens * price) | Static pricing table with per-model rates |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Static pricing table | OpenRouter `/api/v1/models` API for dynamic pricing | Dynamic pricing is more accurate but adds network request latency + complexity; static table is sufficient for MVP and can be updated periodically |
| In-memory session totals | IndexedDB for persistence | Phase 18 handles IndexedDB persistence; Phase 17 only needs in-memory session totals |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Data Flow Architecture
```
API Response (final SSE chunk)
    |
    v
streamSSE.ts --- extracts `usage` object from final chunk
    |
    v
ProviderStreamOptions.onUsage(usage) callback
    |
    v
background.ts --- receives usage, calculates cost, sends message
    |
    v
LLM_COST message (new message type) --- broadcast to Meet tabs
    |
    v
content.tsx --- receives cost data, updates LLMResponse with cost fields
    |
    v
Overlay.tsx / ResponsePanel.tsx --- displays per-request cost + session total
```

### Recommended File Changes
```
src/
  services/llm/
    providers/
      streamSSE.ts        # MODIFY: Extract usage from final chunk, add onUsage callback
      LLMProvider.ts       # MODIFY: Add onUsage to ProviderStreamOptions
    types.ts               # MODIFY: Add TokenUsage and CostData interfaces
  types/
    messages.ts            # MODIFY: Add LLM_COST message type
    transcript.ts          # MODIFY: Add cost fields to LLMResponse
  overlay/
    ResponsePanel.tsx      # MODIFY: Display per-request cost badge
    Overlay.tsx            # MODIFY: Display session cost total in footer
entrypoints/
  background.ts            # MODIFY: Handle usage callback, calculate cost, broadcast LLM_COST
  content.tsx              # MODIFY: Handle LLM_COST message, update response state
```

### Pattern 1: Usage Extraction from SSE Final Chunk

**What:** Both OpenAI and OpenRouter include a `usage` object in the final streaming chunk. For OpenAI, this requires `stream_options: { include_usage: true }` in the request body. For OpenRouter, usage is always included automatically.

**When to use:** Every streaming LLM request.

**OpenAI final chunk structure:**
```json
{
  "choices": [],
  "usage": {
    "prompt_tokens": 19,
    "completion_tokens": 10,
    "total_tokens": 29,
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "audio_tokens": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 0,
      "audio_tokens": 0,
      "accepted_prediction_tokens": 0,
      "rejected_prediction_tokens": 0
    }
  }
}
```

**OpenRouter final chunk structure:**
```json
{
  "choices": [],
  "usage": {
    "prompt_tokens": 194,
    "completion_tokens": 2,
    "total_tokens": 196,
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "cache_write_tokens": 100,
      "audio_tokens": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 0
    },
    "cost": 0.00095
  }
}
```

**Key difference:** OpenRouter includes a `cost` field directly (in credits). OpenAI does not -- cost must be calculated client-side.

### Pattern 2: Static Pricing Table for OpenAI

**What:** A TypeScript map of model IDs to per-token prices (input and output, per million tokens).

**When to use:** Calculating cost for OpenAI provider requests, where the API does not return cost.

**Example:**
```typescript
interface ModelPricing {
  inputPerMillion: number;   // USD per 1M input tokens
  outputPerMillion: number;  // USD per 1M output tokens
}

const OPENAI_PRICING: Record<string, ModelPricing> = {
  'gpt-4o':         { inputPerMillion: 2.50,  outputPerMillion: 10.00 },
  'gpt-4o-mini':    { inputPerMillion: 0.15,  outputPerMillion: 0.60 },
  'gpt-4.1':        { inputPerMillion: 2.00,  outputPerMillion: 8.00 },
  'gpt-4.1-mini':   { inputPerMillion: 0.40,  outputPerMillion: 1.60 },
  'gpt-4.1-nano':   { inputPerMillion: 0.10,  outputPerMillion: 0.40 },
  'gpt-5':          { inputPerMillion: 1.25,  outputPerMillion: 10.00 },
  'gpt-5-mini':     { inputPerMillion: 0.25,  outputPerMillion: 2.00 },
  'gpt-5-nano':     { inputPerMillion: 0.05,  outputPerMillion: 0.40 },
  'o1':             { inputPerMillion: 15.00, outputPerMillion: 60.00 },
  'o1-mini':        { inputPerMillion: 1.10,  outputPerMillion: 4.40 },
  'o3-mini':        { inputPerMillion: 1.10,  outputPerMillion: 4.40 },
  'o4-mini':        { inputPerMillion: 1.10,  outputPerMillion: 4.40 },
};

function calculateCostUSD(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = OPENAI_PRICING[modelId];
  if (!pricing) return 0; // Unknown model, can't calculate
  const inputCost = (promptTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (completionTokens / 1_000_000) * pricing.outputPerMillion;
  return inputCost + outputCost;
}
```

### Pattern 3: OpenRouter Pricing via Cost Field

**What:** OpenRouter returns `cost` directly in the usage object (in credits/USD). No lookup table needed.

**When to use:** For all OpenRouter provider requests.

**Example:**
```typescript
// OpenRouter: cost comes directly from the response
const costUSD = usage.cost ?? 0;
```

### Pattern 4: Non-Streaming JSON Fallback

**What:** Reasoning models may return JSON instead of SSE (existing non-streaming fallback in `streamSSE.ts`). The usage object is at the top level of the JSON response.

**When to use:** When content-type is `application/json` (reasoning model fallback path).

**Example:**
```typescript
// In the non-streaming JSON fallback path:
const json = await response.json();
// Extract usage from top-level
if (json.usage && options.onUsage) {
  options.onUsage(json.usage);
}
```

### Pattern 5: Message Type for Cost Data

**What:** A new `LLM_COST` message type to send usage/cost data from background to content scripts.

**When to use:** After each model completes and usage is available.

**Example:**
```typescript
interface LLMCostMessage extends BaseMessage {
  type: 'LLM_COST';
  responseId: string;
  model: LLMModelType;  // 'fast' | 'full'
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  costUSD: number;  // Calculated or from API
}
```

### Anti-Patterns to Avoid

- **Parsing usage from content tokens:** Never try to extract usage from the delta content stream. Usage is metadata in a separate final chunk.
- **Blocking on cost calculation:** Cost calculation is fast arithmetic. Never make it async or add delays.
- **Storing session cost in Zustand:** Per roadmap decision, cost records go to IndexedDB (Phase 18). Phase 17 only needs in-memory session totals.
- **Fetching pricing from API at request time:** Adding a network request to fetch pricing for every LLM request adds latency. Use a static table.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token counting from text | Client-side tokenizer | API-returned `prompt_tokens`/`completion_tokens` | API returns exact counts; client-side tokenization is approximate and model-dependent |
| Pricing for OpenRouter models | Pricing lookup table for OpenRouter | `usage.cost` field from API response | OpenRouter returns cost directly; maintaining 400+ model prices would be impractical |

**Key insight:** The API responses already contain all the data needed. The only "calculation" is for OpenAI where we multiply token counts by known per-model rates.

## Common Pitfalls

### Pitfall 1: Missing `stream_options` for OpenAI
**What goes wrong:** OpenAI does NOT include usage in streaming responses by default. Without `stream_options: { include_usage: true }` in the request body, the usage object will be `null` on all chunks.
**Why it happens:** This is opt-in for OpenAI (unlike OpenRouter which always includes it).
**How to avoid:** Add `stream_options: { include_usage: true }` to the request body in `OpenAIProvider.streamResponse()`.
**Warning signs:** `onUsage` callback never fires for OpenAI requests.

### Pitfall 2: OpenAI Final Chunk Has Empty Choices
**What goes wrong:** When `include_usage` is true, OpenAI sends an extra final chunk where `choices` is an empty array `[]` and `usage` contains the data. If the parser only looks at `choices[0]`, it will miss the usage data.
**Why it happens:** The usage-only chunk is a separate SSE event before `[DONE]`.
**How to avoid:** In the SSE parser's `onEvent`, after parsing JSON, check for `chunk.usage` *regardless* of whether `choices` has entries. If `chunk.usage` exists and `onUsage` callback is provided, call it.
**Warning signs:** Usage data works for OpenRouter but not OpenAI.

### Pitfall 3: Dual-Stream Cost Aggregation
**What goes wrong:** In normal (non-reasoning) mode, two streams run in parallel (fast + full). The per-request cost must be the sum of both, but they complete at different times.
**Why it happens:** Fast model typically completes before full model.
**How to avoid:** Send separate `LLM_COST` messages for each model. Content script aggregates both costs into a single `totalCost` field on the response. Display updates as each arrives.
**Warning signs:** Cost shows only fast model cost, then jumps when full model completes.

### Pitfall 4: Reasoning Tokens in Cost Calculation
**What goes wrong:** For reasoning models, `completion_tokens` in the API response includes reasoning tokens (internal chain-of-thought tokens). These are billed at the output token rate. The `reasoning_tokens` field is informational but does not change pricing.
**Why it happens:** OpenAI bills all output tokens (including reasoning) at the same rate per the published pricing.
**How to avoid:** Use `completion_tokens` (not `completion_tokens - reasoning_tokens`) for cost calculation. Display `reasoning_tokens` separately for user information.
**Warning signs:** Cost appears too low for reasoning model requests.

### Pitfall 5: Non-Streaming JSON Fallback Path
**What goes wrong:** The existing non-streaming fallback in `streamSSE.ts` (for reasoning models that return JSON) does not extract `usage`. Cost tracking will silently fail for these requests.
**Why it happens:** The current code only extracts `choices[0].message.content` from the JSON response, ignoring the `usage` field.
**How to avoid:** In the non-streaming JSON path, extract `json.usage` and call `onUsage` if present.
**Warning signs:** Cost shows as $0.00 for reasoning model requests that use the JSON fallback.

### Pitfall 6: Service Worker Context for Session Totals
**What goes wrong:** Keeping session cost totals in the content script means they reset on page navigation. Keeping them in the background service worker means they survive page refreshes but reset on SW termination.
**Why it happens:** Chrome MV3 service workers are ephemeral.
**How to avoid:** For Phase 17, in-memory totals in the content script are acceptable (session = single page load). Phase 18 handles persistence via IndexedDB. Session total resets on page reload is expected behavior.
**Warning signs:** None for Phase 17; this becomes relevant in Phase 18.

## Code Examples

### Example 1: Extended StreamChunk Interface
```typescript
// Source: OpenAI API Reference + OpenRouter API Reference
export interface StreamChunk {
  choices: Array<{
    delta: {
      content?: string;
      role?: 'assistant';
    };
    finish_reason: 'stop' | 'length' | 'error' | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
      audio_tokens?: number;
      cache_write_tokens?: number;
    };
    completion_tokens_details?: {
      reasoning_tokens?: number;
      audio_tokens?: number;
      accepted_prediction_tokens?: number;
      rejected_prediction_tokens?: number;
    };
    cost?: number; // OpenRouter only: cost in credits/USD
  };
  error?: {
    message: string;
    code?: string;
  };
}
```

### Example 2: Adding stream_options to OpenAI Request Body
```typescript
// In OpenAIProvider.streamResponse():
const body: Record<string, unknown> = {
  model,
  messages,
  ...tokenLimit,
  stream: true,
  stream_options: { include_usage: true },  // <-- Required for usage in streaming
};
```

### Example 3: Usage Extraction in SSE Parser
```typescript
// In streamSSE onEvent handler:
const chunk = JSON.parse(event.data) as StreamChunk;

// Extract usage from final chunk (has usage field, may have empty choices)
if (chunk.usage && options.onUsage) {
  options.onUsage(chunk.usage);
}

// Existing content extraction continues...
const choice = chunk.choices?.[0];
if (choice?.delta?.content) {
  onToken(choice.delta.content);
}
```

### Example 4: Cost Display in ResponsePanel
```typescript
// After response completes, show cost badge:
{response.status === 'complete' && response.costUSD != null && (
  <span className="text-xs text-white/40">
    ${response.costUSD.toFixed(4)}
  </span>
)}
```

### Example 5: Session Total in Overlay Footer
```typescript
// In Overlay.tsx footer:
<div className="flex items-center justify-between border-t border-white/10 px-3 py-1.5 text-xs text-white/60">
  <span>AI Interview Assistant</span>
  <div className="flex items-center gap-2">
    {sessionCost > 0 && (
      <span className="text-white/40">
        Session: ${sessionCost.toFixed(4)}
      </span>
    )}
    <StatusIndicator status={...} />
  </div>
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No usage in streaming | `stream_options: { include_usage: true }` | OpenAI: Nov 2024+ | Must opt-in for OpenAI streaming |
| Manual token counting | API returns exact counts | Always available | No need for client-side tokenizers |
| No cost in response | OpenRouter includes `cost` in usage | OpenRouter: 2024+ | No calculation needed for OpenRouter |

**Deprecated/outdated:**
- OpenRouter's `usage` and `stream_options` request parameters are deprecated (usage is always included automatically). No need to send these in OpenRouter requests.

## Key Architectural Decisions for Planner

### 1. Where to calculate cost
- **OpenRouter:** Use `usage.cost` directly from API response (most accurate).
- **OpenAI:** Calculate from token counts using static pricing table (prices change infrequently; table can be updated with codebase updates).

### 2. Where to store session totals
- **Content script state** (in-memory): Simple, resets on page reload (which is natural session boundary).
- Not in Zustand (per roadmap decision -- avoids webext-zustand sync bloat).
- Not in IndexedDB yet (that's Phase 18).

### 3. Message flow for cost data
- **Option A:** New `LLM_COST` message type (clean separation, explicit).
- **Option B:** Add cost fields to existing `LLM_STATUS` `complete` message (fewer message types, but overloads the status message).
- **Recommendation:** Option A -- new `LLM_COST` message. Clean, explicit, easy to handle in content script. Only sent once per model per request.

### 4. Cost fields on LLMResponse
- Add to the existing `LLMResponse` interface: `fastCostUSD`, `fullCostUSD`, `totalCostUSD`, `tokenUsage` (detailed breakdown).
- These are populated incrementally as each model's cost arrives.

### 5. Dual-stream cost display
- In normal mode (fast + full), show combined cost after both complete.
- During streaming, show partial cost as each model finishes.
- In reasoning mode (full only), show single cost.

## Open Questions

1. **OpenRouter credit vs USD conversion**
   - What we know: OpenRouter returns `cost` in "credits". Documentation suggests credits = USD for standard accounts.
   - What's unclear: Whether there's ever a credits-to-USD conversion factor for some account types.
   - Recommendation: Treat `cost` as USD for now. If credits != USD for some users, Phase 18 can add a conversion setting.

2. **OpenAI pricing accuracy**
   - What we know: Prices are from the official pricing page as of Feb 2026.
   - What's unclear: How quickly prices change and whether the static table will become stale.
   - Recommendation: Static table is fine for Phase 17 (MVP). Add a "last updated" comment. Phase 18 could optionally fetch from an API.

3. **Cached token pricing**
   - What we know: OpenAI charges half price for cached input tokens. OpenRouter may have similar discounts.
   - What's unclear: Whether `prompt_tokens_details.cached_tokens` affects the actual billing differently.
   - Recommendation: For Phase 17 MVP, calculate cost using total `prompt_tokens` at full price. This slightly overestimates cost for cached requests but is simpler. Can refine later.

## Sources

### Primary (HIGH confidence)
- OpenAI Chat Completions API Reference: https://platform.openai.com/docs/api-reference/chat -- usage field structure, stream_options
- OpenAI Streaming Reference: https://platform.openai.com/docs/api-reference/chat-streaming -- include_usage behavior
- OpenRouter Usage Accounting: https://openrouter.ai/docs/guides/guides/usage-accounting -- cost field, automatic usage inclusion
- OpenRouter API Reference: https://openrouter.ai/docs/api/reference/overview -- usage object TypeScript types
- OpenRouter Streaming Reference: https://openrouter.ai/docs/api/reference/streaming -- final chunk usage behavior
- OpenAI Pricing: https://openai.com/api/pricing/ -- per-model token pricing (via pricepertoken.com verification)
- Existing codebase: `streamSSE.ts`, `background.ts`, `content.tsx`, `Overlay.tsx`, `ResponsePanel.tsx`

### Secondary (MEDIUM confidence)
- OpenAI Community Forum: https://community.openai.com/t/usage-stats-now-available-when-using-streaming-with-the-chat-completions-api-or-completions-api/738156 -- stream_options launch details
- PricePerToken.com: https://pricepertoken.com/pricing-page/provider/openai -- cross-verified pricing data
- LiteLLM GitHub Issues: https://github.com/BerriAI/litellm/issues/16021 -- confirms cost field behavior in OpenRouter streaming

### Tertiary (LOW confidence)
- None. All findings verified with official sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries needed; built on existing codebase patterns
- Architecture: HIGH -- data flow is a natural extension of existing message passing pipeline
- Pitfalls: HIGH -- verified against official API docs and existing codebase structure
- Pricing data: MEDIUM -- prices verified from multiple sources but may change over time

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (30 days; stable domain, pricing may shift slightly)
