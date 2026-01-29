# Phase 2: Audio Pipeline - Research

**Researched:** 2026-01-29
**Domain:** Chrome Extension Audio Capture (tabCapture API, AudioWorklet, Web Audio API)
**Confidence:** HIGH

## Summary

Phase 2 implements audio capture for both tab audio (interviewer voices from Google Meet) and microphone audio (user's voice), converting both to PCM 16-bit 16kHz format suitable for speech-to-text services. This is a complex phase involving multiple Chrome APIs with strict security constraints.

The primary challenge is Chrome MV3's architecture: Service Workers cannot hold media streams, so all audio capture and processing must occur in either the Offscreen Document or Content Script. Additionally, `tabCapture` mutes the captured tab by default, requiring explicit passthrough via AudioContext.

**Primary recommendation:** Capture tab audio via tabCapture.getMediaStreamId() in Service Worker (requires user gesture from popup), pass stream ID to Offscreen Document which creates MediaStream via getUserMedia(), process through AudioWorklet for PCM conversion, and route audio to AudioContext.destination for passthrough.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Audio API | Browser native | Audio graph routing and processing | Only way to process audio in real-time in browser |
| AudioWorklet | Browser native | Off-thread PCM conversion | Replaces deprecated ScriptProcessorNode, runs on audio thread |
| chrome.tabCapture | MV3 API | Get tab audio stream ID | Only Chrome API for capturing tab audio |
| chrome.offscreen | MV3 API | Host media streams | Service Worker cannot hold MediaStreams |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| libsamplerate-js | ^2.0.0 | High-quality resampling | If browser native resampling is insufficient quality |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| AudioWorklet | ScriptProcessorNode | Deprecated, runs on main thread, causes glitches |
| Offscreen Document | Content Script | Content Script cannot call tabCapture, permission issues |
| Linear interpolation resample | libsamplerate-js WASM | Higher quality but adds ~200KB to bundle |

**Installation:**
```bash
# No additional npm packages needed for core functionality
# Optional for high-quality resampling:
npm install libsamplerate-js
```

## Architecture Patterns

### Recommended Project Structure
```
entrypoints/
├── background.ts              # Service Worker - tabCapture.getMediaStreamId()
├── offscreen/
│   ├── index.html            # Offscreen document HTML
│   └── main.ts               # Audio capture, passthrough, WebSocket holder
├── popup/
│   └── App.tsx               # Start/Stop button (user gesture source)
└── content.ts                # Content script (overlay, future phases)

src/
├── audio/
│   ├── pcm-processor.ts      # AudioWorklet processor (separate file)
│   └── audio-capture.ts      # AudioContext setup, stream handling
├── types/
│   └── messages.ts           # Add audio-related message types
└── services/
    └── audio-service.ts      # Coordinate capture start/stop
```

### Pattern 1: Tab Audio Capture with Passthrough

**What:** Capture tab audio while maintaining user audibility
**When to use:** Always for tab audio - tabCapture mutes by default

```typescript
// Source: Chrome official docs + community verified
// In Offscreen Document:
async function startTabCapture(streamId: string): Promise<void> {
  const tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  const audioContext = new AudioContext({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(tabStream);

  // CRITICAL: Route to destination for passthrough (prevents muting)
  source.connect(audioContext.destination);

  // Also connect to AudioWorklet for processing
  await audioContext.audioWorklet.addModule(chrome.runtime.getURL('pcm-processor.js'));
  const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');
  source.connect(workletNode);

  workletNode.port.onmessage = (event) => {
    // event.data contains PCM Int16Array chunks
    chrome.runtime.sendMessage({ type: 'AUDIO_CHUNK', data: event.data });
  };
}
```

### Pattern 2: Microphone Capture (Separate Stream)

**What:** Capture user's microphone as independent audio stream
**When to use:** For user's voice (labeled as "Me" in transcript)

```typescript
// Source: Chrome MV3 documentation
// IMPORTANT: Mic permission must be granted via extension page, not offscreen
async function startMicCapture(): Promise<void> {
  // This may require prior permission grant from extension tab
  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: 16000,
    },
  });

  const audioContext = new AudioContext({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(micStream);

  await audioContext.audioWorklet.addModule(chrome.runtime.getURL('pcm-processor.js'));
  const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');
  source.connect(workletNode);

  workletNode.port.onmessage = (event) => {
    chrome.runtime.sendMessage({ type: 'MIC_AUDIO_CHUNK', data: event.data });
  };
}
```

### Pattern 3: AudioWorklet PCM Processor

**What:** Convert Float32 audio samples to PCM 16-bit Int16
**When to use:** All audio processing for STT services

```typescript
// File: pcm-processor.js (must be vanilla JS, separate file)
// Source: MDN AudioWorklet docs + verified patterns
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.bufferSize = 1600; // 100ms at 16kHz
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length === 0) return true;

    const inputChannel = input[0]; // Mono

    // Convert Float32 to Int16 PCM
    for (let i = 0; i < inputChannel.length; i++) {
      const sample = Math.max(-1, Math.min(1, inputChannel[i]));
      const int16Sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      this.buffer.push(int16Sample);
    }

    // Send chunks when buffer is full
    while (this.buffer.length >= this.bufferSize) {
      const chunk = new Int16Array(this.buffer.splice(0, this.bufferSize));
      this.port.postMessage(chunk.buffer, [chunk.buffer]); // Transfer ownership
    }

    return true; // Keep processor alive
  }
}

registerProcessor('pcm-processor', PCMProcessor);
```

### Pattern 4: User Gesture Flow

**What:** Initiate capture from popup click (required by Chrome)
**When to use:** Starting any audio capture

```typescript
// In Popup (user gesture source):
const handleStart = async () => {
  // This click is the user gesture
  const response = await chrome.runtime.sendMessage({ type: 'START_CAPTURE' });
};

// In Service Worker:
async function handleStartCapture(tabId: number): Promise<void> {
  // getMediaStreamId requires user gesture context
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tabId,
  });

  await ensureOffscreenDocument();

  chrome.runtime.sendMessage({
    type: 'OFFSCREEN_START_CAPTURE',
    streamId,
  });
}
```

### Anti-Patterns to Avoid

- **Capturing in Content Script:** Content scripts cannot use tabCapture API. Always capture in Offscreen Document with stream ID from Service Worker.

- **Using ScriptProcessorNode:** Deprecated and runs on main thread. Always use AudioWorklet for real-time audio processing.

- **Not connecting to destination:** Forgetting `source.connect(audioContext.destination)` will mute tab audio for user.

- **Assuming 16kHz sample rate:** Browser may not honor requested sample rate. Check `audioContext.sampleRate` and resample if needed.

- **Large message payloads:** Don't send entire audio buffers. Chunk into 100ms segments (1600 samples at 16kHz).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio resampling | Custom linear interpolation | AudioContext sampleRate option or libsamplerate-js | Edge cases with sample rate conversion, aliasing |
| Float32 to Int16 | Naive multiplication | Standard clamping formula | Must handle clipping, negative value asymmetry |
| Audio buffering | Fixed-size arrays | Ring buffer pattern | AudioWorklet delivers 128 frames, may need different chunk sizes |
| Tab audio passthrough | Custom routing | `source.connect(audioContext.destination)` | Chrome-specific behavior, documented solution |

**Key insight:** Chrome's audio capture APIs have many undocumented behaviors. The passthrough pattern (connecting source to destination) is not obvious from API docs but is essential to prevent muting.

## Common Pitfalls

### Pitfall 1: Tab Audio Mutes When Captured

**What goes wrong:** User cannot hear tab audio after capture starts
**Why it happens:** `tabCapture` and `getUserMedia` with chromeMediaSource mute by design
**How to avoid:** Always connect MediaStreamSource to AudioContext.destination
**Warning signs:** Tab audio stops, no error thrown

```typescript
// FIX:
const source = audioContext.createMediaStreamSource(tabStream);
source.connect(audioContext.destination); // CRITICAL LINE
source.connect(workletNode);
```

### Pitfall 2: Microphone Permission Fails in Offscreen Document

**What goes wrong:** `getUserMedia()` for microphone throws error or silently fails
**Why it happens:** Offscreen documents cannot show permission prompts
**How to avoid:** Request microphone permission from extension page first
**Warning signs:** Permission denied error, no prompt shown

**Solution:** Create a separate extension page (e.g., `permissions.html`) that requests mic permission once, or instruct users to grant permission via extension settings.

### Pitfall 3: AudioWorklet Module Not Found

**What goes wrong:** `audioContext.audioWorklet.addModule()` fails
**Why it happens:** Module URL must be relative to extension, bundlers may break paths
**How to avoid:** Place processor in `public/` folder, use `chrome.runtime.getURL()`
**Warning signs:** "Failed to load module" or "Aborted request" errors

```typescript
// FIX:
const moduleUrl = chrome.runtime.getURL('pcm-processor.js');
await audioContext.audioWorklet.addModule(moduleUrl);
```

### Pitfall 4: Sample Rate Mismatch

**What goes wrong:** Audio plays at wrong speed or is distorted
**Why it happens:** Browser may not honor requested sample rate (hardware limitations)
**How to avoid:** Check actual sample rate and resample if needed
**Warning signs:** Audio sounds chipmunk-like or slowed down

```typescript
// CHECK:
const audioContext = new AudioContext({ sampleRate: 16000 });
if (audioContext.sampleRate !== 16000) {
  console.warn(`Actual sample rate: ${audioContext.sampleRate}, resampling needed`);
  // Implement resampling or use OfflineAudioContext
}
```

### Pitfall 5: Service Worker Timeout During Long Capture

**What goes wrong:** Service Worker goes idle and stops relaying messages
**Why it happens:** MV3 Service Workers have 30-second idle timeout
**How to avoid:** Audio processing lives in Offscreen Document, not Service Worker
**Warning signs:** Messages stop after ~30 seconds of no popup interaction

### Pitfall 6: Memory Leak from Unreleased Streams

**What goes wrong:** Memory usage grows, tab becomes sluggish
**Why it happens:** MediaStream tracks and AudioContext not properly stopped
**How to avoid:** Explicitly stop all tracks and close AudioContext on stop
**Warning signs:** Chrome task manager shows growing memory for extension

```typescript
// CLEANUP:
function stopCapture() {
  if (tabStream) {
    tabStream.getTracks().forEach(track => track.stop());
  }
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
  }
  if (audioContext) {
    audioContext.close();
  }
}
```

## Code Examples

### Complete Message Flow (Tab Capture)

```typescript
// src/types/messages.ts - Add these message types
export type MessageType =
  | 'PING' | 'PONG'
  | 'CREATE_OFFSCREEN' | 'OFFSCREEN_READY'
  | 'START_CAPTURE' | 'STOP_CAPTURE'
  | 'CAPTURE_STARTED' | 'CAPTURE_STOPPED'
  | 'TAB_AUDIO_CHUNK' | 'MIC_AUDIO_CHUNK'
  | 'CAPTURE_ERROR';

export interface StartCaptureMessage extends BaseMessage {
  type: 'START_CAPTURE';
  tabId?: number; // Optional, defaults to active tab
}

export interface CaptureStreamIdMessage extends BaseMessage {
  type: 'OFFSCREEN_START_CAPTURE';
  tabStreamId: string;
}

export interface AudioChunkMessage extends BaseMessage {
  type: 'TAB_AUDIO_CHUNK' | 'MIC_AUDIO_CHUNK';
  chunk: ArrayBuffer; // PCM Int16 data
  timestamp: number;
}
```

### Service Worker Tab Capture Handler

```typescript
// In background.ts
async function handleStartCapture(sender: chrome.runtime.MessageSender): Promise<void> {
  const tabId = sender.tab?.id;
  if (!tabId) throw new Error('No tab ID');

  // Get stream ID (requires user gesture context from popup click)
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tabId,
  });

  // Ensure offscreen document exists
  await ensureOffscreenDocument();

  // Send stream ID to offscreen for actual capture
  await chrome.runtime.sendMessage({
    type: 'OFFSCREEN_START_CAPTURE',
    tabStreamId: streamId,
  });
}
```

### Offscreen Document Audio Setup

```typescript
// In offscreen/main.ts
let audioContext: AudioContext | null = null;
let tabStream: MediaStream | null = null;
let workletNode: AudioWorkletNode | null = null;

async function startCapture(tabStreamId: string): Promise<void> {
  // Get MediaStream from stream ID
  tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: tabStreamId,
      },
    },
    video: false,
  });

  // Create AudioContext - request 16kHz
  audioContext = new AudioContext({ sampleRate: 16000 });

  // Log actual sample rate for debugging
  console.log('AudioContext sample rate:', audioContext.sampleRate);

  // Create source from stream
  const source = audioContext.createMediaStreamSource(tabStream);

  // CRITICAL: Route to destination for passthrough
  source.connect(audioContext.destination);

  // Load and connect AudioWorklet
  await audioContext.audioWorklet.addModule(chrome.runtime.getURL('pcm-processor.js'));
  workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');
  source.connect(workletNode);

  // Handle PCM chunks from worklet
  workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    chrome.runtime.sendMessage({
      type: 'TAB_AUDIO_CHUNK',
      chunk: event.data,
      timestamp: Date.now(),
    });
  };

  // Notify that capture has started
  chrome.runtime.sendMessage({ type: 'CAPTURE_STARTED' });
}

function stopCapture(): void {
  if (tabStream) {
    tabStream.getTracks().forEach(track => track.stop());
    tabStream = null;
  }
  if (workletNode) {
    workletNode.disconnect();
    workletNode = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  chrome.runtime.sendMessage({ type: 'CAPTURE_STOPPED' });
}
```

### PCM Processor (Vanilla JS for AudioWorklet)

```javascript
// public/pcm-processor.js
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    // 100ms at 16kHz = 1600 samples
    // Adjust based on actual sampleRate if needed
    this.bufferSize = Math.floor(sampleRate * 0.1);
  }

  floatTo16BitPCM(sample) {
    // Clamp to [-1, 1]
    const s = Math.max(-1, Math.min(1, sample));
    // Convert to 16-bit signed integer
    return s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channel = input[0]; // Mono (first channel)
    if (!channel) return true;

    // Convert and buffer samples
    for (let i = 0; i < channel.length; i++) {
      this.buffer.push(this.floatTo16BitPCM(channel[i]));
    }

    // Send chunks when buffer is full
    while (this.buffer.length >= this.bufferSize) {
      const chunk = new Int16Array(this.buffer.splice(0, this.bufferSize));
      // Transfer buffer ownership for performance
      this.port.postMessage(chunk.buffer, [chunk.buffer]);
    }

    return true; // Keep processor alive
  }
}

registerProcessor('pcm-processor', PCMProcessor);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ScriptProcessorNode | AudioWorklet | 2018 (Chrome 66) | No more main thread glitches |
| tabCapture.capture() | tabCapture.getMediaStreamId() | Chrome 116 (2023) | Works in Service Worker |
| Background page | Offscreen Document | MV3 (2022) | Required for DOM/media APIs |
| Content script capture | Offscreen Document | MV3 (2022) | tabCapture not in content script |

**Deprecated/outdated:**
- **ScriptProcessorNode:** Fully deprecated, use AudioWorklet
- **Background pages:** MV3 requires Service Worker, use Offscreen for DOM
- **chrome.tabCapture.capture():** Returns MediaStream directly, not usable in Service Worker

## Open Questions

1. **Sample Rate Handling**
   - What we know: Browser may not honor 16kHz request, returns native hardware rate
   - What's unclear: Exact resampling approach if browser returns 48kHz
   - Recommendation: Check actual sampleRate, implement linear interpolation resampling in worklet if needed. If quality issues arise, consider libsamplerate-js.

2. **Microphone Permission in Offscreen**
   - What we know: getUserMedia for mic fails silently in offscreen document
   - What's unclear: Best UX for requesting mic permission
   - Recommendation: Either request permission from popup (which may work) or create dedicated permissions page user visits once. Test both approaches.

3. **Multiple AudioContext Instances**
   - What we know: On macOS, multiple AudioContexts force same sample rate
   - What's unclear: Whether tab and mic need separate contexts
   - Recommendation: Try single AudioContext for both streams first. If issues, separate contexts with explicit resampling.

## Sources

### Primary (HIGH confidence)
- [Chrome tabCapture API Documentation](https://developer.chrome.com/docs/extensions/reference/api/tabCapture) - getMediaStreamId parameters, permissions, user gesture requirements
- [Chrome Audio Recording and Screen Capture Guide](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture) - MV3 patterns, offscreen document usage
- [MDN AudioWorklet Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet) - Processor registration, process() method, communication patterns
- [Chrome AudioWorklet Design Pattern Blog](https://developer.chrome.com/blog/audio-worklet-design-pattern) - Best practices, WebAssembly integration

### Secondary (MEDIUM confidence)
- [Recall.ai Chrome Recording Extension Guide](https://www.recall.ai/blog/how-to-build-a-chrome-recording-extension) - Complete implementation patterns, audio mixing, verified working approach
- [Chrome Extensions Samples - Tab Capture Recorder](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/sample.tabcapture-recorder) - Official sample code
- [0110.be Audio Resampling in AudioWorklet](https://0110.be/posts/Resampling_audio_via_a_Web_Audio_API_Audio_Worklet) - Resampling challenges and solutions

### Tertiary (LOW confidence)
- Community discussions on chromium-extensions Google Group regarding mic permissions in offscreen - workarounds for permission issues

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Chrome official documentation, MDN specs
- Architecture: HIGH - Chrome official samples, Recall.ai verified implementation
- Pitfalls: HIGH - Multiple sources document same issues (muting, permissions, sample rate)

**Research date:** 2026-01-29
**Valid until:** 2026-03-01 (60 days - Chrome APIs are stable)
