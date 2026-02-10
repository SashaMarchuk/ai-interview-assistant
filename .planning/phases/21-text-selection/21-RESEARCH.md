# Phase 21: Enhanced Text Selection - Research

**Researched:** 2026-02-10
**Domain:** React text selection UI, Shadow DOM Selection API, floating tooltip positioning, drag-and-drop reordering
**Confidence:** HIGH

## Summary

Phase 21 adds a floating tooltip toolbar that appears when users select text in the overlay (transcript or response panels). The tooltip provides quick prompt actions (Explain, Elaborate, Summarize, Counter-argument) that send selected text to the LLM using the fast model. Users can customize which actions appear via a new "Quick Prompts" settings tab in the popup.

The primary technical challenge is **text selection detection inside Shadow DOM**. The overlay renders inside a WXT `createShadowRootUi` Shadow DOM container. The standard `document.getSelection()` in Chromium does NOT pierce Shadow DOM boundaries -- it returns empty for selections within a shadow tree. However, `Selection.getComposedRanges()` (Chrome 137+, available since mid-2025) solves this by accepting ShadowRoot arguments to access composed ranges. The WXT `ui.shadow` property provides direct access to the ShadowRoot. An alternative approach is `shadowRoot.getSelection()` (Chromium-only, non-standard) which also works.

The second challenge is **concurrent LLM requests**. The current `background.ts` cancels ALL active requests before starting a new one (line 1059-1066). The CONTEXT.md decision says quick prompts must run concurrently with ongoing requests. This requires either a new message type (`QUICK_PROMPT_REQUEST`) that bypasses the cancel-all logic, or adding an `isQuickPrompt` flag to `LLM_REQUEST` that skips cancellation.

