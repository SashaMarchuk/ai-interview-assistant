# Phase 5: Overlay UI (Track B) - Research

**Researched:** 2026-01-29
**Domain:** React Draggable/Resizable UI, Shadow DOM CSS Isolation, Chrome Extension Storage, Auto-scroll Patterns
**Confidence:** MEDIUM (Tailwind v4 + Shadow DOM has known issues requiring workarounds)

## Summary

Phase 5 builds a professional floating overlay with draggable/resizable behavior, live transcript display, and dual response panels. The foundation from Phase 1 already establishes Shadow DOM injection via WXT's `createShadowRootUi`, so this phase focuses on enhancing that overlay with proper interactivity and styling.

The standard approach uses **react-rnd** (v10.5.2) for combined drag-and-resize functionality, **chrome.storage.local** for position/size persistence, and custom React hooks for auto-scroll behavior. A critical discovery: **Tailwind CSS v4 has known compatibility issues with Shadow DOM** due to reliance on `@property` CSS declarations that don't work inside shadow roots. This requires either converting `rem` units to `px` or providing CSS variable fallbacks.

The existing `OverlayPlaceholder.tsx` component provides a solid starting point with minimize/expand toggle already implemented. The content script's `cssInjectionMode: 'ui'` configuration ensures styles are injected into the shadow root automatically.

**Primary recommendation:** Use react-rnd for drag/resize, convert Tailwind's rem-based spacing to px units to avoid Shadow DOM issues, persist overlay state via chrome.storage.local, and implement auto-scroll with a bottom anchor ref pattern.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react-rnd` | ^10.5.2 | Draggable + resizable component | Combines both capabilities in one API, TypeScript support, React 18 compatible, well-maintained |
| `use-chrome-storage` | ^1.x | React hooks for chrome.storage | Simplifies storage access in React, auto-syncs across extension contexts |
| Tailwind CSS | ^4.1.x | Utility-first styling | Already installed, but requires Shadow DOM workarounds |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `postcss-rem-to-px` | ^3.x | Convert rem to px in Tailwind output | Required if Tailwind rem units cause sizing issues in Shadow DOM |
| Native CSS | - | `backdrop-filter: blur()` | Transparent blur effect (browser-native, no library needed) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-rnd | react-draggable + react-resizable | Two libraries to manage vs one integrated solution |
| react-rnd | @dnd-kit | @dnd-kit excels at drag-and-drop lists, less suited for single-element position/resize |
| use-chrome-storage | Direct chrome.storage API | More boilerplate, manual state sync |
| react-collapsed | Manual CSS transitions | react-collapsed handles height:auto animation edge cases |

**Installation:**
```bash
npm install react-rnd use-chrome-storage
npm install -D postcss-rem-to-px  # Only if needed for Shadow DOM fix
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── overlay/
│   ├── Overlay.tsx              # Main overlay container with react-rnd
│   ├── OverlayHeader.tsx        # Drag handle, minimize button
│   ├── TranscriptPanel.tsx      # Live transcript with speaker labels
│   ├── ResponsePanel.tsx        # Dual fast-hint + full-answer display
│   ├── hooks/
│   │   ├── useOverlayPosition.ts   # Position/size persistence hook
│   │   └── useAutoScroll.ts        # Auto-scroll to bottom hook
│   └── types.ts                 # Overlay-specific types
├── types/
│   ├── messages.ts              # (existing)
│   └── transcript.ts            # Transcript/response interfaces
└── content/
    └── (content.tsx already exists)
```

### Pattern 1: react-rnd with Controlled State

**What:** Use react-rnd in controlled mode with position/size passed as props.
**When to use:** Always - enables persistence and programmatic control.

```typescript
// Source: https://github.com/bokuweb/react-rnd
import { Rnd } from 'react-rnd';
import { useOverlayPosition } from './hooks/useOverlayPosition';

export function Overlay({ children }: { children: React.ReactNode }) {
  const { position, size, setPosition, setSize, isLoaded } = useOverlayPosition();

  // Don't render until initial position loaded from storage
  if (!isLoaded) return null;

  return (
    <Rnd
      position={position}
      size={size}
      onDragStop={(e, d) => setPosition({ x: d.x, y: d.y })}
      onResizeStop={(e, dir, ref, delta, pos) => {
        setSize({
          width: parseInt(ref.style.width),
          height: parseInt(ref.style.height),
        });
        setPosition(pos);
      }}
      dragHandleClassName="overlay-drag-handle"
      minWidth={280}
      minHeight={200}
      bounds="window"
      enableResizing={{
        top: false,
        right: true,
        bottom: true,
        left: false,
        topRight: false,
        bottomRight: true,
        bottomLeft: false,
        topLeft: false,
      }}
    >
      {children}
    </Rnd>
  );
}
```

