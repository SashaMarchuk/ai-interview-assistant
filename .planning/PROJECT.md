# AI Interview Assistant

## What This Is

A Chrome MV3 extension that provides real-time transcription and AI-powered assistance during technical interviews. Captures audio from browser tabs (Google Meet primary), transcribes via ElevenLabs, and delivers dual parallel LLM responses — a fast hint to start speaking immediately and a comprehensive answer streaming alongside. Supports both OpenRouter and OpenAI as LLM providers.

## Core Value

When a question is captured, get something useful on screen fast enough to start speaking confidently, with comprehensive backup streaming in as you go.

## Requirements

### Validated

- Real-time audio capture from browser tabs via Chrome tabCapture API — v1.0
- Live transcription via ElevenLabs WebSocket STT with speaker diarization — v1.0
- Hotkey capture with hold mode (press and hold to capture, release to send) — v1.0
- Toggle mode as alternative capture behavior — v1.0
- Highlight-to-send mode (select transcript text, send to LLM) — v1.0
- Dual parallel LLM requests via OpenRouter (fast model + full model) — v1.0
- OpenAI direct API support with provider abstraction — v1.0
- Streaming responses for both fast hint and full answer — v1.0
- Floating overlay UI with drag positioning — v1.0
- Resizable overlay with size persistence — v1.0
- Transparent overlay with blurred background — v1.0
- Adjustable blur level in settings — v1.0
- Multiple saved prompt templates (System Design, Coding, Behavioral, custom) — v1.0
- Prompt template switching before/during calls — v1.0
- API key management (ElevenLabs, OpenRouter, OpenAI) — v1.0
- Settings panel for configuration — v1.0
- Health indicators for service issues — v1.0
- Graceful degradation when API keys missing — v1.0

### Active

## Current Milestone: v1.1 Security & Reliability

**Goal:** Harden security, add compliance features, and fix critical reliability bugs before adding new capabilities.

**Target features:**
- Remove API keys from Chrome runtime messages
- Encrypt API keys at rest with WebCrypto AES-GCM
- Privacy policy document + in-app consent notice
- Recording consent legal warnings (first-time + per-session)
- Fix store sync race condition in background script
- Fix transcript state loss on service worker termination
- Circuit breaker pattern with retry logic for API calls
- Persistent transcripts with IndexedDB session history

### Out of Scope

- Additional STT providers (Whisper, AssemblyAI, Deepgram) — ElevenLabs only
- TTS audio feedback — not needed for interview use case
- Mobile support — Chrome desktop only
- Server-side components — fully client-side
- Screen share invisibility mode — complex, not planned
- Audio recording/storage — privacy concern
- Chrome Web Store distribution — private use only

## Context

**Current state (v1.0 shipped):**
- 4,847 lines TypeScript across 148 files
- Tech stack: WXT 0.19.x, React 18, Tailwind v4, Zustand, Chrome MV3
- All 48 v1 requirements delivered
- Human verified on Google Meet

**Audio pipeline:**
- tabCapture API → AudioWorklet → PCM 16-bit 16kHz → Offscreen Document → ElevenLabs WebSocket

**LLM architecture:**
- Provider abstraction layer with LLMProvider interface
- Supports OpenRouter (6 models) and OpenAI (12 models)
- Fast model: quick 1-2 sentence hint (e.g., GPT-4o-mini, Gemini Flash)
- Full model: comprehensive streaming answer (e.g., GPT-4o, Claude Haiku)
- Both stream simultaneously to overlay

**User workflow:**
- Prepare prompt templates before interview
- Start recording when call begins
- Hold hotkey when interviewer asks question (or toggle mode)
- Release to send captured text to LLM
- Glance at fast hint to start speaking
- Read full answer as it streams in

## Constraints

- **Platform**: Chrome Desktop only — tabCapture API not available on mobile
- **STT Provider**: ElevenLabs only — simplifies codebase, proven real-time WebSocket API
- **LLM Providers**: OpenRouter + OpenAI — covers most common models
- **Distribution**: Private — not Chrome Web Store, load unpacked extension
- **Latency**: < 500ms transcription delay — critical for real-time interview use

## Skills Available

See: `.planning/SKILLS.md`

- **browser-extension-builder** — Extension architecture, MV3, content scripts, background workers
- **frontend-design** — Distinctive UI design, production-grade interfaces, anti-generic aesthetics
- **code-review** — Multi-agent PR review, bug detection, CLAUDE.md compliance

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| ElevenLabs only for STT | Simplifies v1, good real-time API, auto language detection | ✓ Good — worked well |
| OpenRouter + OpenAI for LLM | Covers GPT-4, Claude, Gemini via two APIs | ✓ Good — flexible provider choice |
| Two parallel LLM requests | Fast hint to start speaking + comprehensive answer | ✓ Good — core value delivered |
| Hold mode as default hotkey | Natural gesture under interview pressure | ✓ Good — toggle mode added as option |
| Provider abstraction layer | Strategy pattern enables multiple backends | ✓ Good — easy to add providers |
| Shadow DOM for overlay | CSS isolation from Google Meet styles | ✓ Good — no style conflicts |
| WXT 0.19.x framework | Node 18 compatibility, good MV3 support | ✓ Good — stable development |
| webext-zustand for state | Cross-context sync with chrome.storage | ✓ Good — state persists correctly |

---
*Last updated: 2026-02-08 after v1.1 milestone start*
