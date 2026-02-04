/**
 * Transcript and overlay types for AI Interview Assistant
 */

/**
 * Speaker identification for transcript entries
 * - 'Interviewer': Audio from tab (the other person)
 * - 'You': Audio from microphone (the user)
 */
export type TranscriptSpeaker = 'Interviewer' | 'You';

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

/**
 * Mock transcript data for development.
 * Simulates a real interview conversation.
 */
export const MOCK_TRANSCRIPT: TranscriptEntry[] = [
  {
    id: 'mock-1',
    speaker: 'Interviewer',
    text: 'Can you explain the difference between var, let, and const in JavaScript?',
    timestamp: Date.now() - 30000,
    isFinal: true,
  },
  {
    id: 'mock-2',
    speaker: 'You',
    text: "Sure, I'd be happy to explain the differences...",
    timestamp: Date.now() - 25000,
    isFinal: true,
  },
  {
    id: 'mock-3',
    speaker: 'Interviewer',
    text: 'Great, and how does hoisting work with each of these?',
    timestamp: Date.now() - 10000,
    isFinal: true,
  },
];

/**
 * Mock LLM response for development.
 * Shows the expected response structure.
 */
export const MOCK_RESPONSE: LLMResponse = {
  id: 'mock-resp-1',
  questionId: 'mock-3',
  fastHint: 'var is hoisted and initialized to undefined. let/const are hoisted but not initialized (TDZ).',
  fullAnswer: 'All three declarations are hoisted, but they behave differently. var is hoisted and initialized to undefined, so you can reference it before declaration. let and const are hoisted but remain in the "Temporal Dead Zone" (TDZ) until their declaration line, throwing ReferenceError if accessed early. This is why let/const are considered safer - they catch bugs where you accidentally use a variable before it\'s defined.',
  status: 'complete',
};
