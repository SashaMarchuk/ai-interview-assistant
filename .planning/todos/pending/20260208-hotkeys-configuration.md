---
created: 2026-02-08
title: Hotkeys Configuration Page
area: feature
priority: P1
version: v2.1
complexity: medium
estimate: 2 days
files:
  - src/components/settings/HotkeysSection.tsx
  - src/services/hotkeys/hotkeyManager.ts
  - src/store/hotkeysStore.ts
  - src/types/hotkeys.ts
---

## Problem

Users need full control over keyboard shortcuts for all extension actions. Currently, hotkeys are hardcoded and cannot be customized. Power users want chord support (two-step hotkeys like Vim/Emacs).

## User Requirements

- **Settings → Hotkeys:** Dedicated configuration page
- **Configurable hotkeys:**
  - Start/Stop recording
  - Send to Fast
  - Send to Full
  - Generate Reasoning (default: Cmd+R)
  - Selection to LLM (default: Cmd+Enter)
  - Quick actions
  - Toggle overlay visibility
  - Focus transcript
- **Advanced features:**
  - Chord support (e.g., Ctrl+K, Ctrl+S for two-step)
  - Conflict detection (warn if duplicate)
  - Reset to defaults
  - Import/Export hotkey config
- **Cross-device sync:** Use chrome.storage.sync

## Solution

### Architecture

1. **Hotkey Schema**
   ```typescript
   interface HotkeyBinding {
     id: string; // action identifier
     name: string; // display name
     description: string;
     defaultKey: string; // default combo
     currentKey: string; // user-configured
     isChord: boolean; // two-step hotkey
     chordSequence?: string[]; // ['Ctrl+K', 'Ctrl+S']
     category: 'recording' | 'llm' | 'selection' | 'ui' | 'navigation';
   }

   interface HotkeyConfig {
     version: number;
     bindings: Record<string, HotkeyBinding>;
     globalEnabled: boolean; // master toggle
   }
   ```

2. **Hotkey Manager Service**
   - Central registry of all actions
   - Event listener for key combinations
   - Chord state tracking (first key pressed, waiting for second)
   - Conflict detection algorithm
   - Priority system (overlay vs page context)

3. **UI Components**
   - **Hotkey Recorder:**
     - Click "Record" button
     - Press key combination
     - Display normalized key string
     - Visual feedback during recording
   - **Category Sections:**
     - Group by category (Recording, LLM, Selection, etc.)
     - Collapsible sections
   - **Conflict Warnings:**
     - Red highlight if duplicate found
     - Suggest alternative
   - **Reset Button:**
     - Per-binding reset
     - Global "Reset All" option

### Implementation Steps

1. Create hotkeysStore with defaults
2. Implement hotkeyManager service
   - Key event listener (keydown/keyup)
   - Chord state machine
   - Action dispatcher
   - Conflict checker
3. Build HotkeysSection component
   - Category layout
   - Hotkey recorder input
   - Conflict detection UI
   - Reset functionality
4. Migrate existing hardcoded hotkeys to new system
5. Add import/export functionality
6. Implement chrome.storage.sync persistence

### Hotkey Categories & Defaults

**Recording:**
- Start/Stop Recording: `Ctrl+Shift+R`
- Pause Recording: `Ctrl+Shift+P`

**LLM Actions:**
- Send to Fast: `Ctrl+Shift+F`
- Send to Full: `Ctrl+Shift+G`
- Generate Reasoning: `Ctrl+R`
- Parallel Fast+Full: `Ctrl+Shift+B`

**Selection:**
- Selection to LLM: `Ctrl+Enter`
- Selection Quick Action: `Ctrl+Q`

**UI:**
- Toggle Overlay: `Ctrl+Shift+O`
- Toggle Transcript Panel: `Ctrl+T`
- Toggle Fast Panel: `Ctrl+1`
- Toggle Full Panel: `Ctrl+2`
- Toggle Reasoning Panel: `Ctrl+3`

**Navigation:**
- Focus Transcript: `Ctrl+Shift+T`
- Focus Settings: `Ctrl+,`

### Chord Hotkeys (Advanced)

Example chord sequences:
- `Ctrl+K, Ctrl+F` → Send to Fast
- `Ctrl+K, Ctrl+R` → Send to Reasoning
- `Ctrl+X, Ctrl+S` → Save session (future feature)

Chord timeout: 2 seconds (configurable)

### Conflict Detection Algorithm

```typescript
function detectConflicts(bindings: HotkeyBinding[]): ConflictWarning[] {
  const keyMap = new Map<string, string[]>();

  for (const binding of bindings) {
    const key = binding.isChord
      ? binding.chordSequence.join(' → ')
      : binding.currentKey;

    if (!keyMap.has(key)) {
      keyMap.set(key, []);
    }
    keyMap.get(key).push(binding.id);
  }

  return Array.from(keyMap.entries())
    .filter(([_, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ key, conflictingActions: ids }));
}
```

### Key Normalization

- Normalize key names: `Ctrl` (not `Control`), `Cmd` (not `Meta`)
- Platform detection: Auto-convert `Cmd` ↔ `Ctrl` on Mac/Windows
- Display format: `Ctrl+Shift+F` (human-readable)
- Storage format: Canonical representation

### Integration Points

- **All overlay components:** Use hotkey actions
- **Selection tooltip:** Register selection hotkeys
- **Settings page:** Hotkey configuration UI
- **Background script:** Global hotkey listener

### Technical Notes

- **chrome.commands API:**
  - Supports browser-level hotkeys (work even when extension not focused)
  - Limited to 4 shortcuts by default
  - Requires manifest.json configuration
- **Page-level hotkeys:**
  - Use addEventListener in content script
  - More flexible, unlimited shortcuts
  - Only work when overlay focused
- **Hybrid approach:**
  - Critical actions (start/stop) use chrome.commands
  - UI actions use page-level listeners

### Accessibility

- **Screen reader support:** Announce hotkey changes
- **Visual indicators:** Show active hotkey in tooltips
- **Alternative actions:** Ensure all hotkeys have mouse equivalents

### Export/Import Format

```json
{
  "version": 1,
  "bindings": {
    "start_recording": {
      "currentKey": "Ctrl+Shift+R",
      "isChord": false
    },
    "send_to_fast": {
      "currentKey": "Ctrl+K, Ctrl+F",
      "isChord": true,
      "chordSequence": ["Ctrl+K", "Ctrl+F"]
    }
  }
}
```

### Dependencies

- Existing hotkey handlers (migrate to new system)
- chrome.storage.sync
- chrome.commands API (optional for global shortcuts)

### Testing Checklist

- [ ] Record new hotkey binding
- [ ] Detect key conflicts
- [ ] Chord hotkeys work (two-step)
- [ ] Chord timeout works
- [ ] Reset individual binding
- [ ] Reset all bindings
- [ ] Export configuration
- [ ] Import configuration
- [ ] chrome.storage.sync persistence
- [ ] Cross-device sync works
- [ ] Platform-specific keys (Cmd/Ctrl) work
- [ ] All categories display correctly
- [ ] Conflict warnings show/hide
- [ ] Hotkeys work in overlay
- [ ] Global hotkeys work outside overlay
- [ ] Accessibility features work
