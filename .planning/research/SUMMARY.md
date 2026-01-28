# Project Research Summary

**Project:** AI Interview Assistant Chrome Extension
**Domain:** Chrome MV3 Extension with Real-Time Audio and LLM Integration
**Researched:** 2026-01-28
**Confidence:** HIGH

## Executive Summary

The AI Interview Assistant is a Chrome MV3 extension that provides real-time transcription and AI-powered response suggestions during online interviews (Google Meet, Zoom, Teams). The research reveals a technically demanding product that requires careful architectural decisions to overcome Chrome's Service Worker limitations, particularly the 30-second idle timeout that kills WebSocket connections. The solution is the Offscreen Document pattern, where persistent connections live in a hidden DOM-enabled page while the Service Worker coordinates operations.

The recommended approach centers on WXT as the build framework, React 19 for UI, Zustand for state management, and direct WebSocket/fetch connections (minimal dependencies) to ElevenLabs for STT and OpenRouter for LLM streaming. The competitive analysis identifies a unique differentiator: dual parallel LLM responses (fast hint + full answer) that directly address the core user anxiety of "what do I say RIGHT NOW?" Most competitors provide only a single response, creating a delay before the user can speak.

The critical risks are Service Worker termination breaking connections (mitigated by Offscreen Document), audio capture muting tab playback (mitigated by routing audio back through AudioContext), and CSP restrictions blocking external connections (mitigated by explicit manifest configuration). The build order must follow strict dependencies: Foundation → Audio Pipeline → STT → LLM → Polish. Attempting to parallelize prematurely will fail due to tight coupling between audio capture and Service Worker coordination.

## Key Findings

### Recommended Stack

Chrome MV3 extensions with real-time audio require a modern, lightweight stack that minimizes bundle size and respects browser constraints. The research strongly favors WXT over alternatives like Plasmo (maintenance concerns, larger bundles) and CRXJS (seeking maintainers, may archive June 2025). WXT provides superior HMR, 5x smaller builds (~400KB vs 700KB+), and active development with v1.0 imminent.

**Core technologies:**
- **WXT ^0.20.11:** Extension framework (Vite-based) — superior HMR, active maintenance, framework-agnostic with excellent React support
- **React 19.2.3 + React DOM:** UI framework — stable release, native `useSyncExternalStore` for extension state, best ecosystem support
- **Zustand 5.0.10:** State management — 2KB gzipped, minimal boilerplate, excellent Chrome extension support via `@webext-pegasus/store-zustand`
- **Tailwind CSS 4.1.18:** Styling — 5x faster builds, Vite plugin, native cascade layers prevent content script conflicts
- **Native WebSocket + fetch:** API integrations — smaller bundle than SDKs, direct control over connections, lower latency
- **AudioWorklet + Web Audio API:** Audio processing — zero-latency processing, replaces deprecated ScriptProcessorNode, native Chrome support

**Version requirements:**
- TypeScript 5.7.3 for type safety
- Vite 7.3.1 (powers WXT)
- @types/chrome for extension APIs
- ElevenLabs WebSocket endpoint: `wss://api.elevenlabs.io/v1/speech-to-text/realtime`
- OpenRouter HTTPS streaming: `https://openrouter.ai/api/v1/chat/completions`

