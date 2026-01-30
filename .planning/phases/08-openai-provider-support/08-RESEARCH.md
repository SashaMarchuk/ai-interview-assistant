# Phase 8: OpenAI Provider Support - Research

**Researched:** 2026-01-30
**Domain:** Multi-provider LLM abstraction, OpenAI API streaming, provider selection patterns
**Confidence:** HIGH

## Summary

This phase adds OpenAI as an alternative LLM provider alongside the existing OpenRouter integration. The research confirms that OpenAI's Chat Completions API uses the same SSE streaming format as OpenRouter (both use `data: {...}` events with `[DONE]` termination), making it straightforward to share the same parsing logic via eventsource-parser.

The recommended approach is the **Provider Strategy Pattern**: define an abstract `LLMProvider` interface, implement concrete adapters for OpenRouter and OpenAI, and use a factory/registry to select the active provider based on configured API keys. This pattern is well-established in the TypeScript LLM ecosystem (used by NextChat, Continue VS Code, AnythingLLM) and aligns with existing codebase architecture.

Key architectural decisions:
1. **Provider interface** with `streamResponse()` method that both OpenRouter and OpenAI adapters implement
2. **Model availability filtering** - show only models available for the configured provider (OpenAI models for OpenAI key, all OpenRouter models for OpenRouter key)
3. **Template model validation** - graceful fallback when template specifies a model not available on the active provider
4. **Minimal UI changes** - add OpenAI API key field, provider selector (or auto-detect from which key is present), and model list filtering

**Primary recommendation:** Implement Provider Strategy Pattern with `LLMProvider` interface, keep existing SSE parsing via eventsource-parser (compatible with both APIs), and add smart model availability based on active provider.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| eventsource-parser | ^3.0 | Parse SSE streams from both providers | Already installed, works with OpenAI format identically |
| Native fetch | Browser API | HTTP requests to both APIs | Streaming support, no external deps |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| AbortController | Browser API | Cancel in-flight requests | Already used for request cancellation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom OpenAI adapter | openai npm package | SDK adds ~400KB, overkill for just streaming chat completions |
| Per-provider SSE parsing | Shared parser | Both APIs use identical SSE format, no need for separate parsers |
| multi-llm-ts library | Custom adapters | External dependency for only 2 providers, custom code is simpler |

**Installation:**
```bash
# No new dependencies needed - eventsource-parser already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── services/
│   └── llm/
│       ├── index.ts                    # Updated exports
│       ├── types.ts                    # Extended with provider types
│       ├── providers/
│       │   ├── index.ts                # Provider registry/factory
│       │   ├── LLMProvider.ts          # Abstract interface
│       │   ├── OpenRouterProvider.ts   # OpenRouter adapter (refactored)
│       │   └── OpenAIProvider.ts       # New OpenAI adapter
│       ├── OpenRouterClient.ts         # Keep for now, migrate to provider
│       └── PromptBuilder.ts            # Unchanged
├── store/
│   ├── types.ts                        # Add 'openAI' to ApiKeyProvider
│   └── settingsSlice.ts                # Add openAI key, provider selection
└── components/
    └── settings/
        ├── ApiKeySettings.tsx          # Add OpenAI key field
        └── ModelSettings.tsx           # Filter models by provider
```

### Pattern 1: LLM Provider Interface
**What:** Abstract interface that all LLM providers implement
**When to use:** Always - this is the foundation of the multi-provider architecture
**Example:**
```typescript
// Source: Strategy Pattern for LLM providers
// Reference: https://dev.to/daniloab/how-to-integrate-multiple-llm-providers-without-turning-your-codebase-into-a-mess-provider-36g9

export type ProviderId = 'openrouter' | 'openai';

export interface LLMProvider {
  readonly id: ProviderId;
  readonly name: string;

  /**
   * Stream a chat completion response
   */
  streamResponse(options: ProviderStreamOptions): Promise<void>;

  /**
   * Get list of available models for this provider
   */
  getAvailableModels(): ModelInfo[];

  /**
   * Check if a specific model is available
   */
  isModelAvailable(modelId: string): boolean;
}

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
}

export interface ModelInfo {
  id: string;
  name: string;
  category: 'fast' | 'full';  // For UI categorization
  provider: ProviderId;
}
```

