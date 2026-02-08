---
created: 2026-02-08
title: OpenAI Whisper API Support
area: feature
priority: P2
version: v3.0
complexity: medium
estimate: 2-3 days
files:
  - src/services/transcription/openai-whisper.ts
  - src/services/transcription/provider-abstraction.ts
  - src/components/settings/STTSettings.tsx
---

## Problem

Users want a cloud-based alternative to ElevenLabs that may be more cost-effective. OpenAI's Whisper API provides high-quality transcription at potentially lower cost.

## User Requirements

- **Cloud-based:** No local setup required
- **Cost-effective:** Potentially cheaper than ElevenLabs
- **High quality:** OpenAI's Whisper is industry-standard
- **Simple integration:** Similar to existing ElevenLabs flow

## Solution

### Architecture

1. **Provider Abstraction (if not already done)**
   ```typescript
   interface STTProvider {
     name: 'elevenlabs' | 'openai-whisper' | 'whisper-local';
     initialize(): Promise<void>;
     transcribe(audio: AudioBuffer): Promise<TranscriptSegment[]>;
     isAvailable(): Promise<boolean>;
     supportsRealtime(): boolean;
     supportsSpeakerDiarization(): boolean;
   }
   ```

2. **OpenAI Whisper Implementation**
   ```typescript
   class OpenAIWhisperProvider implements STTProvider {
     name = 'openai-whisper';

     async transcribe(audio: AudioBuffer): Promise<TranscriptSegment[]> {
       // Convert audio to file
       const audioFile = await this.audioToFile(audio);

       // Call OpenAI Whisper API
       const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
         method: 'POST',
         headers: {
           'Authorization': `Bearer ${apiKey}`,
         },
         body: this.createFormData(audioFile)
       });

       const result = await response.json();
       return this.parseResponse(result);
     }

     supportsRealtime(): boolean {
       return false; // Whisper API is batch-only
     }

     supportsSpeakerDiarization(): boolean {
       return false; // No speaker diarization
     }
   }
   ```

3. **API Integration Details**
   - **Endpoint:** `POST /v1/audio/transcriptions`
   - **Audio format:** File upload (mp3, mp4, mpeg, mpga, m4a, wav, webm)
   - **Model:** `whisper-1` (currently only model)
   - **Parameters:**
     - `file`: Audio file
     - `model`: "whisper-1"
     - `language`: Optional (ISO-639-1 code)
     - `prompt`: Optional context
     - `response_format`: "json" | "verbose_json" | "text" | "srt" | "vtt"
     - `temperature`: 0-1 (randomness)
     - `timestamp_granularities[]`: "word" | "segment"

### Implementation Steps

1. **Refactor existing STT system (if needed)**
   - Create STTProvider interface
   - Migrate ElevenLabs to interface
   - Add provider selection logic

2. **Implement OpenAI Whisper provider**
   - Create openai-whisper.ts service
   - Audio buffer → file conversion
   - API client implementation
   - Response parsing

3. **Add Settings UI**
   - Provider selection: Radio buttons or dropdown
   - OpenAI Whisper specific settings:
     - API key input (reuse existing OpenAI key)
     - Language selection (optional)
     - Response format
     - Temperature

4. **Handle differences from ElevenLabs**
   - **No real-time:** Batch processing only
   - **No speaker diarization:** All text attributed to single speaker
   - **Chunk handling:** May need to split long audio into chunks (<25MB)

5. **Cost tracking integration**
   - Track audio minutes transcribed
   - Calculate cost: $0.006 per minute (as of 2026)
   - Add to usage dashboard

### API Pricing (as of 2026-02)

- **OpenAI Whisper API:** $0.006 per minute
- **ElevenLabs:** ~$0.30 per 1000 characters (variable by speech rate)

**Cost comparison:**
- 1 minute of speech ≈ 150-200 words ≈ 750-1000 characters
- OpenAI: $0.006/min
- ElevenLabs: ~$0.225-$0.30/min

**OpenAI is ~40-50x cheaper!**

### Audio Processing

**Challenge:** Browser audio → File upload

```typescript
async function audioBufferToFile(
  buffer: AudioBuffer
): Promise<File> {
  // Convert AudioBuffer to WAV
  const wav = audioBufferToWav(buffer);

  // Create File object
  return new File([wav], 'audio.wav', {
    type: 'audio/wav'
  });
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const length = buffer.length * buffer.numberOfChannels * 2;
  const arrayBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(arrayBuffer);

  // Write WAV header
  writeWavHeader(view, buffer);

  // Write PCM samples
  const offset = 44;
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset + i * 2, s * 0x7FFF, true);
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
```

