/**
 * Transcription service module
 *
 * Provides WebSocket connection to ElevenLabs Scribe v2 Realtime API
 * for real-time speech-to-text transcription.
 */

export { ElevenLabsConnection } from './ElevenLabsConnection';
export { AudioBuffer } from './AudioBuffer';
export type {
  TranscriptionConfig,
  ServerMessage,
  ConnectionState,
  TranscriptCallback,
  Word,
  InputAudioChunk,
  SessionStartedMessage,
  PartialTranscriptMessage,
  CommittedTranscriptMessage,
  CommittedTranscriptWithTimestampsMessage,
  ErrorMessage,
} from './types';
