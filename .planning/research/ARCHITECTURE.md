# Architecture Research

## Executive Summary

Chrome MV3 extensions with real-time audio processing require a multi-component architecture due to Service Worker limitations. The key challenge is that Service Workers have a 30-second idle timeout, which kills WebSocket connections. The solution is the **Offscreen Document pattern** - a hidden DOM-enabled page that can maintain persistent connections while the Service Worker coordinates operations.

This document outlines the component structure, communication patterns, and build order for the AI Interview Assistant Chrome Extension.

---

## Component Overview

### 1. Service Worker (Background Script)

**Role:** Central orchestrator and event coordinator

**Responsibilities:**
- Handles extension lifecycle events (install, activate, action clicks)
- Manages permissions and user gestures
- Obtains `tabCapture` stream IDs (requires user gesture)
- Routes messages between components
- Coordinates Offscreen Document creation/teardown
- Manages chrome.storage operations
- Handles LLM API calls (SSE streaming via fetch)

**Limitations:**
- No DOM access
- 30-second idle timeout (extended to ~5 minutes with active events)
- Cannot hold WebSocket connections reliably
- State must be persisted to storage (no long-lived variables)

**Key APIs:**
- `chrome.tabCapture.getMediaStreamId()`
- `chrome.offscreen.createDocument()`
- `chrome.runtime.sendMessage()` / `onMessage`
- `chrome.storage.local`
- `chrome.action.onClicked`

### 2. Offscreen Document

**Role:** WebSocket connection holder for STT

**Responsibilities:**
- Maintains persistent WebSocket to ElevenLabs STT
- Receives PCM audio chunks via message passing
- Encodes audio to base64 and sends to STT service
- Receives transcription results
- Forwards transcripts back to Service Worker

**Permissions:**
- Created with reason: `'USER_MEDIA'` or `'AUDIO_PLAYBACK'`
- Only `chrome.runtime` API available (messaging only)
- Full DOM access within the document

**Lifecycle:**
- Created by Service Worker when recording starts
- One per extension profile (limitation)
- Stays alive while extension is active
- Can outlive the Service Worker that created it

**Key Constraint:** Must be a static HTML file bundled with extension.

### 3. Content Script

**Role:** Page integration and audio capture

**Responsibilities:**
- Receives stream ID from Service Worker
- Creates MediaStream from `navigator.mediaDevices.getUserMedia()`
- Sets up AudioContext and AudioWorklet for PCM conversion
- Sends audio chunks to Service Worker (forwarded to Offscreen)
- Injects overlay UI via Shadow DOM
- Handles hotkey detection on the page
- Manages DOM interactions (text selection for manual mode)

**Permissions:**
- Runs in page context (isolated world)
- Access to DOM of host page
- Can use Web Audio API
- Communicates via `chrome.runtime.sendMessage()`

**Isolation:** Shadow DOM prevents CSS conflicts with host page.

### 4. AudioWorklet Processor

**Role:** Real-time audio processing

**Responsibilities:**
- Receives raw audio samples at native sample rate
- Resamples to 16kHz (ElevenLabs requirement)
- Converts Float32 to PCM 16-bit Int16
- Buffers into chunks (100ms = 1600 samples)
- Posts chunks to main thread via MessagePort

**Key Characteristic:** Runs in audio thread, separate from main thread. Must be a separate `.js` file registered via `addModule()`.

### 5. Popup (Extension UI)

**Role:** Settings and quick controls

**Responsibilities:**
- Start/stop recording button
- API key management
- Settings configuration
- Prompt template editing
- Session history access

**Framework:** React + Tailwind CSS in isolated popup context.

### 6. Overlay (Content Script UI)

**Role:** In-page transcription and response display

**Responsibilities:**
- Live transcript display with auto-scroll
- Dual response panel (fast hint + full answer)
- Hotkey capture indicator
- Drag/resize functionality
- Copy to clipboard
- Text selection for manual mode

**Isolation:** Rendered inside Shadow DOM to prevent style conflicts.

---

## Communication Patterns

### Message Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Browser Tab                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         Content Script                                │    │
│  │  ┌──────────────┐    ┌──────────────┐    ┌─────────────────────┐    │    │
│  │  │ AudioWorklet │───>│ Audio Capture│───>│ Overlay (Shadow DOM)│    │    │
│  │  │  Processor   │    │   Manager    │    │   React UI          │    │    │
│  │  └──────────────┘    └──────┬───────┘    └──────────┬──────────┘    │    │
│  │                              │                       │                │    │
│  └──────────────────────────────┼───────────────────────┼────────────────┘    │
│                                 │                       │                     │
└─────────────────────────────────┼───────────────────────┼─────────────────────┘
                                  │                       │
                    chrome.runtime│.sendMessage           │chrome.runtime
                                  │                       │.sendMessage
                                  ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Service Worker                                     │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  - Message Router                                                       │ │
