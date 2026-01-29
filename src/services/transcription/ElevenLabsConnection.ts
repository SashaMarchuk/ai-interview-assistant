import { AudioBuffer } from './AudioBuffer';
import type {
  TranscriptionConfig,
  ServerMessage,
  ConnectionState,
  TranscriptCallback,
  InputAudioChunk,
} from './types';

/**
 * WebSocket connection wrapper for ElevenLabs Scribe v2 Realtime API.
 * Handles connection lifecycle, reconnection with exponential backoff,
 * and audio buffering during disconnects.
 */
export class ElevenLabsConnection {
  private ws: WebSocket | null = null;
  private _state: ConnectionState = 'disconnected';
  private reconnectAttempts: number = 0;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private audioBuffer: AudioBuffer;
  private config: TranscriptionConfig;
  private onTranscript: TranscriptCallback;
  private onError: (error: string, canRetry: boolean) => void;

  // Reconnection constants
  private static readonly MAX_RECONNECT_ATTEMPTS = 3;
  private static readonly BASE_DELAY_MS = 500;
  private static readonly MAX_DELAY_MS = 5000;

  /**
   * Create a new ElevenLabs connection.
   * @param config - Transcription configuration including API key and source
   * @param onTranscript - Callback for transcript updates (partial and final)
   * @param onError - Callback for errors with retry indication
   */
  constructor(
    config: TranscriptionConfig,
    onTranscript: TranscriptCallback,
    onError: (error: string, canRetry: boolean) => void
  ) {
    this.config = config;
    this.onTranscript = onTranscript;
    this.onError = onError;
    this.audioBuffer = new AudioBuffer();
  }

  /**
   * Get the current connection state.
   */
  get state(): ConnectionState {
    return this._state;
  }

  /**
   * Get the speaker label based on audio source.
   * @returns 'You' for microphone, 'Interviewer' for tab audio
   */
  get speakerLabel(): string {
    return this.config.source === 'mic' ? 'You' : 'Interviewer';
  }

