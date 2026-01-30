/**
 * Capture Mode Hook
 *
 * Manages keyboard capture for LLM question triggering.
 * Supports two modes:
 * - Hold-to-capture: Hold hotkey to capture transcript, release to send
 * - Highlight-to-send: Select text and press hotkey to send immediately
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '../store';

/**
 * Current capture mode state
 */
export interface CaptureState {
  /** Whether the user is currently holding the capture hotkey */
  isHolding: boolean;
  /** Timestamp when capture started (for transcript filtering) */
  captureStartTime: number | null;
  /** Text that was captured (for display purposes) */
  capturedText: string;
  /** Mode of capture: 'hold' for hold-to-capture, 'highlight' for selection */
  mode: 'hold' | 'highlight';
}

/**
 * Options for useCaptureMode hook
 */
export interface UseCaptureOptions {
  /** Callback when capture is triggered (on key release for hold, on key press for highlight) */
  onCapture: (text: string, mode: 'hold' | 'highlight') => void;
  /** Function to get transcript entries since a timestamp */
  getTranscriptSince: (timestamp: number) => string;
  /** Function to get recent transcript (last N entries) */
  getRecentTranscript: () => string;
  /** Function to get full transcript */
  getFullTranscript: () => string;
}

/**
 * Parsed hotkey components
 */
interface ParsedHotkey {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

/**
 * Parse hotkey string like "Ctrl+Shift+Space" into components
 */
function parseHotkey(hotkeyString: string): ParsedHotkey {
  const parts = hotkeyString.split('+').map((p) => p.toLowerCase().trim());
  const key = parts[parts.length - 1];
  return {
    key: key === 'space' ? ' ' : key,
    ctrl: parts.includes('ctrl') || parts.includes('control'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    meta: parts.includes('meta') || parts.includes('cmd') || parts.includes('command'),
  };
}

/**
 * Check if keyboard event matches hotkey configuration
 */
function matchesHotkey(e: KeyboardEvent, hotkey: ParsedHotkey): boolean {
  const pressedKey = e.key.toLowerCase();
  const expectedKey = hotkey.key.toLowerCase();

  // Handle space specially
  const keyMatches =
    pressedKey === expectedKey ||
    (expectedKey === ' ' && pressedKey === ' ') ||
    (expectedKey === 'space' && pressedKey === ' ');

  return (
    keyMatches &&
    e.ctrlKey === hotkey.ctrl &&
    e.shiftKey === hotkey.shift &&
    e.altKey === hotkey.alt &&
    e.metaKey === hotkey.meta
  );
}

/**
 * Get currently highlighted/selected text
 */
function getHighlightedText(): string {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return '';
  return selection.toString().trim();
}

/**
 * Hook for managing capture mode (hold-to-capture and highlight-to-send)
 *
 * Usage:
 * ```tsx
 * const captureState = useCaptureMode({
 *   onCapture: (text, mode) => sendLLMRequest(text, mode),
 *   getTranscriptSince: (ts) => transcript.filter(e => e.timestamp >= ts),
 *   getRecentTranscript: () => transcript.slice(-5),
 *   getFullTranscript: () => transcript,
 * });
 *
 * // captureState.isHolding indicates active capture for visual feedback
 * ```
 */
export function useCaptureMode(options: UseCaptureOptions): CaptureState {
  const { onCapture, getTranscriptSince } = options;

  // Get hotkey and capture mode from store
  const captureHotkey = useStore((state) => state.hotkeys.capture);
  const captureMode = useStore((state) => state.captureMode);

  const [state, setState] = useState<CaptureState>({
    isHolding: false,
    captureStartTime: null,
    capturedText: '',
    mode: 'hold',
  });

  // Ref to track if we're currently holding (for keyup handler)
  const isHoldingRef = useRef(false);
  const captureStartTimeRef = useRef<number | null>(null);

  // Parse hotkey once when it changes
  const parsedHotkey = parseHotkey(captureHotkey);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!matchesHotkey(e, parsedHotkey)) return;
      if (e.repeat) return; // Ignore key repeat

      e.preventDefault();
      e.stopPropagation();

      // Check for highlighted text first (highlight-to-send mode)
      const highlighted = getHighlightedText();
      if (highlighted) {
        // Clear selection
        window.getSelection()?.removeAllRanges();

        setState({
          isHolding: false,
          captureStartTime: null,
          capturedText: highlighted,
          mode: 'highlight',
        });

        // Trigger capture immediately for highlight mode
        onCapture(highlighted, 'highlight');
        return;
      }

      // Toggle mode: press toggles capture state
      if (captureMode === 'toggle') {
        if (isHoldingRef.current) {
          // Currently capturing - stop and send (like keyUp in hold mode)
          const startTime = captureStartTimeRef.current;
          isHoldingRef.current = false;
          captureStartTimeRef.current = null;

          const capturedText = startTime ? getTranscriptSince(startTime) : '';

          setState({
            isHolding: false,
            captureStartTime: null,
            capturedText,
            mode: 'hold', // Keep 'hold' for consistency in CaptureState type
          });

          if (capturedText.trim()) {
            onCapture(capturedText, 'hold');
          }
          return;
        } else {
          // Not capturing - start capture
          const startTime = Date.now();
          isHoldingRef.current = true;
          captureStartTimeRef.current = startTime;

          setState({
            isHolding: true,
            captureStartTime: startTime,
            capturedText: '',
            mode: 'hold',
          });
          return;
        }
      }

      // Hold mode (default): start capture on keydown
      const startTime = Date.now();
      isHoldingRef.current = true;
      captureStartTimeRef.current = startTime;

      setState({
        isHolding: true,
        captureStartTime: startTime,
        capturedText: '',
        mode: 'hold',
      });
    },
    [parsedHotkey, onCapture, captureMode, getTranscriptSince]
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (!matchesHotkey(e, parsedHotkey)) return;

      // In toggle mode, keyUp does nothing (all logic in keyDown)
      if (captureMode === 'toggle') return;

      if (!isHoldingRef.current) return;

      e.preventDefault();
      e.stopPropagation();

      const startTime = captureStartTimeRef.current;
      isHoldingRef.current = false;
      captureStartTimeRef.current = null;

      // Get transcript text captured during hold
      const capturedText = startTime ? getTranscriptSince(startTime) : '';

      setState({
        isHolding: false,
        captureStartTime: null,
        capturedText,
        mode: 'hold',
      });

      // Trigger capture if we got text
      if (capturedText.trim()) {
        onCapture(capturedText, 'hold');
      }
    },
    [parsedHotkey, onCapture, getTranscriptSince, captureMode]
  );

  // Handle window blur (lost keyup - prevents stuck capture state)
  const handleBlur = useCallback(() => {
    if (isHoldingRef.current) {
      isHoldingRef.current = false;
      captureStartTimeRef.current = null;
      setState({
        isHolding: false,
        captureStartTime: null,
        capturedText: '',
        mode: 'hold',
      });
    }
  }, []);

  useEffect(() => {
    // Use capture phase (true) to intercept before other handlers
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('blur', handleBlur);
    };
  }, [handleKeyDown, handleKeyUp, handleBlur]);

  return state;
}