│  │  - tabCapture.getMediaStreamId()                                       │ │
│  │  - offscreen.createDocument()                                          │ │
│  │  - LLM API calls (fetch + SSE)                                         │ │
│  │  - storage operations                                                   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │
                chrome.runtime│.sendMessage
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Offscreen Document                                   │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  - WebSocket to ElevenLabs STT                                         │ │
│  │  - Receives audio chunks                                                │ │
│  │  - Sends base64-encoded PCM                                            │ │
│  │  - Receives transcripts                                                 │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │
                         WebSocket
                              │
                              ▼
                    ┌─────────────────┐
                    │  ElevenLabs STT │
                    │   wss://api...  │
                    └─────────────────┘
```

### Message Types

**Content Script -> Service Worker:**
```typescript
| Message Type     | Purpose                              |
|------------------|--------------------------------------|
| START_RECORDING  | User clicked start                   |
| STOP_RECORDING   | User clicked stop                    |
| AUDIO_CHUNK      | PCM data from AudioWorklet           |
| HOTKEY_TRIGGER   | User completed hotkey gesture        |
| TEXT_SELECTED    | User selected text (manual mode)     |
```

**Service Worker -> Content Script:**
```typescript
| Message Type     | Purpose                              |
|------------------|--------------------------------------|
| STREAM_ID        | tabCapture stream ID for audio       |
| TRANSCRIPT       | New transcript segment               |
| LLM_CHUNK        | Streaming LLM response chunk         |
| LLM_COMPLETE     | LLM response finished                |
| STATE_UPDATE     | Recording/capture state change       |
| ERROR            | Error notification                   |
```

**Service Worker -> Offscreen Document:**
```typescript
| Message Type     | Purpose                              |
|------------------|--------------------------------------|
| CONNECT_STT      | Initialize WebSocket with API key    |
| AUDIO_CHUNK      | Forward PCM data                     |
| DISCONNECT_STT   | Close WebSocket                      |
```

**Offscreen Document -> Service Worker:**
```typescript
| Message Type     | Purpose                              |
|------------------|--------------------------------------|
| STT_CONNECTED    | WebSocket connected                  |
| STT_TRANSCRIPT   | Transcript result (partial/final)   |
| STT_ERROR        | Connection or auth error             |
| STT_DISCONNECTED | WebSocket closed                     |
```

### Message Passing Best Practices

1. **Always return `true` from async listeners** - Keeps channel open for sendResponse
2. **Use typed message interfaces** - Prevents runtime errors
3. **Handle disconnected contexts** - Service Worker may restart
4. **Validate message sources** - Security against malicious pages
5. **Keep payloads small** - Large binary data should use chunking

---

## Data Flow

### Complete Recording Flow

```
1. USER ACTION: Click "Start Recording" in popup/overlay
   │
   ├── Popup/Overlay sends START_RECORDING to Service Worker
   │
2. SERVICE WORKER: Request tab capture permission
   │
   ├── chrome.tabCapture.getMediaStreamId({ targetTabId })
   ├── Creates Offscreen Document (if not exists)
   ├── Sends CONNECT_STT to Offscreen with API key
   ├── Sends STREAM_ID to Content Script
   │
3. OFFSCREEN DOCUMENT: Establish STT connection
   │
   ├── Opens WebSocket to wss://api.elevenlabs.io/v1/speech-to-text/realtime
   ├── Sends session_config message
   ├── Notifies Service Worker: STT_CONNECTED
   │
4. CONTENT SCRIPT: Initialize audio capture
   │
   ├── navigator.mediaDevices.getUserMedia({ audio: { chromeMediaSource: 'tab', chromeMediaSourceId } })
   ├── Create AudioContext (16kHz sample rate)
   ├── Load AudioWorklet processor module
   ├── Connect: MediaStreamSource -> AudioWorkletNode
   ├── Also connect source to destination (to keep audio playing)
   │
5. AUDIO WORKLET: Process audio (runs continuously)
   │
   ├── Receive Float32 samples
   ├── Convert to Int16 PCM
   ├── Buffer to 100ms chunks
   ├── Post chunk to Content Script main thread
   │
6. CONTENT SCRIPT: Forward audio chunks
   │
   ├── Receive chunk from AudioWorklet port.onmessage
   ├── Send AUDIO_CHUNK to Service Worker
   │
