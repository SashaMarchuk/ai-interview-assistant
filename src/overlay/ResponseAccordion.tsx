import { memo, type ReactNode } from 'react';

type AccordionType = 'fast' | 'full' | 'reasoning' | 'quick-prompt';

interface ResponseAccordionProps {
  type: AccordionType;
  label: string;
  snippet: string;
  isOpen: boolean;
  onToggle: () => void;
  isStreaming?: boolean;
  costUSD?: number;
  children: ReactNode;
}

const TYPE_STYLES: Record<AccordionType, { badge: string; border: string }> = {
  fast: {
    badge: 'bg-green-500/20 text-green-300',
    border: 'border-green-400/30',
  },
  full: {
    badge: 'bg-purple-500/20 text-purple-300',
    border: 'border-purple-400/30',
  },
  reasoning: {
    badge: 'bg-amber-500/20 text-amber-300',
    border: 'border-amber-400/30',
  },
  'quick-prompt': {
    badge: 'bg-teal-500/20 text-teal-300',
    border: 'border-teal-400/30',
  },
};

export const ResponseAccordion = memo(function ResponseAccordion({
  type,
  label,
  snippet,
  isOpen,
  onToggle,
  isStreaming,
  costUSD,
  children,
}: ResponseAccordionProps) {
  const styles = TYPE_STYLES[type];

  return (
    <div className={`rounded border ${styles.border} ${isOpen ? 'bg-white/5' : ''}`}>
      {/* Accordion header - always visible, single line */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs hover:bg-white/5"
      >
        {/* Expand/collapse chevron */}
        <span
          className="shrink-0 text-white/40 transition-transform"
          style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          &#9654;
        </span>

        {/* Type badge */}
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${styles.badge}`}>
          {label}
        </span>

        {/* Streaming indicator */}
        {isStreaming && (
          <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-teal-400" />
        )}

        {/* Question snippet - truncated to single line */}
        <span className="min-w-0 flex-1 truncate text-white/40">{snippet}</span>

        {/* Cost */}
        {costUSD != null && costUSD > 0 && (
          <span className="shrink-0 text-white/30">
            ${costUSD < 0.01 ? costUSD.toFixed(4) : costUSD.toFixed(3)}
          </span>
        )}
      </button>

      {/* Accordion body - collapsible */}
      {isOpen && <div className="border-t border-white/10 px-2 py-2 text-sm">{children}</div>}
    </div>
  );
});
