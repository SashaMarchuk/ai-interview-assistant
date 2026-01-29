import type {
  OffscreenReadyMessage,
  PingMessage,
  CaptureErrorMessage,
  CaptureStartedMessage,
  CaptureStoppedMessage,
  TabStreamIdMessage,
  StartMicCaptureMessage,
  StopMicCaptureMessage,
  StartTranscriptionMessage,
  StopTranscriptionMessage,
  TranscriptionStartedMessage,
  TranscriptionStoppedMessage,
  TranscriptionErrorMessage,
  TranscriptPartialMessage,
  TranscriptFinalMessage,
} from '../../src/types/messages';
import { isMessage } from '../../src/types/messages';
import { ElevenLabsConnection } from '../../src/services/transcription';

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

  console.log('Starting tab capture with stream ID:', streamId);

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
    console.log('Requesting tab stream with constraints');

    tabStream = await (navigator.mediaDevices.getUserMedia as (constraints: unknown) => Promise<MediaStream>)(constraints);
    console.log('Tab stream acquired, tracks:', tabStream.getTracks().length);

    // Create AudioContext at 16kHz for STT
    tabAudioContext = new AudioContext({ sampleRate: 16000 });
    console.log('Tab AudioContext created, actual sampleRate:', tabAudioContext.sampleRate);

    // Create source from tab stream
    const source = tabAudioContext.createMediaStreamSource(tabStream);

    // CRITICAL: Connect source to destination for audio passthrough
    // This ensures the user can still hear the tab audio (interviewer's voice)
    source.connect(tabAudioContext.destination);
    console.log('Audio passthrough enabled - tab audio will be audible');

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

    console.log('Tab capture started successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Tab capture failed:', errorMessage, error);

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
 */
async function stopTabCapture(): Promise<void> {
  console.log('stopTabCapture called, current state:', {
    hasStream: !!tabStream,
    hasContext: !!tabAudioContext,
    hasWorklet: !!tabWorkletNode,
  });

  try {
    // Stop all tracks on the stream FIRST (releases Chrome's tab capture)
    if (tabStream) {
      const tracks = tabStream.getTracks();
      console.log(`Stopping ${tracks.length} tab stream tracks...`);
      tracks.forEach((track) => {
        try {
          track.stop();
          console.log(`Tab track stopped: ${track.kind}`);
        } catch (e) {
          console.error('Error stopping tab track:', e);
        }
      });
      tabStream = null;
    }

    // Disconnect worklet node
    if (tabWorkletNode) {
      try {
        tabWorkletNode.disconnect();
        console.log('Tab worklet disconnected');
      } catch (e) {
        console.error('Error disconnecting tab worklet:', e);
      }
      tabWorkletNode = null;
    }

    // Close audio context and AWAIT completion
    if (tabAudioContext) {
      try {
        await tabAudioContext.close();
        console.log('Tab AudioContext closed');
      } catch (e) {
        console.error('Error closing tab AudioContext:', e);
      }
      tabAudioContext = null;
    }

    // Notify that capture has stopped
    chrome.runtime.sendMessage({
      type: 'CAPTURE_STOPPED',
    } satisfies CaptureStoppedMessage).catch((e) => {
      // Ignore errors if service worker is inactive
      console.log('Could not notify capture stopped:', e);
    });

    console.log('Tab capture stopped successfully');
  } catch (error) {
    console.error('Error during tab capture cleanup:', error);
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
      console.log('Microphone permission status:', permissionStatus.state);
      if (permissionStatus.state === 'denied') {
        throw new Error('Microphone permission is blocked. Go to chrome://settings/content/microphone and allow this extension.');
      }
    } catch (e) {
      console.log('Could not query permission status:', e);
    }

    // Request microphone access with audio processing
    console.log('Requesting microphone access...');
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000,
      },
    });
    console.log('Mic stream acquired, tracks:', micStream.getTracks().length);

    // Create AudioContext at 16kHz for STT
    micAudioContext = new AudioContext({ sampleRate: 16000 });
    console.log('Mic AudioContext created, actual sampleRate:', micAudioContext.sampleRate);

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

    console.log('Mic capture started successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Mic capture failed:', errorMessage, error);

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
  console.log('stopMicCapture called, current state:', {
    hasStream: !!micStream,
    hasContext: !!micAudioContext,
    hasWorklet: !!micWorkletNode,
  });

  try {
    // Stop all tracks on the stream
    if (micStream) {
      const tracks = micStream.getTracks();
      console.log(`Stopping ${tracks.length} mic stream tracks...`);
      tracks.forEach((track) => {
        try {
          track.stop();
          console.log(`Mic track stopped: ${track.kind}`);
        } catch (e) {
          console.error('Error stopping mic track:', e);
        }
      });
      micStream = null;
    }

    // Disconnect worklet node
    if (micWorkletNode) {
      try {
        micWorkletNode.disconnect();
        console.log('Mic worklet disconnected');
      } catch (e) {
        console.error('Error disconnecting mic worklet:', e);
      }
      micWorkletNode = null;
    }

    // Close audio context and AWAIT completion
    if (micAudioContext) {
      try {
        await micAudioContext.close();
        console.log('Mic AudioContext closed');
      } catch (e) {
        console.error('Error closing mic AudioContext:', e);
      }
      micAudioContext = null;
    }

    console.log('Mic capture stopped successfully');
  } catch (error) {
    console.error('Error during mic capture cleanup:', error);
  }
}

