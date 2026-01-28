# Pitfalls Research: Chrome MV3 Extension with Real-Time Audio and LLM Integration

Research findings for common mistakes and critical pitfalls when building Chrome extensions with real-time audio processing, WebSocket connections, and LLM streaming.

---

## Critical Pitfalls

These will fundamentally break the extension if not addressed properly.

### 1. Service Worker Termination Kills Active Connections

**The Problem:** Chrome terminates service workers after 30 seconds of inactivity or 5 minutes of continuous work. Any WebSocket or SSE connection in the service worker will be killed unpredictably.

**Why It's Critical:** Your ElevenLabs WebSocket and OpenRouter SSE connections cannot live in the service worker. Period.

**Warning Signs:**
- Transcription randomly stops mid-sentence
- LLM responses cut off unexpectedly
- Users report "it worked for a bit then stopped"
- Console shows service worker restart messages

**Prevention Strategy:**
- Run WebSocket connections in an [Offscreen Document](https://developer.chrome.com/docs/extensions/reference/api/offscreen), not the service worker
- Offscreen documents can live for hours as long as they're fulfilling their purpose
- Implement heartbeat/ping-pong every 20 seconds to keep connections alive within the offscreen document
- Store critical state in `chrome.storage.session` (survives service worker restarts)

**Phase:** Architecture/Foundation - must be designed correctly from day one

**Sources:**
- [Extension Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Longer Extension Service Worker Lifetimes](https://developer.chrome.com/blog/longer-esw-lifetimes)
- [Offscreen Documents Guide](https://dev.to/notearthian/how-to-create-offscreen-documents-in-chrome-extensions-a-complete-guide-3ke2)

---

### 2. tabCapture Mutes Tab Audio by Default

**The Problem:** When you capture a tab's MediaStream, the audio stops playing to the user. This is by design, similar to `getDisplayMedia()` with `suppressLocalAudioPlayback: true`.

**Why It's Critical:** Users will think their audio is broken. They won't hear the interviewer/interviewee.

**Warning Signs:**
- Tab goes silent immediately after starting capture
- Users frantically checking volume controls
- "The extension muted my meeting!" complaints

**Prevention Strategy:**
```javascript
// Create an AudioContext to pipe the stream back to speakers
const audioContext = new AudioContext();
const source = audioContext.createMediaStreamSource(capturedStream);
source.connect(audioContext.destination);
```

**Phase:** Audio Capture implementation - critical for initial working prototype

**Sources:**
- [chrome.tabCapture API](https://developer.chrome.com/docs/extensions/reference/api/tabCapture)
- [How to Build a Chrome Recording Extension](https://www.recall.ai/blog/how-to-build-a-chrome-recording-extension)

---

### 3. tabCapture Requires User Gesture from Visible UI

**The Problem:** `chrome.tabCapture.capture()` and `getMediaStreamId()` can only be called after a user gesture from a visible extension UI (popup, options page, or tab).

**Why It's Critical:** Silent/automatic capture won't work. Popup dismissal before capture starts will fail.

**Warning Signs:**
- "chrome.tabCapture.capture is not a function" errors
- Capture works in dev but fails in production
- Permission prompts never appear
- Silent failures with no error messages

**Prevention Strategy:**
- Initiate capture from a popup click handler that keeps the popup open
- Alternatively, open a dedicated setup tab for capture initialization
- Never try to capture from the service worker directly
- The streamId expires after a few seconds - use it immediately

**Phase:** UX/UI design and Audio Capture implementation

**Sources:**
- [tabCapture with MV3 Discussion](https://github.com/w3c/webextensions/issues/137)
- [Chromium Extension Tab Audio Capture Discussion](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/JI7AW48PxGs/m/QZ69ZIx1AgAJ)

---

### 4. Global State Lost on Service Worker Restart

**The Problem:** All JavaScript global variables are wiped when the service worker restarts. This includes interview state, connection status, user settings, and any runtime data.

**Why It's Critical:** Mid-interview service worker restart = complete context loss.

**Warning Signs:**
- State mysteriously resets to defaults
- "Where did my conversation history go?"
- Zustand store appears empty after Chrome activity
- Extension works fine in dev (DevTools keeps SW alive) but breaks in production

**Prevention Strategy:**
- Use `chrome.storage.session` for ephemeral state (max 10MB, cleared on browser close)
- Use `chrome.storage.local` for persistent settings
- Implement state rehydration on service worker startup
- For Zustand: subscribe to storage changes and trigger rehydration in popup
- Save state continuously, not just on suspend (don't rely on `onSuspend`)

**Phase:** State Management architecture - Foundation phase

**Sources:**
- [Zustand Chrome Extension Discussion](https://github.com/pmndrs/zustand/discussions/2020)
- [V3 Service Worker State Persistence Solutions](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/a40YbSmgUK4)

---

### 5. CSP Blocking External WebSocket Connections

**The Problem:** Content Security Policy must explicitly allow WebSocket connections to external services. Default CSP won't allow connections to ElevenLabs or OpenRouter.

**Why It's Critical:** WebSocket handshakes fail silently or with cryptic CSP errors.

**Warning Signs:**
- "Content Security Policy: blocked loading of resource" errors
- WebSocket connections timeout without clear reason
- Works locally but fails in production

**Prevention Strategy:**
In `manifest.json`:
```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self' wss://api.elevenlabs.io https://openrouter.ai https://*.openrouter.ai;"
  }
}
```
Note: `connect-src` is NOT restricted like `script-src` in MV3 - you can specify external URLs.

**Phase:** Manifest configuration - Foundation phase

**Sources:**
- [Manifest Content Security Policy](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)
- [Resolving CSP Issues in MV3](https://medium.com/@python-javascript-php-html-css/resolving-content-security-policy-issues-in-chrome-extension-manifest-v3-4ab8ee6b3275)

---

## Common Mistakes

Frequently made errors that cause significant issues.

### 6. Shadow DOM CSS Isolation Fails Silently

**The Problem:** CSS from host pages bleeds into your Shadow DOM, or your CSS doesn't apply at all because it's being injected into the document head instead of the shadow root.

**Why It's Common:** React and CSS-in-JS libraries default to injecting styles into `document.head`.

**Warning Signs:**
- Extension looks perfect in isolation, broken on real pages
- Styles randomly change across different websites
- `:hover`, `:focus`, and pseudo-elements don't work
- `rem` units produce unexpected sizes (they're relative to `<html>`, not shadow root)

**Prevention Strategy:**
- Use Emotion with `CacheProvider` specifying a container in the shadow root
- Or use `react-shadow` package for automatic Shadow DOM handling
- Avoid `rem` units - use `px` or `em` within the shadow root
- Install `react-shadow-dom-retarget-events` if click events don't fire
- Test on pages with aggressive CSS (Gmail, Notion, etc.)

**Phase:** UI/Overlay implementation

**Sources:**
- [Shadow DOM CSS Isolation Guide](https://dev.to/developertom01/solving-css-and-javascript-interference-in-chrome-extensions-a-guide-to-react-shadow-dom-and-best-practices-9l)
- [Using Shadow DOM for CSS Isolation](https://www.chrisfarber.net/posts/2023/css-isolation)

---

### 7. AudioWorklet Memory Leaks from Improper Cleanup

**The Problem:** Creating/destroying AudioContext and AudioWorkletNodes without proper cleanup causes memory to accumulate. Audio data buffers are retained even after the node is "disconnected."

**Why It's Common:** Web Audio API cleanup is non-intuitive. Just calling `disconnect()` isn't enough.

**Warning Signs:**
- Chrome Helper process memory grows continuously
- Performance degrades during long interviews
- Audio glitches appear after 20-30 minutes
- Users report "Chrome is using all my RAM"

**Prevention Strategy:**
- Allocate buffers upfront and reuse them (avoid per-chunk allocation)
- Call `close()` on MessagePort from both AudioWorkletProcessor and AudioWorkletNode sides
- Call `audioContext.close()` when done
- Use SharedArrayBuffer for zero-copy data transfer between threads
- Set all node references to `null` after cleanup

**Phase:** Audio Processing implementation

**Sources:**
- [Audio Worklet Design Pattern](https://developer.chrome.com/blog/audio-worklet-design-pattern)
- [Profiling Web Audio Apps](https://web.dev/profiling-web-audio-apps-in-chrome/)
- [AudioWorklet Memory Leak Discussion](https://github.com/superpoweredSDK/web-audio-javascript-webassembly-SDK-interactive-audio/issues/2)

---

### 8. SSE Streaming Response Parsing Errors

**The Problem:** SSE streams from OpenRouter occasionally contain comment payloads (`:`), data-only messages, or non-JSON content. Naive parsing breaks.

**Why It's Common:** Many SSE client implementations don't follow the spec strictly.

**Warning Signs:**
- `JSON.parse` throws on "unexpected token"
- LLM responses randomly fail
- Some responses work, others don't

**Prevention Strategy:**
```javascript
// Properly handle SSE events
eventSource.onmessage = (event) => {
  if (event.data === '[DONE]') return;
  if (event.data.startsWith(':')) return; // Ignore comments
  try {
    const parsed = JSON.parse(event.data);
    // Process parsed data
  } catch (e) {
    // Log but don't throw - malformed packets happen
    console.warn('Non-JSON SSE data:', event.data);
  }
};
```

**Phase:** LLM Integration

**Sources:**
- [OpenRouter API Streaming](https://openrouter.ai/docs/api/reference/streaming)
- [OpenRouter Error Handling](https://openrouter.ai/docs/api/reference/errors-and-debugging)

---

### 9. Service Worker Broken After Extension Auto-Update

**The Problem:** Chrome can end up with TWO service workers after an auto-update: the old one is ACTIVATED but broken due to `chrome.runtime.reload()`, and the new one is INSTALLED but waiting.

**Why It's Common:** This is a known Chrome bug. Extension updates only install when the extension is "idle" (service worker not running).

**Warning Signs:**
- Extension stops working randomly for some users
- Works again after toggling extension off/on
- `chrome://serviceworker-internals/` shows multiple workers
- Users report "reinstalling fixed it"

**Prevention Strategy:**
- Handle `chrome.runtime.onUpdateAvailable` and trigger graceful reload
- Don't keep the service worker perpetually alive (let it go idle for updates)
- Add a "Restart Extension" option in the popup
- Test update scenarios explicitly
- Persist state so restarts are painless

**Phase:** Deployment/Maintenance - but design for it early

**Sources:**
- [MV3 Service Worker Broken After Auto-Update](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/POU6sW-I39M/m/PljS3_zbAgAJ)
- [Chrome Extension Update Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/extensions-update-lifecycle)
- [Chromium Issue #40805401](https://issues.chromium.org/issues/40805401)

---

### 10. ElevenLabs PCM Format Mismatch

**The Problem:** ElevenLabs WebSocket expects specific PCM format: 16-bit, little-endian, mono, at specific sample rates (16kHz, 22.05kHz, 24kHz, or 44.1kHz). AudioWorklet produces Float32Array by default.

**Why It's Common:** Format conversion is easy to get wrong, especially endianness.

**Warning Signs:**
- ElevenLabs returns garbled audio
- "Invalid audio format" errors
- Works in testing, fails with certain audio sources

**Prevention Strategy:**
```javascript
// Convert Float32Array to 16-bit PCM
function float32ToPCM16(float32Array) {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return pcm16;
}
```
- Match sample rate to ElevenLabs requirement (16kHz recommended for STT)
- Ensure mono channel (combine stereo if needed)
- Pro tier required for 44.1kHz

**Phase:** Audio Processing and WebSocket Integration

**Sources:**
- [ElevenLabs PCM Output Format](https://elevenlabs.io/blog/pcm-output-format)
- [ElevenLabs Realtime API](https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime)

---

## Performance Pitfalls

Issues that hurt latency, memory, or user experience.

### 11. Audio Buffer Size Trade-off Misconfigured

**The Problem:** Small buffers = low latency but higher CPU and risk of glitches. Large buffers = smooth audio but noticeable delay.

**Target:** <500ms end-to-end latency

**Warning Signs:**
- Audio crackling/popping (buffer too small)
- Noticeable delay between speech and transcription (buffer too large)
- CPU usage spikes during audio processing

**Prevention Strategy:**
- Start with 128-sample render quantum (Web Audio standard)
- Use `latencyHint: 'interactive'` when creating AudioContext
- Chrome default is 256 samples double-buffered (~23ms at 44.1kHz)
- Profile with `chrome://tracing` and Web Audio DevTools extension
- Consider adaptive buffer sizing based on device capability

**Latency Budget:**
- Audio capture: ~10ms
- PCM conversion: ~5ms
- WebSocket transit: ~50-100ms
- ElevenLabs processing: ~200-300ms
- Total: ~265-415ms (achievable under 500ms target)

**Phase:** Performance Optimization

**Sources:**
- [Web Audio API Buffer Size Discussion](https://github.com/WebAudio/web-audio-api/issues/1221)
- [Web Audio Performance Notes](https://padenot.github.io/web-audio-perf/)
- [AudioContext Latency](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/baseLatency)

---

### 12. Content Script Memory Leaks from DOM Observers

**The Problem:** MutationObservers, event listeners, and DOM references in content scripts accumulate if not cleaned up when navigating or when the extension unloads.

**Warning Signs:**
- Memory grows on each page navigation
- "Detached DOM tree" items in heap snapshots
- Extension slows down over time
- Chrome DevTools shows increasing "Detached" count

**Prevention Strategy:**
```javascript
// Store references for cleanup
const observers = [];
const listeners = [];

function cleanup() {
  observers.forEach(obs => obs.disconnect());
  listeners.forEach(({ element, event, handler }) =>
    element.removeEventListener(event, handler)
  );
  observers.length = 0;
  listeners.length = 0;
}

// Clean up on unload
window.addEventListener('beforeunload', cleanup);
chrome.runtime.onSuspend?.addListener(cleanup);
```

**Phase:** Content Script implementation

**Sources:**
- [Fix Memory Problems - Chrome DevTools](https://developer.chrome.com/docs/devtools/memory-problems)
- [Four Types of Memory Leaks in JavaScript](https://auth0.com/blog/four-types-of-leaks-in-your-javascript-code-and-how-to-get-rid-of-them/)

---

### 13. OpenRouter Rate Limits for Free Models

**The Problem:** Free models have strict rate limits: 50 requests/day without credits, 1000 requests/day with $10+ in credits. Hitting limits mid-interview is catastrophic.

**Warning Signs:**
- 429 rate limit errors
- 402 errors (negative credit balance affects even free models)
- LLM suddenly stops responding

**Prevention Strategy:**
- Use paid models for production reliability
- Implement request queuing and deduplication
- Cache similar responses where appropriate
- Show clear error states in UI when rate limited
- Have fallback model configuration
- Monitor credit balance via OpenRouter dashboard

**Phase:** LLM Integration

**Sources:**
- [OpenRouter Rate Limits](https://openrouter.ai/docs/api/reference/limits)
- [OpenRouter FAQ](https://openrouter.ai/docs/faq)

---

## Chrome MV3 Specific Gotchas

### 14. Event Listeners Must Be Registered Synchronously

**The Problem:** All event listeners in the service worker must be registered at the top level during initial execution, not inside async callbacks or after awaits.

**Why It Matters:** Chrome may miss events if handlers aren't registered when the service worker wakes up.

**Warning Signs:**
- Events work sometimes but not always
- "Handler was not registered" warnings
- First message after wake works, subsequent don't

**Prevention Strategy:**
```javascript
// WRONG
async function init() {
  await someSetup();
  chrome.runtime.onMessage.addListener(handler); // May be missed!
}
init();

// CORRECT
chrome.runtime.onMessage.addListener(handler); // Registered synchronously
async function init() {
  await someSetup();
}
init();
```

**Phase:** Service Worker setup - Foundation

**Sources:**
- [Handle Events with Service Workers](https://developer.chrome.com/docs/extensions/get-started/tutorial/service-worker-events)

---

### 15. DevTools Prevents Service Worker Termination

**The Problem:** With DevTools open, the service worker never terminates. This masks timeout issues during development.

**Warning Signs:**
- Everything works in dev, breaks in production
- "Works on my machine" syndrome
- Users report random failures you can't reproduce

**Prevention Strategy:**
- Test explicitly with DevTools closed
- Use `chrome.runtime.onSuspend` logging (won't fire with DevTools open)
- Create automated tests that simulate service worker suspension
- Test on fresh Chrome profile without DevTools
- Use separate Chrome profile for development vs. testing

**Phase:** Testing strategy - Quality Assurance

**Sources:**
- [eyeo's Journey to Testing Service Worker Suspension](https://developer.chrome.com/blog/eyeos-journey-to-testing-mv3-service%20worker-suspension)

---

### 16. Offscreen Document Permission and Lifecycle

**The Problem:** Offscreen documents require explicit permission declaration and have specific lifecycle constraints. They can only be created for predefined "reasons."

**Warning Signs:**
- "Offscreen API not available" errors
- Document creation fails silently
- Multiple offscreen documents created accidentally

**Prevention Strategy:**
```json
// manifest.json
{
  "permissions": ["offscreen"]
}
```

```javascript
// Only one offscreen document at a time
async function ensureOffscreenDocument() {
  const existing = await chrome.offscreen.hasDocument();
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK', 'WEB_RTC'], // Valid reasons
      justification: 'Audio capture and WebSocket for transcription'
    });
  }
}
```

Valid reasons include: `AUDIO_PLAYBACK`, `BLOBS`, `DOM_SCRAPING`, `GEOLOCATION`, `LOCAL_STORAGE`, `TESTING`, `USER_MEDIA`, `WEB_RTC`, etc.

**Phase:** Foundation architecture

**Sources:**
- [Offscreen Documents Proposal](https://github.com/w3c/webextensions/issues/170)
- [Offscreen Documents Guide](https://dev.to/notearthian/how-to-create-offscreen-documents-in-chrome-extensions-a-complete-guide-3ke2)

---

### 17. Tab Switching Causes Audio Gaps

**The Problem:** When the user switches away from the tab being captured, Chrome may throttle or pause rendering, causing audio gaps.

**Warning Signs:**
- Transcription has missing words/phrases
- Audio quality degrades when user multitasks
- Gaps correlate with tab visibility changes

**Prevention Strategy:**
- Inform users to keep the interview tab visible
- Consider capturing via offscreen document (less affected by visibility)
- Implement audio buffer to smooth over brief gaps
- Log visibility changes for debugging

**Phase:** Audio Capture and UX

**Sources:**
- [How to Build a Chrome Recording Extension](https://www.recall.ai/blog/how-to-build-a-chrome-recording-extension)

---

## Prevention Strategies Summary

| Pitfall | Prevention | Phase |
|---------|------------|-------|
| Service Worker kills connections | Use Offscreen Document for WebSocket/SSE | Architecture |
| tabCapture mutes audio | Pipe stream back to speakers via AudioContext | Audio Capture |
| tabCapture user gesture | Initiate from popup click, use dedicated tab fallback | UX Design |
| State loss on SW restart | Use chrome.storage.session, continuous saves | State Management |
| CSP blocks WebSocket | Configure connect-src in manifest | Manifest Config |
| Shadow DOM CSS bleed | Emotion CacheProvider, avoid rem units | UI Implementation |
| AudioWorklet memory | Preallocate buffers, proper cleanup | Audio Processing |
| SSE parsing errors | Handle non-JSON payloads gracefully | LLM Integration |
| Extension update breaks | Handle onUpdateAvailable, allow idle periods | Deployment |
| PCM format mismatch | Float32 to Int16 conversion, match sample rate | Audio/WebSocket |
| Buffer size wrong | Use 128 samples, latencyHint: 'interactive' | Performance |
| Content script leaks | Cleanup on unload, disconnect observers | Content Script |
| OpenRouter rate limits | Use paid models, implement fallbacks | LLM Integration |
| Async event registration | Register all listeners synchronously at top level | Service Worker |
| DevTools masks issues | Test with DevTools closed, fresh profile | Testing |
| Offscreen document issues | Declare permission, check existence before create | Architecture |
| Tab switching gaps | Buffer audio, inform users, log visibility | Audio/UX |

---

## Warning Signs Checklist

Use this during development to catch issues early:

### Audio Issues
- [ ] Tab goes silent after capture starts
- [ ] Transcription has gaps or missing words
- [ ] Audio quality degrades over time
- [ ] Memory usage grows during long sessions

### Connection Issues
- [ ] WebSocket/SSE randomly disconnects
- [ ] Works in dev, fails in production
- [ ] CSP errors in console
- [ ] Connections work for ~30 seconds then die

### State Issues
- [ ] Settings reset unexpectedly
- [ ] Context/history disappears
- [ ] Works perfectly with DevTools open

### Update Issues
- [ ] Extension stops working after Chrome/extension update
- [ ] Multiple service workers in `chrome://serviceworker-internals/`

### Performance Issues
- [ ] Increasing latency during session
- [ ] Chrome Helper process growing
- [ ] UI becomes sluggish after 15+ minutes

---

## Research Sources

- [Chrome Extension Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Chrome tabCapture API Reference](https://developer.chrome.com/docs/extensions/reference/api/tabCapture)
- [Chrome Offscreen Documents](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Audio Worklet Design Patterns](https://developer.chrome.com/blog/audio-worklet-design-pattern)
- [ElevenLabs WebSocket Documentation](https://elevenlabs.io/docs/websockets)
- [OpenRouter API Documentation](https://openrouter.ai/docs/api/reference/overview)
- [Shadow DOM CSS Isolation](https://dev.to/developertom01/solving-css-and-javascript-interference-in-chrome-extensions-a-guide-to-react-shadow-dom-and-best-practices-9l)
- [Zustand Chrome Extension State](https://github.com/pmndrs/zustand/discussions/2020)
- [MV3 Service Worker Update Issues](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/POU6sW-I39M/m/PljS3_zbAgAJ)
