---
created: 2026-02-08
title: AssemblyAI / Deepgram STT Support
area: feature
priority: P3
version: v4.0+
complexity: medium
estimate: 2-3 days each
files:
  - src/services/transcription/assemblyai.ts
  - src/services/transcription/deepgram.ts
  - src/services/transcription/provider-abstraction.ts
  - src/components/settings/STTSettings.tsx
---

## Problem

Users may want additional cloud STT provider options beyond ElevenLabs and OpenAI Whisper. Both AssemblyAI and Deepgram were mentioned by user as potential alternatives.

## User Requirements

- **Additional cloud options:** More choice for STT providers
- **AssemblyAI features:**
  - Real-time transcription
  - Speaker diarization
  - Custom vocabulary
  - Entity detection
  - Sentiment analysis
- **Deepgram features:**
  - Real-time transcription
  - Very fast processing
  - Multiple language models
  - Custom model training
  - WebSocket streaming

## Solution

### Priority & Timing

**Priority:** P3 (Nice-to-Have)
**Version:** v4.0+ (may defer if not critical)

**Rationale for lower priority:**
- Already have 3 STT options by v3.0: ElevenLabs, OpenAI Whisper, Local Whisper
- Additional providers add maintenance burden
- Most users satisfied with existing options
- Can add if user demand grows

### Architecture

Both would use the same STTProvider abstraction:

```typescript
interface STTProvider {
  name: 'elevenlabs' | 'openai-whisper' | 'whisper-local' | 'assemblyai' | 'deepgram';
  initialize(): Promise<void>;
  transcribe(audio: AudioBuffer): Promise<TranscriptSegment[]>;
  isAvailable(): Promise<boolean>;
  supportsRealtime(): boolean;
  supportsSpeakerDiarization(): boolean;
  supportsCustomVocabulary(): boolean;
  pricing: {
    perMinute?: number;
    perHour?: number;
    perCharacter?: number;
  };
}
```

### AssemblyAI Implementation

**API:** https://www.assemblyai.com/docs/api-reference/transcripts

**Features:**
- Real-time via WebSocket
- Speaker diarization (multiple speakers)
- Custom vocabulary (boost specific words)
- Auto highlights (key topics)
- Entity detection (names, dates, etc.)
- Sentiment analysis per sentence

**Pricing (as of 2026):**
- Core: $0.00025 per second (~$0.015 per minute, ~$0.90 per hour)
- Additional features (diarization, sentiment): May have additional cost

**Implementation sketch:**
```typescript
class AssemblyAIProvider implements STTProvider {
  name = 'assemblyai';

  async transcribe(audio: AudioBuffer): Promise<TranscriptSegment[]> {
    // 1. Upload audio file
    const uploadUrl = await this.uploadAudio(audio);

    // 2. Create transcript job
    const transcriptId = await this.createTranscript(uploadUrl, {
      speaker_labels: true,
      auto_highlights: true,
      entity_detection: true
    });

    // 3. Poll for completion
    const result = await this.pollTranscript(transcriptId);

    // 4. Parse result
    return this.parseAssemblyAIResponse(result);
  }

  supportsRealtime(): boolean {
    return true; // Via WebSocket
  }

  supportsSpeakerDiarization(): boolean {
    return true;
  }
}
```

**Real-time via WebSocket:**
```typescript
async startRealtimeTranscription() {
  const ws = new WebSocket('wss://api.assemblyai.com/v2/realtime/ws', {
    headers: {
      'Authorization': apiKey
    }
  });

  ws.on('message', (data) => {
    const result = JSON.parse(data);
    if (result.message_type === 'FinalTranscript') {
      this.handleTranscriptSegment(result);
    }
  });

  // Send audio chunks
  audioStream.on('data', (chunk) => {
    ws.send(chunk);
  });
}
```

### Deepgram Implementation

**API:** https://developers.deepgram.com/docs

**Features:**
- Real-time streaming (WebSocket)
- Very fast processing (1.5-3x faster than real-time)
- Multiple models: Nova (best), Enhanced, Base
- Custom model training (enterprise)
- Punctuation, diarization, alternatives

**Pricing (as of 2026):**
- Nova: $0.0043 per minute ($0.258 per hour)
- Enhanced: $0.0125 per minute
- Base: Free tier available (limited)

**Implementation sketch:**
```typescript
class DeepgramProvider implements STTProvider {
  name = 'deepgram';

  async transcribe(audio: AudioBuffer): Promise<TranscriptSegment[]> {
    const response = await fetch('https://api.deepgram.com/v1/listen', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'audio/wav'
      },
      body: await audioBufferToWav(audio),
      params: {
        model: 'nova',
        diarize: true,
        punctuate: true,
        language: 'en-US'
      }
    });

    const result = await response.json();
    return this.parseDeepgramResponse(result);
  }

  supportsRealtime(): boolean {
    return true; // WebSocket streaming
  }

  supportsSpeakerDiarization(): boolean {
    return true;
  }
}
```

