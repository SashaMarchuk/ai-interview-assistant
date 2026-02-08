# AI Interview Assistant - Feature Todos

This directory contains structured todo files for all planned features from v2.0 through v4.0+.

## Quick Reference

### How to Use Todos

**Check what's available:**
```
"Покажи всі pending todos"
"What todos do we have?"
```

**Start working on a todo:**
```
"Давай зробимо file personalization"
"Let's work on cost tracking"
```

**Filter by area:**
```
"Покажи todos по feature"
"Show me bug todos"
```

## Version Overview

### v2.0: Core Features (4 todos) - Priority: HIGH
**Timeline:** ~12-14 days
**Status:** Ready to start

| Todo | Priority | Complexity | Days | Description |
|------|----------|------------|------|-------------|
| File Personalization | P0 | Medium | 2-3 | Upload files to OpenAI for context injection |
| Cost Tracking | P0 | Medium | 2-3 | Dashboard for API usage and spending |
| Reasoning Models | P0 | Low-Med | 1-2 | Add o-series models + reasoning button |
| Text Selection + Editing | P1 | Medium | 4 | Select text → LLM + inline transcript editing |

**Start with:** File Personalization or Cost Tracking (can be parallel)

### v2.1: Polish & Cleanup (6 todos) - Priority: MEDIUM
**Timeline:** ~8-11 days
**Status:** After v2.0

| Todo | Priority | Complexity | Days | Description |
|------|----------|------------|------|-------------|
| Hotkeys Configuration | P1 | Medium | 2 | Full hotkey customization with chords |
| Circuit Breaker | P1 | Medium | 1-2 | API retry logic with exponential backoff |
| OpenRouter Removal | P1 | Low | 1 | Remove unused LLM provider |
| Persistent Transcripts | P2 | Medium | 2-3 | IndexedDB storage for session history |
| Speaker Merging | P2 | Low | 0.5-1 | Verify/fix automatic speaker merging |
| Language Auto-detect | P2 | Low | 1 | Auto-detect language from transcription |

**Start with:** Hotkeys Configuration (enables better v2.0 UX) or Circuit Breaker (reliability)

### v3.0: Advanced Features (3 todos) - Priority: MEDIUM
**Timeline:** ~15-20 days
**Status:** After v2.1 stable

| Todo | Priority | Complexity | Days | Description |
|------|----------|------------|------|-------------|
| Usage Templates | P0 | High | 5-6 | Template system for different use cases |
| Local Whisper STT | P1 | Very High | 7-10 | Offline transcription (needs research) |
| OpenAI Whisper API | P2 | Medium | 2-3 | Cloud STT alternative to ElevenLabs |

**Start with:** Usage Templates (depends on stable v2.x)
**Research phase:** Local Whisper (parallel to templates work)

### v4.0+: Future Features (2 todos) - Priority: LOW
**Timeline:** ~4-6 days (if needed)
**Status:** Defer until user demand

| Todo | Priority | Complexity | Days | Description |
|------|----------|------------|------|-------------|
| AssemblyAI Support | P3 | Medium | 2-3 | Additional STT provider option |
| Deepgram Support | P3 | Medium | 2-3 | Fastest cloud STT option |

**Recommendation:** Only implement if strong user demand or specific feature needs

## Development Flow

### Sequential Order (Recommended)

```
v2.0.1 → File Personalization (2-3 days)
v2.0.2 → Cost Tracking (2-3 days)
v2.0.3 → Reasoning Models (1-2 days)
v2.0.4 → Text Selection + Editing (4 days)
         ↓
      /polish-milestone (v2.0 complete)
         ↓
v2.1.1 → Hotkeys Configuration (2 days)
v2.1.2 → Circuit Breaker (1-2 days)
v2.1.3 → OpenRouter Removal (1 day)
v2.1.4 → Persistent Transcripts (2-3 days)
v2.1.5 → Speaker Merging (0.5-1 day)
v2.1.6 → Language Auto-detect (1 day)
         ↓
      /polish-milestone (v2.1 complete)
         ↓
v3.0.1 → Usage Templates (5-6 days)
v3.0.2 → Local Whisper Research + Implementation (7-10 days)
v3.0.3 → OpenAI Whisper API (2-3 days)
         ↓
      /polish-milestone (v3.0 complete)
         ↓
v4.0+ → If user demand exists
```

### Parallel Opportunities

**v2.0 - Can work in parallel:**
- File Personalization + Cost Tracking (independent features)
- Reasoning Models (can overlap with either above)

**v3.0 - Can work in parallel:**
- Local Whisper Research (while building Templates)
- OpenAI Whisper API (independent from Templates)

## Dependencies Graph

