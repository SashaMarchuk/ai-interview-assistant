import { useState, useEffect, useCallback, useRef } from 'react';
import { DEFAULT_OVERLAY_STATE, type OverlayState } from '../../types/transcript';

const STORAGE_KEY = 'ai-interview-overlay-state';

/**
 * Hook for managing overlay position, size, and minimize state.
 * Uses local React state for immediate UI feedback, syncs to chrome.storage.local
 * in the background for persistence across sessions.
 *
 * Key design decisions:
 * - Local state provides flicker-free drag/resize (immediate feedback)
 * - Storage sync happens asynchronously (doesn't block UI)
 * - isLoaded prevents flash of default position on initial load
 */
export function useOverlayPosition() {
  const [state, setState] = useState<OverlayState>(DEFAULT_OVERLAY_STATE);
  const [isLoaded, setIsLoaded] = useState(false);
  const isInitialLoad = useRef(true);

  // Load from storage on mount
  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (result[STORAGE_KEY]) {
        setState(result[STORAGE_KEY]);
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
   * Calculate actual position for the expanded overlay.
   * Handles -1 sentinel value for first-time users (bottom-right default).
   */
  const getPosition = useCallback(() => {
    if (state.x === -1 || state.y === -1) {
      return {
        x: window.innerWidth - state.width - 20,
        y: window.innerHeight - state.height - 20,
      };
    }
    return { x: state.x, y: state.y };
  }, [state.x, state.y, state.width, state.height]);

  /**
   * Get position for minimized button.
   * Always bottom-right corner, independent of overlay position.
   */
  const getMinimizedPosition = useCallback(() => {
    return {
      x: window.innerWidth - 160, // 140px button + 20px margin
      y: window.innerHeight - 56, // 36px button + 20px margin
    };
  }, []);

  const setPosition = useCallback((pos: { x: number; y: number }) => {
    setState((prev) => ({ ...prev, x: pos.x, y: pos.y }));
  }, []);

  const setSize = useCallback((size: { width: number; height: number }) => {
    setState((prev) => ({ ...prev, width: size.width, height: size.height }));
  }, []);

  const setMinimized = useCallback((isMinimized: boolean) => {
    setState((prev) => ({ ...prev, isMinimized }));
  }, []);

  return {
    position: getPosition(),
    minimizedPosition: getMinimizedPosition(),
    size: { width: state.width, height: state.height },
    isMinimized: state.isMinimized,
    isLoaded,
    setPosition,
    setSize,
    setMinimized,
    rawState: state,
    setRawState: setState,
  };
}
