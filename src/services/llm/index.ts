/**
 * LLM Service Barrel Export
 *
 * Provides a clean API surface for LLM functionality:
 * - Types for streaming and dual-request patterns
 * - Provider abstraction layer with OpenRouter and OpenAI adapters
 * - OpenRouter streaming client (legacy, for backward compatibility)
 * - Prompt building with variable substitution
 */

// Re-export all types
export type {
  StreamOptions,
  DualLLMRequest,
  StreamCallbacks,
  OpenRouterChatMessage,
  OpenRouterStreamChunk,
  LLMProviderId,
} from './types';

// Re-export streaming client (legacy - use providers for new code)
export { streamLLMResponse } from './OpenRouterClient';

// Re-export prompt builder
export { buildPrompt, type BuildPromptResult } from './PromptBuilder';

// Re-export provider types and interfaces
export type {
  LLMProvider,
  ProviderId,
  ProviderStreamOptions,
  ModelInfo,
} from './providers/LLMProvider';

// Re-export provider registry functions
export {
  getProvider,
  resolveActiveProvider,
  getAvailableModels,
  resolveProviderForModel,
  getAllProviders,
  type ApiKeys,
  type ResolvedProvider,
} from './providers';

// Re-export provider implementations (for direct access if needed)
export { OpenRouterProvider, OPENROUTER_MODELS } from './providers/OpenRouterProvider';
export { OpenAIProvider, OPENAI_MODELS } from './providers/OpenAIProvider';
