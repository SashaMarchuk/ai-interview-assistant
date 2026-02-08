import type {
  OffscreenReadyMessage,
  PingMessage,
  CaptureErrorMessage,
  CaptureStartedMessage,
  CaptureStoppedMessage,
  TabStreamIdMessage,
  StartMicCaptureMessage,
  StopMicCaptureMessage,
  InternalStartTranscriptionMessage,
  StopTranscriptionMessage,
  TranscriptionStartedMessage,
  TranscriptionStoppedMessage,
  TranscriptionErrorMessage,
  TranscriptPartialMessage,
  TranscriptFinalMessage,
  ConnectionStateMessage,
} from '../../src/types/messages';
import { isMessage } from '../../src/types/messages';
import { ElevenLabsConnection } from '../../src/services/transcription';

/**
 * Broadcast connection state to background for UI display.
 * The background will forward this to content scripts.
 */
function broadcastConnectionState(
  service: 'stt-tab' | 'stt-mic',
  state: 'connected' | 'disconnected' | 'reconnecting' | 'error',
  error?: string
): void {
  chrome.runtime.sendMessage({
    type: 'CONNECTION_STATE',
    service,
    state,
    error,
  } satisfies ConnectionStateMessage).catch(() => {
    // Ignore - background might not be listening yet
  });
}

// Module-level state for tab audio capture
let tabAudioContext: AudioContext | null = null;
let tabStream: MediaStream | null = null;
let tabWorkletNode: AudioWorkletNode | null = null;

// Module-level state for microphone capture
let micAudioContext: AudioContext | null = null;
let micStream: MediaStream | null = null;
let micWorkletNode: AudioWorkletNode | null = null;

// Module-level state for transcription
let tabTranscription: ElevenLabsConnection | null = null;
let micTranscription: ElevenLabsConnection | null = null;
let transcriptionApiKey: string | null = null;
let transcriptionStarting: boolean = false; // Guard against duplicate START_TRANSCRIPTION

/**
 * Start tab audio capture from stream ID.
 * Creates MediaStream via getUserMedia with chromeMediaSource constraint.
 * Routes audio to destination (passthrough) and to PCM processor.
 */
async function startTabCapture(streamId: string): Promise<void> {
  // Clean up any existing capture
  if (tabStream || tabAudioContext) {
    await stopTabCapture();
  }

  try {
    // Get MediaStream using Chrome's tab capture API
    // Note: mandatory syntax is deprecated but REQUIRED for chromeMediaSource
    const constraints = {
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    };

    tabStream = await (navigator.mediaDevices.getUserMedia as (constraints: unknown) => Promise<MediaStream>)(constraints);

    // Create AudioContext at 16kHz for STT
    tabAudioContext = new AudioContext({ sampleRate: 16000 });

    // Create source from tab stream
    const source = tabAudioContext.createMediaStreamSource(tabStream);

    // CRITICAL: Connect source to destination for audio passthrough
    // This ensures the user can still hear the tab audio (interviewer's voice)
    source.connect(tabAudioContext.destination);

    // Load AudioWorklet processor for PCM conversion
    await tabAudioContext.audioWorklet.addModule(chrome.runtime.getURL('pcm-processor.js'));

    // Create worklet node for PCM conversion
    tabWorkletNode = new AudioWorkletNode(tabAudioContext, 'pcm-processor');

    // Handle PCM chunks from worklet
    tabWorkletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      chrome.runtime.sendMessage({
        type: 'TAB_AUDIO_CHUNK',
        chunk: event.data,
        timestamp: Date.now(),
      });
      // Forward audio to transcription if active
      if (tabTranscription) {
        tabTranscription.sendAudio(event.data);
      }
    };

    // Connect source to worklet for PCM processing
    source.connect(tabWorkletNode);

    // Notify that capture has started
    chrome.runtime.sendMessage({
      type: 'CAPTURE_STARTED',
    } satisfies CaptureStartedMessage);

    console.log('Tab capture: Started');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Tab capture error:', errorMessage);

    // Provide more helpful error messages
    let userFriendlyError = errorMessage;
    if (errorMessage.includes('Permission dismissed') || errorMessage.includes('NotAllowedError')) {
      userFriendlyError = 'Tab audio permission denied. Try reloading the tab and clicking Start again.';
    } else if (errorMessage.includes('invalid') || errorMessage.includes('expired')) {
      userFriendlyError = 'Stream ID expired. Please try again.';
    }

    // Send error message
    chrome.runtime.sendMessage({
      type: 'CAPTURE_ERROR',
      error: userFriendlyError,
    } satisfies CaptureErrorMessage);

    // Clean up on failure
    stopTabCapture();
    throw new Error(userFriendlyError);
  }
}

