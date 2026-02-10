import { memo } from 'react';
import type { LLMResponse } from '../types/transcript';

/**
 * Status indicator component showing current LLM response state.
 * Used by both Overlay footer and ResponsePanel header.
 * Memoized to prevent re-renders when other state changes.
 *
 * Two variants:
 * - "footer": Used in Overlay footer with ping animation (streaming dots)
 * - "panel": Used in ResponsePanel header with pulse animation and explicit complete/error states
 */

interface StatusIndicatorProps {
  status: LLMResponse['status'] | null;
  isReasoningPending?: boolean;
  variant?: 'footer' | 'panel';
}

/**
 * Footer variant: ping animation dots, shows Ready/Streaming/Processing/Reasoning.
 */
function FooterStatus({ status, isReasoningPending }: StatusIndicatorProps) {
  // Show purple reasoning indicator when reasoning mode is active
  if (isReasoningPending && (status === 'streaming' || status === 'pending')) {
    return (
      <span className="flex items-center gap-1">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-purple-400"></span>
        </span>
        Reasoning...
      </span>
    );
  }

  if (status === 'streaming') {
    return (
      <span className="flex items-center gap-1">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-400"></span>
        </span>
        Streaming...
      </span>
    );
  }

  if (status === 'pending') {
    return (
      <span className="flex items-center gap-1">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-400"></span>
        </span>
        Processing...
      </span>
    );
  }

  // Default: Ready (complete, error, or no response)
  return (
    <span className="flex items-center gap-1">
      <span className="h-2 w-2 rounded-full bg-green-400"></span>
      Ready
    </span>
  );
}

/**
 * Panel variant: pulse animation dots, shows Thinking/Streaming/Complete/Error/Reasoning.
 */
function PanelStatus({ status, isReasoningPending }: StatusIndicatorProps) {
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
    default:
      return null;
  }
}

export const StatusIndicator = memo(function StatusIndicator({
  status,
  isReasoningPending,
  variant = 'footer',
}: StatusIndicatorProps) {
  if (variant === 'panel') {
    return <PanelStatus status={status} isReasoningPending={isReasoningPending} />;
  }
  return <FooterStatus status={status} isReasoningPending={isReasoningPending} />;
});
