# Phase 16: Reasoning Models - Research

**Researched:** 2026-02-09
**Domain:** OpenAI reasoning model API integration (o-series + GPT-5 series)
**Confidence:** HIGH

## Summary

Phase 16 adds reasoning model support to an existing dual-stream LLM architecture. The codebase already has partial reasoning model awareness: `OpenAIProvider.ts` and `OpenRouterProvider.ts` both detect o-series models (o1, o3 prefixes) and use `max_completion_tokens` instead of `max_tokens`. However, the current implementation is incomplete -- it still sends `system` role instead of `developer` role, hardcodes low token limits (300/2000), lacks `reasoning_effort` control, does not include newer models (o4-mini, GPT-5 series), and has no dedicated UI for reasoning requests.

The OpenAI API treats reasoning models differently from standard models: they require `developer` role (though `system` is auto-converted), `max_completion_tokens` instead of `max_tokens`, a `reasoning_effort` parameter (low/medium/high), and do NOT support `temperature`, `top_p`, or other sampling parameters. Critically, `max_completion_tokens` includes hidden reasoning tokens, so a budget of 300 tokens will produce empty responses. The roadmap mandates a minimum 25K budget for reasoning models.

**Primary recommendation:** Extend the existing `ProviderStreamOptions` interface with optional `reasoningEffort` and `isReasoningModel` fields, update both providers to construct correct request bodies, add new models to the model lists, create a `reasoningEffort` setting in the store, add a dedicated "Reasoning" button in the overlay, and enforce a 25K minimum token budget for reasoning models.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| OpenAI Chat Completions API | v1 | Reasoning model requests | Already used by OpenAIProvider; reasoning models supported |
| OpenRouter API | v1 | Alternative routing for reasoning models | Already used by OpenRouterProvider; supports o-series |
| eventsource-parser | existing | SSE stream parsing | Already in use; works with reasoning model streaming |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zustand | existing | Store reasoning_effort setting | New setting for reasoning effort level |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Chat Completions API | Responses API | OpenAI recommends Responses API for reasoning models, but Chat Completions still works and is what the codebase already uses -- migration would be a separate effort |
| Hardcoded model lists | Dynamic model fetching | Dynamic fetching adds complexity, latency, and API calls -- static lists with periodic manual updates are simpler for a Chrome extension |

**Installation:**
No new packages needed. All changes are within existing code.

## Architecture Patterns

### Recommended Project Structure

No new directories needed. Changes touch existing files:

```
src/
├── services/llm/
│   ├── providers/
│   │   ├── LLMProvider.ts        # Extend ProviderStreamOptions with reasoning fields
│   │   ├── OpenAIProvider.ts     # Update model list, request body construction
│   │   ├── OpenRouterProvider.ts # Update model list, request body construction
│   │   └── streamSSE.ts          # No changes needed (SSE format unchanged)
│   ├── types.ts                  # Extend StreamOptions/DualLLMRequest if needed
│   └── PromptBuilder.ts          # No changes needed
├── store/
│   ├── types.ts                  # Add reasoningEffort to SettingsSlice
│   └── settingsSlice.ts          # Add reasoningEffort state + action
├── overlay/
│   ├── Overlay.tsx               # Add reasoning button
│   ├── ResponsePanel.tsx         # Add "thinking" indicator for reasoning
│   └── OverlayHeader.tsx         # Possibly add reasoning effort selector
├── components/settings/
│   └── ModelSettings.tsx         # Group reasoning models visually
└── types/
    └── messages.ts               # Possibly extend LLM_REQUEST with reasoning fields
```

### Pattern 1: Reasoning Model Detection (Extend Existing)

**What:** A utility function to detect reasoning models and determine correct API parameters.
**When to use:** Before constructing any LLM request body.
**Current code already has this pattern** in both providers, but it needs expansion.

```typescript
// Current (incomplete) - only handles o1/o3 prefix
const OPENAI_REASONING_MODEL_PREFIXES = ['o1', 'o3'];

// Expanded - must also handle o4, GPT-5 series with reasoning_effort
const REASONING_MODEL_PREFIXES = ['o1', 'o3', 'o4'];
const GPT5_REASONING_MODELS = ['gpt-5', 'gpt-5-mini', 'gpt-5-nano'];

function isReasoningModel(modelId: string): boolean {
  const bareModel = modelId.includes('/') ? modelId.split('/').pop()! : modelId;
  // o-series: o1, o1-mini, o3-mini, o4-mini, etc.
  if (REASONING_MODEL_PREFIXES.some(p => bareModel === p || bareModel.startsWith(`${p}-`))) {
    return true;
  }
  // GPT-5 series (supports reasoning_effort)
  if (GPT5_REASONING_MODELS.some(m => bareModel === m || bareModel.startsWith(`${m}-`))) {
    return true;
  }
  return false;
}
```

