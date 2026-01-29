/**
 * LLM Service Barrel Export
 *
 * Provides a clean API surface for LLM functionality:
 * - Types for streaming and dual-request patterns
 * - OpenRouter streaming client
 * - Prompt building with variable substitution
 */

// Re-export all types
export type {
  StreamOptions,
  DualLLMRequest,
  StreamCallbacks,
  OpenRouterChatMessage,
  OpenRouterStreamChunk,
} from './types';

// Re-export streaming client
export { streamLLMResponse } from './OpenRouterClient';

// Re-export prompt builder
export { buildPrompt, type BuildPromptResult } from './PromptBuilder';