### Pattern 2: Position/Size Persistence with chrome.storage

**What:** Custom hook that syncs overlay position/size to chrome.storage.local.
**When to use:** To persist overlay state between sessions.

```typescript
// Source: https://github.com/onikienko/use-chrome-storage
import { createChromeStorageStateHookLocal } from 'use-chrome-storage';

interface OverlayState {
  x: number;
  y: number;
  width: number;
  height: number;
  isMinimized: boolean;
}

const STORAGE_KEY = 'overlay-state';
const DEFAULT_STATE: OverlayState = {
  x: window.innerWidth - 340,  // Default to bottom-right
  y: window.innerHeight - 400,
  width: 320,
  height: 380,
  isMinimized: false,
};

// Create reusable hook (can be used in multiple components)
export const useOverlayState = createChromeStorageStateHookLocal(
  STORAGE_KEY,
  DEFAULT_STATE
);

// Usage in component
function OverlayContainer() {
  const [state, setState, isPersistent, error, isLoaded] = useOverlayState();

  if (!isLoaded) return null;  // Wait for storage to load

  // ... use state.x, state.y, state.width, state.height
}
```

### Pattern 3: Auto-scroll with Bottom Anchor

**What:** Scroll to bottom when new transcript entries arrive.
**When to use:** Live transcript panel.

```typescript
// Source: https://dev.to/hugaidas/anchor-scroll-at-the-bottom-of-the-container-with-dynamic-content-2knj
import { useRef, useEffect } from 'react';

export function useAutoScroll<T>(dependency: T) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [dependency]);

  return bottomRef;
}

// Usage in TranscriptPanel
function TranscriptPanel({ entries }: { entries: TranscriptEntry[] }) {
  const bottomRef = useAutoScroll(entries.length);

  return (
    <div className="overflow-y-auto h-32">
      {entries.map((entry) => (
        <TranscriptEntry key={entry.id} entry={entry} />
      ))}
      <div ref={bottomRef} />  {/* Anchor element */}
    </div>
  );
}
```

### Pattern 4: Drag Handle with CSS Class

**What:** Designate specific area as drag handle using className.
**When to use:** When only header should initiate drag.

```typescript
// react-rnd v8.0.0+ automatically adds dot prefix
<Rnd dragHandleClassName="overlay-drag-handle">
  <div>
    <div className="overlay-drag-handle cursor-move">
      {/* This area initiates drag */}
      <span>AI Interview Assistant</span>
      <button onClick={onMinimize}>-</button>
    </div>
    <div>
      {/* Content area - not draggable */}
    </div>
  </div>
</Rnd>
```

### Pattern 5: Minimize/Expand Toggle

**What:** Toggle between full overlay and minimized bar.
**When to use:** UI-05 requirement.

```typescript
function Overlay() {
  const [state, setState] = useOverlayState();

  const handleToggleMinimize = () => {
    setState(prev => ({ ...prev, isMinimized: !prev.isMinimized }));
  };

  if (state.isMinimized) {
    return (
      <Rnd
        position={{ x: state.x, y: state.y }}
        size={{ width: 120, height: 32 }}
        enableResizing={false}
        onDragStop={(e, d) => setState(prev => ({ ...prev, x: d.x, y: d.y }))}
      >
        <button onClick={handleToggleMinimize} className="...">
          AI Assistant
        </button>
      </Rnd>
    );
  }

  return (
    <Rnd position={...} size={...} ...>
      <FullOverlay onMinimize={handleToggleMinimize} />
    </Rnd>
  );
}
```

### Anti-Patterns to Avoid

- **Using rem units in Tailwind with Shadow DOM:** rem is relative to the host page's root font-size, not the shadow root. Use px-based spacing.
- **Rendering before storage loads:** Always check `isLoaded` before rendering positioned elements to avoid flash of default position.
- **Adding padding to collapse container:** Breaks height animation. Put padding on inner element instead.
- **Drag handle with leading dot:** react-rnd v8.0.0+ adds the dot automatically. Just use class name without dot.
- **Very high z-index assumptions:** Shadow DOM creates its own stacking context. A moderate z-index (999999) is sufficient.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag + resize combined | Separate drag/resize logic | react-rnd | Integrated solution handles edge cases, bounds, constraints |
| Storage persistence hook | Manual chrome.storage wrapper | use-chrome-storage | Handles async loading, state sync, error handling |
| Height animation | Manual JS animation | CSS `transition: height` or react-collapsed | CSS handles it better, react-collapsed handles auto height |
| Scroll anchoring | Manual scroll position tracking | useRef + scrollIntoView | Browser handles smooth scrolling, less code |
| CSS isolation | Manual style scoping | WXT createShadowRootUi | Already handles Shadow DOM setup |

