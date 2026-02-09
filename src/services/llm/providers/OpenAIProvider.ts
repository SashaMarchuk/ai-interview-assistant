/**
 * OpenAI Provider Adapter
 *
 * Implements LLMProvider interface for OpenAI API.
 * Uses shared SSE streaming utility.
 */

import { streamSSE } from './streamSSE';
import type { LLMProvider, ProviderId, ProviderStreamOptions, ModelInfo } from './LLMProvider';

/** OpenAI API endpoint */
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * OpenAI reasoning models (o-series) that require different API parameters:
 * - Use `max_completion_tokens` instead of `max_tokens`
 * - Do not support `temperature`, `top_p`, or `system` role messages in some API versions
 */
const OPENAI_REASONING_MODEL_PREFIXES = ['o1', 'o3'];

/**
 * Check if a model ID is an OpenAI reasoning model (o-series).
 * Matches: o1, o1-mini, o1-preview, o1-pro, o3-mini, etc.
 */
function isReasoningModel(modelId: string): boolean {
  // Strip provider prefix if present (e.g. "openai/o1" -> "o1")
  const bareModel = modelId.includes('/') ? modelId.split('/').pop()! : modelId;
  return OPENAI_REASONING_MODEL_PREFIXES.some(
    (prefix) => bareModel === prefix || bareModel.startsWith(`${prefix}-`),
  );
}

/**
 * Available models on OpenAI
 * Includes all current frontend models as of 2025
 */
export const OPENAI_MODELS: ModelInfo[] = [
  // Fast models (for quick hints)
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', category: 'fast', provider: 'openai' },
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', category: 'fast', provider: 'openai' },
  { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', category: 'fast', provider: 'openai' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', category: 'fast', provider: 'openai' },
  // Full models (for comprehensive answers)
  { id: 'gpt-4o', name: 'GPT-4o', category: 'full', provider: 'openai' },
  { id: 'gpt-4.1', name: 'GPT-4.1', category: 'full', provider: 'openai' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', category: 'full', provider: 'openai' },
  { id: 'gpt-4', name: 'GPT-4', category: 'full', provider: 'openai' },
  // Reasoning models (o-series)
  { id: 'o1', name: 'o1', category: 'full', provider: 'openai' },
  { id: 'o1-mini', name: 'o1 Mini', category: 'fast', provider: 'openai' },
  { id: 'o1-preview', name: 'o1 Preview', category: 'full', provider: 'openai' },
  { id: 'o3-mini', name: 'o3 Mini', category: 'fast', provider: 'openai' },
];

/**
 * OpenAI Provider
 *
 * Implements LLMProvider for OpenAI API streaming.
 */
export class OpenAIProvider implements LLMProvider {
  readonly id: ProviderId = 'openai';
  readonly name = 'OpenAI';

  getAvailableModels(): ModelInfo[] {
    return OPENAI_MODELS;
  }

  isModelAvailable(modelId: string): boolean {
    return OPENAI_MODELS.some((m) => m.id === modelId);
  }

  async streamResponse(options: ProviderStreamOptions): Promise<void> {
    const { model, systemPrompt, userPrompt, maxTokens, apiKey } = options;
    const reasoning = isReasoningModel(model);

    // Reasoning models (o1, o3) use max_completion_tokens; standard models use max_tokens
    const tokenLimit = reasoning
      ? { max_completion_tokens: maxTokens }
      : { max_tokens: maxTokens };

    await streamSSE(
      {
        url: OPENAI_API_URL,
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          ...tokenLimit,
          stream: true,
        },
        providerName: 'OpenAI',
      },
      options,
    );
  }
}
