import { useRef, useEffect } from 'react';

/**
 * Hook that auto-scrolls a container to bottom when dependency changes.
 * Returns a ref to attach to an anchor element at the bottom of scrollable content.
 *
 * @param dependency - Value that triggers scroll when it changes
 * @returns Ref to attach to a div at the bottom of scrollable content
 *
 * @example
 * ```tsx
 * const bottomRef = useAutoScroll(items.length);
 * return (
 *   <div className="overflow-y-auto">
 *     {items.map(...)}
 *     <div ref={bottomRef} />
 *   </div>
 * );
 * ```
 */
export function useAutoScroll<T>(dependency: T) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Smooth scroll to bottom anchor when dependency changes
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
      inline: 'nearest',
    });
  }, [dependency]);

  return bottomRef;
}
