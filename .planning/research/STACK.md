# Stack Research: Chrome Extension with Real-Time Audio & LLM Integration

> Research Date: January 2025
> Target: Chrome MV3 Extension with real-time transcription and LLM assistance

## Executive Summary

For a Chrome MV3 extension with real-time audio capture, WebSocket-based STT, and streaming LLM integration, the recommended 2025 stack centers on **WXT** as the build framework, **React 19** for UI, **Zustand** for state management, and direct WebSocket connections to ElevenLabs for STT and OpenRouter for LLM streaming.

---

## Recommended Stack

### Core Framework

| Package | Version | Purpose |
|---------|---------|---------|
| `wxt` | ^0.20.11 | Chrome extension framework (Vite-based) |
| `@wxt-dev/module-react` | latest | WXT React integration module |

**Why WXT over alternatives:**
- **5x smaller builds** than Plasmo (400KB vs 700KB+ typical)
- **Superior HMR** that works even for Service Workers
- **Framework agnostic** but excellent React support
- **Active maintenance** with v1.0 release imminent
- **Vite-powered** for modern DX and performance

### UI Layer

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | ^19.2.3 | UI framework |
| `react-dom` | ^19.2.3 | React DOM bindings |
| `tailwindcss` | ^4.1.18 | Utility-first CSS |
| `@tailwindcss/vite` | ^4.1.18 | Vite plugin for Tailwind v4 |

**Why React 19:**
- Stable release (December 2024, patches through Dec 2025)
- Native `useSyncExternalStore` for extension state
- Server Components not needed, but Actions useful for async operations
- Best ecosystem support for component libraries

**Why Tailwind v4:**
- 5x faster builds with new engine
- Zero-config with Vite plugin
- CSS-in-JS alternative without runtime overhead
- Native cascade layers prevent style conflicts in content scripts

### State Management

| Package | Version | Purpose |
|---------|---------|---------|
| `zustand` | ^5.0.10 | Lightweight state management |
| `@webext-pegasus/store-zustand` | latest | Cross-context state sync for extensions |

**Why Zustand v5:**
- **14M+ weekly downloads** - battle-tested
- **2KB gzipped** - minimal bundle impact
- Native React 18+ support via `useSyncExternalStore`
- No boilerplate - crucial for rapid development
- Excellent Chrome extension ecosystem support via `@webext-pegasus/store-zustand`

### Audio Processing

| Package | Version | Purpose |
|---------|---------|---------|
| Native Web Audio API | - | Audio context and routing |
| Native AudioWorklet | - | Low-latency audio processing |
| Native MediaRecorder | - | Audio encoding for WebSocket |

**No external packages needed.** Chrome's built-in APIs are sufficient and optimal:
- `AudioWorklet` for zero-latency processing (replaces deprecated `ScriptProcessorNode`)
- `MediaRecorder` with `audio/webm; codecs=opus` for ElevenLabs compatibility
- `AudioContext` for routing captured audio back to speakers

### STT Integration (ElevenLabs)

| Package | Version | Purpose |
|---------|---------|---------|
| Native WebSocket | - | Direct WebSocket connection to ElevenLabs |
| `@elevenlabs/elevenlabs-js` | ^2.31.0 | Optional: Node SDK for server-side operations |

**Why native WebSocket over SDK:**
- **Browser-only requirement** - SDK is Node-focused
- **Direct control** over connection lifecycle
- **Lower latency** without SDK abstraction layer
- **Smaller bundle** - no unnecessary dependencies

ElevenLabs Scribe WebSocket endpoint: `wss://api.elevenlabs.io/v1/speech-to-text/realtime`

### LLM Integration (OpenRouter)

| Package | Version | Purpose |
|---------|---------|---------|
| `@openrouter/ai-sdk-provider` | ^1.5.4 | Vercel AI SDK provider for OpenRouter |
| `ai` | ^6.x | Vercel AI SDK (if using AI SDK approach) |