/**
 * Stop tab audio capture and clean up resources.
 * Returns a promise that resolves when cleanup is complete.
 * @param skipBroadcast - If true, don't send CAPTURE_STOPPED (used during cleanup before restart)
 */
async function stopTabCapture(skipBroadcast = false): Promise<void> {
  try {
    // Stop all tracks on the stream FIRST (releases Chrome's tab capture)
    if (tabStream) {
      tabStream.getTracks().forEach((track) => {
        try { track.stop(); } catch { /* ignore */ }
      });
      tabStream = null;
    }

    // Disconnect worklet node
    if (tabWorkletNode) {
      try { tabWorkletNode.disconnect(); } catch { /* ignore */ }
      tabWorkletNode = null;
    }

    // Close audio context and AWAIT completion
    if (tabAudioContext) {
      try { await tabAudioContext.close(); } catch { /* ignore */ }
      tabAudioContext = null;
    }

    // Notify that capture has stopped (unless this is cleanup before restart)
    if (!skipBroadcast) {
      chrome.runtime.sendMessage({
        type: 'CAPTURE_STOPPED',
      } satisfies CaptureStoppedMessage).catch(() => {});
    }

    console.log('Tab capture: Stopped', skipBroadcast ? '(cleanup)' : '');
  } catch (error) {
    console.error('Tab capture cleanup error:', error);
  }
}

/**
 * Start microphone capture and convert to PCM via AudioWorklet.
 * Sends MIC_AUDIO_CHUNK messages with PCM data.
 */
async function startMicCapture(): Promise<void> {
  // Clean up any existing capture
  if (micStream || micAudioContext) {
    await stopMicCapture();
  }

  try {
    // Check current permission state first
    try {
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (permissionStatus.state === 'denied') {
        throw new Error('Microphone permission is blocked. Go to chrome://settings/content/microphone and allow this extension.');
      }
    } catch { /* ignore query errors */ }

    // Request microphone access with audio processing
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000,
      },
    });

    // Create AudioContext at 16kHz for STT
    micAudioContext = new AudioContext({ sampleRate: 16000 });

    // Create source from microphone stream
    const source = micAudioContext.createMediaStreamSource(micStream);
    // NOTE: Do NOT connect to destination - we don't want to hear ourselves

    // Load AudioWorklet processor (same as tab capture)
    await micAudioContext.audioWorklet.addModule('/pcm-processor.js');

    // Create worklet node for PCM conversion
    micWorkletNode = new AudioWorkletNode(micAudioContext, 'pcm-processor');

    // Handle PCM chunks from worklet
    micWorkletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      chrome.runtime.sendMessage({
        type: 'MIC_AUDIO_CHUNK',
        chunk: event.data,
        timestamp: Date.now(),
      });
      // Forward audio to transcription if active
      if (micTranscription) {
        micTranscription.sendAudio(event.data);
      }
    };

    // Connect source to worklet (NOT to destination)
    source.connect(micWorkletNode);

    console.log('Mic capture: Started');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Mic capture error:', errorMessage);

    // Provide helpful error message
    let userFriendlyError = errorMessage;
    if (error instanceof DOMException && (error.name === 'NotAllowedError' || errorMessage.includes('Permission'))) {
      userFriendlyError = 'Microphone blocked. Click the extension icon in Chrome toolbar, then click the 3-dot menu → "Site settings" → Allow Microphone.';
    }

    // Send error message
    chrome.runtime.sendMessage({
      type: 'CAPTURE_ERROR',
      error: `Mic: ${userFriendlyError}`,
    } satisfies CaptureErrorMessage);

    // Clean up on failure
    stopMicCapture();
    throw new Error(userFriendlyError);
  }
}