### Pattern 2: OpenAI Provider Implementation
**What:** Concrete adapter for OpenAI's Chat Completions API
**When to use:** When user has OpenAI API key configured
**Example:**
```typescript
// Source: https://platform.openai.com/docs/api-reference/chat

import { createParser, type EventSourceMessage } from 'eventsource-parser';
import type { LLMProvider, ProviderStreamOptions, ModelInfo } from './LLMProvider';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// OpenAI models available via direct API
// Note: GPT-4.1 series are the current flagships as of Jan 2026
const OPENAI_MODELS: ModelInfo[] = [
  // Fast models (hints)
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', category: 'fast', provider: 'openai' },
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', category: 'fast', provider: 'openai' },
  { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', category: 'fast', provider: 'openai' },
  // Full models (comprehensive answers)
  { id: 'gpt-4o', name: 'GPT-4o', category: 'full', provider: 'openai' },
  { id: 'gpt-4.1', name: 'GPT-4.1', category: 'full', provider: 'openai' },
];

export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai' as const;
  readonly name = 'OpenAI';

  getAvailableModels(): ModelInfo[] {
    return OPENAI_MODELS;
  }

  isModelAvailable(modelId: string): boolean {
    return OPENAI_MODELS.some(m => m.id === modelId);
  }

  async streamResponse(options: ProviderStreamOptions): Promise<void> {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        messages: [
          { role: 'system', content: options.systemPrompt },
          { role: 'user', content: options.userPrompt },
        ],
        max_tokens: options.maxTokens,
        stream: true,
      }),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${error}`);
    }

    // Same SSE parsing as OpenRouter - format is identical
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let isComplete = false;

    const parser = createParser({
      onEvent: (event: EventSourceMessage) => {
        if (event.data === '[DONE]') {
          isComplete = true;
          options.onComplete();
          return;
        }

        try {
          const chunk = JSON.parse(event.data);
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) {
            options.onToken(content);
          }
        } catch {
          // Ignore parse errors
        }
      },
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (!isComplete) options.onComplete();
        break;
      }
      parser.feed(decoder.decode(value, { stream: true }));
    }
  }
}
```

### Pattern 3: Provider Registry/Factory
**What:** Central registry to resolve active provider based on configuration
**When to use:** When selecting which provider to use for LLM requests
**Example:**
```typescript
// Source: Factory pattern for provider resolution

import { OpenRouterProvider } from './OpenRouterProvider';
import { OpenAIProvider } from './OpenAIProvider';
import type { LLMProvider, ProviderId } from './LLMProvider';

const providers: Map<ProviderId, LLMProvider> = new Map([
  ['openrouter', new OpenRouterProvider()],
  ['openai', new OpenAIProvider()],
]);

/**
 * Get provider by ID
 */
export function getProvider(id: ProviderId): LLMProvider {
  const provider = providers.get(id);
  if (!provider) {
    throw new Error(`Unknown provider: ${id}`);
  }
  return provider;
}

/**
 * Determine active provider based on configured API keys
 * Priority: OpenAI > OpenRouter (or could be user-selectable)
 */
export function resolveActiveProvider(apiKeys: {
  openAI?: string;
  openRouter?: string;
}): LLMProvider | null {
  // Auto-detect based on which keys are configured
  if (apiKeys.openAI) {
    return providers.get('openai')!;
  }
  if (apiKeys.openRouter) {
    return providers.get('openrouter')!;
  }
  return null;
}

/**
 * Get all models available for the given API key configuration
 */
export function getAvailableModels(apiKeys: {
  openAI?: string;
  openRouter?: string;
}): ModelInfo[] {
  const models: ModelInfo[] = [];

  if (apiKeys.openAI) {
    models.push(...providers.get('openai')!.getAvailableModels());
  }
  if (apiKeys.openRouter) {
    models.push(...providers.get('openrouter')!.getAvailableModels());
  }

  return models;
}
```

### Pattern 4: Model Fallback for Templates
**What:** Gracefully handle templates with models not available on active provider
**When to use:** When a template specifies a model that requires a different provider
**Example:**
```typescript
// Source: Graceful degradation pattern

interface ModelResolutionResult {
  model: string;
  provider: LLMProvider;
  usedFallback: boolean;
  fallbackReason?: string;
}

