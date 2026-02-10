/**
 * LLM Provider Interface
 *
 * Defines the contract for LLM provider adapters.
 * All providers (OpenRouter, OpenAI, etc.) implement this interface
 * for consistent streaming behavior across different backends.
 */

import type { TokenUsage } from '../types';
import type { ReasoningEffort } from '../../../store/types';

export type { ReasoningEffort };

/**
 * Minimum token budget for reasoning models.
 * Reasoning models need a large budget to produce useful output
 * (they consume tokens for internal chain-of-thought).
 */
export const MIN_REASONING_TOKEN_BUDGET = 25_000;

/**
 * O-series model prefixes that use reasoning API parameters
 */
const O_SERIES_PREFIXES = ['o1', 'o3', 'o4'];

/**
 * GPT-5 series model IDs that use reasoning API parameters
 */
const GPT5_SERIES = ['gpt-5', 'gpt-5-mini', 'gpt-5-nano'];

/**
 * Check if a model ID is a reasoning model (o-series or GPT-5 series).
 *
 * Reasoning models require different API parameters:
 * - `developer` role instead of `system`
 * - `max_completion_tokens` instead of `max_tokens`
 * - No `temperature` or `top_p` parameters
 * - Optional `reasoning_effort` parameter
 *
 * Handles provider-prefixed IDs (e.g., "openai/o4-mini" -> "o4-mini").
 */
export function isReasoningModel(modelId: string): boolean {
  const bareModel = modelId.includes('/') ? modelId.split('/').pop()! : modelId;
  const matchesOSeries = O_SERIES_PREFIXES.some(
    (prefix) => bareModel === prefix || bareModel.startsWith(`${prefix}-`),
  );
  const matchesGPT5 = GPT5_SERIES.some(
    (model) => bareModel === model || bareModel.startsWith(`${model}-`),
  );
  return matchesOSeries || matchesGPT5;
}

/**
 * Provider identifiers for supported LLM backends
 */
export type ProviderId = 'openrouter' | 'openai';

/**
 * Model information for UI display and selection
 */
export interface ModelInfo {
  /** Model identifier (e.g., 'gpt-4o', 'anthropic/claude-3-haiku') */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Category for UI grouping */
  category: 'fast' | 'full';
  /** Provider this model belongs to */
  provider: ProviderId;
}

/**
 * Provider-agnostic options for streaming an LLM response
 */
export interface ProviderStreamOptions {
  /** Model identifier */
  model: string;
  /** System prompt for LLM context */
  systemPrompt: string;
  /** User prompt with the actual question/request */
  userPrompt: string;
  /** Maximum tokens to generate */
  maxTokens: number;
  /** API key for the provider */
  apiKey: string;
  /** Callback for each token received */
  onToken: (token: string) => void;
  /** Callback when stream completes */
  onComplete: () => void;
  /** Callback on error */
  onError: (error: Error) => void;
  /** Optional abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** Optional reasoning effort for reasoning models (o-series, GPT-5) */
  reasoningEffort?: ReasoningEffort;
  /** Optional callback for token usage data from final chunk */
  onUsage?: (usage: TokenUsage) => void;
}

/**
 * LLM Provider Interface
 *
 * Defines the contract all LLM providers must implement.
 * Enables swapping providers transparently while maintaining
 * consistent streaming behavior.
 */
export interface LLMProvider {
  /** Unique provider identifier */
  readonly id: ProviderId;
  /** Human-readable provider name */
  readonly name: string;

  /**
   * Stream a response from the LLM
   * @param options - Streaming configuration
   */
  streamResponse(options: ProviderStreamOptions): Promise<void>;

  /**
   * Get all models available from this provider
   */
  getAvailableModels(): ModelInfo[];

  /**
   * Check if a model ID is supported by this provider
   * @param modelId - Model identifier to check
   */
  isModelAvailable(modelId: string): boolean;
}