**Key insight:** The hard parts (drag-resize interaction, storage sync, Shadow DOM CSS injection) are solved by existing libraries and WXT. Focus on composing them correctly.

## Common Pitfalls

### Pitfall 1: Tailwind v4 @property Breaks in Shadow DOM

**What goes wrong:** Shadows, box-shadows, transforms, and gradients don't render correctly.
**Why it happens:** Tailwind v4 uses `@property` CSS declarations for variable defaults, but `@property` has no effect inside Shadow DOM.
**How to avoid:** Either:
1. Convert rem to px units via postcss plugin or Tailwind theme override
2. Add CSS variable fallbacks to `:host` selector
3. Use Tailwind v3.x which doesn't rely on `@property`

**Warning signs:** Buttons look unstyled, shadows missing, spacing inconsistent.

**Workaround code:**
```css
/* Add to app.css for Shadow DOM compatibility */
@theme inline {
  --spacing-0: 0;
  --spacing-0-5: 2px;
  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 12px;
  --spacing-4: 16px;
  /* ... continue for all used spacing values */

  --text-xs: 12px;
  --text-sm: 14px;
  --text-base: 16px;
  /* ... continue for all used font sizes */
}

:host {
  /* Fallbacks for @property-dependent features */
  --tw-shadow: 0 0 #0000;
  --tw-ring-shadow: 0 0 #0000;
  --tw-border-style: solid;
}
```

### Pitfall 2: Flash of Unstyled/Unpositioned Content

**What goes wrong:** Overlay appears at default position then jumps to saved position.
**Why it happens:** chrome.storage.local is async; component renders before data loads.
**How to avoid:** Return null or loading state until `isLoaded` is true from storage hook.
**Warning signs:** Brief flash of overlay in corner, then jumps.

### Pitfall 3: Backdrop Filter Requires Transparency

**What goes wrong:** `backdrop-filter: blur()` has no visible effect.
**Why it happens:** Element needs semi-transparent background for blur to show through.
**How to avoid:** Use `background: rgba(255,255,255,0.8)` or Tailwind's `bg-white/80` with `backdrop-blur-sm`.
**Warning signs:** Blur works in isolation but not when background is opaque.

### Pitfall 4: Event Bubbling to Host Page

**What goes wrong:** Clicking in overlay triggers events on underlying Google Meet page.
**Why it happens:** Events bubble out of Shadow DOM by default.
**How to avoid:** Use WXT's `isolateEvents` option in createShadowRootUi, or add `event.stopPropagation()` on container.
**Warning signs:** Clicking overlay triggers Meet UI actions.

### Pitfall 5: Stacking Context in Shadow DOM

**What goes wrong:** Overlay appears behind page elements despite high z-index.
**Why it happens:** Shadow DOM creates separate stacking context from main document.
**How to avoid:** Ensure the shadow host element (the outer container WXT creates) has position:fixed and high z-index.
**Warning signs:** Overlay hidden behind fixed headers or modals.

## Code Examples

### Complete Overlay Component Structure