export function resolveModelForTemplate(
  templateModel: string | undefined,
  defaultModel: string,
  apiKeys: { openAI?: string; openRouter?: string }
): ModelResolutionResult {
  const targetModel = templateModel || defaultModel;

  // Find provider that has this model
  const openAI = providers.get('openai')!;
  const openRouter = providers.get('openrouter')!;

  // Check if requested model is available on configured providers
  if (apiKeys.openAI && openAI.isModelAvailable(targetModel)) {
    return {
      model: targetModel,
      provider: openAI,
      usedFallback: false,
    };
  }

  if (apiKeys.openRouter && openRouter.isModelAvailable(targetModel)) {
    return {
      model: targetModel,
      provider: openRouter,
      usedFallback: false,
    };
  }

  // Fallback: use default model on first available provider
  const activeProvider = resolveActiveProvider(apiKeys);
  if (activeProvider) {
    const fallbackModel = activeProvider.getAvailableModels()
      .find(m => m.category === 'full')?.id || defaultModel;

    return {
      model: fallbackModel,
      provider: activeProvider,
      usedFallback: true,
      fallbackReason: `Model "${targetModel}" not available, using "${fallbackModel}"`,
    };
  }

  throw new Error('No LLM provider configured');
}
```

### Anti-Patterns to Avoid
- **Hardcoding provider in background.ts:** Use provider abstraction, not direct API calls
- **Different SSE parsers per provider:** Both use identical format, share the parser
- **Exposing API keys to UI:** Keep keys in store, pass to background via messages
- **Provider-specific logic in UI components:** UI should work with abstract ModelInfo
- **Blocking on model validation:** Validate asynchronously, show warnings not errors

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE parsing | Separate parsers per API | Shared eventsource-parser | OpenAI and OpenRouter use identical SSE format |
| Model lists | Dynamic API fetch | Static model lists | Models change rarely, API calls add latency |
| Provider selection | Complex auto-detect | Simple key presence check | User will configure one or the other, rarely both |
| Request retry | Per-provider retry logic | Shared retry wrapper | Retry logic is provider-agnostic |

**Key insight:** OpenAI and OpenRouter intentionally use the same API format (OpenAI-compatible). This means nearly all existing code can be reused with just endpoint/header changes.

## Common Pitfalls

### Pitfall 1: Assuming Model IDs are Cross-Provider
**What goes wrong:** Template specifies `openai/gpt-4o` (OpenRouter format) but user has only OpenAI key
**Why it happens:** OpenRouter uses prefixed model IDs (`openai/gpt-4o`), OpenAI uses bare IDs (`gpt-4o`)
**How to avoid:** Normalize model IDs or maintain provider-specific mappings
**Warning signs:** "Model not found" errors when switching providers
**Mitigation:**
```typescript
// Map OpenRouter model IDs to OpenAI equivalents
const MODEL_ID_MAP: Record<string, string> = {
  'openai/gpt-4o': 'gpt-4o',
  'openai/gpt-4o-mini': 'gpt-4o-mini',
  'openai/gpt-4.1': 'gpt-4.1',
  // etc.
};

function normalizeModelId(modelId: string, targetProvider: ProviderId): string {
  if (targetProvider === 'openai' && modelId.startsWith('openai/')) {
    return modelId.replace('openai/', '');
  }
  if (targetProvider === 'openrouter' && !modelId.includes('/')) {
    return `openai/${modelId}`;
  }
  return modelId;
}
```

### Pitfall 2: Service Worker Suspension (Unchanged from Phase 4)
**What goes wrong:** Long LLM responses interrupted after 30 seconds
**Why it happens:** Chrome MV3 service worker suspension
**How to avoid:** Keep-alive interval already implemented in background.ts
**Warning signs:** Responses cut off mid-stream

### Pitfall 3: API Key Validation Timing
**What goes wrong:** User enters invalid API key, finds out only when making request
**Why it happens:** No upfront validation of keys
**How to avoid:** Optional: make a simple API call on key save to validate
**Warning signs:** Cryptic 401 errors during interview
**Mitigation:**
```typescript
// Optional validation endpoint
async function validateOpenAIKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}
```

### Pitfall 4: Model List Staleness
**What goes wrong:** New models released but not in our static list
**Why it happens:** Model list is hardcoded
**How to avoid:** Make it easy to update model lists; consider periodic updates
**Warning signs:** Users can't select newly released models
**Mitigation:** Keep model lists in a single file, document update process

### Pitfall 5: Provider Priority Confusion
**What goes wrong:** User configures both keys, unclear which provider is used
**Why it happens:** Auto-detection without clear UX
**How to avoid:** Either explicit provider selector, or clear "active provider" indicator
**Warning signs:** Unexpected model behavior, confusion about billing

## Code Examples

Verified patterns from official sources:

### OpenAI Chat Completions Request
```typescript
// Source: https://platform.openai.com/docs/api-reference/chat

const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
    ],
    stream: true,
    max_tokens: 500,
  }),
});
```

### OpenAI Streaming Response Format
```typescript
// Source: https://platform.openai.com/docs/api-reference/chat-streaming