/**
 * Stop microphone capture and clean up resources.
 * Returns a promise that resolves when cleanup is complete.
 */
async function stopMicCapture(): Promise<void> {
  try {
    // Stop all tracks on the stream
    if (micStream) {
      micStream.getTracks().forEach((track) => {
        try { track.stop(); } catch { /* ignore */ }
      });
      micStream = null;
    }

    // Disconnect worklet node
    if (micWorkletNode) {
      try { micWorkletNode.disconnect(); } catch { /* ignore */ }
      micWorkletNode = null;
    }

    // Close audio context and AWAIT completion
    if (micAudioContext) {
      try { await micAudioContext.close(); } catch { /* ignore */ }
      micAudioContext = null;
    }

    console.log('Mic capture: Stopped');
  } catch (error) {
    console.error('Mic capture cleanup error:', error);
  }
}

/** Audio source configuration for transcription */
interface TranscriptionSource {
  source: 'tab' | 'mic';
  speaker: string;
  connectionService: 'stt-tab' | 'stt-mic';
  sendStarted: boolean;
}

const TAB_SOURCE: TranscriptionSource = {
  source: 'tab',
  speaker: 'Interviewer',
  connectionService: 'stt-tab',
  sendStarted: true,
};

const MIC_SOURCE: TranscriptionSource = {
  source: 'mic',
  speaker: 'You',
  connectionService: 'stt-mic',
  sendStarted: false,
};

/**
 * Create a transcription connection for a given audio source.
 * Centralizes the common connection setup logic.
 */
function createTranscription(
  apiKey: string,
  languageCode: string | undefined,
  config: TranscriptionSource
): ElevenLabsConnection {
  const { source, speaker, connectionService, sendStarted } = config;

  return new ElevenLabsConnection(
    { apiKey, source, languageCode },
    // onTranscript callback
    (text: string, isFinal: boolean, timestamp: number) => {
      // Skip empty transcripts
      if (!text.trim()) return;

      if (isFinal) {
        chrome.runtime.sendMessage({
          type: 'TRANSCRIPT_FINAL',
          source,
          text,
          timestamp,
          id: crypto.randomUUID(),
          speaker,
        } satisfies TranscriptFinalMessage);
      } else {
        chrome.runtime.sendMessage({
          type: 'TRANSCRIPT_PARTIAL',
          source,
          text,
          timestamp,
        } satisfies TranscriptPartialMessage);
      }
    },
    // onError callback
    (error: string, canRetry: boolean) => {
      console.error(`STT ${speaker} error:`, error);
      chrome.runtime.sendMessage({
        type: 'TRANSCRIPTION_ERROR',
        source,
        error,
        canRetry,
      } satisfies TranscriptionErrorMessage);
      broadcastConnectionState(connectionService, canRetry ? 'reconnecting' : 'error', error);
    },
    // onConnect callback
    () => {
      if (sendStarted) {
        chrome.runtime.sendMessage({
          type: 'TRANSCRIPTION_STARTED',
        } satisfies TranscriptionStartedMessage);
      }
      broadcastConnectionState(connectionService, 'connected');
      console.log(`STT ${speaker}: Connected`);
    }
  );
}

/**
 * Start tab transcription connection to ElevenLabs.
 */
function startTabTranscription(apiKey: string, languageCode?: string): void {
  if (tabTranscription) {
    tabTranscription.disconnect();
    tabTranscription = null;
  }
  tabTranscription = createTranscription(apiKey, languageCode, TAB_SOURCE);
  tabTranscription.connect();
}

/**
 * Start microphone transcription connection to ElevenLabs.
 */
function startMicTranscription(apiKey: string, languageCode?: string): void {
  if (micTranscription) {
    micTranscription.disconnect();
    micTranscription = null;
  }
  micTranscription = createTranscription(apiKey, languageCode, MIC_SOURCE);
  micTranscription.connect();
}

/**
 * Stop all transcription connections and clean up state.
 */
function stopTranscription(): void {
  if (tabTranscription) {
    tabTranscription.disconnect();
    tabTranscription = null;
    broadcastConnectionState('stt-tab', 'disconnected');
  }

  if (micTranscription) {
    micTranscription.disconnect();
    micTranscription = null;
    broadcastConnectionState('stt-mic', 'disconnected');
  }

  transcriptionApiKey = null;
  transcriptionStarting = false;
}