### Pattern 2: Developer Role vs System Role

**What:** Reasoning models require `developer` role instead of `system` role for instructions.
**When to use:** When building the messages array for the API request.

```typescript
// Source: https://platform.openai.com/docs/guides/reasoning
// When system message is sent to o4-mini, o3, o3-mini, o1, it's treated as developer message.
// Explicitly using developer role is best practice.

const messages = reasoning
  ? [
      { role: 'developer', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]
  : [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
```

**Important note:** While OpenAI auto-converts `system` to `developer` for reasoning models, explicitly using `developer` is the correct practice. However, OpenRouter may not auto-convert, so we must handle this in both providers.

### Pattern 3: Token Budget Enforcement

**What:** Reasoning models need much higher `max_completion_tokens` because reasoning tokens are counted against this budget.
**When to use:** When setting `max_completion_tokens` for any reasoning model request.

```typescript
// Source: v2.0 roadmap requirement RSN-06
const MIN_REASONING_TOKEN_BUDGET = 25_000;

const maxTokens = isReasoningModel(model)
  ? Math.max(requestedMaxTokens, MIN_REASONING_TOKEN_BUDGET)
  : requestedMaxTokens;
```

### Pattern 4: Reasoning Effort Parameter

**What:** Pass `reasoning_effort` to control how deeply the model reasons.
**When to use:** For all reasoning model requests.

```typescript
// Source: https://platform.openai.com/docs/guides/reasoning
// o-series supports: low, medium, high
// GPT-5 series supports: low, medium, high (some support minimal, none, xhigh)
// We'll support the common subset: low, medium, high

const body = {
  model,
  messages,
  max_completion_tokens: maxTokens,
  stream: true,
  ...(reasoning && reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
};
```

### Pattern 5: Non-Streaming Fallback

**What:** Some reasoning models may not support streaming in all contexts.
**When to use:** When streaming fails or the model does not support it.

```typescript
// o3-mini, o4-mini generally support streaming via Chat Completions API.
// However, o3 streaming is limited access. If streaming fails,
// fall back to non-streaming with full response delivery.

async streamResponse(options: ProviderStreamOptions): Promise<void> {
  try {
    await streamSSE(config, options); // Try streaming first
  } catch (error) {
    if (isStreamingUnsupported(error)) {
      // Fallback: non-streaming request
      const response = await nonStreamingRequest(config);
      options.onToken(response.content);
      options.onComplete();
    } else {
      throw error;
    }
  }
}
```

### Anti-Patterns to Avoid

- **Using `max_tokens` for reasoning models:** Must use `max_completion_tokens`. The current code handles this correctly for o1/o3 but the naming must be consistent.
- **Setting `temperature` for reasoning models:** Not supported; will cause API errors. Must be excluded from the request body.
- **Low token budgets for reasoning models:** 300 tokens (current fast hint budget) would produce empty responses. Reasoning models need 25K+ because reasoning tokens consume the budget.
- **Using both `system` and `developer` roles:** Cannot use both in the same request. Must pick one.
- **Sending reasoning_effort to non-reasoning models:** Only reasoning models accept this parameter. Sending it to GPT-4o would cause errors or be ignored.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE parsing | Custom event stream parser | `eventsource-parser` (already used) | Edge cases in chunked SSE are subtle |
| Model capability detection | Runtime API queries | Static model metadata + `isReasoningModel()` | Chrome extension needs offline-first; API calls add latency and complexity |
| Reasoning token tracking | Manual token counting | API response `usage.completion_tokens_details.reasoning_tokens` | Phase 17 will handle cost tracking; this phase just needs correct parameters |

**Key insight:** The primary work in this phase is NOT building new infrastructure -- it's correctly parameterizing API requests for reasoning models and adding UI controls. The streaming infrastructure (`streamSSE`) already handles reasoning model responses since they use the same SSE format.

## Common Pitfalls

