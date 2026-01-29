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
  private onConnect?: () => void;

  // Deduplication: track last committed transcript to prevent duplicate final callbacks
  private lastCommittedText: string = '';
  private lastCommittedTimestamp: number = 0;

  // Reconnection constants
  private static readonly MAX_RECONNECT_ATTEMPTS = 3;
  private static readonly BASE_DELAY_MS = 500;
  private static readonly MAX_DELAY_MS = 5000;

  /**
   * Create a new ElevenLabs connection.
   * @param config - Transcription configuration including API key and source
   * @param onTranscript - Callback for transcript updates (partial and final)
   * @param onError - Callback for errors with retry indication
   * @param onConnect - Optional callback when WebSocket connects successfully
   */
  constructor(
    config: TranscriptionConfig,
    onTranscript: TranscriptCallback,
    onError: (error: string, canRetry: boolean) => void,
    onConnect?: () => void
  ) {
    this.config = config;
    this.onTranscript = onTranscript;
    this.onError = onError;
    this.onConnect = onConnect;
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
   * First obtains a single-use token, then connects via WebSocket.
   */
  connect(): void {
    console.log(`[ElevenLabs:${this.config.source}] connect() called, current state: ${this._state}`);

    if (this._state === 'connecting' || this._state === 'connected') {
      console.log(`[ElevenLabs:${this.config.source}] Already ${this._state}`);
      return;
    }

    this._state = 'connecting';
    console.log(`[ElevenLabs:${this.config.source}] Obtaining single-use token...`);

    // First, get a single-use token via REST API
    this.obtainToken()
      .then((token) => {
        console.log(`[ElevenLabs:${this.config.source}] Token obtained, connecting WebSocket...`);
        this.connectWithToken(token);
      })
      .catch((error) => {
        console.error(`[ElevenLabs:${this.config.source}] Failed to obtain token:`, error);
        this._state = 'disconnected';
        this.onError(`Failed to obtain auth token: ${error.message}`, true);
      });
  }

  /**
   * Obtain a single-use token from ElevenLabs REST API.
   * Browser WebSockets can't set custom headers, so we need token-based auth.
   * Endpoint: POST /v1/single-use-token/realtime_scribe
   * Docs: https://elevenlabs.io/docs/api-reference/tokens/create
   */
  private async obtainToken(): Promise<string> {
    const tokenEndpoint = 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe';

    console.log(`[ElevenLabs:${this.config.source}] Requesting single-use token from ${tokenEndpoint}...`);

    try {
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'xi-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`[ElevenLabs:${this.config.source}] Token response received`);
        if (data.token) {
          console.log(`[ElevenLabs:${this.config.source}] ✓ Token obtained successfully (expires in 15 min)`);
          return data.token;
        }
        throw new Error('No token in response: ' + JSON.stringify(data));
      } else {
        const errorText = await response.text();
        console.error(`[ElevenLabs:${this.config.source}] Token request failed (${response.status}):`, errorText);

        // Provide helpful error messages
        if (response.status === 401) {
          throw new Error('Invalid API key. Please check your ElevenLabs API key in Settings.');
        } else if (response.status === 403) {
          throw new Error('API key does not have access to Scribe. Check your ElevenLabs subscription.');
        } else if (response.status === 404) {
          throw new Error('Token endpoint not found. ElevenLabs API may have changed.');
        }
        throw new Error(`Token request failed (${response.status}): ${errorText}`);
      }
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      console.error(`[ElevenLabs:${this.config.source}] Token fetch error:`, error.message);
      throw error;
    }
  }

  /**
   * Connect to WebSocket using the obtained token.
   */
  private connectWithToken(token: string): void {
    const url = this.buildWebSocketUrl(token);
    console.log(`[ElevenLabs:${this.config.source}] Connecting with token auth...`);

    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      console.log(`[ElevenLabs:${this.config.source}] WebSocket created, waiting for connection...`);
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
    this.lastCommittedText = '';
    this.lastCommittedTimestamp = 0;
  }

  // Counter for logging (don't log every chunk)
  private chunkCounter: number = 0;

  /**
   * Send audio chunk to ElevenLabs.
   * If disconnected, buffers the chunk for later transmission.
   * If connected, flushes buffer first then sends current chunk.
   * @param chunk - PCM audio data as ArrayBuffer (16kHz, 16-bit)
   */
  sendAudio(chunk: ArrayBuffer): void {
    this.chunkCounter++;

    if (this._state !== 'connected' || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Buffer during disconnect
      this.audioBuffer.add(chunk);
      if (this.chunkCounter % 50 === 1) {
        console.log(`[ElevenLabs:${this.config.source}] Buffering audio (state: ${this._state}, wsState: ${this.ws?.readyState}), buffer size: ${this.audioBuffer.length}`);
      }
      return;
    }

    // Flush any buffered audio first
    const buffered = this.audioBuffer.flush();
    if (buffered.length > 0) {
      console.log(`[ElevenLabs:${this.config.source}] Flushing ${buffered.length} buffered chunks`);
      for (const bufferedChunk of buffered) {
        this.sendAudioChunk(bufferedChunk);
      }
    }

    // Send current chunk
    this.sendAudioChunk(chunk);

    // Log every 50th chunk to confirm data is flowing
    if (this.chunkCounter % 50 === 0) {
      console.log(`[ElevenLabs:${this.config.source}] Sent ${this.chunkCounter} chunks`);
    }
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
    console.log(`[ElevenLabs:${this.config.source}] ✓ WebSocket Connected!`);
    this._state = 'connected';
    this.reconnectAttempts = 0;

    // Notify caller that connection is established
    if (this.onConnect) {
      this.onConnect();
    }

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
      const messageType = message.message_type;

      // Log all incoming messages for debugging
      console.log(`[ElevenLabs:${this.config.source}] << Received:`, messageType, JSON.stringify(message).substring(0, 200));

      switch (messageType) {
        case 'session_started':
          console.log(`[ElevenLabs:${this.config.source}] ✓ Session started:`, message.session_id);
          console.log(`[ElevenLabs:${this.config.source}] Ready to receive audio`);
          break;

        case 'partial_transcript':
          console.log(`[ElevenLabs:${this.config.source}] Partial:`, message.text);
          this.onTranscript(message.text, false, Date.now());
          break;

        case 'committed_transcript':
        case 'committed_transcript_with_timestamps':
        case 'final_transcript': // Alternative message type some versions use
          // Deduplicate: ElevenLabs may send both committed_transcript and
          // committed_transcript_with_timestamps for the same utterance
          const now = Date.now();
          const isDuplicate =
            message.text === this.lastCommittedText &&
            (now - this.lastCommittedTimestamp) < 1000; // Within 1 second

          if (isDuplicate) {
            console.log(`[ElevenLabs:${this.config.source}] Skipping duplicate final transcript`);
            break;
          }

          this.lastCommittedText = message.text;
          this.lastCommittedTimestamp = now;
          console.log(`[ElevenLabs:${this.config.source}] ✓ Final:`, message.text);
          this.onTranscript(message.text, true, now);
          break;

        case 'vad_event':
          // Voice Activity Detection event - informational, can ignore
          console.log(`[ElevenLabs:${this.config.source}] VAD event:`, (message as { type?: string }).type || 'unknown');
          break;

        case 'internal_vad_score':
        case 'internal_tentative_transcript':
          // Internal debugging messages from ElevenLabs - ignore
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

        case 'auth_error':
          // Authentication failed - API key is invalid, expired, or lacks permissions
          console.error(
            `[ElevenLabs:${this.config.source}] Authentication failed:`,
            (message as { error?: string }).error || 'Invalid API key'
          );
          this.onError('Authentication failed. Please check your ElevenLabs API key in Settings.', false);
          break;

        default:
          // Log full message for unknown types to help debug
          console.warn(`[ElevenLabs:${this.config.source}] Unknown message type "${messageType}":`, JSON.stringify(message));
      }
    } catch (error) {
      console.error(`[ElevenLabs:${this.config.source}] Failed to parse message:`, error, 'Raw:', event.data);
    }
  }

  /**
   * Handle WebSocket close event.
   */
  private handleClose(event: CloseEvent): void {
    console.log(
      `[ElevenLabs:${this.config.source}] Connection closed:`,
      'code:', event.code,
      'reason:', event.reason || '(no reason)',
      'wasClean:', event.wasClean
    );

    const wasConnected = this._state === 'connected';
    this._state = 'disconnected';

    // Log why we're not reconnecting
    if (event.code === 1000) {
      console.log(`[ElevenLabs:${this.config.source}] Clean close (1000), not reconnecting`);
      // If server closed cleanly right after connecting, there might be an issue
      if (this.chunkCounter < 10) {
        console.warn(`[ElevenLabs:${this.config.source}] Connection closed before sending much audio. Check API key and audio format.`);
      }
    }

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
   * Build the WebSocket URL with token authentication.
   * @param token - Single-use authentication token
   */
  private buildWebSocketUrl(token: string): string {
    const params = new URLSearchParams({
      token: token,
      model_id: this.config.modelId || 'scribe_v2_realtime',
      audio_format: 'pcm_16000',
      commit_strategy: 'vad',
      include_timestamps: 'true',
      // Faster VAD: commit transcript after 0.5s of silence (default is 1.5s)
      vad_silence_threshold_secs: (this.config.vadSilenceThresholdSecs ?? 0.5).toString(),
    });

    if (this.config.languageCode) {
      params.set('language_code', this.config.languageCode);
    }

    return `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params.toString()}`;
  }

}
