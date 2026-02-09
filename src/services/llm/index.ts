/**
 * LLM Service Barrel Export
 *
 * Provides a clean API surface for LLM functionality:
 * - Types for streaming and dual-request patterns
 * - Provider abstraction layer with OpenRouter and OpenAI adapters
 * - Prompt building with variable substitution
 */

// Re-export all types
export type { DualLLMRequest, TokenUsage } from './types';

// Re-export prompt builder
export { buildPrompt, type BuildPromptResult } from './PromptBuilder';

// Re-export provider types and interfaces
export type {
  LLMProvider,
  ProviderId,
  ProviderStreamOptions,
  ModelInfo,
  ReasoningEffort,
} from './providers/LLMProvider';

// Re-export reasoning model utilities
export { isReasoningModel, MIN_REASONING_TOKEN_BUDGET } from './providers/LLMProvider';

// Re-export provider registry functions
export {
  getAvailableModels,
  resolveProviderForModel,
  type ApiKeys,
  type ResolvedProvider,
} from './providers';

// Re-export provider implementations (for direct access if needed)
export { OpenRouterProvider, OPENROUTER_MODELS } from './providers/OpenRouterProvider';
export { OpenAIProvider, OPENAI_MODELS } from './providers/OpenAIProvider';

// Re-export pricing module
export { calculateCost, OPENAI_PRICING } from './pricing';
