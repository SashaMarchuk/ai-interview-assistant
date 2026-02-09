/**
 * Cost Dashboard
 *
 * Main dashboard component for viewing historical LLM cost data.
 * Loads records from IndexedDB, aggregates them, and renders:
 * - Daily cost bar chart
 * - Provider/model breakdown pie chart
 * - Per-session cost list
 *
 * Supports 7d/30d/90d date range filtering and auto-prunes records older than 90 days.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  getCostRecordsSince,
  deleteRecordsBefore,
  clearAllRecords,
} from '../../services/costHistory/costDb';
import {
  aggregateByDay,
  aggregateByProvider,
  aggregateByModel,
  aggregateBySessions,
} from '../../services/costHistory/aggregation';
import type { CostRecord } from '../../services/costHistory/types';
import DailyCostChart from './DailyCostChart';
import ProviderBreakdown from './ProviderBreakdown';
import SessionCostList from './SessionCostList';

type DateRange = 7 | 30 | 90;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 90;

export default function CostDashboard() {
  const [records, setRecords] = useState<CostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>(30);
  const hasPruned = useRef(false);

  // Load data from IndexedDB when dateRange changes
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      try {
        // Auto-prune old records on first mount only (fire-and-forget)
        if (!hasPruned.current) {
          hasPruned.current = true;
          deleteRecordsBefore(Date.now() - RETENTION_DAYS * MS_PER_DAY).catch(() => {
            // Silent failure -- pruning is best-effort
          });
        }

        const since = Date.now() - dateRange * MS_PER_DAY;
        const data = await getCostRecordsSince(since);
        if (!cancelled) {
          setRecords(data);
        }
      } catch (error) {
        console.error('Failed to load cost records:', error);
        if (!cancelled) {
          setRecords([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [dateRange]);

  // Aggregate data with useMemo
  const dailyData = useMemo(() => aggregateByDay(records), [records]);
  const providerData = useMemo(() => aggregateByProvider(records), [records]);
  const modelData = useMemo(() => aggregateByModel(records), [records]);
  const sessionData = useMemo(() => aggregateBySessions(records), [records]);
  const totalCost = useMemo(() => records.reduce((sum, r) => sum + r.costUSD, 0), [records]);
  const totalTokens = useMemo(() => records.reduce((sum, r) => sum + r.totalTokens, 0), [records]);

  /** Handle clearing all cost history */
  async function handleClearHistory() {
    if (!window.confirm('Delete all cost history? This cannot be undone.')) {
      return;
    }
    try {
      await clearAllRecords();
      setRecords([]);
    } catch (error) {
      console.error('Failed to clear cost records:', error);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-gray-500">
        Loading cost data...
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header with totals */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Cost Dashboard</h2>
          <p className="text-xs text-gray-500">
            Total:{' '}
            <span className="font-mono font-medium text-gray-700">${totalCost.toFixed(4)}</span>{' '}
            &middot;{' '}
            {totalTokens >= 1_000_000
              ? `${(totalTokens / 1_000_000).toFixed(1)}M tokens`
              : totalTokens >= 1_000
                ? `${(totalTokens / 1_000).toFixed(1)}K tokens`
                : `${totalTokens} tokens`}
          </p>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="flex gap-1">
        {([7, 30, 90] as const).map((range) => (
          <button
            key={range}
            onClick={() => setDateRange(range)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              dateRange === range
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {range}d
          </button>
        ))}
      </div>

      {/* Daily Costs Chart */}
      <section>
        <h3 className="mb-2 text-xs font-medium text-gray-500">Daily Costs</h3>
        <div className="rounded-lg border border-gray-200 p-2">
          <DailyCostChart data={dailyData} />
        </div>
      </section>

      {/* Divider */}
      <hr className="border-gray-100" />

      {/* Provider & Model Breakdown */}
      <section>
        <h3 className="mb-2 text-xs font-medium text-gray-500">Provider & Model Breakdown</h3>
        <div className="rounded-lg border border-gray-200 p-2">
          <ProviderBreakdown providerData={providerData} modelData={modelData} />
        </div>
      </section>

      {/* Divider */}
      <hr className="border-gray-100" />

      {/* Sessions */}
      <section>
        <h3 className="mb-2 text-xs font-medium text-gray-500">Sessions</h3>
        <div className="rounded-lg border border-gray-200">
          <SessionCostList sessions={sessionData} />
        </div>
      </section>

      {/* Clear History */}
      <button
        onClick={handleClearHistory}
        className="w-full rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
      >
        Clear History
      </button>
    </div>
  );
}
