/**
 * Session Cost List
 *
 * Renders a scrollable list of per-session cost summaries.
 * Shows date/time, request count, total cost, and total tokens.
 */

import type { SessionSummary } from '../../services/costHistory/types';

interface SessionCostListProps {
  sessions: SessionSummary[];
}

/** Shared DateTimeFormat instance for session timestamps */
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Format token count with K/M suffix for readability */
function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return String(tokens);
}

export default function SessionCostList({ sessions }: SessionCostListProps) {
  if (sessions.length === 0) {
    return (
      <div className="flex h-[100px] items-center justify-center text-sm text-gray-400">
        No sessions recorded
      </div>
    );
  }

  return (
    <div className="max-h-[200px] divide-y divide-gray-100 overflow-y-auto">
      {sessions.map((session, index) => (
        <div
          key={session.sessionId}
          className={`flex items-center justify-between px-2 py-2 text-xs ${
            index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
          }`}
        >
          <div className="min-w-0 flex-1">
            <div className="font-medium text-gray-700">
              {dateTimeFormatter.format(new Date(session.startTime))}
            </div>
            <div className="text-gray-400">
              {session.requestCount} request{session.requestCount !== 1 ? 's' : ''} &middot;{' '}
              {formatTokens(session.totalTokens)} tokens
            </div>
          </div>
          <div className="ml-3 font-mono text-sm font-medium text-gray-800">
            ${session.totalCost.toFixed(4)}
          </div>
        </div>
      ))}
    </div>
  );
}
