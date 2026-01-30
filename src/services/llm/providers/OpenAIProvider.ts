/**
 * OpenAI Provider Adapter
 *
 * Implements LLMProvider interface for OpenAI API.
 * Handles SSE streaming with eventsource-parser.
 */

import { createParser, type EventSourceParser, type EventSourceMessage } from 'eventsource-parser';
import type { LLMProvider, ProviderId, ProviderStreamOptions, ModelInfo } from './LLMProvider';

/** OpenAI API endpoint */
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Available models on OpenAI
 */
export const OPENAI_MODELS: ModelInfo[] = [
  // Fast models (for quick hints)
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', category: 'fast', provider: 'openai' },
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', category: 'fast', provider: 'openai' },
  { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', category: 'fast', provider: 'openai' },
  // Full models (for comprehensive answers)
  { id: 'gpt-4o', name: 'GPT-4o', category: 'full', provider: 'openai' },
  { id: 'gpt-4.1', name: 'GPT-4.1', category: 'full', provider: 'openai' },
];

/** OpenAI streaming response chunk structure */
interface OpenAIStreamChunk {
  choices: Array<{
    delta: {
      content?: string;
      role?: 'assistant';
    };
    finish_reason: 'stop' | 'length' | null;
  }>;
  error?: {
    message: string;
    code?: string;
  };
}

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
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
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
      throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
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
          const chunk = JSON.parse(event.data) as OpenAIStreamChunk;

          // Check for error in response
          if (chunk.error) {
            onError(new Error(chunk.error.message));
            return;
          }

          // Extract content from delta
          const choice = chunk.choices?.[0];
          if (choice) {
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
