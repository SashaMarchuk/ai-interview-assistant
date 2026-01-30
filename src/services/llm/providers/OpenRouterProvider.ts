/**
 * OpenRouter Provider Adapter
 *
 * Implements LLMProvider interface for OpenRouter API.
 * Handles SSE streaming with eventsource-parser.
 */

import { createParser, type EventSourceParser, type EventSourceMessage } from 'eventsource-parser';
import type { LLMProvider, ProviderId, ProviderStreamOptions, ModelInfo } from './LLMProvider';

/** OpenRouter API endpoint */
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Available models on OpenRouter
 */
export const OPENROUTER_MODELS: ModelInfo[] = [
  // Fast models (for quick hints)
  { id: 'google/gemini-flash-1.5', name: 'Gemini Flash 1.5', category: 'fast', provider: 'openrouter' },
  { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', category: 'fast', provider: 'openrouter' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', category: 'fast', provider: 'openrouter' },
  // Full models (for comprehensive answers)
  { id: 'anthropic/claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', category: 'full', provider: 'openrouter' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', category: 'full', provider: 'openrouter' },
  { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5', category: 'full', provider: 'openrouter' },
];

/** OpenRouter streaming response chunk structure */
interface OpenRouterStreamChunk {
  choices: Array<{
    delta: {
      content?: string;
      role?: 'assistant';
    };
    finish_reason: 'stop' | 'length' | 'error' | null;
  }>;
  error?: {
    message: string;
    code?: string;
  };
}

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
    const {
      model,
      systemPrompt,
      userPrompt,
      maxTokens,
      apiKey,
      onToken,
      onComplete,
      onError,
      abortSignal,
    } = options;

    // Build messages array
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    // Make streaming request
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': chrome.runtime.getURL(''),
        'X-Title': 'AI Interview Assistant',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        stream: true,
      }),
      signal: abortSignal,
    });

    // Check for HTTP errors
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
    }

    // Get response body reader
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder('utf-8');
    let isComplete = false;

    // Create SSE parser
    const parser: EventSourceParser = createParser({
      onEvent: (event: EventSourceMessage) => {
        // Check for stream completion marker
        if (event.data === '[DONE]') {
          isComplete = true;
          onComplete();
          return;
        }

        // Parse the JSON chunk
        try {
          const chunk = JSON.parse(event.data) as OpenRouterStreamChunk;

          // Check for error in response
          if (chunk.error) {
            onError(new Error(chunk.error.message));
            return;
          }

          // Extract content from delta
          const choice = chunk.choices?.[0];
          if (choice) {
            // Check for error finish reason
            if (choice.finish_reason === 'error') {
              onError(new Error('Stream finished with error'));
              return;
            }

            // Extract and emit token
            const content = choice.delta?.content;
            if (content) {
              onToken(content);
            }
          }
        } catch {
          // Ignore JSON parse errors (could be comment lines or malformed data)
        }
      },
    });

    // Read and process stream
    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Stream ended without [DONE] marker
          if (!isComplete) {
            onComplete();
          }
          break;
        }

        // Decode chunk and feed to parser
        const text = decoder.decode(value, { stream: true });
        parser.feed(text);
      }
    } catch (error) {
      // Handle abort or other errors
      if (error instanceof Error && error.name === 'AbortError') {
        // Request was cancelled - not an error
        return;
      }
      throw error;
    }
  }
}