  /**
   * Establish WebSocket connection to ElevenLabs.
   */
  connect(): void {
    if (this._state === 'connecting' || this._state === 'connected') {
      console.log(`[ElevenLabs:${this.config.source}] Already ${this._state}`);
      return;
    }

    this._state = 'connecting';
    const url = this.buildWebSocketUrl();

    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
    } catch (error) {
      console.error(`[ElevenLabs:${this.config.source}] Failed to create WebSocket:`, error);
      this._state = 'disconnected';
      this.onError('Failed to create WebSocket connection', true);
    }
  }

  /**
   * Close the WebSocket connection and clear state.
   */
  disconnect(): void {
    // Cancel any pending reconnection
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    // Close WebSocket
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;

      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, 'Client disconnect');
      }
      this.ws = null;
    }

    // Clear state
    this._state = 'disconnected';
    this.reconnectAttempts = 0;
    this.audioBuffer.clear();
  }

  /**
   * Send audio chunk to ElevenLabs.
   * If disconnected, buffers the chunk for later transmission.
   * If connected, flushes buffer first then sends current chunk.
   * @param chunk - PCM audio data as ArrayBuffer (16kHz, 16-bit)
   */
  sendAudio(chunk: ArrayBuffer): void {
    if (this._state !== 'connected' || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Buffer during disconnect
      this.audioBuffer.add(chunk);
      return;
    }

    // Flush any buffered audio first
    const buffered = this.audioBuffer.flush();
    for (const bufferedChunk of buffered) {
      this.sendAudioChunk(bufferedChunk);
    }

    // Send current chunk
    this.sendAudioChunk(chunk);
  }

  /**
   * Send a single audio chunk over WebSocket.
   */
  private sendAudioChunk(chunk: ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Convert ArrayBuffer to base64 using browser-native btoa
    const uint8Array = new Uint8Array(chunk);
    const binaryString = Array.from(uint8Array)
      .map((byte) => String.fromCharCode(byte))
      .join('');
    const base64 = btoa(binaryString);

    const message: InputAudioChunk = {
      message_type: 'input_audio_chunk',
      audio_base_64: base64,
      commit: false,
      sample_rate: 16000,
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Handle WebSocket open event.
   */
  private handleOpen(): void {
    console.log(`[ElevenLabs:${this.config.source}] Connected`);
    this._state = 'connected';
    this.reconnectAttempts = 0;

    // Flush any buffered audio that accumulated during connect
    const buffered = this.audioBuffer.flush();
    if (buffered.length > 0) {
      console.log(`[ElevenLabs:${this.config.source}] Flushing ${buffered.length} buffered chunks`);
      for (const chunk of buffered) {
        this.sendAudioChunk(chunk);
      }
    }
  }

  /**
   * Handle incoming WebSocket message.
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message: ServerMessage = JSON.parse(event.data);

      switch (message.message_type) {
        case 'session_started':
          console.log(`[ElevenLabs:${this.config.source}] Session started:`, message.session_id);
          break;

        case 'partial_transcript':
          this.onTranscript(message.text, false, Date.now());
          break;

        case 'committed_transcript':
        case 'committed_transcript_with_timestamps':
          this.onTranscript(message.text, true, Date.now());
          break;

        case 'error':
          console.error(
            `[ElevenLabs:${this.config.source}] Server error:`,
            message.error_type,
            message.message
          );
          // Auth errors are not retryable
          const canRetry = message.error_type !== 'auth_error';
          this.onError(`${message.error_type}: ${message.message}`, canRetry);
          break;
      }
    } catch (error) {
      console.error(`[ElevenLabs:${this.config.source}] Failed to parse message:`, error);
    }
  }

  /**
   * Handle WebSocket close event.
   */
  private handleClose(event: CloseEvent): void {
    console.log(
      `[ElevenLabs:${this.config.source}] Connection closed:`,
      event.code,
      event.reason
    );

    const wasConnected = this._state === 'connected';
    this._state = 'disconnected';

    // Only attempt reconnect if we were previously connected and didn't close cleanly
    if (wasConnected && event.code !== 1000) {
      this.reconnect();
    }
  }

  /**
   * Handle WebSocket error event.
   */
  private handleError(event: Event): void {
    console.error(`[ElevenLabs:${this.config.source}] WebSocket error:`, event);
    // Note: onerror is usually followed by onclose, so we don't change state here
  }

  /**
   * Attempt to reconnect with exponential backoff.
   */
  private reconnect(): void {
    if (this.reconnectAttempts >= ElevenLabsConnection.MAX_RECONNECT_ATTEMPTS) {
      console.error(
        `[ElevenLabs:${this.config.source}] Max reconnection attempts reached (${ElevenLabsConnection.MAX_RECONNECT_ATTEMPTS})`
      );
      this.onError('Max reconnection attempts reached', false);
      return;
    }

    this._state = 'reconnecting';
    const delay = this.getBackoffDelay();
    this.reconnectAttempts++;

    console.log(
      `[ElevenLabs:${this.config.source}] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
    );

    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      this.connect();
    }, delay);
  }

  /**
   * Calculate backoff delay with jitter.
   */
  private getBackoffDelay(): number {
    const exponentialDelay =
      ElevenLabsConnection.BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts);
    const jitter = Math.random() * 500; // Prevent thundering herd
    return Math.min(exponentialDelay + jitter, ElevenLabsConnection.MAX_DELAY_MS);
  }

  /**
   * Build the WebSocket URL with query parameters.
   */
  private buildWebSocketUrl(): string {
    const params = new URLSearchParams({
      model_id: this.config.modelId || 'scribe_v2_realtime',
      audio_format: 'pcm_16000',
      commit_strategy: 'vad',
      include_timestamps: 'true',
      'xi-api-key': this.config.apiKey,
    });

    if (this.config.languageCode) {
      params.set('language_code', this.config.languageCode);
    }

    return `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params.toString()}`;
  }
}