```
v1.0 (DONE ✓)
  ↓
┌─────────────── v2.0 Core Features ───────────────┐
│                                                   │
│  File Personalization ──→ OpenAI integration     │
│  Cost Tracking ──────────→ Independent           │
│  Reasoning Models ────→ Model updates            │
│  Selection + Editing ──→ UI refactor             │
│                                                   │
└───────────────────┬───────────────────────────────┘
                    ↓
┌─────────────── v2.1 Polish ──────────────────────┐
│                                                   │
│  Hotkeys ──────────→ Needs v2.0 hotkeys defined  │
│  OpenRouter ───────→ Cleanup only                │
│  Speaker Merging ──→ Verify existing             │
│  Language Detect ──→ Independent                 │
│                                                   │
└───────────────────┬───────────────────────────────┘
                    ↓
┌─────────────── v3.0 Advanced ────────────────────┐
│                                                   │
│  Templates ────────→ Needs stable v2.x           │
│  Local Whisper ────→ Independent (research!)     │
│  OpenAI Whisper ───→ Independent                 │
│                                                   │
└───────────────────┬───────────────────────────────┘
                    ↓
               v4.0+ (Optional)
```

## File Organization

```
.planning/todos/
├── README.md (this file)
├── pending/
│   ├── 20260208-file-personalization.md
│   ├── 20260208-cost-tracking.md
│   ├── 20260208-reasoning-models.md
│   ├── 20260208-text-selection-llm.md
│   ├── 20260208-transcript-editing.md
│   ├── 20260208-hotkeys-configuration.md
│   ├── 20260208-circuit-breaker.md
│   ├── 20260208-openrouter-removal.md
│   ├── 20260208-persistent-transcripts.md
│   ├── 20260208-speaker-merging.md
│   ├── 20260208-language-autodetect.md
│   ├── 20260208-usage-templates.md
│   ├── 20260208-local-whisper-stt.md
│   ├── 20260208-openai-whisper-api.md
│   └── 20260208-assemblyai-deepgram.md
└── done/
    └── (completed todos moved here)
```

## Todo Metadata

Each todo file includes:

```yaml
---
created: YYYY-MM-DD
title: Feature name
area: feature|bug|refactor|docs|test|ui
priority: P0|P1|P2|P3
version: v2.0|v2.1|v3.0|v4.0+
complexity: low|medium|high|very-high
estimate: X-Y days
files:
  - relevant/file/paths
---
```

## Areas (Categories)

- `feature` — New functionality
- `bug` — Bug fixes
- `refactor` — Code improvements
- `docs` — Documentation
- `test` — Testing
- `ui` — UI/UX changes

## Complexity Levels

- **Low:** 0.5-1 day, straightforward implementation
- **Medium:** 2-3 days, some architectural decisions
- **High:** 5-6 days, significant refactoring needed
- **Very High:** 7-10+ days, requires research phase

## Cost Summary (Total Development Time)

- **v2.0:** 9-12 days + testing/polish = ~14 days
- **v2.1:** 7.5-10 days + testing/polish = ~12 days
- **v3.0:** 14-19 days + testing/polish = ~22 days
- **v4.0+:** 4-6 days (if needed)

**Total through v3.0:** ~48 days of development

## When to Use Each Todo

### File Personalization
**Use when:** User wants context-aware LLM responses based on their resume, job descriptions, or project docs.

### Cost Tracking
**Use when:** User is cost-conscious and wants visibility into API spending.

### Reasoning Models
**Use when:** User needs deep analytical thinking for complex technical questions.

### Text Selection + Editing
**Use when:** User wants to quickly send specific parts of transcript to LLM or correct STT errors.

### Hotkeys Configuration
**Use when:** User is a power user who wants full control over keyboard shortcuts.

### Circuit Breaker
**Use when:** Need reliable API handling with automatic retry logic and failure recovery for all external services.

### OpenRouter Removal
**Use when:** Ready to simplify codebase and remove unused provider.

### Persistent Transcripts
**Use when:** User wants to keep session history, search past interviews, and export transcripts for review.

### Speaker Merging
**Use when:** Verifying transcript readability improvements.

### Language Auto-detect
**Use when:** User interviews in multiple languages and wants automatic LLM language matching.

### Usage Templates
**Use when:** User has different use cases (tech interviews, HR, sales) requiring different configurations.

### Local Whisper
**Use when:** User wants offline capability or cost savings on transcription.

### OpenAI Whisper API
**Use when:** User wants cheaper cloud STT alternative to ElevenLabs.

### AssemblyAI/Deepgram
**Use when:** User has specific needs for sentiment analysis, entity detection, or fastest processing.

## Next Steps

1. **Review roadmap:** Ensure version organization makes sense
2. **Start v2.0:** Begin with File Personalization or Cost Tracking
3. **Regular check-ins:** After each major feature completion
4. **Polish after milestones:** Run `/polish-milestone` after v2.0, v2.1, v3.0

## Notes

- All todos based on user interview conducted 2026-02-07
- Full context preserved in each todo file
- Ready for immediate development
- Can be worked on individually or in parallel where noted
