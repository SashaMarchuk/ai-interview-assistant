---
created: 2026-02-08
title: Local Transcription (Whisper Local)
area: feature
priority: P1
version: v3.0
complexity: very-high
estimate: 7-10 days
files:
  - src/services/transcription/whisper-local.ts
  - src/services/transcription/provider-abstraction.ts
  - src/components/settings/STTSettings.tsx
---

## Problem

Users want offline transcription capability to:
1. Work without internet connection
2. Save costs (no cloud API calls)
3. Maintain privacy (no data sent to cloud)

This is a complex architectural challenge requiring careful planning.

## User Requirements

- **Offline operation:** Works without internet
- **Cost savings:** No ElevenLabs API charges
- **Alternative to cloud STT**
- **Must be high quality:** Comparable to cloud services
- **Easy setup:** Minimal user effort

## Solution

**IMPORTANT: This feature requires a RESEARCH PHASE before implementation.**

### Architecture Decision Required

Three main approaches to evaluate:

**Option A: Browser WASM (whisper.cpp → WASM)**
- **Pros:**
  - No additional software installation
  - Works entirely in browser
  - Cross-platform by default
- **Cons:**
  - Large download (model files 30-1500MB)
  - Performance limitations (CPU-only)
  - Memory constraints
  - Slow initialization
- **Complexity:** Very High
- **User Experience:** Good (no install) but slow performance

**Option B: Native App Companion (Electron/Tauri)**
- **Pros:**
  - Better performance (native code)
  - GPU acceleration possible (CUDA/Metal/OpenCL)
  - Can use larger models
  - Persistent local server
- **Cons:**
  - Separate installation required
  - Platform-specific builds (Mac/Windows/Linux)
  - Distribution complexity
  - Extension ↔ App communication setup
- **Complexity:** Very High
- **User Experience:** Medium (extra install) but great performance

**Option C: Local Python Server**
- **Pros:**
  - Easy Whisper integration (OpenAI Whisper or faster-whisper)
  - Good performance with GPU support
  - Simple extension ↔ server communication
  - Community tools available (whisper.cpp server mode)
- **Cons:**
  - Requires Python installation
  - Requires ffmpeg installation
  - Manual setup for non-technical users
  - Port conflicts possible
- **Complexity:** Medium-High
- **User Experience:** Poor (manual setup) but good performance

**Option D: Hybrid Approach**
- **WASM for basic:** Small model (tiny/base) in browser
- **Native/Python for advanced:** Optional high-quality mode
- **Automatic fallback:** If local fails → cloud (ElevenLabs/OpenAI)
- **Complexity:** Very High
- **User Experience:** Best (works for everyone, optimizes for setup)

### Research Phase Tasks

Before implementing, must research:

1. **WASM Feasibility:**
   - Test whisper.cpp WASM build
   - Measure performance (real-time factor)
   - Measure memory usage
   - Test model loading time
   - Evaluate browser compatibility

2. **Native App Approach:**
   - Evaluate Tauri vs Electron
   - Design extension ↔ app protocol
   - Research GPU acceleration options
   - Estimate development time

3. **Python Server Approach:**
   - Test faster-whisper performance
   - Design setup wizard for users
   - Research auto-start mechanisms
   - Evaluate installation friction

4. **Model Selection:**
   - Test quality: tiny, base, small, medium
   - Benchmark speed vs accuracy
   - Measure disk space requirements
   - Compare to ElevenLabs quality

5. **Integration Design:**
   - Provider abstraction layer
   - Fallback strategies
   - Error handling
   - User notifications

### Recommended Architecture (Post-Research)

**Phase 1: Provider Abstraction**
```typescript
interface STTProvider {
  name: 'elevenlabs' | 'openai-whisper' | 'whisper-local';
  initialize(): Promise<void>;
  transcribe(audio: AudioBuffer): Promise<TranscriptSegment[]>;
  isAvailable(): Promise<boolean>;
  supportsRealtime(): boolean;
}
```

**Phase 2: Local Whisper Implementation**
- Start with Python server approach (easiest)
- Create setup wizard
- Implement fallback to cloud
- Add quality/speed settings

**Phase 3: WASM Optimization (Optional)**
- If Python friction too high
- Implement browser WASM version
- Use smaller models (tiny/base)

### Implementation Steps (High-Level)

1. **Research & Prototyping** (3-5 days)
   - Build proof-of-concept for each approach
   - Measure performance benchmarks
   - Make architecture decision

2. **Provider Abstraction** (1-2 days)
   - Design STTProvider interface
   - Refactor existing ElevenLabs to use interface
   - Add provider selection UI

3. **Local Whisper Integration** (3-4 days)
   - Implement chosen approach
   - Build setup wizard
   - Add model management
   - Implement fallback logic

4. **Testing & Optimization** (2-3 days)
   - Test with various audio inputs
   - Optimize performance
   - Handle edge cases
   - User acceptance testing

