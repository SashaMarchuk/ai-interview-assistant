/**
 * LLM Provider Registry
 *
 * Central registry for LLM provider adapters.
 * Provides factory functions for provider resolution based on
 * available API keys and model selection.
 */

import type { LLMProvider, ProviderId, ModelInfo } from './LLMProvider';
import { OpenRouterProvider, OPENROUTER_MODELS } from './OpenRouterProvider';
import { OpenAIProvider, OPENAI_MODELS } from './OpenAIProvider';

// Re-export types and classes
export type { LLMProvider, ProviderId, ProviderStreamOptions, ModelInfo } from './LLMProvider';
export { OpenRouterProvider, OPENROUTER_MODELS } from './OpenRouterProvider';
export { OpenAIProvider, OPENAI_MODELS } from './OpenAIProvider';

/**
 * Provider registry - singleton instances
 */
const providers = new Map<ProviderId, LLMProvider>();
providers.set('openrouter', new OpenRouterProvider());
providers.set('openai', new OpenAIProvider());

/**
 * API keys structure for provider resolution
 */
export interface ApiKeys {
  openAI?: string;
  openRouter?: string;
}

/**
 * Get a provider by ID
 * @throws Error if provider not found
 */
export function getProvider(id: ProviderId): LLMProvider {
  const provider = providers.get(id);
  if (!provider) {
    throw new Error(`Unknown provider: ${id}`);
  }
  return provider;
}

/**
 * Resolve the active provider based on available API keys
 * Priority: OpenAI > OpenRouter
 * @returns Provider instance or null if no keys configured
 */
export function resolveActiveProvider(apiKeys: ApiKeys): LLMProvider | null {
  // Priority: OpenAI first (direct API), then OpenRouter (aggregator)
  if (apiKeys.openAI) {
    return providers.get('openai') ?? null;
  }
  if (apiKeys.openRouter) {
    return providers.get('openrouter') ?? null;
  }
  return null;
}

/**
 * Get all available models for configured providers
 * @returns Union of models from all providers with valid API keys
 */
export function getAvailableModels(apiKeys: ApiKeys): ModelInfo[] {
  const models: ModelInfo[] = [];

  if (apiKeys.openAI) {
    models.push(...OPENAI_MODELS);
  }
  if (apiKeys.openRouter) {
    models.push(...OPENROUTER_MODELS);
  }

  return models;
}

/**
 * Result of provider resolution for a specific model
 */
export interface ResolvedProvider {
  provider: LLMProvider;
  model: string;
}

/**
 * Resolve the provider for a specific model ID
 * @returns Provider and model, or null if model not found or provider not configured
 */
export function resolveProviderForModel(
  modelId: string,
  apiKeys: ApiKeys,
): ResolvedProvider | null {
  // Check OpenAI first (if configured)
  if (apiKeys.openAI) {
    const openaiProvider = providers.get('openai');
    if (openaiProvider?.isModelAvailable(modelId)) {
      return { provider: openaiProvider, model: modelId };
    }
  }

  // Check OpenRouter (if configured)
  if (apiKeys.openRouter) {
    const openrouterProvider = providers.get('openrouter');
    if (openrouterProvider?.isModelAvailable(modelId)) {
      return { provider: openrouterProvider, model: modelId };
    }
  }

  return null;
}

/**
 * Get all registered providers
 */
export function getAllProviders(): LLMProvider[] {
  return Array.from(providers.values());
}
