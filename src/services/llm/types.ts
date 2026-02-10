/**
 * LLM Service Types
 *
 * TypeScript interfaces for LLM streaming API integration.
 * Defines request/response shapes for dual-stream LLM requests.
 */

/**
 * Token usage data extracted from LLM API responses.
 * Used for cost calculation and tracking.
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  /** OpenRouter returns cost directly; undefined for OpenAI */
  providerCost?: number;
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

