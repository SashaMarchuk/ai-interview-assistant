# AI Interview Assistant

## What This Is

A Chrome MV3 extension that provides real-time transcription and AI-powered assistance during technical interviews. Captures audio from browser tabs (Google Meet primary), transcribes via ElevenLabs, and delivers dual parallel LLM responses — a fast hint to start speaking immediately and a comprehensive answer streaming alongside. Features rich Markdown rendering, reasoning model support, cost tracking, file-based personalization, transcript editing, and quick prompt actions on selected text.

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
- Secure message passing (no API keys in runtime messages) — v1.1
- AES-GCM encryption for API keys at rest — v1.1
- Privacy policy + in-app consent notice — v1.1
- Recording consent legal warnings (first-time + per-session) — v1.1
- Store sync race condition fix (queue guard pattern) — v1.1
- Transcript buffer with service worker recovery — v1.1
- Circuit breaker pattern with alarm-based recovery — v1.1
- ESLint 9 + Prettier code formatting — v1.1
- ✓ LLM responses render as formatted Markdown with code blocks, syntax highlighting, and copy-to-clipboard — v2.0
- ✓ Streaming Markdown renders incrementally inside Shadow DOM overlay without flicker — v2.0
- ✓ o-series reasoning models with dedicated button, effort selector, and 25K token budget — v2.0
- ✓ GPT-5 series models available in model picker — v2.0
- ✓ Token usage captured from streaming responses with per-request cost display — v2.0
- ✓ Session cost total visible during active interview — v2.0
- ✓ Cost history stored in IndexedDB with per-provider breakdown and popup dashboard charts — v2.0
- ✓ Resume/JD upload with client-side PDF extraction and IndexedDB storage — v2.0
- ✓ File context automatically injected into LLM prompts via PromptBuilder — v2.0
- ✓ Floating tooltip on text selection with customizable quick prompt actions — v2.0
- ✓ Inline transcript editing with soft-delete, undo, and edit-aware LLM context — v2.0

### Active

(No active requirements — plan next milestone)

### Out of Scope

- Additional STT providers (Whisper, AssemblyAI, Deepgram) — ElevenLabs only
- TTS audio feedback — not needed for interview use case
- Mobile support — Chrome desktop only
- Server-side components — fully client-side
- Screen share invisibility mode — complex, not planned
- Audio recording/storage — privacy concern
- Chrome Web Store distribution — private use only
- OpenAI Files API upload — client-side extraction is more reliable and provider-agnostic
- Reasoning model streaming for o1 — o1 does not support streaming; non-streaming fallback used
- Offline mode — real-time LLM is core value

## Context

**Current state (v2.0 shipped):**
- Tech stack: WXT 0.19.x, React 18, Tailwind v4, Zustand, Chrome MV3
- Codebase: ~12,747 LOC TypeScript across 91+ files
- v1.0: 48 requirements (8 phases, 30 plans) — core transcription + LLM
- v1.1: 7 requirements (6 phases, 7 plans) — security + reliability
- v2.0: 23 requirements (7 phases, 16 plans) — enhanced experience
- Total: 78 requirements validated across 21 phases, 53 plans
- Human verified on Google Meet
- New dependencies added in v2.0: react-markdown, remark-gfm, rehype-highlight, highlight.js, recharts, pdfjs-dist, idb, @floating-ui/react, @dnd-kit/core, @dnd-kit/sortable

**Audio pipeline:**
- tabCapture API → AudioWorklet → PCM 16-bit 16kHz → Offscreen Document → ElevenLabs WebSocket

**LLM architecture:**
- Provider abstraction layer with LLMProvider interface
- Supports OpenRouter (6 models) and OpenAI (12+ models including o-series reasoning)
- Fast model: quick 1-2 sentence hint (e.g., GPT-4o-mini, Gemini Flash)
- Full model: comprehensive streaming answer (e.g., GPT-4o, Claude Haiku)
- Reasoning mode: single-stream with dedicated button and effort control
- Quick prompts: concurrent fast-model requests on selected text
- Cost tracking: per-request badges, session totals, IndexedDB history with charts
- File context: resume/JD injection into system prompts

**User workflow:**
- Prepare prompt templates before interview
- Upload resume and job description for personalized responses
- Start recording when call begins
- Hold hotkey when interviewer asks question (or toggle mode)
- Release to send captured text to LLM
- Glance at fast hint to start speaking
- Read full answer as it streams in (with Markdown formatting)
- Edit transcript entries if transcription errors occur
- Select any text and use quick prompts for instant clarification
- Review cost history in popup dashboard

**Known tech debt:**
- Phase 20 missing VERIFICATION.md (functionality complete per summaries)
- pdfjs-dist DOMMatrix build warning (runtime unaffected)

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
| Client-side file extraction | Not OpenAI Files API — cross-provider compatible | ✓ Good — works with both providers |
| IndexedDB for cost + files | Not Zustand — avoids webext-zustand sync bloat | ✓ Good — large data stays local |
| react-markdown + Tailwind classes | Not typography plugin — Shadow DOM compatible | ✓ Good — clean rendering |
| recharts for charts | SVG-based, no CSP issues in extensions | ✓ Good — CSP-safe |
| 25K min token budget for reasoning | Prevents empty responses from reasoning models | ✓ Good — no empty responses |
| @dnd-kit for DnD | Accessible, keyboard support, React-native | ✓ Good — smooth reordering |
| Floating UI for tooltips | Virtual element positioning in Shadow DOM | ✓ Good — works in overlay |

---
*Last updated: 2026-02-10 after v2.0 milestone*