// Each SSE event looks like:
// data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-4o-mini","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

// Final event:
// data: [DONE]

// This is IDENTICAL to OpenRouter format, so eventsource-parser works for both
```

### Store Type Updates
```typescript
// Source: Extending existing store types

// In src/store/types.ts
export type ApiKeyProvider = 'elevenLabs' | 'openRouter' | 'openAI';

export type LLMProviderId = 'openrouter' | 'openai';

// In SettingsSlice
apiKeys: {
  elevenLabs: string;
  openRouter: string;
  openAI: string;  // NEW
};

// Optional: explicit provider selection
llmProvider: LLMProviderId | 'auto';  // 'auto' = determine from keys
```

### Model Settings Filtering
```typescript
// Source: Dynamic model list based on available providers

function ModelSettings() {
  const apiKeys = useStore((state) => state.apiKeys);

  // Get models available for configured providers
  const availableModels = useMemo(() => {
    const models: ModelInfo[] = [];

    if (apiKeys.openAI) {
      models.push(...OPENAI_MODELS);
    }
    if (apiKeys.openRouter) {
      models.push(...OPENROUTER_MODELS);
    }

    return models;
  }, [apiKeys.openAI, apiKeys.openRouter]);

  const fastModels = availableModels.filter(m => m.category === 'fast');
  const fullModels = availableModels.filter(m => m.category === 'full');

  // ... render selects with filtered options
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OpenRouter only | Multi-provider support | This phase | Users can use OpenAI directly |
| Static model lists | Provider-aware model lists | This phase | Models filtered by active provider |
| GPT-4o flagship | GPT-4.1 flagship | April 2025 | New GPT-4.1 models are current standard |

**Deprecated/outdated:**
- `gpt-4-turbo`: Replaced by GPT-4o and GPT-4.1
- `chatgpt-4o-latest`: Deprecated November 2025, removal February 2026
- `gpt-4o-realtime-preview`: Deprecated September 2025

## Open Questions

Things that couldn't be fully resolved:

1. **Provider Selection UX**
   - What we know: Could auto-detect from keys or have explicit selector
   - What's unclear: Best UX when user has both keys configured
   - Recommendation: Start with auto-detect (priority: OpenAI > OpenRouter), add explicit selector if users request

2. **Model List Updates**
   - What we know: Models change periodically (GPT-4.1 released April 2025)
   - What's unclear: How often to update, whether to fetch dynamically
   - Recommendation: Static lists updated with extension releases; document update process

3. **Cost/Usage Tracking**
   - What we know: OpenAI and OpenRouter have different pricing
   - What's unclear: Whether to show cost estimates in UI
   - Recommendation: Out of scope for v1, could add later

4. **Template Model Compatibility**
   - What we know: Templates may specify OpenRouter-format model IDs
   - What's unclear: Whether to auto-migrate existing templates
   - Recommendation: Keep existing templates working via model ID normalization

## Sources

### Primary (HIGH confidence)
- [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat) - Request format, headers, streaming
- [OpenAI Streaming](https://platform.openai.com/docs/api-reference/chat-streaming) - SSE chunk format
- [OpenRouter Streaming](https://openrouter.ai/docs/api/reference/streaming) - Confirms OpenAI-compatible format
- [OpenAI Models](https://platform.openai.com/docs/models/) - Current model list, deprecations

### Secondary (MEDIUM confidence)
- [Multi-provider LLM orchestration guide (Jan 2026)](https://dev.to/ash_dubai/multi-provider-llm-orchestration-in-production-a-2026-guide-1g10) - Production patterns
- [Provider Strategy Pattern](https://dev.to/daniloab/how-to-integrate-multiple-llm-providers-without-turning-your-codebase-into-a-mess-provider-36g9) - TypeScript implementation
- [multi-llm-ts](https://github.com/nbonamy/multi-llm-ts) - Reference implementation

### Tertiary (LOW confidence)
- Model pricing comparisons - Varies, check current pricing pages

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - eventsource-parser confirmed compatible with both APIs
- Architecture: HIGH - Provider Strategy Pattern is well-established, matches existing codebase style
- OpenAI API format: HIGH - Official documentation confirms SSE format identical to OpenRouter
- Model availability: MEDIUM - Models change, GPT-4.1 is current flagship but may evolve
- Pitfalls: MEDIUM - Based on general multi-provider experience, not OpenAI-specific testing

**Research date:** 2026-01-30
**Valid until:** 2026-03-01 (30 days - APIs are stable, models may update)