// Message types that should be logged (important events only)
const LOGGED_MESSAGE_TYPES = [
  'TAB_STREAM_ID', 'STOP_CAPTURE',
  'START_MIC_CAPTURE', 'STOP_MIC_CAPTURE',
  'START_TRANSCRIPTION', 'STOP_TRANSCRIPTION',
];

// Register message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only log important events
  if (LOGGED_MESSAGE_TYPES.includes(message.type)) {
    console.log('Offscreen:', message.type);
  }

  // Handle messages sent to offscreen document
  if (isMessage<PingMessage>(message, 'PING')) {
    sendResponse({ type: 'PONG', timestamp: message.timestamp, receivedAt: Date.now() });
    return true;
  }

  // Handle TAB_STREAM_ID - start tab audio capture
  if (isMessage<TabStreamIdMessage>(message, 'TAB_STREAM_ID')) {
    startTabCapture(message.streamId)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }

  // Handle STOP_CAPTURE - stop tab audio capture
  if (message.type === 'STOP_CAPTURE') {
    // If this is a cleanup stop (from background during START_CAPTURE), skip CAPTURE_STOPPED broadcast
    const isCleanup = message._fromBackground === true;
    stopTabCapture(isCleanup)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }

  // Handle START_MIC_CAPTURE
  if (isMessage<StartMicCaptureMessage>(message, 'START_MIC_CAPTURE')) {
    // Guard against duplicate messages
    if (micStream || micAudioContext) {
      sendResponse({ success: true, alreadyActive: true });
      return true;
    }

    startMicCapture()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }

  // Handle STOP_MIC_CAPTURE
  if (isMessage<StopMicCaptureMessage>(message, 'STOP_MIC_CAPTURE')) {
    stopMicCapture()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }

  // Handle START_TRANSCRIPTION
  if (isMessage<InternalStartTranscriptionMessage>(message, 'START_TRANSCRIPTION')) {
    // Guard against duplicate messages (popup and background both send this)
    if (transcriptionStarting || transcriptionApiKey) {
      sendResponse({ success: true, alreadyStarting: true });
      return true;
    }

    if (!message.apiKey) {
      sendResponse({ success: false, error: 'No API key' });
      return true;
    }

    transcriptionStarting = true;
    transcriptionApiKey = message.apiKey;
    const langCode = message.languageCode || undefined;
    startTabTranscription(message.apiKey, langCode);
    startMicTranscription(message.apiKey, langCode);
    transcriptionStarting = false;

    // Note: TRANSCRIPTION_STARTED is sent when WebSocket actually connects (in onConnect callback)
    sendResponse({ success: true });
    return true;
  }

  // Handle STOP_TRANSCRIPTION
  if (isMessage<StopTranscriptionMessage>(message, 'STOP_TRANSCRIPTION')) {
    stopTranscription();
    // Send confirmation back
    chrome.runtime.sendMessage({
      type: 'TRANSCRIPTION_STOPPED',
    } satisfies TranscriptionStoppedMessage);
    sendResponse({ success: true });
    return true;
  }

  // IMPORTANT: Do NOT respond to messages not meant for offscreen
  // Let other listeners (background) handle them
  // If we respond here, popup gets wrong response!
  return false;
});

// Notify background that offscreen is ready
async function notifyReady(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_READY',
    } satisfies OffscreenReadyMessage);
  } catch {
    // Background might not be ready - that's OK
  }
}

/**
 * Clean up all audio resources.
 * Called on page unload or extension suspend.
 */
function cleanupAllCapture(): void {
  try { stopTranscription(); } catch { /* ignore */ }
  if (tabStream || tabAudioContext) {
    // Skip broadcast during cleanup - everything is shutting down
    try { stopTabCapture(true); } catch { /* ignore */ }
  }
  if (micStream || micAudioContext) {
    try { stopMicCapture(); } catch { /* ignore */ }
  }
}

// Register cleanup on page unload
window.addEventListener('beforeunload', () => {
  cleanupAllCapture();
});

// Initialize
console.log('Offscreen: Ready');
notifyReady();
