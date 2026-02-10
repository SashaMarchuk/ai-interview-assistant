import type { TranscriptEntry } from './transcript';

/**
 * Services that report connection state
 */
export type ConnectionService = 'stt-tab' | 'stt-mic' | 'llm';

/**
 * Possible connection states
 */
export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'error';

/**
 * Audio source types for transcription
 */
export type AudioSource = 'tab' | 'mic';

/**
 * LLM model types for streaming responses
 */
export type LLMModelType = 'fast' | 'full';

/**
 * Combined LLM model target (both models)
 */
export type LLMModelTarget = LLMModelType | 'both';

/**
 * LLM request status types
 */
export type LLMRequestStatus = 'pending' | 'streaming' | 'complete' | 'error';

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
  // Permission request (from content script context)
  | 'REQUEST_MIC_PERMISSION'
  // State query
  | 'GET_CAPTURE_STATE'
  // Transcription lifecycle
  | 'START_TRANSCRIPTION'
  | 'STOP_TRANSCRIPTION'
  | 'TRANSCRIPTION_STARTED'
  | 'TRANSCRIPTION_STOPPED'
  | 'TRANSCRIPTION_ERROR'
  // Transcript updates
  | 'TRANSCRIPT_PARTIAL'
  | 'TRANSCRIPT_FINAL'
  | 'TRANSCRIPT_UPDATE'
  // LLM request lifecycle
  | 'LLM_REQUEST'
  | 'LLM_STREAM'
  | 'LLM_STATUS'
  | 'LLM_CANCEL'
  | 'LLM_COST'
  // Quick prompt lifecycle (concurrent with LLM requests)
  | 'QUICK_PROMPT_REQUEST'
  | 'QUICK_PROMPT_CANCEL'
  // Connection state updates
  | 'CONNECTION_STATE';

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

// Microphone capture message interfaces
export interface StartMicCaptureMessage extends BaseMessage {
  type: 'START_MIC_CAPTURE';
}

export interface StopMicCaptureMessage extends BaseMessage {
  type: 'STOP_MIC_CAPTURE';
}

// Permission request message interface
export interface RequestMicPermissionMessage extends BaseMessage {
  type: 'REQUEST_MIC_PERMISSION';
}

// State query message interface
export interface GetCaptureStateMessage extends BaseMessage {
  type: 'GET_CAPTURE_STATE';
}

// Transcription lifecycle message interfaces
export interface StartTranscriptionMessage extends BaseMessage {
  type: 'START_TRANSCRIPTION';
  /** ISO 639-3 language code (e.g. 'eng', 'ukr') - empty/undefined for auto-detect */
  languageCode?: string;
}

/** Internal message from background to offscreen -- carries API key within trusted extension origin */
export interface InternalStartTranscriptionMessage extends BaseMessage {
  type: 'START_TRANSCRIPTION';
  apiKey: string;
  languageCode?: string;
  _fromBackground: true;
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
  source: AudioSource;
  error: string;
  canRetry: boolean;
}

// Transcript update message interfaces
export interface TranscriptPartialMessage extends BaseMessage {
  type: 'TRANSCRIPT_PARTIAL';
  source: AudioSource;
  text: string;
  timestamp: number;
}

export interface TranscriptFinalMessage extends BaseMessage {
  type: 'TRANSCRIPT_FINAL';
  source: AudioSource;
  text: string;
  timestamp: number;
  id: string;
  speaker: string;
}

export interface TranscriptUpdateMessage extends BaseMessage {
  type: 'TRANSCRIPT_UPDATE';
  entries: TranscriptEntry[];
}

// LLM request from content script to background
export interface LLMRequestMessage extends BaseMessage {
  type: 'LLM_REQUEST';
  responseId: string; // Unique ID for this request/response pair
  question: string; // Captured/highlighted text
  recentContext: string; // Last N transcript entries formatted
  fullTranscript: string; // Full session transcript formatted
  templateId: string; // Active template ID
  /** Optional: if true, this is a single-stream reasoning request (not dual fast+full) */
  isReasoningRequest?: boolean;
  /** Optional: reasoning effort level for reasoning models */
  reasoningEffort?: 'low' | 'medium' | 'high';
}

// Streaming token updates from background to content script
export interface LLMStreamMessage extends BaseMessage {
  type: 'LLM_STREAM';
  responseId: string;
  model: LLMModelType;
  token: string;
}

// Status updates for the LLM request lifecycle
export interface LLMStatusMessage extends BaseMessage {
  type: 'LLM_STATUS';
  responseId: string;
  model: LLMModelTarget;
  status: LLMRequestStatus;
  error?: string;
}

// Cancel an in-flight LLM request
export interface LLMCancelMessage extends BaseMessage {
  type: 'LLM_CANCEL';
  responseId: string;
}

// Cost data from a completed LLM model request
export interface LLMCostMessage extends BaseMessage {
  type: 'LLM_COST';
  responseId: string;
  model: LLMModelType;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  costUSD: number;
}

// Quick prompt request from content script to background (runs concurrently with LLM requests)
export interface QuickPromptRequestMessage extends BaseMessage {
  type: 'QUICK_PROMPT_REQUEST';
  /** Unique ID prefixed with 'qp-' for routing */
  responseId: string;
  /** The text the user selected */
  selectedText: string;
  /** Prompt template with {{selection}} placeholder */
  promptTemplate: string;
  /** Display label for the action (e.g., "Explain") */
  actionLabel: string;
}

// Cancel an in-flight quick prompt request
export interface QuickPromptCancelMessage extends BaseMessage {
  type: 'QUICK_PROMPT_CANCEL';
  responseId: string;
}

// Connection state updates from offscreen to background to content
export interface ConnectionStateMessage extends BaseMessage {
  type: 'CONNECTION_STATE';
  service: ConnectionService;
  state: ConnectionStatus;
  error?: string;
}

/**
 * Response from GET_CAPTURE_STATE message
 * Returns current capture, transcription, and LLM state
 */
export interface CaptureStateResponse {
  isCapturing: boolean;
  isTranscribing: boolean;
  hasActiveLLMRequest: boolean;
  isCaptureStartInProgress: boolean;
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
  | RequestMicPermissionMessage
  | GetCaptureStateMessage
  | StartTranscriptionMessage
  | StopTranscriptionMessage
  | TranscriptionStartedMessage
  | TranscriptionStoppedMessage
  | TranscriptionErrorMessage
  | TranscriptPartialMessage
  | TranscriptFinalMessage
  | TranscriptUpdateMessage
  | LLMRequestMessage
  | LLMStreamMessage
  | LLMStatusMessage
  | LLMCancelMessage
  | LLMCostMessage
  | QuickPromptRequestMessage
  | QuickPromptCancelMessage
  | ConnectionStateMessage;

export type InternalMessage = ExtensionMessage & { _fromBackground?: true };

// Type guard for message checking (constraint widened to support internal message types)
export function isMessage<T extends { type: string }>(
  message: unknown,
  type: T['type'],
): message is T {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    (message as { type: unknown }).type === type
  );
}
