import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DEFAULT_OVERLAY_STATE, type OverlayState } from '../../types/transcript';

const STORAGE_KEY = 'ai-interview-overlay-state';

// Button dimensions for bounds calculation
const MIN_BTN_WIDTH = 56;
const MIN_BTN_HEIGHT = 44;
const MARGIN = 20;

/**
 * Position coordinates for overlay or minimized button
 */
interface Position {
  x: number;
  y: number;
}

/**
 * Size dimensions for overlay
 */
interface Size {
  width: number;
  height: number;
}

/**
 * Return type for useOverlayPosition hook
 */
export interface UseOverlayPositionReturn {
  /** Current calculated position of the expanded overlay */
  position: Position;
  /** Current calculated position of the minimized button */
  minimizedPosition: Position;
  /** Current size of the overlay */
  size: Size;
  /** Whether the overlay is minimized */
  isMinimized: boolean;
  /** Whether initial state has been loaded from storage */
  isLoaded: boolean;
  /** Update the overlay position */
  setPosition: (pos: Position) => void;
  /** Update the overlay size */
  setSize: (size: Size) => void;
  /** Set minimized state */
  setMinimized: (isMinimized: boolean) => void;
  /** Update the minimized button position */
  setMinimizedPosition: (pos: Position) => void;
}

/**
 * Hook for managing overlay position, size, and minimize state.
 * Uses local React state for immediate UI feedback, syncs to chrome.storage.local
 * in the background for persistence across sessions.
 *
 * Key design decisions:
 * - Local state provides flicker-free drag/resize (immediate feedback)
 * - Storage sync happens asynchronously (doesn't block UI)
 * - isLoaded prevents flash of default position on initial load
 * - Minimized button repositions on window resize to stay in bounds
 */
export function useOverlayPosition(): UseOverlayPositionReturn {
  const [state, setState] = useState<OverlayState>(DEFAULT_OVERLAY_STATE);
  const [isLoaded, setIsLoaded] = useState(false);
  const isInitialLoad = useRef(true);

  // Load from storage on mount
  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (result[STORAGE_KEY]) {
        // Merge with defaults to handle new fields added to schema
        setState({ ...DEFAULT_OVERLAY_STATE, ...result[STORAGE_KEY] });
      }
      setIsLoaded(true);
      isInitialLoad.current = false;
    });
  }, []);

  // Sync to storage when state changes (but not on initial load)
  useEffect(() => {
    if (!isInitialLoad.current && isLoaded) {
      chrome.storage.local.set({ [STORAGE_KEY]: state });
    }
  }, [state, isLoaded]);

  /**
   * Calculate default position for minimized button.
   * Top-right corner, below Meet's top bar.
   */
  const getDefaultMinimizedPosition = useCallback(() => {
    return {
      x: window.innerWidth - MIN_BTN_WIDTH - MARGIN,
      y: 80, // Below Meet top bar
    };
  }, []);

  /**
   * Ensure position is within viewport bounds.
   */
  const clampToViewport = useCallback((x: number, y: number, width: number, height: number) => {
    return {
      x: Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN)),
      y: Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN)),
    };
  }, []);

  /**
   * Handle window resize - keep elements in bounds.
   * If using default position, recalculate. Otherwise, clamp to viewport.
   */
  useEffect(() => {
    if (!isLoaded) return;

    const handleResize = () => {
      setState((prev) => {
        const updates: Partial<OverlayState> = {};

        // Handle minimized button position
        if (prev.minBtnX === -1 || prev.minBtnY === -1) {
          // Using defaults - recalculate
          const defaultPos = getDefaultMinimizedPosition();
          updates.minBtnX = defaultPos.x;
          updates.minBtnY = defaultPos.y;
        } else {
          // Manual position - clamp to viewport
          const clamped = clampToViewport(
            prev.minBtnX,
            prev.minBtnY,
            MIN_BTN_WIDTH,
            MIN_BTN_HEIGHT,
          );
          if (clamped.x !== prev.minBtnX || clamped.y !== prev.minBtnY) {
            updates.minBtnX = clamped.x;
            updates.minBtnY = clamped.y;
          }
        }

        // Handle overlay position
        if (prev.x !== -1 && prev.y !== -1) {
          const clamped = clampToViewport(prev.x, prev.y, prev.width, prev.height);
          if (clamped.x !== prev.x || clamped.y !== prev.y) {
            updates.x = clamped.x;
            updates.y = clamped.y;
          }
        }

        // Only update if something changed
        if (Object.keys(updates).length > 0) {
          return { ...prev, ...updates };
        }
        return prev;
      });
    };

    // Debounce resize handler
    let timeoutId: ReturnType<typeof setTimeout>;
    const debouncedResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleResize, 100);
    };

    window.addEventListener('resize', debouncedResize);
    return () => {
      window.removeEventListener('resize', debouncedResize);
      clearTimeout(timeoutId);
    };
  }, [isLoaded, getDefaultMinimizedPosition, clampToViewport]);

  /**
   * Calculate actual position for the expanded overlay.
   * Handles -1 sentinel value for first-time users (bottom-right default).
   * Memoized to avoid recalculating on every render when deps haven't changed.
   */
  const position = useMemo(() => {
    if (state.x === -1 || state.y === -1) {
      return {
        x: window.innerWidth - state.width - MARGIN,
        y: window.innerHeight - state.height - MARGIN,
      };
    }
    return { x: state.x, y: state.y };
  }, [state.x, state.y, state.width, state.height]);

  /**
   * Get position for minimized button.
   * Defaults to top-right corner (won't block Meet navigation at bottom).
   * Memoized to avoid recalculating on every render when deps haven't changed.
   */
  const minimizedPosition = useMemo(() => {
    if (state.minBtnX === -1 || state.minBtnY === -1) {
      return getDefaultMinimizedPosition();
    }
    return { x: state.minBtnX, y: state.minBtnY };
  }, [state.minBtnX, state.minBtnY, getDefaultMinimizedPosition]);

  const setPosition = useCallback((pos: { x: number; y: number }) => {
    setState((prev) => ({ ...prev, x: pos.x, y: pos.y }));
  }, []);

  const setSize = useCallback((size: { width: number; height: number }) => {
    setState((prev) => ({ ...prev, width: size.width, height: size.height }));
  }, []);

  const setMinimized = useCallback((isMinimized: boolean) => {
    setState((prev) => ({ ...prev, isMinimized }));
  }, []);

  const setMinimizedPosition = useCallback((pos: { x: number; y: number }) => {
    setState((prev) => ({ ...prev, minBtnX: pos.x, minBtnY: pos.y }));
  }, []);

  // Memoize size object to prevent new object creation on every render
  const size = useMemo(
    () => ({ width: state.width, height: state.height }),
    [state.width, state.height],
  );

  return {
    position,
    minimizedPosition,
    size,
    isMinimized: state.isMinimized,
    isLoaded,
    setPosition,
    setSize,
    setMinimized,
    setMinimizedPosition,
  };
}
