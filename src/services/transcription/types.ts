/**
 * Transcription service types for ElevenLabs Scribe v2 Realtime API
 */

/**
 * Configuration for establishing a transcription connection
 */
export interface TranscriptionConfig {
  /** ElevenLabs API key */
  apiKey: string;
  /** Model ID (default: scribe_v2_realtime) */
  modelId?: string;
  /** Language code for transcription (e.g., 'en') */
  languageCode?: string;
  /** Audio source: 'tab' for interviewer, 'mic' for user */
  source: 'tab' | 'mic';
  /** VAD silence threshold in seconds (default: 0.5 for fast commits) */
  vadSilenceThresholdSecs?: number;
}

/**
 * Word-level timing information from ElevenLabs
 */
export interface Word {
  /** The transcribed word or spacing */
  text: string;
  /** Start time in seconds */
  start: number;
  /** End time in seconds */
  end: number;
  /** Whether this is a word or spacing character */
  type: 'word' | 'spacing';
  /** Optional log probability for confidence */
  logprob?: number;
}

/**
 * Server message types from ElevenLabs WebSocket
 * Based on: https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime
 */
export type ServerMessage =
  | SessionStartedMessage
  | PartialTranscriptMessage
  | CommittedTranscriptMessage
  | CommittedTranscriptWithTimestampsMessage
  | FinalTranscriptMessage
  | VadEventMessage
  | InternalVadScoreMessage
  | InternalTentativeTranscriptMessage
  | ErrorMessage
  | AuthErrorMessage;

export interface SessionStartedMessage {
  message_type: 'session_started';
  session_id: string;
  config: Record<string, unknown>;
}

export interface PartialTranscriptMessage {
  message_type: 'partial_transcript';
  text: string;
}

export interface CommittedTranscriptMessage {
  message_type: 'committed_transcript';
  text: string;
}

export interface CommittedTranscriptWithTimestampsMessage {
  message_type: 'committed_transcript_with_timestamps';
  text: string;
  words: Word[];
}

/** Alternative final transcript message type (some API versions) */
export interface FinalTranscriptMessage {
  message_type: 'final_transcript';
  text: string;
}

/** Voice Activity Detection event */
export interface VadEventMessage {
  message_type: 'vad_event';
  type?: string;
}

/** Internal VAD score message (debug) */
export interface InternalVadScoreMessage {
  message_type: 'internal_vad_score';
  score?: number;
}

/** Internal tentative transcript (debug) */
export interface InternalTentativeTranscriptMessage {
  message_type: 'internal_tentative_transcript';
  text?: string;
}

export interface ErrorMessage {
  message_type: 'error';
  error_type: string;
  message: string;
}

/** Authentication error message */
export interface AuthErrorMessage {
  message_type: 'auth_error';
  error?: string;
}

/**
 * Type guard for ServerMessage types
 * Checks if an unknown object is a valid ServerMessage
 */
export function isServerMessage(data: unknown): data is ServerMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'message_type' in data &&
    typeof (data as { message_type: unknown }).message_type === 'string'
  );
}

/**
 * Type guard for specific ServerMessage types
 */
export function isServerMessageType<T extends ServerMessage>(
  data: ServerMessage,
  type: T['message_type']
): data is T {
  return data.message_type === type;
}

/**
 * WebSocket connection states
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * Callback for transcript updates
 * @param text - The transcribed text
 * @param isFinal - Whether this is a final (committed) result or interim (partial)
 * @param timestamp - Unix timestamp in milliseconds
 */
export type TranscriptCallback = (text: string, isFinal: boolean, timestamp: number) => void;

/**
 * Input audio chunk message format for ElevenLabs WebSocket
 */
export interface InputAudioChunk {
  message_type: 'input_audio_chunk';
  audio_base_64: string;
  commit: boolean;
  sample_rate: number;
  previous_text?: string;
}

/**
 * Response from ElevenLabs single-use token endpoint
 */
export interface TokenResponse {
  token: string;
}
