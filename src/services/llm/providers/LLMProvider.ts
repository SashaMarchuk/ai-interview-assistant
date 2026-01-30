/**
 * LLM Provider Interface
 *
 * Defines the contract for LLM provider adapters.
 * All providers (OpenRouter, OpenAI, etc.) implement this interface
 * for consistent streaming behavior across different backends.
 */

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