7. SERVICE WORKER: Route to Offscreen
   │
   ├── Forward AUDIO_CHUNK to Offscreen Document
   │
8. OFFSCREEN DOCUMENT: Send to STT
   │
   ├── Base64 encode PCM data
   ├── Send { type: 'input_audio_chunk', audio: base64 } via WebSocket
   │
9. ELEVENLABS STT: Process and respond
   │
   ├── Returns partial_transcript (interim results)
   ├── Returns committed_transcript (final results)
   │
10. OFFSCREEN -> SERVICE WORKER -> CONTENT SCRIPT: Transcript delivery
    │
    ├── Offscreen receives WebSocket message
    ├── Sends STT_TRANSCRIPT to Service Worker
    ├── Service Worker sends TRANSCRIPT to Content Script
    ├── Overlay UI renders transcript segment
```

### Hotkey Capture Flow (Hold Mode)

```
1. USER: Press and hold Space key
   │
   ├── Content Script captures keydown event
   ├── Starts accumulating transcript text
   ├── Updates UI: "Capturing..."
   │
2. TRANSCRIPT CONTINUES: New segments arrive
   │
   ├── Each segment appended to captured text
   │
3. USER: Release Space key
   │
   ├── Content Script captures keyup event
   ├── Collects all accumulated text
   ├── Sends HOTKEY_TRIGGER { text, mode: 'hold' } to Service Worker
   │
4. SERVICE WORKER: Launch dual LLM requests
   │
   ├── Substitutes $highlighted variable in prompts
   ├── Parallel fetch to OpenRouter:
   │   ├── Fast model (Gemini Flash) -> 150 max tokens
   │   └── Full model (Claude Haiku) -> 1024 max tokens
   ├── Both requests use stream: true (SSE)
   │
5. SERVICE WORKER: Stream responses to Content Script
   │
   ├── As chunks arrive, send LLM_CHUNK { type: 'fast'|'full', content }
   ├── On completion, send LLM_COMPLETE { type: 'fast'|'full' }
   │
6. CONTENT SCRIPT: Update overlay
   │
   ├── Fast response appears in "Quick Hint" section
   ├── Full response streams in "Full Answer" section
   ├── Both update simultaneously as chunks arrive
