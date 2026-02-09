/**
 * Static pricing table for OpenAI models and cost calculation.
 * OpenRouter returns cost directly in the API response; this table
 * is only used for OpenAI provider where cost must be calculated.
 *
 * Prices as of Feb 2026 from https://openai.com/api/pricing/
 */

interface ModelPricing {
  inputPerMillion: number; // USD per 1M input tokens
  outputPerMillion: number; // USD per 1M output tokens
}

const OPENAI_PRICING: Record<string, ModelPricing> = {
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gpt-4.1': { inputPerMillion: 2.0, outputPerMillion: 8.0 },
  'gpt-4.1-mini': { inputPerMillion: 0.4, outputPerMillion: 1.6 },
  'gpt-4.1-nano': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  'gpt-5': { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  'gpt-5-mini': { inputPerMillion: 0.25, outputPerMillion: 2.0 },
  'gpt-5-nano': { inputPerMillion: 0.05, outputPerMillion: 0.4 },
  o1: { inputPerMillion: 15.0, outputPerMillion: 60.0 },
  'o1-mini': { inputPerMillion: 1.1, outputPerMillion: 4.4 },
  'o3-mini': { inputPerMillion: 1.1, outputPerMillion: 4.4 },
  'o4-mini': { inputPerMillion: 1.1, outputPerMillion: 4.4 },
};

/**
 * Calculate cost in USD from token counts and model ID.
 * For OpenRouter, use providerCost directly (more accurate).
 * For OpenAI, calculate from static pricing table.
 * Returns 0 for unknown models.
 */
export function calculateCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
  providerCost?: number,
): number {
  // If provider returned cost directly (OpenRouter), use it
  if (providerCost != null && providerCost > 0) {
    return providerCost;
  }
  // Calculate from static table (OpenAI)
  const pricing = OPENAI_PRICING[modelId];
  if (!pricing) return 0;
  const inputCost = (promptTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (completionTokens / 1_000_000) * pricing.outputPerMillion;
  return inputCost + outputCost;
}

export { OPENAI_PRICING };
