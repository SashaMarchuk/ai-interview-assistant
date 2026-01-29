---
phase: 05-overlay-ui
plan: 01
subsystem: overlay
tags: [react-rnd, use-chrome-storage, hooks, typescript, tailwind, shadow-dom]

dependency_graph:
  requires: [01-foundation]
  provides: [overlay-types, overlay-hooks, shadow-dom-css]
  affects: [05-02-overlay-components, 05-03-overlay-integration]

tech_stack:
  added:
    - react-rnd@10.5.2
    - use-chrome-storage@1.3.2
  patterns:
    - chrome-storage-persistence
    - auto-scroll-hook

key_files:
  created:
    - src/types/transcript.ts
    - src/overlay/hooks/useOverlayPosition.ts
    - src/overlay/hooks/useAutoScroll.ts
  modified:
    - package.json
    - src/assets/app.css

decisions:
  - id: overlay-persistence-library
    choice: use-chrome-storage
    rationale: Provides React hooks for chrome.storage.local with TypeScript support
  - id: drag-resize-library
    choice: react-rnd
    rationale: Single library combining react-draggable and react-resizable

metrics:
  duration: ~3 minutes
  completed: 2026-01-29
---

# Phase 05 Plan 01: Overlay UI Foundation Summary

**One-liner:** Installed react-rnd and use-chrome-storage, created transcript/overlay types, position persistence hook, auto-scroll hook, and Tailwind v4 Shadow DOM compatibility fixes.

## What Was Built

### Dependencies Added

| Package | Version | Purpose |
|---------|---------|---------|
| react-rnd | 10.5.2 | Drag and resize for overlay panel |
| use-chrome-storage | 1.3.2 | React hooks for chrome.storage API |

### Types Created (src/types/transcript.ts)

| Type | Purpose |
|------|---------|
| TranscriptEntry | STT result with speaker, text, timestamp, isFinal |
| LLMResponse | AI response with fastHint, fullAnswer, status |
| OverlayState | Position, size, minimized state for persistence |
| DEFAULT_OVERLAY_STATE | Default values (-1,-1 signals auto-position) |
| MOCK_TRANSCRIPT | Development mock data |
| MOCK_RESPONSE | Development mock response |

### Hooks Created

**useOverlayPosition** (src/overlay/hooks/useOverlayPosition.ts)
- Persists overlay position/size to chrome.storage.local
- Calculates default bottom-right position for first-time users
- Returns position, size, isMinimized, setters

**useAutoScroll** (src/overlay/hooks/useAutoScroll.ts)
- Returns ref for bottom anchor element
- Smooth scrolls when dependency changes
- Used for transcript auto-follow

### CSS Updates (src/assets/app.css)

Tailwind v4 Shadow DOM compatibility:
- @theme inline: px-based spacing values (--spacing-0 through --spacing-20)
- @theme inline: px-based text sizes (--text-xs through --text-2xl)
- :host selector: Shadow/ring/transform/backdrop variable fallbacks
- .overlay-container: System font stack

## Implementation Details

### Position Persistence Pattern

```typescript
const STORAGE_KEY = 'ai-interview-overlay-state';
const useOverlayStateStorage = createChromeStorageStateHookLocal<OverlayState>(
  STORAGE_KEY,
  DEFAULT_OVERLAY_STATE
);
```

The hook uses -1 as a sentinel value to detect first-time users and calculate appropriate bottom-right positioning based on window dimensions.

### Shadow DOM CSS Strategy

Tailwind v4's @property CSS declarations don't work inside Shadow DOM. The fix provides explicit fallback values:
1. @theme inline overrides spacing/text with px values
2. :host selector provides CSS variable defaults for effects

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash | Type | Description |
|------|------|-------------|
| ede96e2 | chore | Install react-rnd and use-chrome-storage dependencies |
| 27ef43b | feat | Add transcript and overlay types with mock data |
| 23f1802 | feat | Add overlay position persistence and auto-scroll hooks |
| dc4b2cd | feat | Add Tailwind v4 Shadow DOM compatibility fixes |

## Verification Results

| Check | Status |
|-------|--------|
| npm ls react-rnd use-chrome-storage | PASS - Both packages listed |
| npm run build | PASS - 373.96 kB output |
| Files exist | PASS - All 3 new files created |
| CSS @theme values | PASS - Present in built output |

## Next Phase Readiness

**Provided for 05-02:**
- TranscriptEntry, LLMResponse types for component props
- useOverlayPosition hook for Rnd integration
- useAutoScroll hook for transcript panel
- Shadow DOM-compatible CSS

**Dependencies satisfied:**
- react-rnd ready for overlay panel component
- use-chrome-storage ready for position persistence

**No blockers identified.**
