/**
 * Provider & Model Cost Breakdown
 *
 * Renders a pie chart for provider-level cost distribution
 * and a simple list for top model costs using recharts.
 * Designed for 384px popup width.
 */

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import type { ProviderCost, ModelCost } from '../../services/costHistory/types';

interface ProviderBreakdownProps {
  providerData: ProviderCost[];
  modelData: ModelCost[];
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

/** Format USD values for tooltip (higher precision) */
function formatTooltipValue(value: number): string {
  return `$${value.toFixed(4)}`;
}

export default function ProviderBreakdown({ providerData, modelData }: ProviderBreakdownProps) {
  if (providerData.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center text-sm text-gray-400">
        No cost data yet
      </div>
    );
  }

  const topModels = modelData.slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Provider Pie Chart */}
      <div>
        <h4 className="mb-1 text-xs font-medium text-gray-500">By Provider</h4>
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={providerData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={60}
                label={false}
              >
                {providerData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number | undefined) => [formatTooltipValue(value ?? 0), 'Cost']}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Model Breakdown List */}
      {topModels.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-gray-500">By Model (Top 5)</h4>
          <div className="space-y-1">
            {topModels.map((model, index) => (
              <div key={model.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="max-w-[200px] truncate text-gray-700">{model.name}</span>
                </div>
                <span className="font-mono text-gray-600">${model.value.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
