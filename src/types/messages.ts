// Message types as discriminated union
export type MessageType =
  | 'PING'
  | 'PONG'
  | 'CREATE_OFFSCREEN'
  | 'OFFSCREEN_READY'
  | 'INJECT_UI'
  | 'UI_INJECTED';

// Base message interface
interface BaseMessage {
  type: MessageType;
}

// Specific message interfaces
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

// Union type for all messages
export type ExtensionMessage =
  | PingMessage
  | PongMessage
  | CreateOffscreenMessage
  | OffscreenReadyMessage
  | InjectUIMessage
  | UIInjectedMessage;

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
