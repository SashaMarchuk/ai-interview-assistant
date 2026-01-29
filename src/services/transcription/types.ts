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
  | ErrorMessage;

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

export interface ErrorMessage {
  message_type: 'error';
  error_type: string;
  message: string;
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