### Pitfall 1: Empty Responses from Low Token Budget
**What goes wrong:** Reasoning models use reasoning tokens (hidden "thinking" tokens) that count against `max_completion_tokens`. A budget of 300 or 2000 tokens is consumed entirely by reasoning, leaving zero visible output.
**Why it happens:** The current codebase sets `maxTokens: 300` for fast hints and `maxTokens: 2000` for full answers. These are far too low for reasoning models.
**How to avoid:** Enforce minimum 25K `max_completion_tokens` for any reasoning model request, regardless of what the normal budget would be.
**Warning signs:** LLM response completes with status "complete" but `fastHint` or `fullAnswer` is empty or extremely short.

### Pitfall 2: API Error from Unsupported Parameters
**What goes wrong:** Sending `temperature`, `top_p`, `max_tokens`, or other unsupported parameters to reasoning models causes HTTP 400 errors.
**Why it happens:** The current `streamSSE` function passes all parameters in the body. If temperature is added later, it would break reasoning models.
**How to avoid:** Reasoning model request bodies must ONLY include: `model`, `messages`, `max_completion_tokens`, `reasoning_effort`, `stream`, `response_format`, `tools`, `tool_choice`. Exclude everything else.
**Warning signs:** 400 Bad Request errors specifically when using reasoning models but not standard models.

### Pitfall 3: System vs Developer Role Confusion
**What goes wrong:** Using `role: "system"` is auto-converted for o-series but may cause unexpected behavior. Using both `system` and `developer` in the same request causes an error.
**Why it happens:** Existing code always uses `system` role. The auto-conversion means it "works" but is not explicit.
**How to avoid:** Explicitly use `developer` role for reasoning models, `system` role for standard models. Never mix both.
**Warning signs:** Subtle: responses may deprioritize developer instructions if the wrong role is used.

### Pitfall 4: Dual-Stream Design Conflict with Reasoning Models
**What goes wrong:** The current architecture fires TWO parallel requests (fast + full). If both fast and full models are reasoning models, that's two expensive requests with 25K+ token budgets each.
**Why it happens:** The dedicated "Reasoning" button (RSN-05) suggests a single-purpose request, but the existing dual-stream architecture always fires both.
**How to avoid:** The "Reasoning" button should fire a SINGLE request (not dual), using the reasoning model specified by the user. This is separate from the normal hold-to-capture flow which triggers dual-stream.
**Warning signs:** Unexpectedly high costs when reasoning button is used.

### Pitfall 5: Streaming Not Available for All Reasoning Models
**What goes wrong:** Some reasoning models (like o3 in limited access, o3-pro) do not support streaming, causing connection failures.
**Why it happens:** The current code always sets `stream: true`. For models where streaming is unavailable, this fails.
**How to avoid:** Implement a fallback path: try streaming first, if it fails with a specific error, retry without streaming and deliver the complete response at once.
**Warning signs:** Streaming errors specifically for certain reasoning models but not others.

### Pitfall 6: Model List Staleness
**What goes wrong:** New models are released (GPT-5.1, GPT-5.2, o3-pro) and users can't access them without an extension update.
**Why it happens:** Static hardcoded model lists.
**How to avoid:** For this phase, acknowledge this is a known limitation. Future phases could add dynamic model fetching. Document the model update process clearly.
**Warning signs:** Users requesting models that OpenAI has released but the extension doesn't list.

## Code Examples

### Example 1: Updated OpenAI Provider Model List

```typescript
// Source: https://platform.openai.com/docs/models
export const OPENAI_MODELS: ModelInfo[] = [
  // Fast models (for quick hints)
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', category: 'fast', provider: 'openai' },
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', category: 'fast', provider: 'openai' },
  { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', category: 'fast', provider: 'openai' },
  { id: 'gpt-5-nano', name: 'GPT-5 Nano', category: 'fast', provider: 'openai' },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini', category: 'fast', provider: 'openai' },
  // Full models (for comprehensive answers)
  { id: 'gpt-4o', name: 'GPT-4o', category: 'full', provider: 'openai' },
  { id: 'gpt-4.1', name: 'GPT-4.1', category: 'full', provider: 'openai' },
  { id: 'gpt-5', name: 'GPT-5', category: 'full', provider: 'openai' },
  // Reasoning models (o-series) -- available in both dropdowns
  { id: 'o3-mini', name: 'o3 Mini', category: 'fast', provider: 'openai' },
  { id: 'o4-mini', name: 'o4 Mini', category: 'fast', provider: 'openai' },
  { id: 'o1', name: 'o1', category: 'full', provider: 'openai' },
  { id: 'o3', name: 'o3', category: 'full', provider: 'openai' },
];
```

