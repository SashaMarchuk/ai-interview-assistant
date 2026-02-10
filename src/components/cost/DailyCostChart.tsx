/**
 * Daily Cost Bar Chart
 *
 * Renders a bar chart showing daily cost totals using recharts.
 * Designed for 384px popup width with angled x-axis labels.
 */

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { DailyCost } from '../../services/costHistory/types';

interface DailyCostChartProps {
  data: DailyCost[];
}

/** Format USD values for axis ticks */
function formatAxisTick(value: number): string {
  return `$${value.toFixed(2)}`;
}

/** Format USD values for tooltip (higher precision) */
function formatTooltipValue(value: number): string {
  return `$${value.toFixed(4)}`;
}

export default function DailyCostChart({ data }: DailyCostChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center text-sm text-gray-400">
        No cost data yet
      </div>
    );
  }

  return (
    <div className="h-[180px]">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={formatAxisTick} width={50} />
          <Tooltip
            formatter={(value: number | undefined) => [formatTooltipValue(value ?? 0), 'Cost']}
            labelStyle={{ fontSize: 12 }}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="cost" fill="#3B82F6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