/**
 * Start tab transcription connection to ElevenLabs.
 * Creates WebSocket connection and forwards transcript results to Service Worker.
 */
function startTabTranscription(apiKey: string): void {
  console.log('startTabTranscription called, existing:', !!tabTranscription);
  if (tabTranscription) {
    console.log('Tab transcription already running, disconnecting first');
    tabTranscription.disconnect();
    tabTranscription = null;
  }

  tabTranscription = new ElevenLabsConnection(
    { apiKey, source: 'tab' },
    // onTranscript callback
    (text: string, isFinal: boolean, timestamp: number) => {
      if (isFinal) {
        chrome.runtime.sendMessage({
          type: 'TRANSCRIPT_FINAL',
          source: 'tab',
          text,
          timestamp,
          id: crypto.randomUUID(),
          speaker: 'Interviewer',
        } satisfies TranscriptFinalMessage);
      } else {
        chrome.runtime.sendMessage({
          type: 'TRANSCRIPT_PARTIAL',
          source: 'tab',
          text,
          timestamp,
        } satisfies TranscriptPartialMessage);
      }
    },
    // onError callback
    (error: string, canRetry: boolean) => {
      console.error('Tab transcription error:', error);
      chrome.runtime.sendMessage({
        type: 'TRANSCRIPTION_ERROR',
        source: 'tab',
        error,
        canRetry,
      } satisfies TranscriptionErrorMessage);
    },
    // onConnect callback - notify background when WebSocket connects
    () => {
      console.log('Tab WebSocket connected! Sending notification to background...');
      chrome.runtime.sendMessage({
        type: 'TRANSCRIPTION_STARTED',
      } satisfies TranscriptionStartedMessage);
    }
  );

  tabTranscription.connect();
  console.log('Tab transcription connect() called');
}

/**
 * Start microphone transcription connection to ElevenLabs.
 * Creates WebSocket connection and forwards transcript results to Service Worker.
 */