**What NOT to use:**
- Plasmo Framework (maintenance mode, outdated Parcel bundler)
- ScriptProcessorNode (deprecated, causes latency)
- Redux/RTK (15KB+ vs Zustand's 2KB, excessive boilerplate)
- Full ElevenLabs Node SDK in browser (Node-focused, unnecessary bundle size)
- React Query (overkill for WebSocket streams)
- Tailwind v3 CDN (MV3 forbids external scripts)

### Expected Features

The competitive landscape includes Final Round AI, LockedIn AI, Interview Coder, Beyz AI, Tactiq, and VoiceMeetAI. Research reveals clear table stakes (features that are mandatory to compete) and opportunities for differentiation.

**Must have (table stakes):**
- Real-time transcription with < 500ms latency — every competitor provides instant visual feedback
- LLM-powered responses with streaming — core value proposition, expected by users
- Floating overlay UI (draggable, resizable, minimize) — unobtrusive but accessible interface
- Hotkey-driven capture — precise control over what gets sent to LLM
- API key storage and settings persistence — basic usability requirement
- Copy to clipboard functionality — expected workflow integration

**Should have (competitive advantages):**
- Dual parallel LLM responses (fast hint + full answer) — PRIMARY DIFFERENTIATOR, addresses "what do I say RIGHT NOW?" anxiety
- Hotkey hold-to-capture mode — natural gesture under pressure, more precise than auto-detection
- Multiple prompt templates (System Design, Coding, Behavioral) — pre-optimized for interview types
- Transparent blur overlay — see meeting and assistant simultaneously, less "cheating" feel
- Auto language detection (29+ languages via ElevenLabs) — differentiator for international candidates

**Defer to v2+:**
- Session history and transcript export — secondary to core "get useful responses fast" value
- Multiple STT providers with fallback — one reliable provider beats three mediocre integrations
- Mock interview system — different product category, saturated market

**Anti-features (deliberately avoid):**
- Stealth mode/screen share invisibility — high complexity, detection risk, ethical concerns, legal exposure
- Audio recording/storage — two-party consent laws, privacy liability, not needed for use case
- Coding solution generation — detection risk, definitionally cheating, scope creep
- Desktop application (v1) — distribution complexity, maintenance burden, browser sufficiency
- Built-in mock interviews — different product, scope creep

**Total estimated effort for v1:** 15-20 days of focused development

### Architecture Approach

Chrome MV3 extensions with audio processing require a multi-component architecture due to Service Worker limitations (30-second idle timeout, no DOM access). The solution is the Offscreen Document pattern, where a hidden DOM-enabled page maintains persistent WebSocket connections while the Service Worker coordinates operations and handles LLM streaming.

**Major components:**
1. **Service Worker (Background Script)** — Central orchestrator, handles extension lifecycle, obtains tabCapture stream IDs (requires user gesture), routes messages between components, manages Offscreen Document creation, executes LLM API calls (fetch + SSE streaming)
2. **Offscreen Document** — WebSocket connection holder for ElevenLabs STT, stays alive for hours as long as it's fulfilling its purpose, receives PCM audio chunks via message passing, forwards transcripts back to Service Worker
3. **Content Script** — Page integration layer, receives stream ID from Service Worker, creates MediaStream from getUserMedia, sets up AudioContext and AudioWorklet for PCM conversion, injects overlay UI via Shadow DOM, handles hotkey detection
4. **AudioWorklet Processor** — Real-time audio processing in dedicated audio thread, resamples to 16kHz, converts Float32 to PCM 16-bit Int16, buffers into 100ms chunks, posts to main thread via MessagePort
5. **Popup** — Settings and API key management, start/stop controls, prompt template editor
6. **Overlay (Shadow DOM)** — Live transcript display, dual response panel (fast hint + full answer), hotkey capture indicator, drag/resize functionality, isolated from host page styles

**Communication pattern:**
- AudioWorklet → Content Script (MessagePort): PCM chunks
- Content Script → Service Worker (chrome.runtime.sendMessage): Audio chunks, hotkey events
- Service Worker → Offscreen (chrome.runtime.sendMessage): Audio chunks, connect/disconnect
- Offscreen → ElevenLabs (WebSocket): Base64-encoded audio, receives transcripts
- Service Worker → OpenRouter (fetch + SSE): LLM requests, streams responses
- Service Worker → Content Script (chrome.tabs.sendMessage): Transcripts, LLM chunks

**Critical architectural constraints:**
- Service Workers have 30-second idle timeout (extended to ~5 minutes with active events)
- Only one Offscreen Document per profile
- tabCapture requires explicit user gesture from visible UI (popup/action click)
- Shadow DOM required for style isolation in content scripts
- AudioWorklet must return true from process() or Chrome garbage collects it

### Critical Pitfalls

Research identified 17 documented pitfalls, prioritized by impact and phase relevance.

1. **Service Worker Termination Kills Active Connections** — Chrome terminates service workers after 30 seconds idle or 5 minutes active. WebSocket/SSE connections die unpredictably. PREVENTION: Run WebSocket in Offscreen Document, not Service Worker. Store critical state in chrome.storage.session. Implement heartbeat/ping-pong every 20 seconds. Design for this from day one or complete rebuild required.

2. **tabCapture Mutes Tab Audio by Default** — When you capture a tab's MediaStream, audio stops playing to the user. Users will think their audio is broken and won't hear the interviewer. PREVENTION: Create AudioContext and pipe stream back to speakers via `source.connect(audioContext.destination)`. Critical for initial prototype or user testing will fail immediately.

3. **Global State Lost on Service Worker Restart** — All JavaScript global variables wiped when service worker restarts (every 30 seconds to 5 minutes). Mid-interview restart means complete context loss. PREVENTION: Use chrome.storage.session for ephemeral state (max 10MB), chrome.storage.local for persistent settings. Save state continuously, not just on suspend. Implement state rehydration on startup.

4. **tabCapture Requires User Gesture from Visible UI** — Cannot be called from service worker or after popup dismissal. Silent/automatic capture won't work. PREVENTION: Initiate capture from popup click handler that keeps popup open, or open dedicated setup tab. Use streamId immediately (expires after a few seconds).

5. **CSP Blocking External WebSocket Connections** — Default Content Security Policy won't allow connections to ElevenLabs or OpenRouter. WebSocket handshakes fail silently with cryptic CSP errors. PREVENTION: Add to manifest.json: `"content_security_policy": { "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self' wss://api.elevenlabs.io https://openrouter.ai https://*.openrouter.ai;" }`

**Additional high-impact pitfalls:**
- Shadow DOM CSS isolation fails (React injects styles into document.head, not shadow root) — use Emotion CacheProvider or react-shadow package, avoid rem units
- AudioWorklet memory leaks from improper cleanup — preallocate buffers, call close() on MessagePort, audioContext.close() when done
- SSE streaming response parsing errors — handle comment payloads, non-JSON content gracefully, some responses contain [DONE] or empty data
- Service worker broken after extension auto-update — Chrome bug causes two workers (old activated but broken, new installed but waiting), handle onUpdateAvailable
- ElevenLabs PCM format mismatch — expects 16-bit little-endian mono at 16/22.05/24/44.1kHz, AudioWorklet produces Float32Array, conversion errors cause garbled audio

## Implications for Roadmap

Based on research, suggested phase structure with strict ordering due to dependencies:

### Phase 1: Foundation & Extension Shell
**Rationale:** Must establish basic extension structure, manifest configuration, and message passing before any audio or API work. CSP configuration, permission declarations, and Service Worker event registration MUST be synchronous and correct from day one or everything fails.

**Delivers:** Extension loads successfully, popup opens, basic message passing works between Service Worker and Content Script, Shadow DOM container renders

**Addresses:**
- Manifest V3 permissions (tabCapture, offscreen, storage, activeTab)
- CSP configuration for WebSocket connections (prevents Pitfall #5)
- Synchronous event listener registration (prevents Pitfall #14)
- chrome.storage setup for state persistence (prevents Pitfall #4)

**Avoids:**
- CSP blocking external connections (Pitfall #5)
- Event listeners not registered synchronously (Pitfall #14)

**Research flag:** Standard patterns, skip research-phase. Well-documented Chrome extension setup.

### Phase 2: Audio Pipeline (Critical Path)
**Rationale:** Audio capture is the most technically complex component and has the most dependencies. Offscreen Document pattern must be implemented correctly from the start (cannot retrofit). AudioWorklet setup requires understanding of Chrome's audio processing constraints. This phase is the highest risk for project failure.

**Delivers:** Click start → tab audio captured → PCM chunks flowing through AudioWorklet → logged in console, audio still playing to user (passthrough working)

**Addresses:**
- AudioWorklet for low-latency processing (replaces deprecated ScriptProcessorNode)
- Offscreen Document creation and lifecycle management
- tabCapture user gesture handling from popup
- Audio routing to keep speakers working
- Float32 to Int16 PCM conversion for ElevenLabs

**Avoids:**
- Service Worker connection termination (Pitfall #1) — WebSocket will go in Offscreen
- tabCapture muting audio (Pitfall #2) — audio passthrough implemented
- tabCapture user gesture requirement (Pitfall #4) — initiated from popup click
- AudioWorklet memory leaks (Pitfall #7) — preallocate buffers, proper cleanup
- PCM format mismatch (Pitfall #10) — correct conversion implemented

**Research flag:** NEEDS DEEPER RESEARCH. Complex integration with Chrome APIs, audio format requirements, AudioWorklet specifics. Suggest `/gsd:research-phase "Phase 2: Audio Pipeline"` before implementation.

### Phase 3: STT Integration
**Rationale:** Depends on Phase 2 audio pipeline being complete. WebSocket connection to ElevenLabs must live in Offscreen Document (not Service Worker). Once audio chunks flow correctly, STT integration is straightforward API work.

**Delivers:** Speak → see live transcript in overlay, partial and final results displayed, auto-scroll working

**Addresses:**
- ElevenLabs WebSocket adapter in Offscreen Document
- Base64 encoding of PCM audio for transmission
- Partial vs final transcript handling
- Basic React overlay with transcript display
- Message routing from Offscreen → Service Worker → Content Script

**Avoids:**
- Service Worker connection termination (Pitfall #1) — WebSocket in Offscreen Document
- SSE parsing errors (Pitfall #8) — not applicable yet (OpenRouter in Phase 4)

**Research flag:** Standard patterns, skip research-phase. ElevenLabs API is well-documented, WebSocket pattern established in Phase 2.

### Phase 4: LLM Integration & Dual Response
**Rationale:** Depends on Phase 3 STT working to provide transcript text for LLM context. Dual parallel response is the PRIMARY DIFFERENTIATOR and must be implemented correctly. OpenRouter fetch + SSE streaming can live in Service Worker (short-lived requests, not persistent connection).

**Delivers:** Hold hotkey → capture transcript → release → see fast hint appear immediately, full answer streams in, both displayed in dual panel UI

**Addresses:**
- OpenRouter fetch with SSE streaming (native, no SDK)
- Dual parallel requests (Gemini Flash for fast hint, Claude Haiku for full answer)
- Hotkey system (hold-to-capture mode with key event handling)
- Prompt variable substitution ($highlighted, $recent context)
- Response UI with streaming text display
- Copy to clipboard functionality

**Avoids:**
- SSE parsing errors (Pitfall #8) — handle non-JSON payloads, [DONE] markers
- OpenRouter rate limits (Pitfall #13) — show clear error states, fallback model config

**Research flag:** NEEDS RESEARCH FOR DUAL STREAMING. Parallel promise handling, UI coordination for two simultaneous streams, cancellation handling if user triggers again. Standard patterns for individual components (hotkey, SSE), but novel combination.

### Phase 5: Polish, Settings & Templates
**Rationale:** Core functionality complete, now improve UX and configurability. No blocking dependencies. Can parallelize some tasks (settings panel, drag/resize, templates).

**Delivers:** Production-ready UX with API key management, model selection, hotkey configuration, prompt templates (System Design, Coding, Behavioral), custom template CRUD, overlay drag/resize/minimize, position persistence, error handling with toast notifications

**Addresses:**
- Settings panel in popup for API keys, preferences
- Prompt template system (default + custom)
- Overlay positioning features (drag, resize, minimize)
- chrome.storage persistence for settings and position
- Error recovery and user notifications

**Avoids:**
- Shadow DOM CSS issues (Pitfall #6) — resolved in Phase 3 setup
- Content script memory leaks (Pitfall #12) — cleanup on unload, disconnect observers

**Research flag:** Standard patterns, skip research-phase. Well-established UI/UX patterns for Chrome extensions.

### Phase Ordering Rationale

1. **Foundation first (Phase 1):** No alternatives. Cannot proceed without manifest, permissions, CSP configuration. Mistakes here require complete rebuild.

2. **Audio before STT (Phase 2 → Phase 3):** STT requires audio chunks. Cannot test STT without working audio pipeline. Offscreen Document architecture must be correct from start.

3. **STT before LLM (Phase 3 → Phase 4):** LLM needs transcript text as input. Hotkey capture accumulates transcript segments from STT.

4. **Polish last (Phase 5):** Settings and templates enhance usability but aren't blocking. Can be added after core value (transcription + responses) works.

5. **Cannot parallelize phases 2-4:** Tight coupling through data flow (audio → transcription → LLM input). Attempting parallel development will cause integration issues.

### Research Flags

**Phases needing deeper research during planning:**

- **Phase 2 (Audio Pipeline):** Complex Chrome API integration, AudioWorklet specifics, Offscreen Document lifecycle, PCM format requirements, audio passthrough patterns. HIGH PRIORITY for `/gsd:research-phase` — this is the most technically risky phase.

- **Phase 4 (Dual LLM Streaming):** Parallel SSE stream handling, UI coordination for simultaneous updates, cancellation/cleanup if user triggers again before completion, error handling for partial failures. MEDIUM PRIORITY for research — novel pattern, not well-documented.

**Phases with standard patterns (skip research-phase):**

- **Phase 1 (Foundation):** Standard Chrome extension setup, well-documented manifest configuration
- **Phase 3 (STT Integration):** ElevenLabs API well-documented, WebSocket pattern established in Phase 2
- **Phase 5 (Polish):** Standard UI/UX patterns for extensions, settings persistence is straightforward

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | Clear 2025 consensus on WXT, React 19, Zustand 5. Multiple sources confirm. Native WebSocket/fetch approach verified in working extensions. |
| Features | **HIGH** | Competitive analysis comprehensive (6+ competitors), table stakes vs differentiators clearly delineated, dual response differentiator validated against market gaps. |
| Architecture | **HIGH** | Offscreen Document pattern required by MV3 constraints (verified in Chrome docs), component responsibilities well-defined, build order validated by dependency analysis. |
| Pitfalls | **HIGH** | 17 pitfalls documented with prevention strategies, sourced from Chrome docs, GitHub issues, production postmortems, extension developer communities. |

**Overall confidence:** **HIGH**

The research is comprehensive with strong source quality. Chrome MV3 constraints are official and unchanging. Stack choices are backed by 2025 comparisons and active maintenance verification. Feature prioritization is grounded in competitive analysis. Architecture is dictated by platform constraints (not opinions). Pitfalls are sourced from production failures and official Chrome guidance.

### Gaps to Address

Minor gaps that need resolution during planning/execution:

- **Buffer size optimization:** Research suggests 128 samples with `latencyHint: 'interactive'` but actual latency depends on user hardware. Plan for testing across devices and potential adaptive buffer sizing. TARGET: < 500ms end-to-end latency. (Address during Phase 2 performance testing)

- **OpenRouter model selection for dual response:** Research recommends Gemini Flash (fast) + Claude Haiku (full), but optimal model pairing needs empirical validation. Rate limits and cost vary by model. (Address during Phase 4 implementation with A/B testing)

- **Shadow DOM style injection specifics:** Multiple approaches mentioned (Emotion CacheProvider, react-shadow package). Need to test on aggressive CSS sites (Gmail, Notion) to validate chosen approach. (Address during Phase 3 UI implementation with real-world testing)

- **Offscreen Document valid reasons:** Research lists `AUDIO_PLAYBACK` and `USER_MEDIA` as valid reasons, but Chrome may enforce 30-second auto-close for AUDIO_PLAYBACK without actual sound. May need to test both. (Address during Phase 2 with documentation check)

- **Service Worker update handling strategy:** Multiple options (onUpdateAvailable with graceful reload, restart extension button, allow idle periods). Need to define specific UX flow. (Address during Phase 5 with user testing)

These gaps are low-risk and can be resolved through testing during implementation. None block initial development.

## Sources

### Primary (HIGH confidence)
- [Chrome Extension Official Documentation](https://developer.chrome.com/docs/extensions/) — Manifest V3, Service Workers, tabCapture, Offscreen API, message passing, CSP configuration
- [WXT Framework Documentation](https://wxt.dev/) — Build system, HMR, React integration, manifest configuration
- [ElevenLabs Realtime STT API](https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime) — WebSocket endpoint, PCM format requirements, session configuration
- [OpenRouter API Documentation](https://openrouter.ai/docs/api/reference/streaming) — SSE streaming, rate limits, error handling
- [Web Audio API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) — AudioWorklet, AudioContext, latency configuration

### Secondary (MEDIUM confidence)
- [2025 Browser Extension Framework Comparison](https://redreamality.com/blog/the-2025-state-of-browser-extension-frameworks-a-comparative-analysis-of-plasmo-wxt-and-crxjs/) — WXT vs Plasmo vs CRXJS comparison
- [Chrome Extension Service Worker Lifecycle](https://developer.chrome.com/blog/longer-esw-lifetimes) — Timeout behavior, keep-alive strategies
- [Chrome tabCapture API Reference](https://developer.chrome.com/docs/extensions/reference/api/tabCapture) — User gesture requirements, MediaStream handling
- [Shadow DOM CSS Isolation Guide](https://dev.to/developertom01/solving-css-and-javascript-interference-in-chrome-extensions-a-guide-to-react-shadow-dom-and-best-practices-9l) — Content script styling approaches
- [Recall.ai Chrome Recording Extension Guide](https://www.recall.ai/blog/how-to-build-a-chrome-recording-extension) — Audio passthrough pattern, tabCapture best practices

### Tertiary (LOW confidence, needs validation)
- [Beyz AI Blog - Top AI Interview Assistants](https://beyz.ai/blog/top-10-ai-interview-assistants-in-2025-tested-by-users) — Competitive feature analysis (marketing-focused, may be biased)
- [Senseo Copilot Blog - AI Interview Tools Comparison](https://www.senseicopilot.com/blog/top-ai-interview-tools-2025) — Feature comparison (blog post, not verified hands-on)
- Community discussions (GitHub issues, Stack Overflow, Google Groups) — Specific pitfall reports, workarounds (variable quality, verify during implementation)

---

*Research completed: 2026-01-28*
*Ready for roadmap: yes*
*Synthesized from: STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md*
