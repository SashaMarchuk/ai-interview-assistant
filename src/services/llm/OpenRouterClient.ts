/**
 * OpenRouter Streaming Client
 *
 * @deprecated Use OpenRouterProvider from './providers' instead.
 * This file is kept for backward compatibility but will be removed in a future version.
 * The provider abstraction supports both OpenRouter and OpenAI with automatic selection.
 *
 * Handles SSE streaming requests to OpenRouter API.
 * Uses eventsource-parser for robust SSE parsing.
 */

import { createParser, type EventSourceParser, type EventSourceMessage } from 'eventsource-parser';
import type { StreamOptions, OpenRouterChatMessage, OpenRouterStreamChunk } from './types';

/** OpenRouter API endpoint */
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Stream an LLM response from OpenRouter
 *
 * Makes a streaming request to OpenRouter API and invokes callbacks
 * for each token received, completion, and errors.
 *
 * @param options - Stream configuration including model, prompts, and callbacks
 * @throws Error if response is not ok (non-2xx status)
 *
 * @example
 * ```ts
 * await streamLLMResponse({
 *   model: 'anthropic/claude-3-haiku',
 *   systemPrompt: 'You are a helpful assistant.',
 *   userPrompt: 'What is TypeScript?',
 *   maxTokens: 500,
 *   apiKey: 'sk-...',
 *   onToken: (token) => console.log(token),
 *   onComplete: () => console.log('Done'),
 *   onError: (err) => console.error(err),
 * });
 * ```
 */
export async function streamLLMResponse(options: StreamOptions): Promise<void> {
  console.warn(
    '[DEPRECATED] streamLLMResponse from OpenRouterClient.ts is deprecated. ' +
    'Use the provider abstraction from src/services/llm/providers instead.'
  );

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
  const messages: OpenRouterChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
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
        // This is expected for some SSE implementations
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