### Model Size Considerations

OpenAI Whisper models:
- **tiny:** 75MB, ~10x realtime (fast but lower quality)
- **base:** 142MB, ~7x realtime (good balance)
- **small:** 466MB, ~4x realtime (better quality)
- **medium:** 1.5GB, ~2x realtime (high quality)
- **large:** 2.9GB, ~1x realtime (best quality)

Recommendation: Default to **base** (good quality/speed), allow user upgrade to **small**.

### Settings UI

**Settings → Transcription:**
```
┌─────────────────────────────────────┐
│ Transcription Provider              │
├─────────────────────────────────────┤
│ ● ElevenLabs (cloud)                │
│   - Best quality                    │
│   - Real-time                       │
│   - Costs: $0.30/1000 chars         │
│                                     │
│ ○ OpenAI Whisper API (cloud)        │
│   - Good quality                    │
│   - Lower cost                      │
│                                     │
│ ○ Local Whisper (offline)           │
│   - Free                            │
│   - Private                         │
│   - Requires setup                  │
│   [Setup Wizard]                    │
│                                     │
│ ☑ Fallback to cloud if local fails  │
│                                     │
│ Local Whisper Settings:             │
│ Model: [base ▼]                     │
│ Language: [auto-detect ▼]           │
│ GPU Acceleration: ☑ Enabled         │
└─────────────────────────────────────┘
```

### Fallback Strategy

```typescript
async function transcribe(audio: AudioBuffer): Promise<TranscriptSegment[]> {
  const provider = settingsStore.sttProvider;

  try {
    // Try primary provider
    if (provider === 'whisper-local') {
      return await whisperLocal.transcribe(audio);
    }
  } catch (error) {
    // Fallback logic
    if (settingsStore.fallbackToCloud) {
      console.warn('Local transcription failed, falling back to cloud');
      return await elevenlabs.transcribe(audio);
    }
    throw error;
  }
}
```

### GPU Acceleration

- **CUDA (NVIDIA):** Best performance on Windows/Linux
- **Metal (Apple):** Best on macOS
- **OpenCL:** Cross-platform fallback
- **CPU-only:** Always available fallback

Detect GPU availability and show in UI.

### Setup Wizard (Python Approach)

Steps:
1. Check Python installed → Guide if not
2. Check ffmpeg installed → Guide if not
3. Install faster-whisper: `pip install faster-whisper`
4. Download model (base by default)
5. Start local server
6. Test connection
7. Configure extension to use localhost:PORT

### Dependencies

- **Provider abstraction layer:** Needs design
- **Existing transcription system:** Refactor needed
- **Settings UI:** Major additions

### Success Metrics

- **Performance:** Transcription within 2x realtime
- **Quality:** Comparable to ElevenLabs (subjective testing)
- **Reliability:** <5% fallback rate to cloud
- **Setup success:** >80% users complete setup successfully

### Risks & Mitigation

**Risk:** Poor performance on low-end devices
- **Mitigation:** Offer multiple model sizes, cloud fallback

**Risk:** Setup too complex for average users
- **Mitigation:** Detailed wizard, video guides, one-click installers

**Risk:** Model downloads fail
- **Mitigation:** Resume support, alternative mirrors, pre-bundled option

**Risk:** Real-time factor too slow
- **Mitigation:** Buffer management, quality warnings, auto-fallback

### Out of Scope (For Initial Version)

- Custom model fine-tuning
- Multi-language models (use auto-detect)
- Batch transcription
- Speaker diarization (may not be available locally)

### Testing Checklist

- [ ] Research phase completed
- [ ] Architecture decision documented
- [ ] Provider abstraction implemented
- [ ] Setup wizard tested
- [ ] Model download works
- [ ] Transcription accuracy acceptable
- [ ] Performance meets targets
- [ ] GPU acceleration works (if available)
- [ ] CPU-only fallback works
- [ ] Cloud fallback works
- [ ] Error handling robust
- [ ] Settings UI intuitive
- [ ] Setup completion rate measured
- [ ] Cross-platform testing (Mac/Windows/Linux)
- [ ] Documentation complete

### Documentation Needed

- Setup guide (with screenshots)
- Troubleshooting FAQ
- Performance tuning tips
- Model comparison chart
- Privacy benefits explanation

### Timeline Estimate

- **Research phase:** 3-5 days
- **Architecture decision:** 1 day
- **Implementation:** 3-4 days
- **Testing & polish:** 2-3 days
- **Documentation:** 1 day

**Total:** 10-14 days (includes research)

### Next Steps

1. **User approval** of research approach
2. **Spike:** Build proof-of-concept prototypes
3. **Decision:** Choose architecture based on benchmarks
4. **Implementation:** Follow chosen path
5. **Beta testing:** Small user group
6. **Public release:** After validation
