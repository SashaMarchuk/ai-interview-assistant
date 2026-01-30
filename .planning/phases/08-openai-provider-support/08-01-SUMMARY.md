---
phase: 08-openai-provider-support
plan: 01
subsystem: llm-service
tags: [provider-pattern, openai, openrouter, streaming, sse]

dependency-graph:
  requires: [04-llm-integration]
  provides: [provider-abstraction, openai-adapter, openrouter-adapter, provider-registry]
  affects: [08-02, 08-03]

tech-stack:
  added: []
  patterns: [strategy-pattern, provider-interface, singleton-registry]

key-files:
  created:
    - src/services/llm/providers/LLMProvider.ts
    - src/services/llm/providers/OpenRouterProvider.ts
    - src/services/llm/providers/OpenAIProvider.ts
    - src/services/llm/providers/index.ts
  modified:
    - src/services/llm/types.ts
    - src/services/llm/index.ts

decisions:
  - id: provider-interface-design
    choice: "LLMProvider interface with streamResponse, getAvailableModels, isModelAvailable"
    rationale: "Minimal interface covering streaming and model discovery needs"
  - id: provider-priority
    choice: "OpenAI > OpenRouter when both keys configured"
    rationale: "Direct API access preferred over aggregator for latency"
  - id: model-categories
    choice: "'fast' | 'full' categories for UI grouping"
    rationale: "Matches existing dual-stream hint/answer pattern"

metrics:
  duration: ~2.5 minutes
  completed: 2026-01-30
---

# Phase 8 Plan 1: Provider Abstraction Layer Summary

LLM provider abstraction with interface, OpenRouter adapter, OpenAI adapter, and registry factory functions.

## What Was Built

### LLMProvider Interface (`src/services/llm/providers/LLMProvider.ts`)

Core abstraction defining provider contract:
- `ProviderId` type: `'openrouter' | 'openai'`
- `LLMProvider` interface with:
  - `streamResponse(options)` - SSE streaming
  - `getAvailableModels()` - model discovery
  - `isModelAvailable(modelId)` - model validation
- `ProviderStreamOptions` - provider-agnostic streaming options
- `ModelInfo` - model metadata with id, name, category, provider

### OpenRouterProvider (`src/services/llm/providers/OpenRouterProvider.ts`)

OpenRouter API adapter:
- Implements `LLMProvider` interface
- `OPENROUTER_MODELS` array with 6 models (3 fast, 3 full)
- Reuses existing eventsource-parser SSE logic
- OpenRouter-specific headers (HTTP-Referer, X-Title)

### OpenAIProvider (`src/services/llm/providers/OpenAIProvider.ts`)

OpenAI API adapter:
- Implements `LLMProvider` interface
- `OPENAI_MODELS` array with 5 models (3 fast, 2 full)
- Same SSE streaming pattern as OpenRouter
- Standard OpenAI headers (Authorization only)

### Provider Registry (`src/services/llm/providers/index.ts`)

Factory functions for provider resolution:
- `getProvider(id)` - get provider by ID
- `resolveActiveProvider(apiKeys)` - auto-detect from keys
- `getAvailableModels(apiKeys)` - union of models for configured providers
- `resolveProviderForModel(modelId, apiKeys)` - find provider supporting model

## Commits

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Provider interface and types | dafca25 | LLMProvider.ts, types.ts |
| 2 | OpenRouter provider adapter | af41688 | OpenRouterProvider.ts |
| 3 | OpenAI provider and registry | e46cff5 | OpenAIProvider.ts, index.ts, llm/index.ts |

## Models Defined

### OpenRouter Models
| ID | Name | Category |
|----|------|----------|
| google/gemini-flash-1.5 | Gemini Flash 1.5 | fast |
| anthropic/claude-3-haiku | Claude 3 Haiku | fast |
| openai/gpt-4o-mini | GPT-4o Mini | fast |
| anthropic/claude-3-5-sonnet | Claude 3.5 Sonnet | full |
| openai/gpt-4o | GPT-4o | full |
| google/gemini-pro-1.5 | Gemini Pro 1.5 | full |

### OpenAI Models
| ID | Name | Category |
|----|------|----------|
| gpt-4o-mini | GPT-4o Mini | fast |
| gpt-4.1-mini | GPT-4.1 Mini | fast |
| gpt-4.1-nano | GPT-4.1 Nano | fast |
| gpt-4o | GPT-4o | full |
| gpt-4.1 | GPT-4.1 | full |

## API Changes

New exports from `src/services/llm/index.ts`:
```typescript
// Types
export type { LLMProvider, ProviderId, ProviderStreamOptions, ModelInfo } from './providers/LLMProvider';
export type { ApiKeys, ResolvedProvider } from './providers';

// Functions
export { getProvider, resolveActiveProvider, getAvailableModels, resolveProviderForModel, getAllProviders } from './providers';

// Provider classes (for direct access)
export { OpenRouterProvider, OPENROUTER_MODELS } from './providers/OpenRouterProvider';
export { OpenAIProvider, OPENAI_MODELS } from './providers/OpenAIProvider';
```

## Backward Compatibility

Existing exports preserved:
- `streamLLMResponse` (legacy function, still works)
- All types from `types.ts`
- `buildPrompt` from PromptBuilder

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `npx tsc --noEmit` - PASS
- `npm run build` - PASS (611.5 kB total)

## Next Phase Readiness

Plan 08-02 can now:
- Use `resolveProviderForModel()` in background.ts to get provider for selected model
- Use `provider.streamResponse()` instead of direct `streamLLMResponse()`
- Use `getAvailableModels()` to populate settings UI dropdowns
