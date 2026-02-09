/**
 * Cost History Types
 *
 * Type definitions for cost record persistence and aggregation.
 * Used by IndexedDB wrapper (costDb.ts) and aggregation helpers (aggregation.ts).
 */

import type { ProviderId } from '../llm/providers/LLMProvider';

/**
 * A single cost record persisted to IndexedDB.
 * Written by background service worker on every LLM completion.
 */
export interface CostRecord {
  /** Unique record identifier (crypto.randomUUID()) */
  id: string;
  /** Unix timestamp in milliseconds (Date.now()) */
  timestamp: number;
  /** Session identifier generated on START_CAPTURE */
  sessionId: string;
  /** LLM provider that handled the request */
  provider: ProviderId;
  /** Model identifier (e.g., 'gpt-4o', 'anthropic/claude-3-haiku') */
  modelId: string;
  /** Which model slot was used */
  modelSlot: 'fast' | 'full';
  /** Number of input tokens */
  promptTokens: number;
  /** Number of output tokens */
  completionTokens: number;
  /** Number of reasoning tokens (o-series, GPT-5) */
  reasoningTokens: number;
  /** Total token count */
  totalTokens: number;
  /** Calculated cost in USD */
  costUSD: number;
}

// --- Aggregation result types ---

/** Daily cost aggregation for bar chart display */
export interface DailyCost {
  /** Human-readable date label (e.g., "Feb 3") */
  date: string;
  /** ISO date key for sorting (e.g., "2026-02-03") */
  dateKey: string;
  /** Total cost in USD for this day */
  cost: number;
  /** Total tokens used this day */
  tokens: number;
}

/** Provider-level cost breakdown for pie chart */
export interface ProviderCost {
  /** Provider display name ("OpenAI" or "OpenRouter") */
  name: string;
  /** Total cost in USD */
  value: number;
}

/** Model-level cost breakdown for pie chart */
export interface ModelCost {
  /** Model identifier */
  name: string;
  /** Total cost in USD */
  value: number;
}

/** Per-session cost summary for session list */
export interface SessionSummary {
  /** Session identifier */
  sessionId: string;
  /** Earliest request timestamp in this session */
  startTime: number;
  /** Number of LLM requests in this session */
  requestCount: number;
  /** Total cost in USD for this session */
  totalCost: number;
  /** Total tokens used in this session */
  totalTokens: number;
}
