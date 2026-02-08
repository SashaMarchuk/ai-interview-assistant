---
created: 2026-02-08
title: Language Auto-Detection for LLM Responses
area: feature
priority: P2
version: v2.1
complexity: low
estimate: 1 day
files:
  - src/services/transcription/elevenlabs.ts
  - src/services/llm/promptBuilder.ts
  - src/components/settings/LanguageSettings.tsx
  - src/store/settingsStore.ts
---

## Problem

LLM responses should match the language of the interview conversation. Currently, responses may default to English regardless of detected language. User wants hybrid approach: auto-detection with manual override.

## User Requirements

- **Auto-detect from transcription:** ElevenLabs already detects language
- **Inject language instruction in prompts:** "Reply in [detected_language]"
- **Manual override:** User can force specific language in Settings
- **Settings options:**
  - Auto-detect (default)
  - Manual selection from 29 supported languages
  - "Always English" toggle (shortcut)

## Solution

### Architecture

1. **Language Detection Flow**
   ```typescript
   interface LanguageSettings {
     mode: 'auto' | 'manual';
     manualLanguage?: string; // ISO code or name
     detectedLanguage?: string; // from ElevenLabs
   }

   function getResponseLanguage(settings: LanguageSettings): string {
     if (settings.mode === 'manual') {
       return settings.manualLanguage;
     }
     return settings.detectedLanguage || 'English';
   }
   ```

2. **ElevenLabs Language Detection**
   - ElevenLabs API returns detected language in metadata
   - Extract language from transcription response
   - Store in transcript store
   - Update on each new transcription segment

3. **Prompt Injection**
   - Add language instruction to all prompts:
     - Fast prompt: Append "Reply in {language}"
     - Full prompt: Append "Reply in {language}"
     - Reasoning prompt: Append "Reply in {language}"
     - Custom/Quick prompts: Append "Reply in {language}"
   - Template: `\n\nIMPORTANT: Reply in {language}.`

4. **Supported Languages (ElevenLabs 29 Languages)**
   - English, Ukrainian, Spanish, French, German, Italian, Portuguese
   - Polish, Dutch, Russian, Arabic, Chinese, Japanese, Korean
   - Turkish, Swedish, Danish, Norwegian, Finnish, Czech
   - Romanian, Greek, Hindi, Hungarian, Indonesian, Malay
   - Slovak, Tamil, Thai, Vietnamese

### Implementation Steps

1. Update transcription service
   - Extract detected language from ElevenLabs API response
   - Store in transcript metadata
2. Create language settings section
   - Mode selector: Auto / Manual
   - Language dropdown (29 languages)
   - "Always English" quick toggle
3. Create prompt builder utility
   - `buildPromptWithLanguage(basePrompt, language)`
   - Inject language instruction
4. Update all LLM call points
   - Use prompt builder
   - Pass detected or manual language
5. Add language indicator in UI
   - Show current detected language in transcript header
   - Icon or badge

### UI Components

**Settings → Language:**
```
┌─────────────────────────────────────┐
│ Language Settings                   │
├─────────────────────────────────────┤
│ ○ Auto-detect (recommended)         │
│   Current: Ukrainian (detected)     │
│                                     │
│ ○ Manual selection                  │
│   Language: [Dropdown ▼]            │
│                                     │
│ ☐ Always use English                │
└─────────────────────────────────────┘
```

**Transcript Header:**
```
🌐 Language: Ukrainian (auto-detected)
```

### Prompt Injection Example

**Before:**
```
You are an AI interview assistant. Help answer this question:
{question}
```

**After:**
```
You are an AI interview assistant. Help answer this question:
{question}

IMPORTANT: Reply in Ukrainian.
```

### Integration Points

- **All LLM prompts:** Fast, Full, Reasoning, Custom
- **File personalization (v2.0):** Include language in file context prompts
- **Templates (v3.0):** Language setting per template

### Technical Notes

- **Language codes:** Use full names for clarity ("Ukrainian" not "uk")
- **Detection confidence:** ElevenLabs may provide confidence score - display if available
- **Fallback:** If detection fails, default to English
- **Mixed language:** If interview switches languages, use most recent detected

### Edge Cases

- **Multi-language conversation:** Use most recent segment language
- **Low confidence detection:** Show warning, allow manual override
- **Language not in 29 supported:** Fallback to English, log warning

### Storage Schema

```typescript
interface LanguagePreferences {
  mode: 'auto' | 'manual';
  manualLanguage: string;
  alwaysEnglish: boolean;
}

interface TranscriptMetadata {
  detectedLanguage: string;
  detectionConfidence?: number;
  languageHistory: Array<{
    language: string;
    timestamp: number;
  }>;
}
```

### Dependencies

- ElevenLabs transcription service (language detection)
- All LLM prompt builders
- Settings store

### Testing Checklist

- [ ] Detect language from ElevenLabs API
- [ ] Display detected language in UI
- [ ] Auto mode uses detected language
- [ ] Manual mode uses selected language
- [ ] "Always English" toggle works
- [ ] Language instruction injected in Fast prompt
- [ ] Language instruction injected in Full prompt
- [ ] Language instruction injected in Reasoning prompt
- [ ] Language instruction injected in Custom prompts
- [ ] LLM responds in correct language
- [ ] Settings persist across sessions
- [ ] Fallback to English on detection failure
- [ ] Mixed language conversation handled
- [ ] Low confidence detection shows warning
- [ ] All 29 languages selectable
