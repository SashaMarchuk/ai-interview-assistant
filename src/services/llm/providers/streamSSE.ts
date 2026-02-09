/**
 * Shared SSE Streaming Utility
 *
 * Consolidates common SSE (Server-Sent Events) streaming logic
 * used by both OpenAI and OpenRouter providers.
 */

import { createParser, type EventSourceParser, type EventSourceMessage } from 'eventsource-parser';
import type { ProviderStreamOptions } from './LLMProvider';

/** Common streaming response chunk structure (OpenAI-compatible) */
export interface StreamChunk {
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
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
    cost?: number; // OpenRouter only
  };
}

/** Configuration for the SSE stream */
export interface SSEStreamConfig {
  /** API endpoint URL */
  url: string;
  /** HTTP headers (without Content-Type which is auto-added) */
  headers: Record<string, string>;
  /** Request body to send */
  body: Record<string, unknown>;
  /** Provider name for error messages */
  providerName: string;
  /** Whether to check for 'error' finish_reason (OpenRouter) */
  checkErrorFinishReason?: boolean;
}

/**
 * Stream an SSE response from an OpenAI-compatible API.
 *
 * Handles connection, parsing, and error handling in a unified way
 * for both OpenAI and OpenRouter (and any future OpenAI-compatible providers).
 */
export async function streamSSE(
  config: SSEStreamConfig,
  options: ProviderStreamOptions,
): Promise<void> {
  const { url, headers, body, providerName, checkErrorFinishReason = false } = config;
  const { onToken, onComplete, onError, abortSignal } = options;

  // Make streaming request
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: abortSignal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error';
    throw new Error(`${providerName} connection failed: ${message}`);
  }

  // Check for HTTP errors
  if (!response.ok) {
    let errorText = '';
    try {
      errorText = await response.text();
      const errorJson = JSON.parse(errorText);
      errorText = errorJson?.error?.message || errorText;
    } catch {
      // Keep raw text if not JSON
    }
    throw new Error(`${providerName} error ${response.status}: ${errorText || 'Unknown error'}`);
  }

  // Non-streaming fallback: some reasoning models return JSON instead of SSE.
  // Detect by checking content-type header and handle gracefully.
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json') && !contentType.includes('text/event-stream')) {
    try {
      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message: string };
        usage?: StreamChunk['usage'];
      };
      if (json.error) {
        onError(new Error(json.error.message));
        return;
      }

      // Extract usage from non-streaming JSON response
      if (json.usage && options.onUsage) {
        options.onUsage({
          promptTokens: json.usage.prompt_tokens,
          completionTokens: json.usage.completion_tokens,
          reasoningTokens: json.usage.completion_tokens_details?.reasoning_tokens ?? 0,
          totalTokens: json.usage.total_tokens,
          providerCost: json.usage.cost,
        });
      }

      const content = json.choices?.[0]?.message?.content;
      if (content) {
        onToken(content);
      }
      onComplete();
      return;
    } catch {
      throw new Error(`${providerName}: failed to parse non-streaming JSON response`);
    }
  }

  // Get response body reader
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder('utf-8');
  let completed = false;

  /** Guard against double onComplete invocation (e.g., [DONE] marker + reader done) */
  function completeOnce(): void {
    if (!completed) {
      completed = true;
      onComplete();
    }
  }

  // Create SSE parser
  const parser: EventSourceParser = createParser({
    onEvent: (event: EventSourceMessage) => {
      // Check for stream completion marker
      if (event.data === '[DONE]') {
        completeOnce();
        return;
      }

      // Parse the JSON chunk
      try {
        const chunk = JSON.parse(event.data) as StreamChunk;

        // Check for error in response
        if (chunk.error) {
          onError(new Error(chunk.error.message));
          return;
        }

        // Extract usage data from final chunk (sent when choices is empty or after [DONE]-adjacent chunk)
        if (chunk.usage && options.onUsage) {
          options.onUsage({
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            reasoningTokens: chunk.usage.completion_tokens_details?.reasoning_tokens ?? 0,
            totalTokens: chunk.usage.total_tokens,
            providerCost: chunk.usage.cost,
          });
        }

        // Extract content from delta
        const choice = chunk.choices?.[0];
        if (choice) {
          // Check for error finish reason (OpenRouter-specific)
          if (checkErrorFinishReason && choice.finish_reason === 'error') {
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
        // Stream ended without [DONE] marker - complete if not already done
        completeOnce();
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