### Example 2: Reasoning-Aware Request Body Construction

```typescript
// Source: https://platform.openai.com/docs/guides/reasoning
// https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/reasoning

const MIN_REASONING_TOKENS = 25_000;

async streamResponse(options: ProviderStreamOptions): Promise<void> {
  const { model, systemPrompt, userPrompt, maxTokens, apiKey } = options;
  const reasoning = isReasoningModel(model);

  // Role: developer for reasoning, system for standard
  const messages = [
    { role: reasoning ? 'developer' : 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  // Token budget: enforce minimum for reasoning models
  const tokenBudget = reasoning
    ? Math.max(maxTokens, MIN_REASONING_TOKENS)
    : maxTokens;

  // Token parameter name differs
  const tokenLimit = reasoning
    ? { max_completion_tokens: tokenBudget }
    : { max_tokens: maxTokens };

  // Build body -- exclude unsupported params for reasoning models
  const body: Record<string, unknown> = {
    model,
    messages,
    ...tokenLimit,
    stream: true,
  };

  // Add reasoning_effort if reasoning model and effort specified
  if (reasoning && options.reasoningEffort) {
    body.reasoning_effort = options.reasoningEffort;
  }

  await streamSSE({ url: OPENAI_API_URL, headers: { Authorization: `Bearer ${apiKey}` }, body, providerName: 'OpenAI' }, options);
}
```

### Example 3: Extended ProviderStreamOptions

```typescript
// Extension to LLMProvider.ts

export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface ProviderStreamOptions {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  apiKey: string;
  onToken: (token: string) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
  abortSignal?: AbortSignal;
  /** Optional: reasoning effort level for reasoning models */
  reasoningEffort?: ReasoningEffort;
}
```

### Example 4: Store Extension for Reasoning Effort

```typescript
// In store/types.ts
export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface SettingsSlice {
  // ... existing fields ...
  /** Reasoning effort level for reasoning models */
  reasoningEffort: ReasoningEffort;
  /** Set reasoning effort level */
  setReasoningEffort: (effort: ReasoningEffort) => void;
}
```

### Example 5: Dedicated Reasoning Button (Overlay)

```typescript
// Concept for reasoning button in the overlay
// This fires a SINGLE reasoning request (not dual-stream)

function ReasoningButton({ onReasoningRequest }: { onReasoningRequest: () => void }) {
  const reasoningEffort = useStore(s => s.reasoningEffort);
  return (
    <button
      onClick={onReasoningRequest}
      className="flex items-center gap-1 rounded px-2 py-1 text-xs bg-purple-500/20 text-purple-300 hover:bg-purple-500/30"
      title={`Reasoning (${reasoningEffort})`}
    >
      <ThinkingIcon />
      Reason
    </button>
  );
}
```

### Example 6: Reasoning "Thinking" Indicator