function startMicTranscription(apiKey: string): void {
  console.log('startMicTranscription called, existing:', !!micTranscription);
  if (micTranscription) {
    console.log('Mic transcription already running, disconnecting first');
    micTranscription.disconnect();
    micTranscription = null;
  }

  micTranscription = new ElevenLabsConnection(
    { apiKey, source: 'mic' },
    // onTranscript callback
    (text: string, isFinal: boolean, timestamp: number) => {
      if (isFinal) {
        chrome.runtime.sendMessage({
          type: 'TRANSCRIPT_FINAL',
          source: 'mic',
          text,
          timestamp,
          id: crypto.randomUUID(),
          speaker: 'You',
        } satisfies TranscriptFinalMessage);
      } else {
        chrome.runtime.sendMessage({
          type: 'TRANSCRIPT_PARTIAL',
          source: 'mic',
          text,
          timestamp,
        } satisfies TranscriptPartialMessage);
      }
    },
    // onError callback
    (error: string, canRetry: boolean) => {
      console.error('Mic transcription error:', error);
      chrome.runtime.sendMessage({
        type: 'TRANSCRIPTION_ERROR',
        source: 'mic',
        error,
        canRetry,
      } satisfies TranscriptionErrorMessage);
    },
    // onConnect callback - notify background when WebSocket connects
    () => {
      console.log('Mic WebSocket connected!');
    }
  );

  micTranscription.connect();
  console.log('Mic transcription connect() called');
}

/**
 * Stop all transcription connections and clean up state.
 */
function stopTranscription(): void {
  if (tabTranscription) {
    tabTranscription.disconnect();
    tabTranscription = null;
  }

  if (micTranscription) {
    micTranscription.disconnect();
    micTranscription = null;
  }

  transcriptionApiKey = null;
  transcriptionStarting = false;
  console.log('Transcription stopped');
}

// Register message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Offscreen received:', message.type, 'from:', sender.id);

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
    stopTabCapture()
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
      console.log('Mic capture already active, ignoring duplicate message');
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
  if (isMessage<StartTranscriptionMessage>(message, 'START_TRANSCRIPTION')) {
    console.log('=== START_TRANSCRIPTION received ===');

    // Guard against duplicate messages (popup and background both send this)
    if (transcriptionStarting || transcriptionApiKey) {
      console.log('Transcription already starting/active, ignoring duplicate message');
      sendResponse({ success: true, alreadyStarting: true });
      return true;
    }

    console.log('API Key length:', message.apiKey?.length || 0);
    // Don't log API key prefix for security

    if (!message.apiKey) {
      console.error('No API key provided!');
      sendResponse({ success: false, error: 'No API key' });
      return true;
    }

    transcriptionStarting = true;
    transcriptionApiKey = message.apiKey;
    console.log('Starting tab transcription...');
    startTabTranscription(message.apiKey);
    console.log('Starting mic transcription...');
    startMicTranscription(message.apiKey);
    transcriptionStarting = false;

    // Note: TRANSCRIPTION_STARTED is sent when WebSocket actually connects (in onConnect callback)
    // This allows proper tracking of connection state
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

  // Echo back unknown messages
  sendResponse({ received: true, originalType: message.type });
  return true;
});

// Notify background that offscreen is ready
async function notifyReady(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_READY',
    } satisfies OffscreenReadyMessage);
    console.log('Offscreen ready notification response:', response);
  } catch (error) {
    console.error('Failed to notify ready:', error);
  }
}

/**
 * Clean up all audio resources.
 * Called on page unload or extension suspend.
 */
function cleanupAllCapture(): void {
  console.log('Cleaning up all audio capture resources...');

  // Stop transcription WebSocket connections
  try {
    stopTranscription();
  } catch (error) {
    console.error('Error stopping transcription during cleanup:', error);
  }

  // Stop tab capture
  if (tabStream || tabAudioContext) {
    try {
      stopTabCapture();
    } catch (error) {
      console.error('Error stopping tab capture during cleanup:', error);
    }
  }

  // Stop mic capture
  if (micStream || micAudioContext) {
    try {
      stopMicCapture();
    } catch (error) {
      console.error('Error stopping mic capture during cleanup:', error);
    }
  }

  console.log('Audio capture cleanup complete');
}

// Register cleanup on page unload
// This fires when extension reloads, unloads, or updates
window.addEventListener('beforeunload', () => {
  console.log('Offscreen document unloading - cleaning up resources');
  cleanupAllCapture();
});

// Initialize
console.log('Offscreen document loaded');
notifyReady();
