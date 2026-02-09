/**
 * OpenRouter Provider Adapter
 *
 * Implements LLMProvider interface for OpenRouter API.
 * Uses shared SSE streaming utility.
 */

import { streamSSE } from './streamSSE';
import type { LLMProvider, ProviderId, ProviderStreamOptions, ModelInfo } from './LLMProvider';
import { isReasoningModel } from './LLMProvider';

/** OpenRouter API endpoint */
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Available models on OpenRouter
 */
export const OPENROUTER_MODELS: ModelInfo[] = [
  // Fast models (for quick hints)
  {
    id: 'google/gemini-flash-1.5',
    name: 'Gemini Flash 1.5',
    category: 'fast',
    provider: 'openrouter',
  },
  {
    id: 'anthropic/claude-3-haiku',
    name: 'Claude 3 Haiku',
    category: 'fast',
    provider: 'openrouter',
  },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', category: 'fast', provider: 'openrouter' },
  // Full models (for comprehensive answers)
  {
    id: 'anthropic/claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    category: 'full',
    provider: 'openrouter',
  },
  { id: 'openai/gpt-4o', name: 'GPT-4o', category: 'full', provider: 'openrouter' },
  { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5', category: 'full', provider: 'openrouter' },
  // Reasoning models (o-series and GPT-5)
  { id: 'openai/o3-mini', name: 'o3 Mini', category: 'fast', provider: 'openrouter' },
  { id: 'openai/o4-mini', name: 'o4 Mini', category: 'fast', provider: 'openrouter' },
  { id: 'openai/gpt-5', name: 'GPT-5', category: 'full', provider: 'openrouter' },
  { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini', category: 'fast', provider: 'openrouter' },
];

/**
 * OpenRouter Provider
 *
 * Implements LLMProvider for OpenRouter API streaming.
 */
export class OpenRouterProvider implements LLMProvider {
  readonly id: ProviderId = 'openrouter';
  readonly name = 'OpenRouter';

  getAvailableModels(): ModelInfo[] {
    return OPENROUTER_MODELS;
  }

  isModelAvailable(modelId: string): boolean {
    return OPENROUTER_MODELS.some((m) => m.id === modelId);
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
        url: OPENROUTER_API_URL,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': chrome.runtime.getURL(''),
          'X-Title': 'AI Interview Assistant',
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
        providerName: 'OpenRouter',
        checkErrorFinishReason: true,
      },
      options,
    );
  }
}