**Primary recommendation:** Use `document.getSelection()` with `getComposedRanges({ shadowRoots: [shadowRoot] })` for Shadow DOM selection, `@floating-ui/react-dom` for tooltip positioning via virtual elements, and `@dnd-kit/sortable` for drag-and-drop reordering in settings. Add a new `QUICK_PROMPT_REQUEST` message type to the messaging system to support concurrent requests.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Tooltip Appearance & Actions:**
- Compact horizontal toolbar style (like Notion's selection toolbar -- clean, minimal)
- Small triangular arrow pointer connecting tooltip to selection
- Buttons show icon + short text labels (e.g., "Explain")
- Tooltip stays visible after clicking an action (supports multiple actions on same selection)
- Clicked button shows spinner/loading indicator while LLM request is in flight
- Selected text stays highlighted until response arrives
- Quick fade-in animation (~150ms) when tooltip appears
- 200ms debounce delay before showing tooltip (avoids flickering during selection)
- Quick prompts always use the fast model (lightweight tasks)
- Response displayed in the existing response panel (not inline)
- Quick prompt requests can run concurrently with ongoing LLM requests

**Quick Prompt Set:**
- 4 default actions: Explain, Elaborate, Summarize, Counter-argument
- Maximum 4 actions in toolbar at any time
- Selected text sent as primary context: "Explain this: [selected text]"
- Counter-argument uses interview-aware framing: "Provide a counter-argument to this point, as an interviewer might challenge it"
- Response panel shows action label + text snippet as header (e.g., "Explain: 'microservices architecture...'")
- Quick prompt responses append below existing response content (not replace)
- Keyboard shortcut for the first action (e.g., Ctrl+Shift+E for Explain on current selection)
- Custom prompts support {{selection}} template variable for flexible text placement

**Customization in Settings:**
- Full CRUD: users can add, remove, edit, and reorder actions (up to max 4)
- Dedicated "Quick Prompts" tab in popup settings
- "Reset to defaults" button restores original 4 actions
- Drag-and-drop reordering with grab handles
- Icon picker from ~10-15 predefined icons when creating custom prompts
- "Test" button sends prompt with sample text and shows preview response before saving
- {{selection}} template variable supported in custom prompt text
- Quick prompt configurations stored in Zustand store (synced via webext-zustand)

**Selection Behavior & Edge Cases:**
- Tooltip only appears for click-and-drag selections (not double-click -- reserved for Phase 20 transcript editing)
- Any selection length triggers tooltip (no minimum character threshold)
- Works in both transcript panel and response panel
- Works on code blocks and prose -- code selections are valid (explain a code snippet)
- Tooltip dismisses on click outside (no Escape key handler needed)
- Feature can be disabled via toggle in settings
- Quick prompts allowed to run concurrently with ongoing LLM requests (no blocking)

### Claude's Discretion

- Tooltip position logic (above vs below selection, flip behavior near edges)
- Exact icon set for the icon picker (~10-15 options)
- Keyboard shortcut key combination (suggested Ctrl+Shift+E but flexible)
- Exact animation easing and timing details
- Error handling for failed quick prompt requests
- Sample text content for the "Test" button in settings

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@floating-ui/react-dom` | ^0.3.x | Tooltip positioning relative to text selection | Industry standard for floating element positioning; lightweight (~3KB); virtual element support for Range-based positioning; built-in flip/shift middleware |
| `@dnd-kit/core` | ^6.x | Drag-and-drop framework for settings reorder | Modern React DnD; ~10KB; accessible; hook-based; well-maintained |
| `@dnd-kit/sortable` | ^8.x | Sortable preset for reorder list | Thin layer on @dnd-kit/core specifically for list reordering |
| `@dnd-kit/utilities` | ^3.x | CSS transform utilities for DnD | Required peer for CSS transforms during drag |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Native `Selection.getComposedRanges()` | Chrome 137+ | Shadow DOM-aware text selection | Always -- primary selection API for Shadow DOM |
| Native `Range.getBoundingClientRect()` | All browsers | Get selection position for tooltip placement | Always -- feeds coordinates to Floating UI virtual element |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@floating-ui/react-dom` | Manual absolute positioning with `getBoundingClientRect()` | Loses flip/shift/overflow detection; more code, more edge cases |
| `@dnd-kit/sortable` | CSS-only drag with HTML5 drag API | Worse UX, no touch support, limited control over drag preview |
| `@dnd-kit/sortable` | Simple up/down arrow buttons | User explicitly asked for drag-and-drop reordering, not arrow buttons |

**Installation:**
```bash
npm install @floating-ui/react-dom @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── overlay/
│   ├── SelectionTooltip.tsx       # Floating tooltip component
│   ├── hooks/
│   │   └── useTextSelection.ts    # Selection detection hook (Shadow DOM aware)
│   ├── Overlay.tsx                # Modified: renders SelectionTooltip
│   ├── TranscriptPanel.tsx        # Modified: participates in selection events
│   └── ResponsePanel.tsx          # Modified: appends quick prompt responses
├── components/
│   └── settings/
│       └── QuickPromptSettings.tsx # Settings CRUD with DnD reorder
├── store/
│   ├── types.ts                   # Modified: add QuickPrompt types, quickPromptsSlice
│   ├── quickPromptsSlice.ts       # New slice for quick prompt config
│   ├── settingsSlice.ts           # Modified: add quickPromptsEnabled toggle
│   └── index.ts                   # Modified: add quickPromptsSlice
├── types/
│   └── messages.ts                # Modified: add QUICK_PROMPT_REQUEST message type
└── entrypoints/
    ├── content.tsx                 # Modified: handle quick prompt requests, pass shadowRoot
    ├── background.ts              # Modified: handle QUICK_PROMPT_REQUEST without cancelling
    └── popup/App.tsx              # Modified: add Quick Prompts tab
```

### Pattern 1: Shadow DOM Selection Detection via `useTextSelection` Hook
**What:** A custom React hook that listens for `mouseup` events and checks for text selection using `getComposedRanges()` with the shadow root, returning selection text and bounding rect.
**When to use:** In the Overlay component to detect when users select text in transcript/response panels.
**Key insight:** The `selectionchange` event fires on `document`, but inside Shadow DOM we need `getComposedRanges({ shadowRoots: [shadowRoot] })` to get the actual range. The hook must receive the ShadowRoot reference from the content script.

```typescript
// Source: MDN Selection.getComposedRanges() + Floating UI virtual elements
function useTextSelection(shadowRoot: ShadowRoot | null) {
  const [selectionState, setSelectionState] = useState<{
    text: string;
    rect: DOMRect | null;
  } | null>(null);

  useEffect(() => {
    if (!shadowRoot) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleMouseUp = () => {
      // Clear any pending debounce
      if (debounceTimer) clearTimeout(debounceTimer);

      debounceTimer = setTimeout(() => {
        const selection = document.getSelection();
        if (!selection || selection.isCollapsed) {
          setSelectionState(null);
          return;
        }

        // Use getComposedRanges for Shadow DOM support
        const ranges = selection.getComposedRanges({ shadowRoots: [shadowRoot] });
        if (ranges.length === 0) {
          setSelectionState(null);
          return;
        }

        const text = selection.toString().trim();
        if (!text) {
          setSelectionState(null);
          return;
        }

        // Convert StaticRange to live Range for getBoundingClientRect()
        const staticRange = ranges[0];
        const liveRange = document.createRange();
        liveRange.setStart(staticRange.startContainer, staticRange.startOffset);
        liveRange.setEnd(staticRange.endContainer, staticRange.endOffset);
        const rect = liveRange.getBoundingClientRect();

        setSelectionState({ text, rect });
      }, 200); // 200ms debounce per CONTEXT.md
    };

    const handleMouseDown = () => {
      // Only dismiss if not clicking on tooltip itself
      // (tooltip click handling is separate)
    };

    // Listen on the shadow root's host document for mouseup
    shadowRoot.addEventListener('mouseup', handleMouseUp);

    return () => {
      shadowRoot.removeEventListener('mouseup', handleMouseUp);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [shadowRoot]);

  return selectionState;
}
```

### Pattern 2: Floating UI Virtual Element for Selection Positioning
**What:** Using Floating UI's virtual element pattern to position the tooltip relative to the text selection's bounding rect.
**When to use:** When rendering the SelectionTooltip component.

```typescript
// Source: https://floating-ui.com/docs/virtual-elements
import { useFloating, offset, flip, shift } from '@floating-ui/react-dom';

function SelectionTooltip({ rect, ... }: Props) {
  const { refs, floatingStyles } = useFloating({
    placement: 'top',  // Default above selection
    middleware: [
      offset(8),       // 8px gap from selection
      flip(),          // Flip to bottom if no space above
      shift({ padding: 8 }), // Keep within viewport
    ],
  });

  // Set virtual reference from selection rect
  useEffect(() => {
    if (rect) {
      refs.setPositionReference({
        getBoundingClientRect: () => rect,
      });
    }
  }, [rect, refs]);

  return (
    <div ref={refs.setFloating} style={floatingStyles}>
      {/* Tooltip buttons */}
    </div>
  );
}
```

### Pattern 3: Quick Prompt Request Flow (Concurrent with Regular LLM)
**What:** A new message type `QUICK_PROMPT_REQUEST` that bypasses the cancel-all logic in background.ts.
**When to use:** When user clicks a quick prompt action button.
**Key insight:** Current `LLM_REQUEST` handler cancels ALL active requests (line 1058-1066 in background.ts). Quick prompts need their own pathway to avoid cancelling ongoing requests. The response is streamed back using the same `LLM_STREAM` / `LLM_STATUS` message types but with a unique `responseId` that the content script can route to the correct UI section.

```typescript
// New message type in messages.ts
export interface QuickPromptRequestMessage extends BaseMessage {
  type: 'QUICK_PROMPT_REQUEST';
  responseId: string;
  selectedText: string;
  promptTemplate: string; // e.g., "Explain this: {{selection}}"
  actionLabel: string;    // e.g., "Explain"
}
```

### Pattern 4: Appending Quick Prompt Responses to Response Panel
**What:** Modify `ResponsePanel` to accept and render an array of quick prompt responses below the main response.
**When to use:** When quick prompt responses arrive via LLM streaming.
**Key insight:** The response panel currently shows a single `LLMResponse` with `fastHint` and `fullAnswer`. Quick prompt responses should be appended as separate sections with a header showing the action label and text snippet.

### Pattern 5: Zustand Quick Prompts Slice
**What:** A new Zustand slice storing the array of quick prompt actions (max 4), persisted via chrome.storage.
**When to use:** For storing/reading quick prompt configurations.

```typescript
// In store/types.ts
export interface QuickPromptAction {
  id: string;
  label: string;         // "Explain"
  icon: string;          // Emoji or icon key
  promptTemplate: string; // "Explain this: {{selection}}" or "{{selection}} - elaborate on this"
  order: number;         // 0-3 for display ordering
}

export interface QuickPromptsSlice {
  quickPrompts: QuickPromptAction[];
  quickPromptsEnabled: boolean;
  setQuickPrompts: (prompts: QuickPromptAction[]) => void;
  setQuickPromptsEnabled: (enabled: boolean) => void;
  addQuickPrompt: (prompt: Omit<QuickPromptAction, 'id' | 'order'>) => void;
  updateQuickPrompt: (id: string, updates: Partial<Omit<QuickPromptAction, 'id'>>) => void;
  removeQuickPrompt: (id: string) => void;
  reorderQuickPrompts: (orderedIds: string[]) => void;
  resetQuickPromptsToDefaults: () => void;
}
```

### Anti-Patterns to Avoid
- **Anti-pattern: Using `document.getSelection()` without `getComposedRanges()`:** In Chromium, `document.getSelection()` returns empty for selections inside Shadow DOM. Always use `getComposedRanges({ shadowRoots: [shadowRoot] })`.
- **Anti-pattern: Using the same LLM_REQUEST message type for quick prompts:** The current handler cancels all active requests. Quick prompts need a separate pathway to enable concurrency.
- **Anti-pattern: Replacing response panel content with quick prompt results:** Decision says responses should APPEND below existing content, not replace.
- **Anti-pattern: Using `selectionchange` event directly:** This fires too frequently and needs debouncing. Prefer `mouseup` + debounce for click-and-drag selection detection.
- **Anti-pattern: Double-click selection:** Phase 20 uses double-click for transcript editing. Phase 21 must only trigger on click-and-drag selections. Check `selection.type === 'Range'` (not `'Caret'`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tooltip positioning with viewport awareness | Custom absolute positioning with manual flip/shift | `@floating-ui/react-dom` with `flip()` + `shift()` middleware | Edge detection, overflow handling, virtual element support are complex to get right |
| Drag-and-drop list reordering | HTML5 Drag API or manual mouse tracking | `@dnd-kit/sortable` | Touch support, accessibility, grab handles, smooth animations built-in |
| Shadow DOM selection ranges | Custom shadow root traversal | `Selection.getComposedRanges()` | Native API, handles all edge cases, Chrome 137+ (well above extension's target) |
| Debounce utility | Custom setTimeout wrapper | Simple inline setTimeout with cleanup | Only 1 usage; no need for lodash/debounce for single case |

**Key insight:** The Floating UI virtual element pattern (`refs.setPositionReference({ getBoundingClientRect })`) is purpose-built for positioning relative to text selections. Building custom viewport-aware positioning is error-prone.

## Common Pitfalls

### Pitfall 1: Shadow DOM getSelection() Returns Empty
**What goes wrong:** `document.getSelection().toString()` returns empty string for text selected inside Shadow DOM in Chromium.
**Why it happens:** Chromium's `document.getSelection()` does not pierce Shadow DOM boundaries by default.
**How to avoid:** Use `selection.getComposedRanges({ shadowRoots: [shadowRoot] })` to get the composed range, then use the range to extract text. The `ui.shadow` property from WXT's `createShadowRootUi` provides the ShadowRoot reference.
**Warning signs:** Selection tooltip never appears despite text being visually selected.

### Pitfall 2: Selection Conflicts with Phase 20 Double-Click Edit
**What goes wrong:** Double-clicking a word creates a selection, which triggers the tooltip, conflicting with Phase 20's inline editing.
**Why it happens:** Double-click natively selects a word AND triggers the `dblclick` event.
**How to avoid:** Only show tooltip for `mouseup` events after a drag selection. Check that the selection is a `Range` type (not `Caret`) and that it resulted from a mousedown-then-mousemove-then-mouseup sequence, not a double-click. Track `mousedown` and filter out selections where `mouseup` fires without significant mouse movement AND `event.detail >= 2` (double-click indicator).
**Warning signs:** Tooltip appears on double-click in transcript panel.

### Pitfall 3: Background Cancels Quick Prompt Requests
**What goes wrong:** User clicks a quick prompt action, but it cancels the ongoing main LLM request.
**Why it happens:** `background.ts` line 1058-1066 cancels ALL `activeAbortControllers` before starting a new `LLM_REQUEST`.
**How to avoid:** Use a separate `QUICK_PROMPT_REQUEST` message type with its own abort controller tracking. Quick prompt abort controllers should be stored separately (e.g., `quickPromptAbortControllers`) and should NOT be cleared by the regular `LLM_REQUEST` handler.
**Warning signs:** Main response disappears when clicking a quick prompt action.

### Pitfall 4: StaticRange vs Range for getBoundingClientRect
**What goes wrong:** `getComposedRanges()` returns `StaticRange` objects, but `StaticRange` does NOT have `getBoundingClientRect()`.
**Why it happens:** `StaticRange` is a simpler interface than `Range` -- it lacks DOM manipulation and geometry methods.
**How to avoid:** Convert `StaticRange` to a live `Range` using `document.createRange()` + `setStart/setEnd` from the `StaticRange`'s container/offset values.
**Warning signs:** TypeError: `staticRange.getBoundingClientRect is not a function`.

### Pitfall 5: Tooltip Positioning in Scrollable Containers
**What goes wrong:** Tooltip appears at wrong position when transcript/response panel is scrolled.
**Why it happens:** `getBoundingClientRect()` returns viewport-relative coordinates, but if the tooltip is positioned within a scrollable container, the offsets need adjusting.
**How to avoid:** Render the tooltip as a sibling of the scrollable container (not inside it), using viewport coordinates directly. Floating UI handles this correctly when using virtual elements at the document level.
**Warning signs:** Tooltip drifts from selection after scrolling.

### Pitfall 6: Quick Prompt Responses Overwriting Main Response
**What goes wrong:** Quick prompt response replaces the main LLM response in the panel.
**Why it happens:** The current content.tsx `initLLMResponse` sets `currentLLMResponse = null` and `activeResponseId` to the new ID, which causes the existing response to be discarded.
**How to avoid:** Quick prompt responses need a separate state variable (e.g., `quickPromptResponses: QuickPromptResponse[]`) that appends to the response panel without touching `currentLLMResponse`. The ResponsePanel should render both.
**Warning signs:** "Full Answer" section disappears when clicking Explain.

### Pitfall 7: Tailwind Animations in Shadow DOM
**What goes wrong:** Tailwind v4 animation classes (like `animate-spin` for loading spinner) may not work in Shadow DOM due to missing `@property` declarations.
**Why it happens:** Same Shadow DOM `@property` issue documented in `app.css` for other Tailwind features.
**How to avoid:** Add explicit `@keyframes` and animation CSS in `app.css` if needed, similar to existing Shadow DOM fallbacks. Or use inline styles for the spinner animation.
**Warning signs:** Loading spinner doesn't animate after clicking an action button.

## Code Examples

### Passing ShadowRoot to Overlay
```typescript
// In content.tsx onMount callback
const ui = await createShadowRootUi(ctx, {
  name: 'ai-interview-assistant',
  position: 'inline',
  anchor: 'body',
  onMount: (container, shadow) => {
    // shadow is the ShadowRoot - pass it down to overlay
    const wrapper = document.createElement('div');
    wrapper.id = 'ai-interview-root';
    container.appendChild(wrapper);
    const root = createRoot(wrapper);
    root.render(
      <CaptureProvider ...>
        <Overlay shadowRoot={shadow} />
      </CaptureProvider>,
    );
    return root;
  },
});
```

### Distinguishing Click-and-Drag from Double-Click
```typescript
// Track mousedown to distinguish drag selection from double-click
let mouseDownTime = 0;
let mouseDownPos = { x: 0, y: 0 };

const handleMouseDown = (e: MouseEvent) => {
  mouseDownTime = Date.now();
  mouseDownPos = { x: e.clientX, y: e.clientY };
};

const handleMouseUp = (e: MouseEvent) => {
  // Ignore double-clicks (event.detail >= 2)
  if (e.detail >= 2) return;

  // Proceed with selection check after 200ms debounce
  // ...
};
```

### Quick Prompt Request Handler in Background (No Cancel)
```typescript
// In background.ts message handler
case 'QUICK_PROMPT_REQUEST': {
  // Do NOT cancel existing requests -- quick prompts run concurrently
  const abortController = new AbortController();
  quickPromptAbortControllers.set(message.responseId, abortController);

  handleQuickPromptRequest(
    message.responseId,
    message.selectedText,
    message.promptTemplate,
    message.actionLabel,
    abortController,
  );
  return { success: true };
}
```

### Default Quick Prompt Actions
```typescript
const DEFAULT_QUICK_PROMPTS: QuickPromptAction[] = [
  {
    id: 'explain',
    label: 'Explain',
    icon: 'lightbulb',    // maps to emoji or SVG
    promptTemplate: 'Explain this: {{selection}}',
    order: 0,
  },
  {
    id: 'elaborate',
    label: 'Elaborate',
    icon: 'expand',
    promptTemplate: 'Elaborate on this in more detail: {{selection}}',
    order: 1,
  },
  {
    id: 'summarize',
    label: 'Summarize',
    icon: 'compress',
    promptTemplate: 'Summarize the key points of this: {{selection}}',
    order: 2,
  },
  {
    id: 'counter',
    label: 'Counter',
    icon: 'scales',
    promptTemplate: 'Provide a counter-argument to this point, as an interviewer might challenge it: {{selection}}',
    order: 3,
  },
];
```

### Icon Set for Icon Picker (Claude's Discretion)
```typescript
// Recommend ~12 Unicode emoji icons -- simple, universal, no library needed
const ICON_OPTIONS = [
  { key: 'lightbulb', emoji: '\u{1F4A1}', label: 'Lightbulb' },
  { key: 'expand', emoji: '\u{1F50D}', label: 'Magnify' },
  { key: 'compress', emoji: '\u{1F4DD}', label: 'Memo' },
  { key: 'scales', emoji: '\u{2696}\u{FE0F}', label: 'Scales' },
  { key: 'brain', emoji: '\u{1F9E0}', label: 'Brain' },
  { key: 'rocket', emoji: '\u{1F680}', label: 'Rocket' },
  { key: 'check', emoji: '\u{2705}', label: 'Check' },
  { key: 'warning', emoji: '\u{26A0}\u{FE0F}', label: 'Warning' },
  { key: 'star', emoji: '\u{2B50}', label: 'Star' },
  { key: 'wrench', emoji: '\u{1F527}', label: 'Wrench' },
  { key: 'book', emoji: '\u{1F4DA}', label: 'Books' },
  { key: 'chat', emoji: '\u{1F4AC}', label: 'Chat' },
];
```

## Discretion Recommendations

### Tooltip Position Logic
**Recommendation:** Default placement `'top'` (above selection) with `flip()` middleware to auto-switch to `'bottom'` when insufficient space above. Use `shift({ padding: 8 })` to keep tooltip within viewport horizontally. Add `offset(8)` for 8px gap between selection and tooltip. This is the Floating UI standard pattern and handles all edge cases automatically.

### Keyboard Shortcut
**Recommendation:** `Ctrl+Shift+E` (Explain) -- matches the first default action. On Mac, this could be `Cmd+Shift+E`. The shortcut should only fire when there is an active text selection. Use the same hotkey parsing infrastructure from `useCaptureMode.ts` (`parseHotkey`/`matchesHotkey`).

### Animation Easing
**Recommendation:** `ease-out` for fade-in, `150ms` duration as specified. CSS: `transition: opacity 150ms ease-out`. No complex spring animations -- matches the Notion-like minimal aesthetic.

### Error Handling for Failed Quick Prompts
**Recommendation:** Show inline error state on the clicked button (red tint + "Failed" text) for 3 seconds, then reset to normal state. Don't show a separate error toast -- keep it contained within the tooltip. Log the error to console for debugging.

### Sample Text for Test Button
**Recommendation:** Use a realistic interview-relevant snippet: "Microservices architecture provides independent deployability and technology heterogeneity, but introduces complexity in distributed data management and inter-service communication."

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `shadowRoot.getSelection()` (non-standard) | `selection.getComposedRanges({ shadowRoots })` | Chrome 137, mid-2025 | Standard API; works across browsers; future-proof |
| Popper.js v1/v2 | Floating UI (`@floating-ui/react-dom`) | 2022-2023 | Smaller bundle; better React integration; virtual element support |
| react-beautiful-dnd | @dnd-kit | 2021+ | rbd deprecated; dnd-kit is actively maintained, hook-based, accessible |

**Deprecated/outdated:**
- `shadowRoot.getSelection()`: Non-standard Chromium API. Still works but `getComposedRanges()` is the standard replacement.
- `react-beautiful-dnd`: Deprecated by Atlassian. Use `@dnd-kit` instead.
- Popper.js v1/v2: Replaced by Floating UI (same author).

## Open Questions

1. **WXT `createShadowRootUi` onMount callback signature**
   - What we know: The WXT docs show `onMount: (container, shadow)` where `shadow` is the ShadowRoot. The interface `ShadowRootContentScriptUi` has a `.shadow` property.
   - What's unclear: Whether the `onMount` callback in the current WXT 0.19.x actually passes the shadow root as second parameter, or if we need to access it via `ui.shadow` after mount.
   - Recommendation: Try both approaches during implementation. If `onMount(container, shadow)` doesn't provide shadow root, access it via `ui.shadow` and pass it down via React context or prop.

2. **getComposedRanges() TypeScript declarations**
   - What we know: Chrome 137+ supports `getComposedRanges()`. TypeScript's lib.dom.d.ts may not yet include the type declaration.
   - What's unclear: Whether the current TypeScript version (5.4.5) includes `getComposedRanges` in its lib types.
   - Recommendation: Add a type declaration in `src/types/globals.d.ts` if missing:
     ```typescript
     interface Selection {
       getComposedRanges(options?: { shadowRoots?: ShadowRoot[] }): StaticRange[];
     }
     ```

3. **Quick prompt response routing in content.tsx**
   - What we know: Current `handleLLMStream` and `handleLLMStatus` route by `responseId`. Quick prompts will generate unique `responseId` values.
   - What's unclear: How to differentiate quick prompt responses from regular responses in the content script to route them to the right state variable.
   - Recommendation: Use a prefix convention for responseIds (e.g., `qp-{uuid}`) or add a `source` field to `LLM_STREAM`/`LLM_STATUS` messages. Alternatively, maintain a `Set<string>` of active quick prompt responseIds in content.tsx for routing.

## Sources

### Primary (HIGH confidence)
- MDN `Selection.getComposedRanges()`: https://developer.mozilla.org/en-US/docs/Web/API/Selection/getComposedRanges -- API reference, browser compatibility
- Floating UI Virtual Elements: https://floating-ui.com/docs/virtual-elements -- positioning pattern for text selection
- WXT `ShadowRootContentScriptUi` interface: https://wxt.dev/api/reference/wxt/utils/content-script-ui/shadow-root/interfaces/shadowrootcontentscriptui -- `.shadow` property access
- Can I Use `getComposedRanges()`: https://caniuse.com/mdn-api_selection_getcomposedranges -- Chrome 137, Firefox 142, Safari 17
- @dnd-kit documentation: https://docs.dndkit.com -- sortable list implementation

### Secondary (MEDIUM confidence)
- Shadow DOM selection explainer: https://github.com/mfreed7/shadow-dom-selection -- W3C proposal context
- Floating UI React integration: https://floating-ui.com/docs/react -- React hooks usage
- @dnd-kit GitHub: https://github.com/clauderic/dnd-kit -- maintenance status, version info

### Tertiary (LOW confidence)
- Chrome Labs shadow-selection-polyfill: https://github.com/GoogleChromeLabs/shadow-selection-polyfill -- fallback option if `getComposedRanges` fails (unlikely needed)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Floating UI and @dnd-kit are well-documented industry standards; `getComposedRanges()` is a stable web API
- Architecture: HIGH -- Patterns derive directly from existing codebase conventions (custom events, Zustand slices, message types) and verified library APIs
- Pitfalls: HIGH -- Shadow DOM selection issues are well-documented; concurrent request conflict identified from reading actual background.ts code
- Shadow DOM selection API: HIGH -- MDN documentation verified, Chrome 137+ confirmed, Can I Use data checked

**Research date:** 2026-02-10
**Valid until:** 2026-03-10 (30 days -- stable APIs, no fast-moving dependencies)
