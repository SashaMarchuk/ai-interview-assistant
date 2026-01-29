import type {
  OffscreenReadyMessage,
  PingMessage,
  CaptureErrorMessage,
  StartMicCaptureMessage,
  StopMicCaptureMessage,
} from '../../src/types/messages';
import { isMessage } from '../../src/types/messages';

// Module-level state for microphone capture
let micAudioContext: AudioContext | null = null;
let micStream: MediaStream | null = null;
let micWorkletNode: AudioWorkletNode | null = null;

/**
 * Start microphone capture and convert to PCM via AudioWorklet.
 * Sends MIC_AUDIO_CHUNK messages with PCM data.
 */
async function startMicCapture(): Promise<void> {
  // Clean up any existing capture
  if (micStream || micAudioContext) {
    stopMicCapture();
  }

  try {
    // Request microphone access with audio processing
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000,
      },
    });
    console.log('Mic stream acquired');

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
    };

    // Connect source to worklet (NOT to destination)
    source.connect(micWorkletNode);

    console.log('Mic capture started successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check for permission denied error
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      console.error(
        'Microphone permission denied. Grant permission via extension settings or reload the extension.'
      );
    }

    // Send error message
    chrome.runtime.sendMessage({
      type: 'CAPTURE_ERROR',
      error: `Mic capture failed: ${errorMessage}`,
    } satisfies CaptureErrorMessage);

    // Clean up on failure
    stopMicCapture();
    throw error;
  }
}

/**
 * Stop microphone capture and clean up resources.
 */
function stopMicCapture(): void {
  // Stop all tracks on the stream
  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop());
    micStream = null;
  }

  // Disconnect worklet node
  if (micWorkletNode) {
    micWorkletNode.disconnect();
    micWorkletNode = null;
  }

  // Close audio context
  if (micAudioContext) {
    micAudioContext.close().catch(console.error);
    micAudioContext = null;
  }

  console.log('Mic capture stopped');
}

// Register message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Offscreen received:', message.type, 'from:', sender.id);

  // Handle messages sent to offscreen document
  if (isMessage<PingMessage>(message, 'PING')) {
    sendResponse({ type: 'PONG', timestamp: message.timestamp, receivedAt: Date.now() });
    return true;
  }

  // Handle START_MIC_CAPTURE
  if (isMessage<StartMicCaptureMessage>(message, 'START_MIC_CAPTURE')) {
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
    stopMicCapture();
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

// Initialize
console.log('Offscreen document loaded');
notifyReady();
