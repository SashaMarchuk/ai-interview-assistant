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
  | 'MIC_AUDIO_CHUNK';

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

export interface AudioChunkMessage extends BaseMessage {
  type: 'TAB_AUDIO_CHUNK' | 'MIC_AUDIO_CHUNK';
  chunk: ArrayBuffer;
  timestamp: number;
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
  | AudioChunkMessage;

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