```

---

## Chrome MV3 Considerations

### Service Worker Idle Timeout

**Problem:** Service Workers terminate after 30 seconds of inactivity. WebSocket connections in the Service Worker would be killed.

**Solution:** Offscreen Document Pattern
- WebSocket lives in Offscreen Document (has DOM, persists)
- Service Worker only handles coordination
- Message passing keeps Service Worker alive during active use

**Keep-Alive Strategies (if needed):**
1. WebSocket messages reset the timer (Chrome 116+)
2. Periodic chrome.runtime.sendMessage between components
3. chrome.alarms for scheduled wake-ups

### Offscreen Document Constraints

1. **One per profile** - Cannot create multiple offscreen documents
2. **No extension APIs** - Only `chrome.runtime` for messaging
3. **Must be bundled** - URL must be a static file in extension package
4. **Reason required** - Must specify valid reason from enum

**Valid Reasons for Audio:**
- `USER_MEDIA` - For getUserMedia operations
- `AUDIO_PLAYBACK` - For playing audio (30s auto-close without sound)

### Permission Model

```json
{
  "permissions": [
    "tabCapture",      // Required for audio capture
    "offscreen",       // Required for Offscreen Document
    "storage",         // For settings persistence
    "activeTab",       // Current tab access
    "scripting"        // Content script injection
  ]
}
```

### User Gesture Requirements

- `tabCapture.getMediaStreamId()` requires user gesture
- Typically triggered from popup click or action button
- Cannot start capture programmatically without interaction

---

## Suggested Build Order

### Phase 1: Foundation (No External Dependencies)

**Goal:** Basic extension structure that loads and communicates

1. **Project Setup**
   - Initialize Vite + CRXJS
   - Configure TypeScript
   - Set up Tailwind CSS
   - Create manifest.json with permissions

2. **Service Worker Shell**
   - Basic event listeners (install, activate)
   - Message routing infrastructure
   - Typed message interfaces

3. **Content Script Shell**
   - Basic injection
   - Message passing to Service Worker
   - Shadow DOM container setup

**Deliverable:** Extension loads, popup opens, message passing works.

### Phase 2: Audio Pipeline (Critical Path)

**Goal:** Capture tab audio and see PCM chunks flowing

4. **AudioWorklet Processor**
   - Float32 to Int16 conversion
   - Chunking logic (100ms)
   - MessagePort communication

5. **Content Script Audio Capture**
   - getUserMedia with stream ID
   - AudioContext setup
   - WorkletNode connection
   - Audio passthrough (keep playing)

6. **Offscreen Document**
   - Basic HTML + script
   - Message listener
   - WebSocket stub (connect/disconnect)

7. **Service Worker Coordination**
   - tabCapture.getMediaStreamId()
   - Offscreen document creation
   - Audio chunk routing

**Deliverable:** Click start -> audio captured -> chunks logged.

### Phase 3: STT Integration

**Goal:** Live transcription working

8. **ElevenLabs Adapter**
   - WebSocket connection to production endpoint
   - Session config message
   - Audio chunk encoding (base64)
   - Transcript message parsing

9. **Transcript Flow**
   - Offscreen -> SW -> Content Script pipeline
   - Partial vs final transcript handling

10. **Basic Overlay UI**
    - React setup in Shadow DOM
    - Simple transcript display
    - Auto-scroll

**Deliverable:** Speak -> see transcript in overlay.

### Phase 4: LLM Integration

**Goal:** Dual response system working

11. **OpenRouter Service**
    - Fetch with SSE streaming
    - Response chunk parsing
    - Dual parallel request handling

12. **Hotkey System**
    - Key event capture
    - Hold mode implementation
    - Text accumulation during capture

13. **Prompt Variable Substitution**
    - $highlighted replacement
    - $recent context (last 60s)

14. **Response UI**
    - Dual panel (fast + full)
    - Streaming text display
    - Copy to clipboard

**Deliverable:** Hold hotkey -> release -> get dual responses.

### Phase 5: Polish & Settings

**Goal:** Production-ready UX

15. **Settings Panel**
    - API key management
    - Model selection
    - Hotkey configuration

16. **Prompt Templates**
    - Default templates (System Design, Coding, Behavioral)
    - Custom template CRUD
    - Template switching

17. **Overlay Features**
    - Drag positioning
    - Resize handles
    - Minimize/expand
    - Position persistence

18. **Error Handling**
    - Toast notifications
    - Connection recovery
    - Graceful degradation

**Deliverable:** Full feature set, polished UX.

### Dependency Graph

```
Phase 1 ──────────────────────────────────────────────────┐
  │                                                        │
  ▼                                                        │
Phase 2 (Audio Pipeline)                                   │
  │                                                        │
  ├── AudioWorklet (no deps)                               │
  ├── Content Script Audio (depends on WorkletNode)        │
  ├── Offscreen Document (depends on message routing)      │
  └── SW Coordination (depends on all above)               │
       │                                                   │
       ▼                                                   │
Phase 3 (STT) ─────────────────────────────────────────────┤
  │                                                        │
  └── Depends on Phase 2 complete                          │
       │                                                   │
       ▼                                                   │
Phase 4 (LLM) ─────────────────────────────────────────────┤
  │                                                        │
  ├── OpenRouter Service (independent)                     │
  ├── Hotkey System (needs transcript flow from Phase 3)   │
  └── Response UI (needs hotkey + LLM service)             │
       │                                                   │
       ▼                                                   │
