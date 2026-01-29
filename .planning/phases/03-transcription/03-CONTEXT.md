# Phase 3: Transcription - Context

**Gathered:** 2026-01-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Live speech-to-text with speaker labels — real-time streaming transcription from both tab audio (interviewer) and microphone (user), merged chronologically with speaker identification. WebSocket connection to ElevenLabs maintained via Offscreen Document.

</domain>

<decisions>
## Implementation Decisions

### Speaker Labeling
- User's speech labeled as "You"
- Tab audio speakers labeled as "Speaker 1", "Speaker 2", etc. (numbered via diarization)
- If diarization unavailable, fallback to generic "Interviewer" label
- Each speaker gets a distinct accent color for visual differentiation
- Click-to-rename: users can click speaker name to rename (e.g., "Speaker 1" → "John")
- Renamed labels persist for session only, reset when session ends
- Consecutive messages from same speaker grouped under header (not inline per message)

### Transcript Formatting
- Timestamps visible in absolute time format (e.g., "10:34:15")
- Timestamp appears after speaker name: "You (10:34): Hello..."
- Long messages wrap naturally within panel width
- Text selectable for copying
- Click-to-copy button on each entry in addition to text selection

### Interim Results Display
- Interim (partial) transcription shown in italic text
- Animated typing indicator (dots or cursor) shows active transcription
- Interim results appear for both "You" and "Speaker N" sources
- Fade transition when interim text becomes finalized

### Connection Handling
- Auto-reconnect silently on WebSocket disconnect (no user interruption)
- 3 reconnection attempts with increasing delay before giving up
- After failure: subtle indicator icon in corner with tooltip for details
- Buffer audio during brief disconnects, send on reconnect

### Claude's Discretion
- Grouping threshold for consecutive speaker messages (reasonable time gap)
- Specific reconnection backoff timing
- Exact animation/transition durations
- Typing indicator implementation details

</decisions>

<specifics>
## Specific Ideas

- Speaker colors should align with Phase 5 decisions (blue for "You" already established)
- Grouping behavior similar to chat apps like Slack or iMessage

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-transcription*
*Context gathered: 2026-01-29*
