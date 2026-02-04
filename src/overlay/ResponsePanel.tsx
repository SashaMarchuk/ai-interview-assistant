import { memo } from 'react';
import type { LLMResponse } from '../types/transcript';

interface ResponsePanelProps {
  response: LLMResponse | null;
}

/**
 * Status indicator showing current response state.
 * Memoized to prevent re-renders when parent updates but status unchanged.
 */
const StatusIndicator = memo(function StatusIndicator({ status }: { status: LLMResponse['status'] }) {
  switch (status) {
    case 'pending':
      return (
        <span className="flex items-center gap-1 text-xs text-yellow-300">
          <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></span>
          Thinking...
        </span>
      );
    case 'streaming':
      return (
        <span className="flex items-center gap-1 text-xs text-blue-300">
          <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
          Streaming...
        </span>
      );
    case 'complete':
      return (
        <span className="flex items-center gap-1 text-xs text-green-300">
          <span className="w-2 h-2 bg-green-400 rounded-full"></span>
          Complete
        </span>
      );
    case 'error':
      return (
        <span className="flex items-center gap-1 text-xs text-red-300">
          <span className="w-2 h-2 bg-red-400 rounded-full"></span>
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
export const ResponsePanel = memo(function ResponsePanel({ response }: ResponsePanelProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="text-xs font-medium text-white/60 mb-1 flex items-center justify-between">
        <span>AI Response</span>
        {response && <StatusIndicator status={response.status} />}
      </div>

      <div className="flex-1 rounded p-2 overflow-y-auto">
        {!response ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-sm text-white/40 italic text-center px-4">
              Hold hotkey to capture question...
            </span>
          </div>
        ) : response.status === 'error' ? (
          <div className="text-sm text-red-300">
            <span className="font-medium">Error:</span>{' '}
            {response.error || 'An error occurred'}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Fast Hint Section */}
            {response.fastHint && (
              <div className="text-sm">
                <div className="flex items-center gap-1 mb-1">
                  <span className="font-medium text-green-300">Quick Hint</span>
                  <span className="text-xs text-white/40">— start talking</span>
                </div>
                <div className="text-white/90 border-l-2 border-green-400/50 pl-2">
                  {response.fastHint}
                </div>
              </div>
            )}

            {/* Full Answer Section */}
            {response.fullAnswer && (
              <div className="text-sm">
                <div className="flex items-center gap-1 mb-1">
                  <span className="font-medium text-purple-300">Full Answer</span>
                  <span className="text-xs text-white/40">— detailed response</span>
                </div>
                <div className="text-white/90 border-l-2 border-purple-400/50 pl-2">
                  {response.fullAnswer}
                </div>
              </div>
            )}

            {/* Pending state with no content yet */}
            {response.status === 'pending' && !response.fastHint && !response.fullAnswer && (
              <div className="text-sm text-white/40 italic text-center py-4">
                Processing your question...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
