---
created: 2026-02-08
title: Text Selection → Send to LLM
area: feature
priority: P1
version: v2.0
complexity: medium
estimate: 2 days
files:
  - src/components/overlay/SelectionTooltip.tsx
  - src/services/selection/selectionHandler.ts
  - src/components/settings/CustomPromptsSection.tsx
  - src/store/customPromptsStore.ts
---

## Problem

Users need a quick way to send selected transcript text to LLM for specific analysis or questions. Currently, they must manually copy text and use hotkeys, which is cumbersome.

## User Requirements

- **Selection methods:**
  - Mouse drag (standard text selection)
  - Shift + Arrow keys (keyboard selection)
- **Action triggers:**
  - Floating tooltip near selection (Google Docs style)
  - Right-click context menu
  - Hotkey: Cmd/Ctrl+Enter
- **Quick actions in tooltip:**
  - **Fast:** Use Fast model + Fast prompt
  - **Fast+Full:** Run both in parallel
  - **Quick:** Use separate "quick question" prompt
  - **Custom:** Select from user-defined custom prompts
- **Custom prompts management:**
  - Settings → Prompts → Custom Quick Prompts
  - User creates named prompts for reuse
  - Example: "Explain like I'm 5", "Give code example", "Find errors"

## Solution

### Architecture

1. **Selection Detection**
   ```typescript
   interface TextSelection {
     text: string;
     range: Range;
     position: { x: number; y: number };
     source: 'transcript' | 'response'; // where selection came from
   }
   ```

2. **Selection Tooltip Component**
   - Floating positioned near cursor
   - Buttons for quick actions
   - Dropdown for custom prompts
   - Auto-dismiss when clicking away

3. **Custom Prompts System**
   ```typescript
   interface CustomPrompt {
     id: string;
     name: string;
     prompt: string;
     icon?: string;
     hotkey?: string; // optional custom hotkey
   }
   ```

4. **Context Menu Integration**
   - Chrome context menu API
   - Show "Send to AI" submenu with same options
   - Works on any selected text in overlay

### Implementation Steps

1. Create selectionHandler service
   - Monitor text selection events
   - Calculate tooltip position
   - Handle keyboard selection (Shift+Arrows)
2. Build SelectionTooltip component
   - Floating UI with action buttons
   - Custom prompts dropdown
   - Smooth animations
3. Implement custom prompts store
4. Create CustomPromptsSection in Settings
   - CRUD interface for custom prompts
   - Prompt template variables support
5. Hook up action handlers
   - Fast: Use existing Fast LLM flow
   - Fast+Full: Parallel requests
   - Quick/Custom: Use selected prompt
6. Add context menu integration
7. Implement Cmd+Enter hotkey

### Prompt Template Variables

Support variables in custom prompts:
- `{selection}` - The selected text
- `{language}` - Detected language
- `{files}` - File context if enabled

Example custom prompt:
```
Explain this concept in simple terms:
{selection}

Reply in {language}.
```

### UI/UX Details

- **Tooltip appearance:**
  - Compact, subtle styling
  - Appears 10px above selection end
  - Fades in smoothly
  - Auto-hides after 10s if no interaction
- **Action buttons:**
  - Icon + label
  - Fast: ⚡ Fast
  - Full: 🧠 Full
  - Quick: ❓ Quick
  - Custom: ⭐ Custom...

### Integration Points

- **File personalization:** Include file context if enabled
- **Language detection:** Use detected language in prompts
- **Cost tracking:** Track selection-based LLM calls
- **Response handling:** Show in appropriate panel or new popup

### Technical Notes

- **Selection API:** Use `window.getSelection()` for browser selection
- **Floating UI:** Consider using floating-ui library for positioning
- **Context menu:** Chrome extension context menu API
- **Hotkey conflicts:** Ensure Cmd+Enter doesn't conflict with existing hotkeys

### Default Custom Prompts

Ship with pre-configured examples:
1. **Explain Simply:** "Explain this in simple terms"
2. **Code Example:** "Provide a code example for this concept"
3. **Elaborate:** "Expand on this topic with more details"
4. **Critique:** "Point out any potential issues or misconceptions"

### Dependencies

- Existing LLM service (Fast/Full flows)
- Settings store for custom prompts
- Hotkey system

### Testing Checklist

- [ ] Mouse selection shows tooltip
- [ ] Keyboard selection (Shift+Arrows) works
- [ ] Tooltip positioned correctly
- [ ] Fast action works
- [ ] Fast+Full runs in parallel
- [ ] Quick action uses quick prompt
- [ ] Custom prompts dropdown works
- [ ] Create/edit/delete custom prompts
- [ ] Context menu shows on right-click
- [ ] Cmd+Enter hotkey works
- [ ] Tooltip auto-hides correctly
- [ ] Template variables replaced correctly
- [ ] File context included if enabled
- [ ] Response shows in correct panel
