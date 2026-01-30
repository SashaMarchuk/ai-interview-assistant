---
phase: 07-integration
plan: 04
status: complete
started: 2026-01-30
completed: 2026-01-30
subsystem: capture-settings
tags: [hotkey, toggle-mode, capture, settings, zustand]
dependency-graph:
  requires: [07-01, 07-02]
  provides: [toggle-capture-mode, capture-mode-ui]
  affects: []
tech-stack:
  added: []
  patterns: [zustand-settings-pattern, radio-button-settings]
key-files:
  created: []
  modified:
    - src/store/types.ts
    - src/store/settingsSlice.ts
    - src/store/index.ts
    - src/hooks/useCaptureMode.ts
    - src/components/settings/HotkeySettings.tsx
decisions:
  - key: capture-mode-type
    choice: Union type 'hold' | 'toggle'
    rationale: Simple discriminated union for clear behavior selection
  - key: toggle-keydown-only
    choice: All toggle logic in keyDown handler
    rationale: KeyUp does nothing in toggle mode, preventing release-triggered sends
  - key: mode-field-consistency
    choice: CaptureState.mode stays 'hold' even in toggle mode
    rationale: Mode field refers to capture method (hold vs highlight), not settings mode
metrics:
  tasks: 3/3
  duration: ~5 minutes
---

# Phase 7 Plan 04: Toggle Mode Summary

Toggle mode for capture hotkey with persisted settings and UI selection.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add captureMode setting to store | b311675 | types.ts, settingsSlice.ts, index.ts |
| 2 | Implement toggle mode in useCaptureMode hook | 33d64b2 | useCaptureMode.ts |
| 3 | Add capture mode toggle to HotkeySettings UI | 3f183df | HotkeySettings.tsx |

## What Was Built

### CaptureMode Type and Setting
Added `CaptureMode` type with two values:
- `'hold'`: Default - hold hotkey to capture, release to send
- `'toggle'`: Press once to start capture, press again to stop and send

Setting persisted in chrome.storage.local via zustand partialize.

### Toggle Mode Logic
Updated `useCaptureMode` hook:
- In toggle mode, first keyDown starts capture (sets isHolding=true)
- Second keyDown stops capture and sends (like keyUp in hold mode)
- KeyUp handler returns early in toggle mode (no action)
- Hold mode behavior unchanged

### Settings UI
Radio button selection in HotkeySettings with clear descriptions:
- "Hold to capture" - Hold hotkey while speaking, release to send
- "Toggle mode" - Press once to start, press again to stop and send

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| CaptureMode type | Union 'hold' \| 'toggle' | Simple discriminated union for clear behavior |
| Toggle keyDown-only | All logic in keyDown | Prevents release-triggered sends in toggle mode |
| Mode field consistency | CaptureState.mode = 'hold' | Mode refers to capture method, not settings |

## Key Patterns

### Zustand Settings Pattern
```typescript
// Type definition
export type CaptureMode = 'hold' | 'toggle';

// Default value
captureMode: 'hold' as CaptureMode,

// Action
setCaptureMode: (mode: CaptureMode) => {
  set(() => ({ captureMode: mode }));
},

// Partialize for persistence
partialize: (state) => ({
  // ...other settings
  captureMode: state.captureMode,
}),
```

### Toggle Mode State Machine
```
[Idle] --keyDown--> [Capturing]
[Capturing] --keyDown--> [Send & Idle]
```

Hold mode uses keyDown->keyUp transition, toggle mode uses keyDown->keyDown.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

| Criteria | Status |
|----------|--------|
| CaptureMode type with 'hold' \| 'toggle' | PASS |
| Store has captureMode with 'hold' default | PASS |
| Setting persists (in partialize) | PASS |
| useCaptureMode implements toggle behavior | PASS |
| HotkeySettings shows radio buttons | PASS |
| Build succeeds with no TypeScript errors | PASS |

## Requirements Addressed

- **KEY-03**: Toggle mode for capture hotkey

## Next Phase Readiness

Phase 7 Integration Wave 2 complete. All 4 plans now done:
- 07-01: Graceful Degradation UI
- 07-02: Connection State & Retry Logic
- 07-03: Settings Wiring
- 07-04: Toggle Mode Integration

Ready for final E2E verification.