Phase 5 (Polish) ──────────────────────────────────────────┘
  │
  └── All features from Phase 1-4 must be working
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                    CHROME EXTENSION                                  │
│                                                                                      │
│  ┌────────────────────────────────────────────────────────────────────────────────┐ │
│  │                              SERVICE WORKER                                     │ │
│  │                           (Background Script)                                   │ │
│  │                                                                                 │ │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │ │
│  │   │   Message   │  │  TabCapture │  │  Offscreen  │  │   LLM Service       │  │ │
│  │   │   Router    │  │  Coordinator│  │  Manager    │  │   (OpenRouter)      │  │ │
│  │   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────────┬───────────┘  │ │
│  │          │                │                │                   │              │ │
│  └──────────┼────────────────┼────────────────┼───────────────────┼──────────────┘ │
│             │                │                │                   │                │
│             │  ┌─────────────┴────────────────┘                   │                │
│             │  │                                                   │                │
│             ▼  ▼                                                   │                │
│  ┌────────────────────────────────────────────────────────────────┼───────────────┐│
│  │                         OFFSCREEN DOCUMENT                      │              ││
│  │                                                                 │              ││
│  │   ┌──────────────────────────────────────────────────────────┐ │              ││
│  │   │                    ElevenLabs STT Adapter                 │ │              ││
│  │   │  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │ │              ││
│  │   │  │   WebSocket  │  │   Audio      │  │  Transcript    │  │ │              ││
│  │   │  │   Manager    │──│   Encoder    │  │  Parser        │  │ │              ││
│  │   │  └──────────────┘  └──────────────┘  └────────────────┘  │ │              ││
│  │   └───────────────────────────┬──────────────────────────────┘ │              ││
│  │                               │                                 │              ││
│  └───────────────────────────────┼─────────────────────────────────┼──────────────┘│
│                                  │                                 │               │
│                                  │ WebSocket                       │ HTTPS         │
│                                  ▼                                 ▼               │
│                         ┌────────────────┐               ┌───────────────────┐    │
│                         │  ElevenLabs    │               │    OpenRouter     │    │
│                         │  STT API       │               │    LLM API        │    │
│                         └────────────────┘               └───────────────────┘    │
│                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                    BROWSER TAB                                       │
│                              (e.g., Google Meet)                                     │
│                                                                                      │
│  ┌────────────────────────────────────────────────────────────────────────────────┐ │
│  │                              CONTENT SCRIPT                                     │ │
│  │                                                                                 │ │
│  │   ┌─────────────────────────────────────────────────────────────────────────┐  │ │
│  │   │                        Audio Capture Module                              │  │ │
│  │   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │  │ │
│  │   │  │ MediaStream  │  │ AudioContext │  │ AudioWorklet │                   │  │ │
│  │   │  │   Source     │──│   (16kHz)    │──│  Processor   │──────┐            │  │ │
│  │   │  └──────────────┘  └──────────────┘  └──────────────┘      │            │  │ │
│  │   └────────────────────────────────────────────────────────────┼────────────┘  │ │
│  │                                                                 │ PCM Chunks   │ │
│  │   ┌─────────────────────────────────────────────────────────────┼────────────┐ │ │
│  │   │                        SHADOW DOM                            │            │ │ │
│  │   │   ┌──────────────────────────────────────────────────────────▼──────┐    │ │ │
│  │   │   │                     OVERLAY (React)                             │    │ │ │
│  │   │   │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐│    │ │ │
│  │   │   │  │   Transcript   │  │   Response     │  │   Controls +       ││    │ │ │
│  │   │   │  │   Display      │  │   Panel (Dual) │  │   Hotkey Capture   ││    │ │ │
│  │   │   │  └────────────────┘  └────────────────┘  └────────────────────┘│    │ │ │
│  │   │   └─────────────────────────────────────────────────────────────────┘    │ │ │
│  │   └──────────────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                                 │ │
│  │   ┌─────────────────────────────────────────────────────────────────────────┐  │ │
│  │   │                        Hotkey Service                                    │  │ │
│  │   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │  │ │
│  │   │  │ Key Listener │  │ Text Capture │  │ Mode Handler │                   │  │ │
│  │   │  │ (hold/toggle)│──│ Accumulator  │──│ (3 modes)    │                   │  │ │
│  │   │  └──────────────┘  └──────────────┘  └──────────────┘                   │  │ │
│  │   └─────────────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                                 │ │
│  └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                      POPUP                                           │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │  │
│  │  │ Start/Stop  │  │  Settings   │  │  Prompts    │  │   API Keys          │   │  │
│  │  │  Controls   │  │   Panel     │  │   Editor    │  │   Management        │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Component Interaction Summary

| From | To | Method | Data |
|------|----|--------|------|
| Popup | Service Worker | `chrome.runtime.sendMessage` | Commands, settings |
| Content Script | Service Worker | `chrome.runtime.sendMessage` | Audio chunks, hotkey events |
| Service Worker | Content Script | `chrome.tabs.sendMessage` | Stream ID, transcripts, LLM responses |
| Service Worker | Offscreen | `chrome.runtime.sendMessage` | Audio chunks, connect/disconnect |
| Offscreen | Service Worker | `chrome.runtime.sendMessage` | Transcripts, connection state |
| AudioWorklet | Content Script | `MessagePort.postMessage` | PCM chunks |
| Offscreen | ElevenLabs | WebSocket | Audio (base64), config |
| Service Worker | OpenRouter | fetch (SSE) | LLM requests, streaming responses |

---

## References

- [Chrome Offscreen API Documentation](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Chrome tabCapture API](https://developer.chrome.com/docs/extensions/reference/api/tabCapture)
- [Audio Recording and Screen Capture Guide](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture)
- [Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [WebSockets in Service Workers](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets)
- [Message Passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [ElevenLabs Real-Time STT API](https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime)
- [Tab Capture Recorder Sample](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/sample.tabcapture-recorder)

---

*Last updated: 2025-01-28*
