# Features Research: AI Interview Assistant Chrome Extension

Research conducted: 2026-01-28

## Executive Summary

The AI interview assistant market has matured rapidly, with tools like Final Round AI, LockedIn AI, Interview Coder, and Beyz AI establishing clear expectations. This analysis categorizes features into table stakes (must-have to compete), differentiators (competitive advantages), and anti-features (things to deliberately avoid).

---

## Table Stakes

These are mandatory features. Without them, users will immediately leave for competitors.

### 1. Real-Time Transcription

| Feature | Description | Complexity | Dependencies |
|---------|-------------|------------|--------------|
| Tab audio capture | Chrome tabCapture API for Google Meet, Zoom, Teams | Medium | Chrome Manifest V3, Offscreen Document |
| Live transcript display | Show text as speech happens | Low | STT adapter |
| Partial/interim results | Show in-progress transcription before finalization | Low | WebSocket STT |
| Auto-scroll | Follow new transcript text | Low | None |
| Latency < 500ms | Critical for real-time use | High | STT provider choice, AudioWorklet optimization |

**Rationale**: Every competitor (Tactiq, Otter.ai, Bluedot, VoiceMeetAI) provides real-time transcription. Users expect instant visual feedback of what's being said.

### 2. LLM-Powered Responses

| Feature | Description | Complexity | Dependencies |
|---------|-------------|------------|--------------|
| Question-to-answer pipeline | Capture question -> send to LLM -> display answer | Medium | LLM API integration |
| Streaming responses | Show answer as it generates (not all at once) | Medium | SSE/streaming API |
| Copy to clipboard | One-click copy of answer | Low | None |
| Context awareness | Include recent conversation context | Low | Transcript state management |

**Rationale**: The core value proposition. Final Round AI, LockedIn AI, Interview Coder all provide real-time AI suggestions during interviews.

### 3. Basic Overlay UI

| Feature | Description | Complexity | Dependencies |
|---------|-------------|------------|--------------|
| Floating overlay | Always-on-top window over meeting | Medium | Shadow DOM injection |
| Draggable positioning | Move overlay anywhere on screen | Low | Drag handlers |
| Resizable | Adjust overlay dimensions | Low | Resize handlers |
| Minimize/expand | Collapse to small indicator | Low | State management |
| Visual styling | Clean, readable UI | Low | Tailwind CSS |

**Rationale**: Users need an unobtrusive but accessible interface. All competitors provide some form of overlay or side panel.

### 4. Configuration Management

| Feature | Description | Complexity | Dependencies |
|---------|-------------|------------|--------------|
| API key storage | Save ElevenLabs + OpenRouter keys securely | Low | chrome.storage |
| Settings persistence | Remember user preferences | Low | chrome.storage |
| Status indicators | Show connection state, recording state | Low | None |

**Rationale**: Basic usability requirement. Users won't re-enter API keys every session.

---

## Differentiators

These features distinguish the product from competitors and justify switching costs.

### 1. Dual Parallel LLM Responses (Primary Differentiator)

| Feature | Description | Complexity | Dependencies |
|---------|-------------|------------|--------------|
| Fast hint + Full answer | Two simultaneous LLM calls | Medium | Parallel async handling |
| Fast model for quick start | 1-2 sentence hint in < 1 second | Low | Fast model selection (Gemini Flash) |
| Full model for depth | Comprehensive streaming answer | Low | Capable model (Claude Haiku) |
| Visual separation | Clear distinction between hint and full answer | Low | UI design |

**Why differentiating**: Most competitors (Final Round AI, LockedIn AI, Beyz AI) provide a single response. The dual-response approach directly addresses the core anxiety: "What do I say RIGHT NOW?" The fast hint lets users start speaking confidently while the full answer streams in for depth.

**Complexity**: Medium - Requires parallel promise handling and UI coordination, but no new infrastructure.

### 2. Hotkey Capture Modes

