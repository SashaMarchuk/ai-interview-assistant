/**
 * OpenAI Provider Adapter
 *
 * Implements LLMProvider interface for OpenAI API.
 * Uses shared SSE streaming utility.
 */

import { streamSSE } from './streamSSE';
import type { LLMProvider, ProviderId, ProviderStreamOptions, ModelInfo } from './LLMProvider';
import { isReasoningModel, MIN_REASONING_TOKEN_BUDGET } from './LLMProvider';

/** OpenAI API endpoint */
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Available models on OpenAI
 * Updated for 2026: includes GPT-5 series and o4-mini, removes deprecated models
 */
export const OPENAI_MODELS: ModelInfo[] = [
  // Fast models (for quick hints)
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', category: 'fast', provider: 'openai' },
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', category: 'fast', provider: 'openai' },
  { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', category: 'fast', provider: 'openai' },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini', category: 'fast', provider: 'openai' },
  { id: 'gpt-5-nano', name: 'GPT-5 Nano', category: 'fast', provider: 'openai' },
  // Full models (for comprehensive answers)
  { id: 'gpt-4o', name: 'GPT-4o', category: 'full', provider: 'openai' },
  { id: 'gpt-4.1', name: 'GPT-4.1', category: 'full', provider: 'openai' },
  { id: 'gpt-5', name: 'GPT-5', category: 'full', provider: 'openai' },
  // Reasoning models (o-series)
  { id: 'o1', name: 'o1', category: 'full', provider: 'openai' },
  { id: 'o1-mini', name: 'o1 Mini', category: 'fast', provider: 'openai' },
  { id: 'o3-mini', name: 'o3 Mini', category: 'fast', provider: 'openai' },
  { id: 'o4-mini', name: 'o4 Mini', category: 'fast', provider: 'openai' },
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

    // Reasoning models use 'developer' role; standard models use 'system'
    const messages = [
      { role: reasoning ? 'developer' : 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    // Reasoning models use max_completion_tokens with minimum 25K budget;
    // standard models use max_tokens as-is
    const tokenLimit = reasoning
      ? { max_completion_tokens: Math.max(maxTokens, MIN_REASONING_TOKEN_BUDGET) }
      : { max_tokens: maxTokens };

    // Build request body -- reasoning models exclude temperature/top_p
    const body: Record<string, unknown> = {
      model,
      messages,
      ...tokenLimit,
      stream: true,
    };

    // Add reasoning_effort when specified for reasoning models
    if (reasoning && options.reasoningEffort) {
      body.reasoning_effort = options.reasoningEffort;
    }

    await streamSSE(
      {
        url: OPENAI_API_URL,
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body,
        providerName: 'OpenAI',
      },
      options,
    );
  }
}
