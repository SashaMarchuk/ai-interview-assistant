---
created: 2026-02-08
title: Verify/Fix Automatic Speaker Merging
area: bug
priority: P2
version: v2.1
complexity: low
estimate: 0.5-1 day
files:
  - src/services/transcription/elevenlabs.ts
  - src/components/overlay/TranscriptPanel.tsx
  - src/types/transcript.ts
---

## Problem

Transcript should automatically merge consecutive segments from the same speaker into single blocks. This may already be implemented (ElevenLabs provides speaker diarization), but needs verification.

## User Requirements

- **Automatic merging:** If consecutive words are from same speaker, combine into one segment
- **No manual action needed:** Works automatically during transcription
- **Better readability:** Less clutter, easier to read transcript

## Solution

### Investigation Phase (First Step)

1. **Check existing implementation:**
   - Review ElevenLabs transcription service
   - Check if speaker diarization already merges speakers
   - Test with actual recording to see current behavior

2. **Verify behavior:**
   - Record test conversation with speaker changes
   - Check how transcript displays
   - Confirm if merging happens or not

### If NOT Implemented - Add Merging Logic

```typescript
interface TranscriptSegment {
  id: string;
  text: string;
  speaker: string;
  timestamp: number;
  endTimestamp?: number;
}

function mergeConsecutiveSegments(
  segments: TranscriptSegment[]
): TranscriptSegment[] {
  if (segments.length === 0) return [];

  const merged: TranscriptSegment[] = [];
  let current = { ...segments[0] };

  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i];

    // Same speaker - merge text
    if (segment.speaker === current.speaker) {
      current.text += ' ' + segment.text;
      current.endTimestamp = segment.endTimestamp || segment.timestamp;
    } else {
      // Different speaker - push current and start new
      merged.push(current);
      current = { ...segment };
    }
  }

  merged.push(current); // Push last segment
  return merged;
}
```

### If ALREADY Implemented - Verify & Document

- Test merging behavior
- Add test cases
- Document in code comments
- Update user documentation

### Integration Points

- **ElevenLabs service:** May already handle this via API
- **Transcript rendering:** Display merged segments
- **Transcript editing (v2.0):** Ensure edits work with merged segments

### Implementation Steps

1. **Investigation:**
   - Review `src/services/transcription/elevenlabs.ts`
   - Check API response format
   - Test recording with speaker changes
2. **If needed - implement merging:**
   - Add merging function
   - Call after receiving transcription
   - Update transcript store
3. **Testing:**
   - Multi-speaker conversation
   - Rapid speaker changes
   - Same speaker long monologue
4. **Documentation:**
   - Update code comments
   - Note in changelog

### Edge Cases

- **Very short segments:** Don't merge if time gap > 2 seconds
- **Speaker confidence:** ElevenLabs may have low confidence - handle gracefully
- **Real-time updates:** Ensure merging works with streaming transcription

### Configuration (Optional)

Add user preference in Settings:
- **Auto-merge speakers:** ON/OFF toggle
- **Merge threshold:** Time gap before creating new segment (default: 2s)

### Dependencies

- Existing ElevenLabs integration
- Transcript store
- Transcript rendering components

### Testing Checklist

- [ ] Verify current merging behavior
- [ ] Test with two-speaker conversation
- [ ] Test with rapid speaker changes
- [ ] Test with single speaker (no changes)
- [ ] Check time gaps between segments
- [ ] Ensure merged segments display correctly
- [ ] Verify transcript editing works with merged
- [ ] Check export includes merged correctly
- [ ] Test with ElevenLabs API edge cases
- [ ] Document findings