```typescript
// src/overlay/Overlay.tsx
import { Rnd } from 'react-rnd';
import { useOverlayState } from './hooks/useOverlayPosition';
import { TranscriptPanel } from './TranscriptPanel';
import { ResponsePanel } from './ResponsePanel';

interface OverlayProps {
  transcript: TranscriptEntry[];
  fastHint: string | null;
  fullAnswer: string | null;
}

export function Overlay({ transcript, fastHint, fullAnswer }: OverlayProps) {
  const [state, setState, , , isLoaded] = useOverlayState();

  if (!isLoaded) return null;

  if (state.isMinimized) {
    return (
      <Rnd
        position={{ x: state.x, y: state.y }}
        size={{ width: 140, height: 36 }}
        enableResizing={false}
        bounds="window"
        onDragStop={(e, d) => setState(prev => ({ ...prev, x: d.x, y: d.y }))}
        className="z-[999999]"
      >
        <button
          onClick={() => setState(prev => ({ ...prev, isMinimized: false }))}
          className="w-full h-full bg-blue-500 text-white rounded-lg shadow-lg
                     hover:bg-blue-600 text-sm font-medium px-3"
        >
          AI Assistant
        </button>
      </Rnd>
    );
  }

  return (
    <Rnd
      position={{ x: state.x, y: state.y }}
      size={{ width: state.width, height: state.height }}
      onDragStop={(e, d) => setState(prev => ({ ...prev, x: d.x, y: d.y }))}
      onResizeStop={(e, dir, ref, delta, pos) => {
        setState(prev => ({
          ...prev,
          width: parseInt(ref.style.width),
          height: parseInt(ref.style.height),
          ...pos,
        }));
      }}
      dragHandleClassName="overlay-header"
      minWidth={280}
      minHeight={200}
      maxWidth={600}
      maxHeight={800}
      bounds="window"
      enableResizing={{
        top: false,
        right: true,
        bottom: true,
        left: false,
        topRight: false,
        bottomRight: true,
        bottomLeft: false,
        topLeft: false,
      }}
      className="z-[999999]"
    >
      <div className="h-full flex flex-col bg-white/90 backdrop-blur-sm
                      rounded-lg shadow-xl border border-gray-200 overflow-hidden">
        {/* Header - drag handle */}
        <div className="overlay-header flex items-center justify-between
                        px-4 py-2 bg-gray-50 border-b cursor-move">
          <span className="font-medium text-gray-700 text-sm">
            AI Interview Assistant
          </span>
          <button
            onClick={() => setState(prev => ({ ...prev, isMinimized: true }))}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            -
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 overflow-hidden flex flex-col gap-3">
          <TranscriptPanel entries={transcript} />
          <ResponsePanel fastHint={fastHint} fullAnswer={fullAnswer} />
        </div>
      </div>
    </Rnd>
  );
}
```

### Transcript Panel with Auto-scroll

```typescript
// src/overlay/TranscriptPanel.tsx
import { useAutoScroll } from './hooks/useAutoScroll';
import type { TranscriptEntry } from '@/types/transcript';

interface TranscriptPanelProps {
  entries: TranscriptEntry[];
}

export function TranscriptPanel({ entries }: TranscriptPanelProps) {
  const bottomRef = useAutoScroll(entries.length);

  return (
    <div className="flex-shrink-0">
      <div className="text-xs font-medium text-gray-500 mb-1">
        Transcript
      </div>
      <div className="bg-gray-50 rounded p-2 h-24 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="text-sm text-gray-400 italic">
            Waiting for audio...
          </div>
        ) : (
          <>
            {entries.map((entry) => (
              <div key={entry.id} className="text-sm mb-1">
                <span className="font-medium text-blue-600">
                  {entry.speaker}:
                </span>{' '}
                <span className="text-gray-700">{entry.text}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </div>
  );
}
```

### Dual Response Panel

```typescript
// src/overlay/ResponsePanel.tsx
interface ResponsePanelProps {
  fastHint: string | null;
  fullAnswer: string | null;
}

export function ResponsePanel({ fastHint, fullAnswer }: ResponsePanelProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="text-xs font-medium text-gray-500 mb-1">
        AI Response
      </div>
      <div className="flex-1 bg-gray-50 rounded p-2 overflow-y-auto">
        {!fastHint && !fullAnswer ? (
          <div className="text-sm text-gray-400 italic">
            Hold hotkey to capture question...
          </div>
        ) : (
          <div className="space-y-2">
            {fastHint && (
              <div className="text-sm">
                <span className="font-medium text-green-600">Quick:</span>{' '}
                <span className="text-gray-700">{fastHint}</span>
              </div>
            )}
            {fullAnswer && (
              <div className="text-sm">
                <span className="font-medium text-purple-600">Full:</span>{' '}
                <span className="text-gray-700">{fullAnswer}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

### TypeScript Interfaces for Mock Data

```typescript
// src/types/transcript.ts

export interface TranscriptEntry {
  id: string;
  speaker: string;           // "Interviewer" or "You" or detected name
  text: string;
  timestamp: number;         // Unix timestamp ms
  isFinal: boolean;          // false for interim results
  confidence?: number;       // 0-1 confidence score
}

export interface LLMResponse {
  id: string;
  questionId: string;        // Links to triggering transcript
  fastHint: string | null;   // Quick 1-2 sentence hint
  fullAnswer: string | null; // Complete detailed answer
  status: 'pending' | 'streaming' | 'complete' | 'error';
  error?: string;
}

