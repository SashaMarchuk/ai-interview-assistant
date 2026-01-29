---
phase: 04-llm-integration
plan: 03
status: complete
subsystem: llm-integration
tags: [capture-mode, keyboard-handling, hotkeys, content-script, react-hooks]

dependency-graph:
  requires: ["04-01"]
  provides: ["useCaptureMode hook", "CaptureProvider component", "keyboard capture handling"]
  affects: ["04-04", "07-01"]

tech-stack:
  added: []
  patterns: ["React context provider", "keyboard event capture phase", "custom events"]

files:
  created:
    - src/hooks/useCaptureMode.ts
    - src/hooks/index.ts
  modified:
    - entrypoints/content.tsx

decisions:
  - "Capture phase event listeners for hotkey interception"
  - "Window blur handler prevents stuck capture state"
  - "CaptureContext exposes state for visual indicator"
  - "Custom events for non-React consumers"

metrics:
  duration: 3m
  completed: 2026-01-29
---

# Phase 04 Plan 03: Capture Mode Integration Summary

**One-liner:** Hold-to-capture and highlight-to-send keyboard handling via useCaptureMode hook with CaptureProvider wrapping overlay

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create useCaptureMode hook | 5489b6a | src/hooks/useCaptureMode.ts, src/hooks/index.ts |
| 2 | Integrate capture mode into content script | 41d695a | entrypoints/content.tsx |

## What Was Built

### useCaptureMode Hook
- Parses hotkey strings like "Ctrl+Shift+Space" into components
- matchesHotkey() checks KeyboardEvent against parsed hotkey config
- getHighlightedText() retrieves window selection for highlight-to-send
- Hold-to-capture: start on keydown, capture transcript on keyup
- Highlight-to-send: immediate trigger when text is selected
- Window blur handler resets state to prevent stuck capture

### Content Script Integration
- Transcript helper functions: getTranscriptSince(), getRecentTranscript(), getFullTranscript()
- sendLLMRequest() sends LLM_REQUEST message to background with question, context, templateId
- CaptureProvider component wraps Overlay and uses useCaptureMode hook
- CaptureContext exposes capture state for visual indicator in overlay
- Custom events (capture-state-update) for non-React consumers

## Key Implementation Details

### Hotkey Parsing
```typescript
function parseHotkey(hotkeyString: string): ParsedHotkey {
  const parts = hotkeyString.split('+').map((p) => p.toLowerCase().trim());
  const key = parts[parts.length - 1];
  return {
    key: key === 'space' ? ' ' : key,
    ctrl: parts.includes('ctrl') || parts.includes('control'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    meta: parts.includes('meta') || parts.includes('cmd') || parts.includes('command'),
  };
}
```

### Event Capture Phase
```typescript
// Use capture phase (true) to intercept before other handlers
window.addEventListener('keydown', handleKeyDown, true);
window.addEventListener('keyup', handleKeyUp, true);
window.addEventListener('blur', handleBlur);
```

### CaptureProvider Pattern
```tsx
<CaptureProvider
  onCapture={sendLLMRequest}
  getTranscriptSince={getTranscriptSince}
  getRecentTranscript={getRecentTranscript}
  getFullTranscript={getFullTranscript}
>
  <Overlay />
</CaptureProvider>
```

## Decisions Made

1. **Capture phase event listeners:** Use capture phase (third parameter `true`) to intercept hotkeys before Google Meet's handlers can consume them

2. **Window blur handler:** Prevents stuck capture state if user alt-tabs while holding hotkey

3. **CaptureContext for visual indicator:** React context exposes isHolding state for overlay to show visual feedback

4. **Custom events for debugging:** Dispatch capture-state-update events for non-React consumers or debugging

5. **Refs for keyup handler:** Use refs (isHoldingRef, captureStartTimeRef) to access current values in keyup callback without stale closures

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

| Check | Status |
|-------|--------|
| npm run build passes | PASS |
| useCaptureMode exports from src/hooks | PASS |
| CaptureProvider wraps Overlay | PASS |
| TypeScript compiles without errors | PASS |

## Success Criteria Met

- [x] Hold-to-capture mode: hold hotkey, release to send
- [x] Highlight-to-send mode: select text, press hotkey to send
- [x] Window blur resets hold state (prevents stuck capture)
- [x] LLM_REQUEST sent with question, context, and template ID
- [x] CaptureContext exposes state for visual indicator

## Next Phase Readiness

Ready for 04-04 (Response Display) - the overlay can consume CaptureContext.isHolding for visual indicator, and LLM_REQUEST messages are being sent to background.

**Dependencies satisfied:**
- LLM service foundation (04-01) provides buildPrompt and streamLLMResponse
- LLM message types enable content script to send LLM_REQUEST

**Integration point:** Background service worker needs handler for LLM_REQUEST messages (04-02 work in progress).
