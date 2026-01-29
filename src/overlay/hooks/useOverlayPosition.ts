import { createChromeStorageStateHookLocal } from 'use-chrome-storage';
import { DEFAULT_OVERLAY_STATE, type OverlayState } from '../../types/transcript';

const STORAGE_KEY = 'ai-interview-overlay-state';

/**
 * Create reusable hook for overlay position/size persistence.
 * Uses chrome.storage.local for persistence across sessions.
 */
const useOverlayStateStorage = createChromeStorageStateHookLocal<OverlayState>(
  STORAGE_KEY,
  DEFAULT_OVERLAY_STATE
);

/**
 * Hook for managing overlay position, size, and minimize state.
 * Persists to chrome.storage.local for session persistence.
 *
 * @returns Object containing:
 * - position: Current {x, y} position (calculates default if first time)
 * - size: Current {width, height} dimensions
 * - isMinimized: Whether the overlay is minimized
 * - isLoaded: Boolean indicating if initial load from storage is complete
 * - setPosition: Function to update position
 * - setSize: Function to update size
 * - setMinimized: Function to update minimize state
 * - rawState: Direct access to underlying state
 * - setRawState: Direct access to state setter
 */
export function useOverlayPosition() {
  const [state, setState, isPersistent, error, isLoaded] = useOverlayStateStorage();

  /**
   * Calculate actual position, handling -1 default.
   * First time users get bottom-right positioning.
   */
  const getPosition = () => {
    if (state.x === -1 || state.y === -1) {
      // First time: position at bottom-right with 20px margin
      return {
        x: window.innerWidth - state.width - 20,
        y: window.innerHeight - state.height - 20,
      };
    }
    return { x: state.x, y: state.y };
  };

  const setPosition = (pos: { x: number; y: number }) => {
    setState((prev) => ({ ...prev, x: pos.x, y: pos.y }));
  };

  const setSize = (size: { width: number; height: number }) => {
    setState((prev) => ({ ...prev, width: size.width, height: size.height }));
  };

  const setMinimized = (isMinimized: boolean) => {
    setState((prev) => ({ ...prev, isMinimized }));
  };

  return {
    position: getPosition(),
    size: { width: state.width, height: state.height },
    isMinimized: state.isMinimized,
    isLoaded,
    setPosition,
    setSize,
    setMinimized,
    // Raw state access for advanced use
    rawState: state,
    setRawState: setState,
  };
}
