import type { TranscriptEntry } from './transcript';

// Message types as discriminated union
export type MessageType =
  | 'PING'
  | 'PONG'
  | 'CREATE_OFFSCREEN'
  | 'OFFSCREEN_READY'
  | 'INJECT_UI'
  | 'UI_INJECTED'
  // Audio capture lifecycle
  | 'START_CAPTURE'
  | 'STOP_CAPTURE'
  | 'CAPTURE_STARTED'
  | 'CAPTURE_STOPPED'
  | 'CAPTURE_ERROR'
  | 'TAB_STREAM_ID'
  | 'TAB_AUDIO_CHUNK'
  // Microphone capture lifecycle
  | 'START_MIC_CAPTURE'
  | 'STOP_MIC_CAPTURE'
  | 'MIC_AUDIO_CHUNK'
  // Transcription lifecycle
  | 'START_TRANSCRIPTION'
  | 'STOP_TRANSCRIPTION'
  | 'TRANSCRIPTION_STARTED'
  | 'TRANSCRIPTION_STOPPED'
  | 'TRANSCRIPTION_ERROR'
  // Transcript updates
  | 'TRANSCRIPT_PARTIAL'
  | 'TRANSCRIPT_FINAL'
  | 'TRANSCRIPT_UPDATE';

// Base message interface
interface BaseMessage {
  type: MessageType;
}

// Existing message interfaces
export interface PingMessage extends BaseMessage {
  type: 'PING';
  timestamp: number;
}

export interface PongMessage extends BaseMessage {
  type: 'PONG';
  timestamp: number;
  receivedAt: number;
}

export interface CreateOffscreenMessage extends BaseMessage {
  type: 'CREATE_OFFSCREEN';
}

export interface OffscreenReadyMessage extends BaseMessage {
  type: 'OFFSCREEN_READY';
}

export interface InjectUIMessage extends BaseMessage {
  type: 'INJECT_UI';
}

export interface UIInjectedMessage extends BaseMessage {
  type: 'UI_INJECTED';
  success: boolean;
}

// Audio capture message interfaces
export interface StartCaptureMessage extends BaseMessage {
  type: 'START_CAPTURE';
}

export interface StopCaptureMessage extends BaseMessage {
  type: 'STOP_CAPTURE';
}

export interface CaptureStartedMessage extends BaseMessage {
  type: 'CAPTURE_STARTED';
}

export interface CaptureStoppedMessage extends BaseMessage {
  type: 'CAPTURE_STOPPED';
}

export interface CaptureErrorMessage extends BaseMessage {
  type: 'CAPTURE_ERROR';
  error: string;
}

export interface TabStreamIdMessage extends BaseMessage {
  type: 'TAB_STREAM_ID';
  streamId: string;
}

export interface TabAudioChunkMessage extends BaseMessage {
  type: 'TAB_AUDIO_CHUNK';
  chunk: ArrayBuffer;
  timestamp: number;
}

export interface MicAudioChunkMessage extends BaseMessage {
  type: 'MIC_AUDIO_CHUNK';
  chunk: ArrayBuffer;
  timestamp: number;
}

// Union type for audio chunks (backwards compatibility)
export type AudioChunkMessage = TabAudioChunkMessage | MicAudioChunkMessage;

// Microphone capture message interfaces
export interface StartMicCaptureMessage extends BaseMessage {
  type: 'START_MIC_CAPTURE';
}

export interface StopMicCaptureMessage extends BaseMessage {
  type: 'STOP_MIC_CAPTURE';
}

// Transcription lifecycle message interfaces
export interface StartTranscriptionMessage extends BaseMessage {
  type: 'START_TRANSCRIPTION';
  apiKey: string;
}

export interface StopTranscriptionMessage extends BaseMessage {
  type: 'STOP_TRANSCRIPTION';
}

export interface TranscriptionStartedMessage extends BaseMessage {
  type: 'TRANSCRIPTION_STARTED';
}

export interface TranscriptionStoppedMessage extends BaseMessage {
  type: 'TRANSCRIPTION_STOPPED';
}

export interface TranscriptionErrorMessage extends BaseMessage {
  type: 'TRANSCRIPTION_ERROR';
  source: 'tab' | 'mic';
  error: string;
  canRetry: boolean;
}

// Transcript update message interfaces
export interface TranscriptPartialMessage extends BaseMessage {
  type: 'TRANSCRIPT_PARTIAL';
  source: 'tab' | 'mic';
  text: string;
  timestamp: number;
}

export interface TranscriptFinalMessage extends BaseMessage {
  type: 'TRANSCRIPT_FINAL';
  source: 'tab' | 'mic';
  text: string;
  timestamp: number;
  id: string;
  speaker: string;
}

export interface TranscriptUpdateMessage extends BaseMessage {
  type: 'TRANSCRIPT_UPDATE';
  entries: TranscriptEntry[];
}

// Union type for all messages
export type ExtensionMessage =
  | PingMessage
  | PongMessage
  | CreateOffscreenMessage
  | OffscreenReadyMessage
  | InjectUIMessage
  | UIInjectedMessage
  | StartCaptureMessage
  | StopCaptureMessage
  | CaptureStartedMessage
  | CaptureStoppedMessage
  | CaptureErrorMessage
  | TabStreamIdMessage
  | TabAudioChunkMessage
  | MicAudioChunkMessage
  | StartMicCaptureMessage
  | StopMicCaptureMessage
  | StartTranscriptionMessage
  | StopTranscriptionMessage
  | TranscriptionStartedMessage
  | TranscriptionStoppedMessage
  | TranscriptionErrorMessage
  | TranscriptPartialMessage
  | TranscriptFinalMessage
  | TranscriptUpdateMessage;

// Type guard for message checking
export function isMessage<T extends ExtensionMessage>(
  message: unknown,
  type: T['type']
): message is T {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    (message as { type: unknown }).type === type
  );
}