**Alternative: Direct fetch with streaming:**
```typescript
// Native approach - smaller bundle, full control
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: JSON.stringify({ model, messages, stream: true })
});
const reader = response.body.getReader();
// Process SSE stream
```

**Recommendation:** Use native `fetch` with ReadableStream for minimal bundle size unless you need AI SDK's abstractions.

### Build & Development

| Package | Version | Purpose |
|---------|---------|---------|
| `vite` | ^7.3.1 | Build tool (via WXT) |
| `typescript` | ^5.7.3 | Type safety |
| `@types/chrome` | latest | Chrome extension type definitions |

---

## Build System

### WXT Configuration

```typescript
// wxt.config.ts
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    permissions: ['tabCapture', 'activeTab', 'offscreen', 'storage'],
    host_permissions: ['<all_urls>'],
  },
});
```

### Why WXT over CRXJS

| Aspect | WXT | CRXJS |
|--------|-----|-------|
| Maintenance | Active, v1.0 imminent | Seeking maintainers, may archive June 2025 |
| HMR for Service Workers | Yes | Limited |
| Build size | ~400KB typical | ~500KB typical |
| Framework support | React, Vue, Svelte, Solid | React-focused |
| MV3 support | Full | Full |

---

## Chrome Extension Specifics (MV3)

### Offscreen Document Pattern (Critical)

For audio capture in MV3, you **must** use the Offscreen Document pattern:

```
┌─────────────────────┐     ┌──────────────────────┐
│   Service Worker    │     │  Offscreen Document  │
│   (background.ts)   │────▶│   (offscreen.ts)     │
│                     │     │                      │
│ - Coordinates state │     │ - tabCapture stream  │
│ - Manages lifecycle │     │ - AudioWorklet       │
│ - Message routing   │     │ - WebSocket to STT   │
└─────────────────────┘     └──────────────────────┘
          │
          ▼
┌─────────────────────┐
│   Content Script    │
│   (content.tsx)     │
│                     │
│ - Floating overlay  │
│ - React UI          │
│ - Shadow DOM        │
└─────────────────────┘
```

**Why Offscreen Document:**
- Service Workers cannot access DOM/Web Audio API
- Service Workers may be suspended by Chrome
- All audio processing must happen in DOM-enabled context
- `chrome.offscreen.createDocument({ reasons: ['USER_MEDIA'], ... })`

### Manifest Permissions Required

```json
{
  "permissions": [
    "tabCapture",
    "activeTab",
    "offscreen",
    "storage"
  ],
  "host_permissions": ["<all_urls>"]
}
```

### User Gesture Requirement

`tabCapture` requires explicit user gesture:
- Extension action click (toolbar button)
- Popup interaction
- Cannot be triggered programmatically without user action

---

## Audio Processing Architecture

### AudioWorklet for Low Latency

```typescript
// audio-processor.worklet.ts
class AudioProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>) {
    const input = inputs[0];
    if (input.length > 0) {
      // Send audio data to main thread
      this.port.postMessage({ audioData: input[0] });
    }
    return true; // Keep processor alive (required for Chrome)
  }
}
registerProcessor('audio-processor', AudioProcessor);
```

**Critical:** Always `return true` from `process()` in Chrome, or the processor will be garbage collected.

### Audio Routing for Speaker Playback

When capturing tab audio, sound stops playing to the user. Re-route it:

```typescript
const audioContext = new AudioContext();
const source = audioContext.createMediaStreamSource(mediaStream);
source.connect(audioContext.destination); // Play to speakers
// Also connect to AudioWorklet for processing
```

---

## UI Framework Details

### Shadow DOM for Content Scripts

Isolate extension styles from host page:

```typescript
// content.tsx
const host = document.createElement('div');
const shadow = host.attachShadow({ mode: 'closed' });
document.body.appendChild(host);

// Inject Tailwind styles into shadow root
const styles = document.createElement('style');
styles.textContent = tailwindCSS; // Bundled CSS
shadow.appendChild(styles);

// Render React into shadow DOM
createRoot(shadow).render(<App />);
```