**Real-time via WebSocket:**
```typescript
const ws = new WebSocket('wss://api.deepgram.com/v1/listen', {
  headers: {
    'Authorization': `Token ${apiKey}`
  },
  params: {
    encoding: 'linear16',
    sample_rate: 16000,
    channels: 1,
    model: 'nova',
    diarize: true
  }
});

ws.on('message', (data) => {
  const result = JSON.parse(data);
  if (result.is_final) {
    this.handleTranscriptSegment(result.channel.alternatives[0]);
  }
});
```

### Provider Comparison Table

| Feature | ElevenLabs | OpenAI Whisper | AssemblyAI | Deepgram |
|---------|------------|----------------|------------|----------|
| Real-time | ✓ | ✗ | ✓ | ✓ |
| Speaker Diarization | ✓ | ✗ | ✓ | ✓ |
| Custom Vocabulary | ? | ✗ | ✓ | ✓ |
| Sentiment Analysis | ✗ | ✗ | ✓ | ✗ |
| Cost (per min) | ~$0.30 | $0.006 | $0.015 | $0.0043 |
| Speed | Real-time | Batch | Real-time | 1.5-3x realtime |

### Settings UI Update

**Settings → Transcription → Provider:**
```
┌─────────────────────────────────────┐
│ Select Transcription Provider       │
├─────────────────────────────────────┤
│ ○ ElevenLabs (recommended)          │
│   ✓ Real-time ✓ Diarization         │
│   Cost: ~$0.30/min                  │
│                                     │
│ ○ OpenAI Whisper API (cheapest)     │
│   ✗ Batch only ✗ No diarization     │
│   Cost: $0.006/min                  │
│                                     │
│ ○ AssemblyAI (advanced features)    │
│   ✓ Real-time ✓ Diarization         │
│   ✓ Sentiment ✓ Entity detection    │
│   Cost: $0.015/min                  │
│                                     │
│ ○ Deepgram (fastest)                │
│   ✓ Real-time ✓ Diarization         │
│   ✓ Very fast processing            │
│   Cost: $0.0043/min                 │
│                                     │
│ ○ Local Whisper (offline)           │
│   [Setup Wizard]                    │
└─────────────────────────────────────┘
```

### Implementation Steps (Each Provider)

1. **Create provider service file**
   - Implement STTProvider interface
   - API client setup
   - Audio conversion utilities

2. **Add API key management**
   - Settings UI for API key
   - Validation
   - Secure storage

3. **Implement transcription logic**
   - Upload/streaming audio
   - Response parsing
   - Error handling

4. **Add provider-specific features**
   - Custom vocabulary (AssemblyAI)
   - Model selection (Deepgram)
   - Advanced settings

5. **Cost tracking integration**
   - Add to usage dashboard
   - Provider-specific pricing

6. **Testing**
   - API integration
   - Real-time vs batch
   - Speaker diarization
   - Cost calculation

### Timing & Dependencies

**Prerequisites:**
- Provider abstraction layer complete (v3.0)
- Settings UI refactored for multiple providers (v3.0)
- Cost tracking system in place (v2.0)

**When to implement:**
- **After v3.0 stable** with 3 STT providers
- **Only if user demand** justifies additional complexity
- **Consider:** May be better to polish existing 3 options

### User Demand Signals

Implement if:
- Multiple users request specific provider
- Specific features needed (sentiment, entity detection)
- Cost optimization important (Deepgram cheapest real-time option)
- Performance critical (Deepgram fastest)

**Otherwise:** Defer to v4.0+ or later

### Technical Debt Considerations

**Adding more providers increases:**
- Maintenance burden (API changes, breaking updates)
- Testing complexity (5 providers to test)
- Settings UI complexity
- Documentation overhead
- Support complexity (users with issues)

**Benefits:**
- User choice
- Redundancy (if one provider down, use another)
- Cost optimization opportunities
- Feature access (sentiment, etc.)

### Testing Checklist (Per Provider)

- [ ] Provider service implements interface correctly
- [ ] API key validation works
- [ ] Audio upload/streaming works
- [ ] Transcription accurate
- [ ] Speaker diarization works (if supported)
- [ ] Real-time mode works (if supported)
- [ ] Cost tracking records usage
- [ ] Error handling robust
- [ ] Rate limiting handled
- [ ] Settings persist
- [ ] Switch between providers seamless
- [ ] Provider-specific features work

### Documentation

- Add provider comparison guide
- When to use which provider
- Setup instructions for each
- Feature matrix
- Cost calculator tool

### Recommendation

**Suggest deferring to v4.0+ unless:**
1. Strong user demand for specific provider
2. Need specific features (sentiment analysis, custom vocabulary)
3. Cost optimization critical (Deepgram for real-time)

**Focus v3.0 on:**
- Polishing existing 3 providers (ElevenLabs, OpenAI, Local)
- Templates system
- Making existing features rock-solid

**Then re-evaluate for v4.0** based on:
- User feedback
- Feature requests
- Cost optimization needs
- Provider reliability issues
