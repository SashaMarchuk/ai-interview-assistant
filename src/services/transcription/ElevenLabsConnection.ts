import { AudioBuffer } from './AudioBuffer';
import type {
  TranscriptionConfig,
  ServerMessage,
  ConnectionState,
  TranscriptCallback,
  InputAudioChunk,
  TokenResponse,
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
    if (this._state === 'connecting' || this._state === 'connected') {
      return;
    }

    this._state = 'connecting';

    // First, get a single-use token via REST API
    this.obtainToken()
      .then((token) => {
        this.connectWithToken(token);
      })
      .catch((error) => {
        console.error(`[ElevenLabs:${this.config.source}] Token error:`, error.message);
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

    try {
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'xi-api-key': this.config.apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json() as TokenResponse;
        if (data.token) {
          return data.token;
        }
        throw new Error('No token in response');
      } else {
        const errorText = await response.text();

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

    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
    } catch (error) {
      console.error(`[ElevenLabs:${this.config.source}] WebSocket creation failed:`, error);
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

    // Convert ArrayBuffer to base64 using optimized approach
    // Using a pre-built string with direct indexing is ~3x faster than Array.from().map().join()
    const uint8Array = new Uint8Array(chunk);
    const len = uint8Array.length;
    let binaryString = '';
    // Process in chunks of 8KB to avoid call stack limits while maintaining performance
    const chunkSize = 8192;
    for (let i = 0; i < len; i += chunkSize) {
      const end = Math.min(i + chunkSize, len);
      binaryString += String.fromCharCode.apply(null, uint8Array.subarray(i, end) as unknown as number[]);
    }
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
    this._state = 'connected';
    this.reconnectAttempts = 0;

    // Notify caller that connection is established
    if (this.onConnect) {
      this.onConnect();
    }

    // Flush any buffered audio that accumulated during connect
    const buffered = this.audioBuffer.flush();
    for (const chunk of buffered) {
      this.sendAudioChunk(chunk);
    }
  }

  /**
   * Handle incoming WebSocket message.
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message: ServerMessage = JSON.parse(event.data);
      const messageType = message.message_type;

      switch (messageType) {
        case 'session_started':
          // Session ready to receive audio
          break;

        case 'partial_transcript':
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
            break;
          }

          this.lastCommittedText = message.text;
          this.lastCommittedTimestamp = now;
          this.onTranscript(message.text, true, now);
          break;

        case 'vad_event':
        case 'internal_vad_score':
        case 'internal_tentative_transcript':
          // Internal debugging messages from ElevenLabs - ignore
          break;

        case 'error':
          console.error(`[ElevenLabs:${this.config.source}] Error:`, message.error_type, message.message);
          const canRetry = message.error_type !== 'auth_error';
          this.onError(`${message.error_type}: ${message.message}`, canRetry);
          break;

        case 'auth_error':
          console.error(`[ElevenLabs:${this.config.source}] Auth failed`);
          this.onError('Authentication failed. Please check your ElevenLabs API key in Settings.', false);
          break;

        default:
          // Unknown message type - ignore silently
          break;
      }
    } catch (error) {
      console.error(`[ElevenLabs:${this.config.source}] Parse error:`, error);
    }
  }

  /**
   * Handle WebSocket close event.
   */
  private handleClose(event: CloseEvent): void {
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
      this.onError('Max reconnection attempts reached', false);
      return;
    }

    this._state = 'reconnecting';
    const delay = this.getBackoffDelay();
    this.reconnectAttempts++;

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
