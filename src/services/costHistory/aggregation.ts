/**
 * Cost History Aggregation Helpers
 *
 * Pure functions that take CostRecord arrays and return aggregated data
 * for chart rendering. Uses Map-based accumulation pattern.
 * No external dependencies.
 */

import type { CostRecord, DailyCost, ProviderCost, ModelCost, SessionSummary } from './types';

/** DateTimeFormat instance for month abbreviation (reused across calls) */
const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' });

/**
 * Aggregate cost records by day.
 * Returns DailyCost[] sorted chronologically.
 */
export function aggregateByDay(records: CostRecord[]): DailyCost[] {
  const byDay = new Map<string, { cost: number; tokens: number }>();

  for (const r of records) {
    const d = new Date(r.timestamp);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const existing = byDay.get(dateKey) ?? { cost: 0, tokens: 0 };
    existing.cost += r.costUSD;
    existing.tokens += r.totalTokens;
    byDay.set(dateKey, existing);
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, data]) => {
      const [yearStr, monthStr, dayStr] = dateKey.split('-');
      const dateObj = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
      const month = monthFormatter.format(dateObj);
      return {
        date: `${month} ${Number(dayStr)}`,
        dateKey,
        cost: data.cost,
        tokens: data.tokens,
      };
    });
}

/**
 * Aggregate cost records by provider.
 * Returns ProviderCost[] with display names ("OpenAI", "OpenRouter").
 */
export function aggregateByProvider(records: CostRecord[]): ProviderCost[] {
  const byProvider = new Map<string, number>();

  for (const r of records) {
    const key = r.provider === 'openai' ? 'OpenAI' : 'OpenRouter';
    byProvider.set(key, (byProvider.get(key) ?? 0) + r.costUSD);
  }

  return Array.from(byProvider.entries()).map(([name, value]) => ({ name, value }));
}

/**
 * Aggregate cost records by model.
 * Returns ModelCost[] sorted by cost descending.
 */
export function aggregateByModel(records: CostRecord[]): ModelCost[] {
  const byModel = new Map<string, number>();

  for (const r of records) {
    byModel.set(r.modelId, (byModel.get(r.modelId) ?? 0) + r.costUSD);
  }

  return Array.from(byModel.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value }));
}

/**
 * Aggregate cost records by session.
 * Returns SessionSummary[] sorted by startTime descending (most recent first).
 */
export function aggregateBySessions(records: CostRecord[]): SessionSummary[] {
  const bySession = new Map<string, SessionSummary>();

  for (const r of records) {
    const existing = bySession.get(r.sessionId) ?? {
      sessionId: r.sessionId,
      startTime: r.timestamp,
      requestCount: 0,
      totalCost: 0,
      totalTokens: 0,
    };
    existing.requestCount += 1;
    existing.totalCost += r.costUSD;
    existing.totalTokens += r.totalTokens;
    if (r.timestamp < existing.startTime) {
      existing.startTime = r.timestamp;
    }
    bySession.set(r.sessionId, existing);
  }

  return Array.from(bySession.values()).sort((a, b) => b.startTime - a.startTime);
}
