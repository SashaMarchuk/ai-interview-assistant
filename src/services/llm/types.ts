/**
 * LLM Service Types
 *
 * TypeScript interfaces for LLM streaming API integration.
 * Defines request/response shapes for dual-stream LLM requests.
 */

// Re-export provider types for backward compatibility
export type { ProviderId as LLMProviderId } from './providers/LLMProvider';

/**
 * Options for streaming an LLM response
 */
export interface StreamOptions {
  /** Model identifier (e.g., 'anthropic/claude-3-haiku') */
  model: string;
  /** System prompt for LLM context */
  systemPrompt: string;
  /** User prompt with the actual question/request */
  userPrompt: string;
  /** Maximum tokens to generate */
  maxTokens: number;
  /** OpenRouter API key */
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
 * Request structure for dual-stream LLM processing
 * Background.ts uses this to initiate parallel fast/full requests
 */
export interface DualLLMRequest {
  /** The captured question text (highlighted or detected) */
  question: string;
  /** Recent transcript context (last ~5 entries) */
  recentContext: string;
  /** Full transcript content for comprehensive context */
  fullTranscript: string;
  /** Template ID to use for prompt building */
  templateId: string;
  /** Optional: if true, this is a reasoning request (single-stream, not dual) */
  isReasoningRequest?: boolean;
  /** Optional: reasoning effort level */
  reasoningEffort?: 'low' | 'medium' | 'high';
}

/**
 * Callbacks for dual-stream LLM responses
 * Handles both fast hint and full answer streams
 */
export interface StreamCallbacks {
  /** Token received from fast model */
  onFastToken: (token: string) => void;
  /** Token received from full model */
  onFullToken: (token: string) => void;
  /** Fast model stream completed */
  onFastComplete: () => void;
  /** Full model stream completed */
  onFullComplete: () => void;
  /** Error occurred on either stream */
  onError: (error: Error, model: 'fast' | 'full') => void;
}

/**
 * OpenRouter chat message format
 */
export interface OpenRouterChatMessage {
  /** Message role */
  role: 'system' | 'user' | 'assistant' | 'developer';
  /** Message content */
  content: string;
}

/**
 * OpenRouter streaming response chunk structure
 */
export interface OpenRouterStreamChunk {
  /** Array of choices (typically single element for streaming) */
  choices: Array<{
    /** Delta containing incremental content */
    delta: {
      /** Incremental text content */
      content?: string;
      /** Role (only present in first chunk) */
      role?: 'assistant';
    };
    /** Reason for completion (null while streaming, set on final chunk) */
    finish_reason: 'stop' | 'length' | 'error' | null;
  }>;
  /** Error information if request failed */
  error?: {
    message: string;
    code?: string;
  };
}
