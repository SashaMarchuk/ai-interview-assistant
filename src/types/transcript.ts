/**
 * Transcript and overlay types for AI Interview Assistant
 */

/**
 * Transcript entry from STT service.
 * Represents a single utterance from either the interviewer or the user.
 */
export interface TranscriptEntry {
  /** Unique identifier for this entry */
  id: string;
  /** Speaker identification: "Interviewer", "You", or detected name */
  speaker: string;
  /** The transcribed text content */
  text: string;
  /** Unix timestamp in milliseconds when this was spoken */
  timestamp: number;
  /** Whether this is the final transcription (false for interim results) */
  isFinal: boolean;
  /** Optional confidence score from 0-1 */
  confidence?: number;
}

/**
 * Status of LLM response generation
 */
export type LLMResponseStatus = 'pending' | 'streaming' | 'complete' | 'error';

/**
 * LLM response structure.
 * Contains both fast hints and complete answers.
 */
export interface LLMResponse {
  /** Unique identifier for this response */
  id: string;
  /** Links to the triggering transcript entry's id */
  questionId: string;
  /** Quick 1-2 sentence hint for immediate reference */
  fastHint: string | null;
  /** Complete detailed answer */
  fullAnswer: string | null;
  /** Current status of the response generation */
  status: LLMResponseStatus;
  /** Error message if status is 'error' */
  error?: string;
  /** Cost of fast model response in USD */
  fastCostUSD?: number;
  /** Cost of full model response in USD */
  fullCostUSD?: number;
  /** Total combined cost in USD (fast + full) */
  totalCostUSD?: number;
}

/**
 * Overlay position and size state for persistence.
 * Stored in chrome.storage.local for session persistence.
 */
export interface OverlayState {
  /** X position in pixels (-1 signals "use calculated default") */
  x: number;
  /** Y position in pixels (-1 signals "use calculated default") */
  y: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Whether the overlay is minimized */
  isMinimized: boolean;
  /** Minimized button X position (-1 for default top-right) */
  minBtnX: number;
  /** Minimized button Y position (-1 for default top-right) */
  minBtnY: number;
}

/**
 * Default overlay state for first-time users.
 * x/y of -1 signals the hook should calculate default positions.
 * Overlay defaults to bottom-right, minimized button to top-right.
 */
export const DEFAULT_OVERLAY_STATE: OverlayState = {
  x: -1,
  y: -1,
  width: 340,
  height: 400,
  isMinimized: false,
  minBtnX: -1,
  minBtnY: -1,
};
