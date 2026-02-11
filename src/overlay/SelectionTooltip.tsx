/**
 * SelectionTooltip Component
 *
 * A floating toolbar that appears above/below text selections.
 * Uses @floating-ui/react-dom for viewport-aware positioning via virtual elements.
 * Renders action buttons from the Zustand quick prompts store.
 *
 * Features:
 * - Positions relative to selection bounding rect
 * - Flips to bottom if no space above
 * - Fade-in animation (150ms)
 * - Loading spinners on action buttons
 * - Error state with 3-second auto-reset
 * - Triangular arrow pointer toward selection
 */

import { useEffect, useState, useMemo, forwardRef } from 'react';
import { useFloating, offset, flip, shift } from '@floating-ui/react-dom';
import { useStore } from '../store';
import { ICON_MAP } from '../constants/quickPromptIcons';

interface SelectionTooltipProps {
  /** Selection bounding rect for positioning */
  rect: DOMRect;
  /** Called when an action button is clicked */
  onAction: (promptTemplate: string, actionLabel: string, actionId: string) => void;
  /** ID of the action currently loading (shows spinner) */
  loadingActionId: string | null;
  /** ID of the action that errored (shows error state) */
  errorActionId: string | null;
}

/**
 * Floating tooltip toolbar for quick prompt actions on text selections.
 * Uses forwardRef so the parent can pass a ref for click-outside detection.
 */
export const SelectionTooltip = forwardRef<HTMLDivElement, SelectionTooltipProps>(
  function SelectionTooltip({ rect, onAction, loadingActionId, errorActionId }, ref) {
    const quickPrompts = useStore((state) => state.quickPrompts);
    const [visible, setVisible] = useState(false);

    // Floating UI setup with virtual element positioning
    // strategy: 'fixed' is required because selection rect comes from
    // getBoundingClientRect() (viewport coordinates) and the tooltip
    // is a sibling of Rnd (not a descendant), so 'absolute' would
    // position relative to the wrong containing block.
    const { refs, floatingStyles, placement } = useFloating({
      strategy: 'fixed',
      placement: 'top',
      middleware: [offset(8), flip(), shift({ padding: 8 })],
    });

    // Set virtual reference from selection rect using refs.setReference
    // In @floating-ui/react-dom v2, setReference accepts VirtualElement
    useEffect(() => {
      refs.setReference({
        getBoundingClientRect: () => rect,
      });
    }, [rect, refs]);

    // Trigger fade-in animation on mount
    useEffect(() => {
      // Use requestAnimationFrame to ensure the initial opacity:0 is painted
      const raf = requestAnimationFrame(() => {
        setVisible(true);
      });
      return () => cancelAnimationFrame(raf);
    }, []);

    // Memoize sorted prompts to avoid re-sorting on every render
    const sortedPrompts = useMemo(
      () => [...quickPrompts].sort((a, b) => a.order - b.order),
      [quickPrompts],
    );

    // Determine arrow position based on Floating UI placement
    const isAbove = placement.startsWith('top');

    return (
      <div
        ref={(node) => {
          // Merge refs: floating ref + forwarded ref
          refs.setFloating(node);
          if (typeof ref === 'function') {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        style={{ ...floatingStyles, zIndex: 10000000 }}
        className={`selection-tooltip-enter ${visible ? 'selection-tooltip-enter-active' : ''}`}
      >
        <div className="flex items-center gap-0.5 rounded-lg border border-white/20 bg-gray-800/95 px-1.5 py-1 shadow-lg">
          {sortedPrompts.map((prompt) => {
            const isLoading = loadingActionId === prompt.id;
            const isError = errorActionId === prompt.id;
            const icon = ICON_MAP[prompt.icon] || prompt.icon;

            return (
              <button
                key={prompt.id}
                onClick={() => onAction(prompt.promptTemplate, prompt.label, prompt.id)}
                disabled={isLoading}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  isError
                    ? 'bg-red-500/20 text-red-300'
                    : isLoading
                      ? 'cursor-wait bg-white/5 text-white/50'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`}
                title={prompt.label}
              >
                {isLoading ? (
                  <span className="qp-spinner" />
                ) : (
                  <span className="text-sm">{icon}</span>
                )}
                <span>{isError ? 'Failed' : prompt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Arrow pointer toward selection */}
        <div
          className="selection-tooltip-arrow"
          style={{
            left: '50%',
            marginLeft: '-4px',
            background: 'rgb(31 41 55 / 0.95)',
            ...(isAbove ? { bottom: '-4px' } : { top: '-4px' }),
          }}
        />
      </div>
    );
  },
);