| Feature | Description | Complexity | Dependencies |
|---------|-------------|------------|--------------|
| Hold-to-capture | Press and hold -> capture transcript -> release -> send | Medium | KeyboardEvent listeners |
| Toggle mode | Press once start, press again send | Low | State machine |
| Highlight-to-send | Select text in transcript, hotkey sends selection | Low | Selection API |
| Visual capture indicator | Pulse/highlight showing active capture | Low | CSS animations |

**Why differentiating**: Most tools auto-detect questions or require clicking buttons. The hold-to-capture gesture is natural under interview pressure - the user controls exactly what gets sent to the LLM. Competitors like Interview Coder auto-capture screenshots; this is more precise and less intrusive.

**Complexity**: Medium - Keyboard event handling across extension contexts requires careful message passing.

### 3. Multiple Prompt Templates

| Feature | Description | Complexity | Dependencies |
|---------|-------------|------------|--------------|
| Pre-built templates | System Design, Coding, Behavioral presets | Low | None |
| Template switching | Change prompts before/during interview | Low | State management |
| Custom templates | User-defined prompt templates | Medium | Template editor UI |
| Variable substitution | $highlighted, $recent, $transcript variables | Low | String replacement |

**Why differentiating**: InterviewsChat offers multiple AI models but not interview-type-specific prompts. Having pre-optimized prompts for System Design (mention CAP theorem, trade-offs) vs Behavioral (STAR format) vs Coding (time/space complexity) saves setup time and improves answer quality.

**Complexity**: Low-Medium - Template storage and switching is simple; the effort is in crafting quality default prompts.

### 4. Transparent Blur Overlay

| Feature | Description | Complexity | Dependencies |
|---------|-------------|------------|--------------|
| Transparency control | Adjustable overlay opacity | Low | CSS opacity |
| Backdrop blur | Blur background behind overlay | Low | CSS backdrop-filter |
| Adjustable blur level | User-controlled blur intensity | Low | Settings UI |

**Why differentiating**: Most overlays are solid panels that block screen content. A transparent blur overlay lets users see both the meeting and the assistant simultaneously, reducing the "cheating" feel and improving peripheral awareness.

**Complexity**: Low - Pure CSS with browser support.

### 5. Auto Language Detection

| Feature | Description | Complexity | Dependencies |
|---------|-------------|------------|--------------|
| Automatic language detection | No manual language selection needed | Low | ElevenLabs API feature |
| Same-language responses | LLM replies in detected language | Low | Prompt engineering |
| Multi-language support | Works with 29+ languages | Low | STT provider capability |

**Why differentiating**: Interview assistants like Beyz AI emphasize multilingual support as a key differentiator for international candidates. ElevenLabs provides this out-of-the-box; surfacing it as a feature requires no extra work.

**Complexity**: Low - Leverage existing API capability.

---

## Anti-Features

Things to deliberately NOT build, with rationale.

### 1. Screen Share Invisibility / Stealth Mode

**What it is**: Making the overlay invisible during screen sharing, like Final Round AI's "Stealth Mode" or LockedIn AI's "True Stealth Mode".

**Why NOT to build**:
- **Technical complexity**: High - Requires OS-level window compositor tricks, native app development (not just Chrome extension), platform-specific code (Windows DWM, macOS window layers)
- **Detection risk**: Companies like Polygraf AI and Sherlock AI are specifically building detection tools that claim 97%+ accuracy at catching these tools
- **Ethical concerns**: This feature explicitly enables deception, which crosses a line from "assistance" to "cheating"
- **Legal exposure**: Some jurisdictions have regulations around interview recording/assistance disclosure
- **Not needed for v1**: The target use case is assistance (like having notes), not deception

**Alternative**: A minimized indicator that's visible but unobtrusive. Users can position the overlay outside shared screen area if needed.

### 2. Audio Recording / Storage

**What it is**: Recording and storing interview audio for later playback.

