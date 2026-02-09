import { memo } from 'react';
import type { LLMResponse } from '../types/transcript';
import { MemoizedMarkdown } from '../components/markdown/MemoizedMarkdown';

interface ResponsePanelProps {
  response: LLMResponse | null;
  isReasoningPending?: boolean;
}

/**
 * Status indicator showing current response state.
 * Memoized to prevent re-renders when parent updates but status unchanged.
 */
const StatusIndicator = memo(function StatusIndicator({
  status,
  isReasoningPending,
}: {
  status: LLMResponse['status'];
  isReasoningPending?: boolean;
}) {
  // Show purple reasoning indicator when reasoning mode is active
  if (isReasoningPending && (status === 'pending' || status === 'streaming')) {
    return (
      <span className="flex items-center gap-1 text-xs text-purple-300">
        <span className="h-2 w-2 animate-pulse rounded-full bg-purple-400"></span>
        Reasoning...
      </span>
    );
  }

  switch (status) {
    case 'pending':
      return (
        <span className="flex items-center gap-1 text-xs text-yellow-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400"></span>
          Thinking...
        </span>
      );
    case 'streaming':
      return (
        <span className="flex items-center gap-1 text-xs text-blue-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400"></span>
          Streaming...
        </span>
      );
    case 'complete':
      return (
        <span className="flex items-center gap-1 text-xs text-green-300">
          <span className="h-2 w-2 rounded-full bg-green-400"></span>
          Complete
        </span>
      );
    case 'error':
      return (
        <span className="flex items-center gap-1 text-xs text-red-300">
          <span className="h-2 w-2 rounded-full bg-red-400"></span>
          Error
        </span>
      );
  }
});

/**
 * Response panel displaying dual AI responses: fast hint and full answer.
 * Designed for the interview assistant use case where user needs
 * quick guidance immediately, with comprehensive answer streaming in.
 * Memoized to prevent re-renders when transcript updates but response unchanged.
 */
export const ResponsePanel = memo(function ResponsePanel({
  response,
  isReasoningPending,
}: ResponsePanelProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-1 flex items-center justify-between text-xs font-medium text-white/60">
        <span>AI Response</span>
        {response && (
          <div className="flex items-center gap-2">
            {response.totalCostUSD != null && response.totalCostUSD > 0 && (
              <span className="text-xs text-white/40" title={`Fast: $${(response.fastCostUSD ?? 0).toFixed(4)} | Full: $${(response.fullCostUSD ?? 0).toFixed(4)}`}>
                ${response.totalCostUSD < 0.01
                  ? response.totalCostUSD.toFixed(4)
                  : response.totalCostUSD.toFixed(3)}
              </span>
            )}
            <StatusIndicator status={response.status} isReasoningPending={isReasoningPending} />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto rounded p-2">
        {!response ? (
          <div className="flex h-full items-center justify-center">
            <span className="px-4 text-center text-sm text-white/40 italic">
              Hold hotkey to capture question...
            </span>
          </div>
        ) : response.status === 'error' ? (
          <div className="text-sm text-red-300">
            <span className="font-medium">Error:</span> {response.error || 'An error occurred'}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Fast Hint Section */}
            {response.fastHint && (
              <div className="text-sm">
                <div className="mb-1 flex items-center gap-1">
                  <span className="font-medium text-green-300">Quick Hint</span>
                  <span className="text-xs text-white/40">— start talking</span>
                </div>
                <div className="border-l-2 border-green-400/50 pl-2">
                  <MemoizedMarkdown content={response.fastHint} />
                </div>
              </div>
            )}

            {/* Full Answer Section */}
            {response.fullAnswer && (
              <div className="text-sm">
                <div className="mb-1 flex items-center gap-1">
                  <span className="font-medium text-purple-300">Full Answer</span>
                  <span className="text-xs text-white/40">— detailed response</span>
                </div>
                <div className="border-l-2 border-purple-400/50 pl-2">
                  <MemoizedMarkdown content={response.fullAnswer} />
                </div>
              </div>
            )}

            {/* Pending state with no content yet */}
            {response.status === 'pending' && !response.fastHint && !response.fullAnswer && (
              <div className="py-4 text-center text-sm text-white/40 italic">
                {isReasoningPending ? 'Reasoning deeply...' : 'Processing your question...'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