// Mock data for development
export const MOCK_TRANSCRIPT: TranscriptEntry[] = [
  {
    id: '1',
    speaker: 'Interviewer',
    text: 'Can you explain the difference between var, let, and const in JavaScript?',
    timestamp: Date.now() - 30000,
    isFinal: true,
  },
  {
    id: '2',
    speaker: 'You',
    text: 'Sure, let me explain...',
    timestamp: Date.now() - 25000,
    isFinal: true,
  },
];

export const MOCK_RESPONSE: LLMResponse = {
  id: 'resp-1',
  questionId: '1',
  fastHint: 'var is function-scoped, let/const are block-scoped. const cannot be reassigned.',
  fullAnswer: 'var is function-scoped and hoisted. let and const are block-scoped (inside {}). const must be initialized and cannot be reassigned, but objects can be mutated. Prefer const by default, use let when reassignment needed.',
  status: 'complete',
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| jQuery draggable | React drag libraries (react-rnd, dnd-kit) | 2018+ | Declarative, type-safe, React lifecycle integration |
| CSS `rem` in Shadow DOM | `px` units or CSS variable fallbacks | Tailwind v4 (2024) | rem breaks in Shadow DOM; px is reliable |
| localStorage in extensions | chrome.storage.local | Chrome MV3 (2021) | localStorage cleared when user clears browsing data |
| Manual scroll position | CSS scroll-behavior + scrollIntoView | Modern browsers | Smooth scrolling is native, no JS animation needed |
| `@property` for CSS vars | Fallback values in `:host` | Shadow DOM limitation | `@property` doesn't work in Shadow DOM |

**Deprecated/outdated:**
- **jQuery UI draggable:** Not React-friendly, no TypeScript, large bundle
- **Custom drag implementations:** Error-prone, accessibility issues, edge cases
- **localStorage in Chrome extensions:** Gets cleared with browsing data, use chrome.storage.local

## Open Questions

1. **Tailwind v4 + Shadow DOM long-term solution**
   - What we know: `@property` doesn't work in Shadow DOM, workarounds exist
   - What's unclear: Whether Tailwind team will provide official Shadow DOM support
   - Recommendation: Use px-based spacing override now; revisit if Tailwind addresses this

2. **Event isolation granularity**
   - What we know: WXT supports `isolateEvents` option
   - What's unclear: Exact events that need isolation for Google Meet compatibility
   - Recommendation: Start with keyboard events (keydown, keyup) to prevent hotkey conflicts

3. **Resize handle visibility**
   - What we know: react-rnd renders resize handles as child elements
   - What's unclear: Best styling approach for subtle but discoverable handles
   - Recommendation: Use CSS to show handles on hover only

## Sources

### Primary (HIGH confidence)

- [react-rnd GitHub](https://github.com/bokuweb/react-rnd) - API documentation, version 10.5.2, TypeScript types
- [WXT Content Script UI](https://wxt.dev/guide/key-concepts/content-script-ui.html) - createShadowRootUi API, cssInjectionMode
- [chrome.storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) - Official Chrome extension storage documentation
- [use-chrome-storage GitHub](https://github.com/onikienko/use-chrome-storage) - React hooks for chrome.storage

### Secondary (MEDIUM confidence)

- [WXT GitHub Discussion #636](https://github.com/wxt-dev/wxt/discussions/636) - CSS imports with createShadowRootUi
- [Tailwind v4 Shadow DOM Discussion](https://github.com/tailwindlabs/tailwindcss/discussions/16772) - @property bug and workarounds
- [MDN backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter) - CSS blur effect documentation
- [MDN overflow-anchor](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow-anchor) - Scroll anchoring behavior

### Tertiary (LOW confidence)

- [Dev.to Tailwind Shadow DOM Case Study](https://dev.to/dhirajarya01/how-i-finally-made-tailwindcss-work-inside-the-shadow-dom-a-real-case-study-5gkl) - Community workaround for px units
- WebSearch results on auto-scroll patterns - validated with MDN and official React patterns

## Metadata

**Confidence breakdown:**
- Standard Stack: MEDIUM - react-rnd is well-documented, but Tailwind v4 Shadow DOM issues add complexity
- Architecture: HIGH - Patterns are established React/WXT patterns verified with official docs
- Pitfalls: HIGH - Shadow DOM + Tailwind v4 issues well-documented in GitHub discussions

**Research date:** 2026-01-29
**Valid until:** 60 days (react-rnd stable, Tailwind v4 Shadow DOM workarounds may change)