### Response Format

**Use `verbose_json` for timestamps:**
```json
{
  "task": "transcribe",
  "language": "english",
  "duration": 12.4,
  "text": "Full transcript text",
  "words": [
    {
      "word": "Hello",
      "start": 0.0,
      "end": 0.4
    },
    ...
  ],
  "segments": [
    {
      "id": 0,
      "seek": 0,
      "start": 0.0,
      "end": 4.0,
      "text": " Hello, how are you?",
      "tokens": [50364, 2425, 11, 577, 366, 291, 30, 50564],
      "temperature": 0.0,
      "avg_logprob": -0.3,
      "compression_ratio": 1.5,
      "no_speech_prob": 0.01
    }
  ]
}
```

Convert to our TranscriptSegment format:
```typescript
function parseWhisperResponse(data: WhisperResponse): TranscriptSegment[] {
  return data.segments.map(segment => ({
    id: generateId(),
    text: segment.text.trim(),
    speaker: 'Speaker 1', // No diarization
    timestamp: segment.start * 1000, // Convert to ms
    endTimestamp: segment.end * 1000,
    confidence: 1 - segment.no_speech_prob
  }));
}
```

### Settings UI

**Settings → Transcription → Provider:**
```
┌─────────────────────────────────────┐
│ Transcription Provider              │
├─────────────────────────────────────┤
│ ○ ElevenLabs                        │
│   ✓ Real-time transcription         │
│   ✓ Speaker diarization             │
│   Cost: ~$0.30 per 1000 chars       │
│                                     │
│ ● OpenAI Whisper API                │
│   ✓ High quality                    │
│   ✗ No real-time (batch only)       │
│   ✗ No speaker diarization          │
│   Cost: $0.006 per minute           │
│   (~40x cheaper than ElevenLabs!)   │
│                                     │
│ ○ Local Whisper (offline)           │
│   [Setup Wizard]                    │
└─────────────────────────────────────┘

OpenAI Whisper Settings:
API Key: [Use OpenAI key from LLM settings]
Language: [Auto-detect ▼]
Temperature: [0.0 ──────●─── 1.0]
```

### Limitations vs ElevenLabs

**Limitations:**
1. **No real-time:** Must wait for full audio file processing
2. **No speaker diarization:** Cannot distinguish speakers
3. **Batch processing:** Not suitable for live capture scenarios
4. **File size limit:** 25MB per request

**When to use OpenAI Whisper:**
- Cost is primary concern
- Don't need speaker diarization
- Batch processing acceptable
- Post-interview transcription review

**When to use ElevenLabs:**
- Need real-time transcription
- Need speaker identification
- Live interview assistance critical

### Chunking Strategy

For long recordings (>25MB or >30 minutes):
```typescript
async function transcribeLongAudio(buffer: AudioBuffer): Promise<TranscriptSegment[]> {
  const chunks = splitAudioBuffer(buffer, 10 * 60); // 10-minute chunks

  const results = await Promise.all(
    chunks.map(chunk => this.transcribe(chunk))
  );

  return mergeSegments(results);
}
```

### Integration Points

- **Provider abstraction:** Must be implemented first (or alongside)
- **Cost tracking:** Add Whisper API to usage dashboard
- **Settings:** Provider selection UI
- **LLM integration:** Reuse existing OpenAI API key

### Dependencies

- Provider abstraction interface (may need to create)
- Existing OpenAI API key from LLM settings
- Audio buffer conversion utilities

### Testing Checklist

- [ ] Provider abstraction works
- [ ] Select OpenAI Whisper in settings
- [ ] API key validation
- [ ] Audio buffer → file conversion
- [ ] API call successful
- [ ] Response parsing correct
- [ ] Segments have timestamps
- [ ] Single speaker attribution
- [ ] Cost tracking records usage
- [ ] Long audio chunking works
- [ ] Error handling (API failures, rate limits)
- [ ] Language auto-detection
- [ ] Manual language selection
- [ ] Temperature setting works
- [ ] Switch between providers without issues
- [ ] Settings persist correctly

### Future Enhancements

- **Speaker diarization:** Use pyannote.audio or similar (separate service)
- **Real-time alternative:** OpenAI Realtime API (when available)
- **Batch job queue:** Process multiple recordings efficiently
- **Whisper fine-tuning:** Custom model for specific domains

### Documentation

- Add to user guide: When to use which STT provider
- Cost comparison table
- Limitations clearly explained
- Setup instructions
