# AI Interview Assistant

## What This Is

A Chrome extension that provides real-time transcription and AI-powered assistance during technical interviews. Captures audio from browser tabs (Google Meet primary), transcribes via ElevenLabs, and delivers dual parallel LLM responses — a fast hint to start speaking immediately and a comprehensive answer streaming alongside.

## Core Value

When a question is captured, get something useful on screen fast enough to start speaking confidently, with comprehensive backup streaming in as you go.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Real-time audio capture from browser tabs via Chrome tabCapture API
- [ ] Live transcription via ElevenLabs WebSocket STT with auto language detection
- [ ] Hotkey capture with hold mode (press and hold to capture, release to send)
- [ ] Highlight-to-send mode (select transcript text, send to LLM)
- [ ] Dual parallel LLM requests via OpenRouter (fast model + full model)
- [ ] Streaming responses for both fast hint and full answer
- [ ] Floating overlay UI with drag positioning
- [ ] Resizable overlay with size persistence
- [ ] Transparent overlay with blurred background
- [ ] Adjustable blur level in settings
- [ ] Multiple saved prompt templates (System Design, Coding, Behavioral, custom)
- [ ] Prompt template switching before/during calls
- [ ] Copy answer to clipboard
- [ ] API key management (ElevenLabs, OpenRouter)
- [ ] Settings panel for configuration

### Out of Scope

- Session history and export — deferred to v2, focus on live experience first
- Additional STT providers (Whisper, AssemblyAI, Deepgram) — ElevenLabs only for v1
- TTS audio feedback — not needed for interview use case
- Mobile support — Chrome desktop only
- Server-side components — fully client-side
- Screen share invisibility mode — complex, not v1
- Audio recording/storage — privacy concern, not needed
- Chrome Web Store distribution — private use only

## Context

**Technical environment:**
- Chrome Extension Manifest V3
- Service Worker with 30-second idle timeout (requires Offscreen Document for WebSocket)
- React 18 for UI components
- Vite + CRXJS for build system
- Tailwind CSS for styling
- Zustand for state management

**Audio pipeline:**
- tabCapture API → AudioWorklet → PCM 16-bit 16kHz → Offscreen Document → ElevenLabs WebSocket

**LLM architecture:**
- Two parallel requests on hotkey trigger
- Fast model: quick 1-2 sentence hint (e.g., Gemini Flash)
- Full model: comprehensive streaming answer (e.g., Claude Haiku)
- Both stream simultaneously to overlay

**User workflow:**
- Prepare prompt templates before interview
- Start recording when call begins
- Hold hotkey when interviewer asks question
- Release to send captured text to LLM
- Glance at fast hint to start speaking
- Read full answer as it streams in

## Constraints

- **Platform**: Chrome Desktop only — tabCapture API not available on mobile
- **STT Provider**: ElevenLabs only — simplifies v1, proven real-time WebSocket API
- **LLM Provider**: OpenRouter — access to multiple models via single API
- **Distribution**: Private — not Chrome Web Store, load unpacked extension
- **Latency**: < 500ms transcription delay — critical for real-time interview use

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| ElevenLabs only for STT | Simplifies v1, good real-time API, auto language detection | — Pending |
| OpenRouter for LLM | Single API key, access to Gemini/Claude/GPT models | — Pending |
| Two parallel LLM requests | Fast hint to start speaking + comprehensive answer | — Pending |
| Hold mode as default hotkey | Natural gesture under interview pressure | — Pending |
| Defer session history to v2 | Focus on live experience first | — Pending |
| Transparent blur overlay | Unobtrusive during calls, adjustable to preference | — Pending |

---
*Last updated: 2026-01-28 after initialization*