**Why NOT to build**:
- **Privacy laws**: Two-party consent states (CA, IL, WA, etc.) require all parties to consent to recording
- **Legal liability**: Recording without consent can result in criminal charges in some jurisdictions
- **Data storage complexity**: Secure storage, retention policies, GDPR compliance
- **Not needed for use case**: Real-time transcription serves the interview assistance need without recording

**Alternative**: Transcript-only history with configurable retention (already planned for v2).

### 3. Coding Solution Generation

**What it is**: Automatically capturing code problems and generating complete solutions (like Interview Coder, LeetCode Wizard).

**Why NOT to build**:
- **Detection**: HackerRank, CodeSignal now specifically detect these tools with AI monitoring
- **Meta's new format**: AI-enabled coding interviews evaluate how you USE AI, not whether you can hide it
- **Ethical line**: Generating solutions during a test is definitionally cheating
- **Scope creep**: Would require screenshot analysis, IDE integration, code formatting

**Alternative**: Focus on explaining concepts, suggesting approaches, but not writing code. Prompts should emphasize "explain how to approach" not "write the solution".

### 4. Built-in Mock Interview System

**What it is**: Full mock interview capability with AI asking questions, like Huru.ai or Interview Sidekick.

**Why NOT to build**:
- **Different product**: Mock interviews are preparation tools; real-time assistance is a live-interview tool
- **Saturated market**: Many dedicated mock interview tools exist (Google Interview Warmup, Pramp, Huru.ai)
- **Scope creep**: Would require different UI, conversation management, question databases

**Alternative**: Focus entirely on real-time interview assistance. Users can use dedicated prep tools separately.

### 5. Desktop Application

**What it is**: A standalone desktop app instead of Chrome extension, like LockedIn AI's desktop app or Final Round AI's downloadable.

**Why NOT to build (for v1)**:
- **Distribution complexity**: Code signing, auto-updates, platform installers
- **Maintenance burden**: Windows + macOS + Linux builds
- **User friction**: Download and install vs one-click extension
- **Chrome sufficiency**: tabCapture API provides everything needed for browser-based meetings

**Alternative**: Chrome extension meets all v1 requirements. Desktop app could be v2+ if browser limitations emerge.

### 6. Session History & Export (v1)

**What it is**: Saving transcripts, browsing history, exporting to files.

**Why defer (not anti-feature, just deferred)**:
- **Storage complexity**: Retention policies, search indexing, cleanup
- **UI overhead**: History browser, export formats, session management
- **v1 focus**: "Get something useful on screen fast" is the core value - history is secondary

**Already planned for v2**: This is explicitly listed in PROJECT.md as deferred.

### 7. Multiple STT Providers with Fallback

**What it is**: Supporting Whisper, AssemblyAI, Deepgram with automatic failover.

**Why NOT to build (v1)**:
- **Complexity**: Different APIs, authentication, audio format requirements
- **ElevenLabs sufficiency**: Reliable, good real-time API, auto language detection
- **Diminishing returns**: One good provider beats three mediocre integrations

**Alternative**: Single provider (ElevenLabs) with clear error messaging if issues arise.

---

## Feature Dependencies

```
Core Infrastructure (must build first)
├── Chrome Extension Shell (Manifest V3)
│   └── Service Worker + Offscreen Document
├── Tab Audio Capture
│   └── AudioWorklet for PCM conversion
└── Message Passing
    └── Between SW <-> Content Script <-> Offscreen

STT Pipeline (requires Core Infrastructure)
├── ElevenLabs WebSocket Connection
│   └── Real-time Transcript Display
│       └── Auto-scroll
│       └── Partial/interim results

Hotkey System (requires STT Pipeline)
├── Keyboard Event Handling
│   └── Hold-to-capture mode
│   └── Toggle mode
│   └── Manual selection mode
└── Capture State Management
    └── Visual indicators

LLM Pipeline (requires Hotkey System)
├── OpenRouter Integration
│   └── Streaming Response Handling
│       └── Dual Parallel Responses
│           ├── Fast Hint Display
│           └── Full Answer Display
└── Prompt Template System
    └── Variable Substitution
    └── Template Switching

UI Layer (requires all above)
├── Floating Overlay
│   ├── Draggable
│   ├── Resizable
│   └── Transparent Blur
├── Settings Panel
│   └── API Key Management
│   └── Template Editor
└── Response Panel
    └── Copy to Clipboard
```

