/**
 * useTextSelection Hook
 *
 * Shadow DOM-aware text selection detection hook.
 * Uses Selection.getComposedRanges() (Chrome 137+) to detect
 * click-and-drag selections inside the overlay's Shadow DOM.
 *
 * Key behaviors:
 * - Filters out double-click selections (reserved for Phase 20 transcript editing)
 * - 200ms debounce before reporting selection (avoids flicker during selection)
 * - Clears selection on mousedown outside tooltip (click-outside dismiss)
 * - Returns selection text and bounding rect for tooltip positioning
 */

import { useState, useEffect, useCallback, useMemo, type RefObject } from 'react';

export interface SelectionState {
  /** The selected text content */
  text: string;
  /** Bounding rect of the selection in viewport coordinates */
  rect: DOMRect;
}

/**
 * Detect text selections inside a Shadow DOM root.
 *
 * @param shadowRoot - The ShadowRoot containing the overlay UI
 * @param enabled - Whether selection detection is active
 * @param tooltipRef - Ref to the tooltip element (clicks inside it won't dismiss)
 * @returns Selection state and a function to programmatically clear it
 */
export function useTextSelection(
  shadowRoot: ShadowRoot | null,
  enabled: boolean,
  tooltipRef: RefObject<HTMLDivElement | null>,
): { selection: SelectionState | null; clearSelection: () => void } {
  const [rawSelection, setRawSelection] = useState<SelectionState | null>(null);

  const clearSelection = useCallback(() => {
    setRawSelection(null);
  }, []);

  useEffect(() => {
    if (!shadowRoot || !enabled) {
      // Clear on cleanup when deps change to disabled
      return () => {
        setRawSelection(null);
      };
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleMouseUp = (e: Event) => {
      const mouseEvent = e as MouseEvent;
      // Filter out double-clicks (reserved for Phase 20 transcript editing)
      if (mouseEvent.detail >= 2) return;

      // Clear any pending debounce
      if (debounceTimer) clearTimeout(debounceTimer);

      debounceTimer = setTimeout(() => {
        const sel = document.getSelection();
        if (!sel) {
          setRawSelection(null);
          return;
        }

        // NOTE: Do NOT check sel.isCollapsed here — document.getSelection()
        // rescopes Shadow DOM selections to the host boundary, so isCollapsed
        // returns true even when text IS selected inside the shadow root.
        // Instead, use getComposedRanges() which sees inside the shadow root.

        // getComposedRanges requires Chrome 137+
        if (!sel.getComposedRanges) {
          console.warn('[AI Assistant] getComposedRanges not available — Chrome 137+ required for text selection tooltip');
          setRawSelection(null);
          return;
        }

        const ranges = sel.getComposedRanges({ shadowRoots: [shadowRoot] });
        if (ranges.length === 0) {
          setRawSelection(null);
          return;
        }

        const staticRange = ranges[0];
        // Check if the composed range is collapsed (no actual selection)
        if (
          staticRange.startContainer === staticRange.endContainer &&
          staticRange.startOffset === staticRange.endOffset
        ) {
          setRawSelection(null);
          return;
        }

        // Extract text from the composed range
        try {
          const liveRange = document.createRange();
          liveRange.setStart(staticRange.startContainer, staticRange.startOffset);
          liveRange.setEnd(staticRange.endContainer, staticRange.endOffset);

          const text = liveRange.toString().trim();
          if (!text) {
            setRawSelection(null);
            return;
          }

          const rect = liveRange.getBoundingClientRect();

          // Validate rect has dimensions (not collapsed)
          if (rect.width === 0 && rect.height === 0) {
            setRawSelection(null);
            return;
          }

          console.log('[AI Assistant] Text selection detected:', { text: text.substring(0, 50), rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height } });
          setRawSelection({ text, rect });
        } catch {
          // Range conversion can fail if nodes were removed
          setRawSelection(null);
        }
      }, 200); // 200ms debounce per CONTEXT.md decision
    };

    const handleMouseDown = (e: Event) => {
      const mouseEvent = e as MouseEvent;
      // Don't dismiss if clicking inside the tooltip
      if (tooltipRef.current && tooltipRef.current.contains(mouseEvent.target as Node)) {
        return;
      }

      // Clear selection on mousedown outside tooltip
      setRawSelection(null);
    };

    // Listen on shadow root for events inside the overlay
    shadowRoot.addEventListener('mouseup', handleMouseUp);
    shadowRoot.addEventListener('mousedown', handleMouseDown);

    return () => {
      shadowRoot.removeEventListener('mouseup', handleMouseUp);
      shadowRoot.removeEventListener('mousedown', handleMouseDown);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [shadowRoot, enabled, tooltipRef]);

  // Derive final selection: null when feature is disabled
  const selection = useMemo(
    () => (!shadowRoot || !enabled ? null : rawSelection),
    [shadowRoot, enabled, rawSelection],
  );

  return { selection, clearSelection };
}