### Floating Overlay with Blur

```css
.overlay {
  backdrop-filter: blur(12px);
  background: rgba(0, 0, 0, 0.7);
  border-radius: 12px;
  position: fixed;
  z-index: 2147483647; /* Max z-index */
}
```

---

## What NOT to Use

### Plasmo Framework
**Reason:** Maintenance concerns - appears to be in maintenance mode with little active development. Uses outdated Parcel bundler causing compatibility issues. WXT is the clear 2025 choice.

### ScriptProcessorNode
**Reason:** Deprecated. Runs on main thread causing latency and audio glitches. Use `AudioWorklet` instead.

### Redux / Redux Toolkit
**Reason:** Overkill for this use case. 15KB+ bundle size vs Zustand's 2KB. Excessive boilerplate for simple state needs.

### Full ElevenLabs Node SDK in browser
**Reason:** SDK is Node-focused, adds unnecessary bundle size. Use native WebSocket for browser STT.

### CRXJS Vite Plugin
**Reason:** Project seeking maintainers, may be archived June 2025. WXT has superior HMR and active development.

### React Query / TanStack Query
**Reason:** Overkill - designed for REST API caching, not real-time WebSocket streams. Native WebSocket + Zustand is simpler and more appropriate.

### Jotai / Recoil
**Reason:** While valid, Zustand has better Chrome extension ecosystem support via `@webext-pegasus/store-zustand` for cross-context state sync.

### Tailwind v3 CDN
**Reason:** MV3 forbids external scripts. Use Vite plugin with proper build or local CDN bundle. v4 with Vite plugin is the correct approach.

---

## Confidence Levels

| Decision | Confidence | Rationale |
|----------|------------|-----------|
| **WXT** | **HIGH** | Clear 2025 consensus, active maintenance, superior DX |
| **React 19** | **HIGH** | Stable, best ecosystem, team familiarity likely |
| **Zustand 5** | **HIGH** | Perfect fit for extension state, excellent ecosystem |
| **Tailwind 4** | **HIGH** | Modern CSS, Vite integration, isolation-friendly |
| **Native WebSocket for STT** | **HIGH** | Smaller bundle, better control for browser use |
| **Offscreen Document pattern** | **HIGH** | Required by MV3 for audio processing |
| **AudioWorklet** | **HIGH** | Only viable option for low-latency audio |
| **OpenRouter direct fetch** | **MEDIUM** | AI SDK adds convenience but bundle size; evaluate tradeoff |
| **TypeScript 5.7** | **HIGH** | Standard, stable, required for type safety |
| **Vite 7** | **HIGH** | Powers WXT, modern standard |

---

## Version Summary

```json
{
  "wxt": "^0.20.11",
  "react": "^19.2.3",
  "react-dom": "^19.2.3",
  "zustand": "^5.0.10",
  "tailwindcss": "^4.1.18",
  "@tailwindcss/vite": "^4.1.18",
  "typescript": "^5.7.3",
  "@elevenlabs/elevenlabs-js": "^2.31.0",
  "@openrouter/ai-sdk-provider": "^1.5.4"
}
```

---

## References

- [WXT Framework](https://wxt.dev/) - Next-gen Web Extension Framework
- [Chrome tabCapture API](https://developer.chrome.com/docs/extensions/reference/api/tabCapture)
- [Chrome Offscreen Documents](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [ElevenLabs Realtime STT](https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime)
- [OpenRouter Streaming API](https://openrouter.ai/docs/api/reference/streaming)
- [AudioWorklet MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [Chrome Audio Recording Guide](https://developer.chrome.com/docs/extensions/mv3/screen_capture)
- [Zustand Chrome Extension Integration](https://github.com/nicholasgriffintn/webext-pegasus)
- [2025 Browser Extension Framework Comparison](https://redreamality.com/blog/the-2025-state-of-browser-extension-frameworks-a-comparative-analysis-of-plasmo-wxt-and-crxjs/)