---

## Complexity Assessment Summary

| Feature | Complexity | Effort Estimate | Priority |
|---------|------------|-----------------|----------|
| Tab Audio Capture | Medium | 2-3 days | P0 - Critical |
| ElevenLabs STT Integration | Medium | 2-3 days | P0 - Critical |
| Basic Overlay UI | Medium | 2-3 days | P0 - Critical |
| Hotkey Hold Mode | Medium | 1-2 days | P0 - Critical |
| OpenRouter LLM Integration | Medium | 1-2 days | P0 - Critical |
| Streaming Responses | Medium | 1 day | P0 - Critical |
| Dual Parallel Responses | Medium | 1 day | P1 - High |
| Prompt Templates | Low-Medium | 1-2 days | P1 - High |
| Transparent Blur Overlay | Low | 0.5 days | P1 - High |
| Draggable/Resizable | Low | 1 day | P1 - High |
| Copy to Clipboard | Low | 0.5 days | P1 - High |
| Settings Panel | Low-Medium | 1-2 days | P1 - High |
| Toggle/Manual Hotkey Modes | Low | 1 day | P2 - Medium |
| Custom Templates | Medium | 1-2 days | P2 - Medium |
| Language Auto-Detection Display | Low | 0.5 days | P2 - Medium |

**Total estimated effort for v1**: ~15-20 days of focused development

---

## Competitive Landscape Summary

| Tool | Strength | Weakness vs Our Approach |
|------|----------|-------------------------|
| Final Round AI | Stealth mode, multi-platform | Single response, requires desktop app for stealth |
| LockedIn AI | Coding copilot, resume-tailored | Complex setup, subscription-heavy |
| Interview Coder | Code-focused, auto-screenshot | Detection risk high, ethics questionable |
| Beyz AI | Multilingual, all-in-one | Overcomplicated for interview-only use |
| Tactiq | Mature transcription | No LLM assistance |
| VoiceMeetAI | Privacy-focused | Limited AI features |

**Our positioning**: Lightweight, focused, ethical interview assistance with unique dual-response UX that directly addresses "what do I say RIGHT NOW?" anxiety.

---

## Sources

- [Top AI Interview Assistants 2025](https://beyz.ai/blog/top-10-ai-interview-assistants-in-2025-tested-by-users)
- [Best AI Interview Assistants Comparison](https://www.senseicopilot.com/blog/top-ai-interview-tools-2025)
- [Final Round AI Interview Copilot](https://www.finalroundai.com/interview-copilot)
- [LockedIn AI Desktop App](https://www.lockedinai.com/desktop-app)
- [Transcribing Browser Tab Audio - Deepgram](https://deepgram.com/learn/transcribing-browser-tab-audio-chrome-extensions)
- [Chrome tabCapture API](https://developer.chrome.com/docs/extensions/reference/api/tabCapture)
- [Interview Cheating Detection - Polygraf AI](https://polygraf.ai/interview-cheating-ai-detector/)
- [LLM Latency Benchmarks](https://research.aimultiple.com/llm-latency-benchmark/)
- [OpenAI Latency Optimization](https://platform.openai.com/docs/guides/latency-optimization)
- [Whisper Speech Recognition](https://github.com/openai/whisper)
- [Recording Consent Laws](https://employmentlawwatch.com/post/102ls2n/the-legality-of-ai-powered-recording-and-transcription)