```typescript
// In ResponsePanel.tsx -- show "thinking" state for reasoning models
// Reasoning models may take longer before first token due to "thinking"

case 'pending':
  return isReasoningRequest ? (
    <span className="flex items-center gap-1 text-xs text-purple-300">
      <span className="h-2 w-2 animate-pulse rounded-full bg-purple-400"></span>
      Reasoning...
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs text-yellow-300">
      <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400"></span>
      Thinking...
    </span>
  );
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `system` role for all models | `developer` role for reasoning models | o3-mini launch (Jan 2025) | Must switch role based on model type |
| `max_tokens` parameter | `max_completion_tokens` for reasoning | o1 launch (Sep 2024) | Already partially handled in codebase |
| No reasoning effort control | `reasoning_effort` parameter | o3-mini launch (Jan 2025) | New user-facing setting needed |
| Only GPT-4 series models | GPT-5/5-mini/5-nano + o4-mini available | GPT-5 launch (Aug 2025) | Model list needs major update |
| Chat Completions only | Responses API recommended for reasoning | o3/o4-mini launch (Apr 2025) | Chat Completions still works; migration can be deferred |

**Deprecated/outdated:**
- `o1-preview`: Deprecated in favor of `o1`. Remove from model list.
- `gpt-3.5-turbo`: Legacy model, consider removing. Keep for backward compatibility if users have it selected.
- `gpt-4-turbo`, `gpt-4`: Superseded by `gpt-4.1` and `gpt-4o`. Consider removing.

## Open Questions

1. **Streaming reliability for o3/o4-mini**
   - What we know: o3-mini and o4-mini are documented as supporting streaming via Chat Completions. o3 has limited-access streaming.
   - What's unclear: Whether streaming actually works reliably in practice for o4-mini, or whether some users will hit failures due to org verification tier.
   - Recommendation: Implement streaming as default with a non-streaming fallback. The blocker noted in STATE.md ("o3/o4-mini streaming may require org verification tier") should be handled gracefully.

2. **GPT-5 series model behavior with reasoning_effort**
   - What we know: GPT-5, GPT-5-mini, GPT-5-nano support `reasoning_effort` with `low`, `medium`, `high`. They also support `system` role natively (not just `developer`).
   - What's unclear: Whether GPT-5 models need `max_completion_tokens` or if `max_tokens` also works. Azure docs say Chat Completions requires `max_completion_tokens` for reasoning models.
   - Recommendation: Use `max_completion_tokens` for GPT-5 series to be safe. Apply the same 25K minimum budget.

3. **Reasoning button vs dual-stream architecture**
   - What we know: RSN-05 requires a dedicated "Reasoning" button. The existing architecture fires dual parallel streams (fast + full).
   - What's unclear: Should the reasoning button fire a single request or still dual? Using a reasoning model for fast hints (300 tokens) makes no sense with 25K minimum budget.
   - Recommendation: Reasoning button fires a SINGLE request to the full model slot (or a user-selected reasoning model), displayed in the "Full Answer" panel. The fast hint panel shows "N/A for reasoning" or is hidden.

4. **OpenRouter parameter passthrough for reasoning_effort**
   - What we know: OpenRouter supports reasoning models and has documentation about reasoning tokens.
   - What's unclear: Whether OpenRouter's Chat Completions endpoint passes `reasoning_effort` through to OpenAI correctly.
   - Recommendation: Test with OpenRouter. If `reasoning_effort` is not passed through, it may need to be sent differently (e.g., as `reasoning.effort` or via a custom header). Fall back to medium if unsupported.

5. **Where to place reasoning effort control in the UI**
   - What we know: RSN-04 says "User can set reasoning_effort to low, medium, or high before sending a request."
   - What's unclear: Should this be in popup settings (global default), overlay header (per-request), or both?
   - Recommendation: Store a global default in settings (popup). Show a small dropdown/toggle near the reasoning button in the overlay for per-request override. This pattern mirrors how the model picker works (global setting with optional override).

## Sources

### Primary (HIGH confidence)
- [Azure OpenAI Reasoning Models Guide](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/reasoning) - Comprehensive table of model capabilities, supported parameters, streaming support, reasoning_effort values per model
- [OpenAI Models Documentation](https://platform.openai.com/docs/models) - Model IDs, context windows, capabilities
- [OpenAI Reasoning Guide](https://platform.openai.com/docs/guides/reasoning) - Developer role, max_completion_tokens, reasoning_effort, unsupported parameters
- [OpenRouter o4-mini](https://openrouter.ai/openai/o4-mini) - OpenRouter model ID, context window, supported parameters
- [OpenRouter o3-mini](https://openrouter.ai/openai/o3-mini) - OpenRouter model ID, streaming support confirmed

### Secondary (MEDIUM confidence)
- [Introducing o3 and o4-mini - OpenAI Blog](https://openai.com/index/introducing-o3-and-o4-mini/) - Streaming support, function calling, developer messages
- [Introducing GPT-5 for Developers](https://openai.com/index/introducing-gpt-5-for-developers/) - GPT-5 model family, reasoning_effort, pricing
- [AI/ML API Documentation - o4-mini](https://docs.aimlapi.com/api-references/text-models-llm/openai/o4-mini) - Confirmed streaming support, role types, max_completion_tokens

### Tertiary (LOW confidence)
- WebSearch results about o3 streaming being "limited access" - conflicting information across sources; needs runtime validation
- GPT-5 exact model IDs may have been updated since research date

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries needed; extending existing patterns
- Architecture: HIGH - Clear extension points in existing code; patterns well-documented by OpenAI
- Pitfalls: HIGH - Token budget issue is well-documented; unsupported parameters documented in official docs
- Model IDs & capabilities: MEDIUM - Models evolve quickly; IDs verified against official docs but may change
- Streaming for o3/o4-mini: MEDIUM - Conflicting info across sources; may need runtime testing

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (30 days; model capabilities change frequently, re-verify model list before implementation)
