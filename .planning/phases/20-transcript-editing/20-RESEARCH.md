# Phase 20: Transcript Editing - Research

**Researched:** 2026-02-09
**Domain:** React inline editing UI, client-side transcript state management
**Confidence:** HIGH

## Summary

Phase 20 adds inline editing, soft-delete, and undo capabilities to the transcript panel in the overlay. The entire editing surface is confined to a single component (`TranscriptPanel.tsx`) and the transcript data flow in `content.tsx`, with no new libraries required. The existing architecture already provides a clean intercept point: transcript entries are stored as `TranscriptEntry[]` in `content.tsx` module-level state and formatted into LLM context strings by `formatEntries()`, `getRecentTranscript()`, and `getFullTranscript()` just before sending LLM requests.

The key insight is that edits should be tracked as an **overlay map** (keyed by entry `id`) in `content.tsx` module-level state, rather than mutating the original `TranscriptEntry[]` from the background service worker. This preserves the source-of-truth transcript from STT while letting the content script apply edits before rendering and before building LLM context. No Zustand store changes are needed; no new message types are needed; no background.ts changes are required.

**Primary recommendation:** Implement edits as a content-script-local `Map<string, TranscriptEdit>` overlay that transforms entries at read time, keeping the background transcript pipeline untouched.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 18 | 18.x | Inline editing UI components | Already in use, memo patterns established |
| Tailwind v4 | 4.x | Styling edit states, indicators | Already in use with Shadow DOM compat |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | - | - | This phase requires zero new dependencies |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Content-editable div | Controlled `<input>` | Input is simpler, more predictable; contentEditable has XSS risks and cursor management issues in Shadow DOM |
| Zustand store for edits | Module-level Map | Edits are session-scoped (reset on page reload), no need for cross-context sync or persistence. Map avoids webext-zustand sync overhead |
| External undo library | Simple array-based undo stack | Only need single-level undo per entry (restore original). A full undo/redo library is overkill |

**Installation:**
```bash
# No new packages required
```

## Architecture Patterns

### Current Data Flow (Before Phase 20)

```
Background (TranscriptBuffer)
  --> chrome.runtime.sendMessage({ type: 'TRANSCRIPT_UPDATE', entries })
    --> content.tsx: dispatchTranscriptUpdate(entries)
      --> currentTranscript = entries  (module-level)
      --> CustomEvent('transcript-update') dispatched to window
        --> Overlay.tsx: setTranscript(event.detail.entries)
          --> TranscriptPanel: renders entries

LLM Context building (content.tsx):
  formatEntries(entries) --> "Speaker: text\n..."
  getRecentTranscript() --> last 5 final entries formatted
  getFullTranscript() --> all final entries formatted
  These are passed as recentContext/fullTranscript in LLM_REQUEST message
```

### Recommended Architecture (Phase 20)

```
src/
  overlay/
    TranscriptPanel.tsx      # MODIFIED: add editing UI, soft-delete, undo
  types/
    transcript.ts            # MODIFIED: add TranscriptEdit type
  entrypoints/
    content.tsx              # MODIFIED: add edit overlay map, transform entries
```

### Pattern 1: Edit Overlay Map
**What:** A `Map<string, TranscriptEdit>` stored in content.tsx module-level state that overlays edits on top of the raw transcript entries from background.
**When to use:** When you need to modify displayed/used data without changing the source-of-truth.

```typescript
// In src/types/transcript.ts
export interface TranscriptEdit {
  /** The edited text (null = not text-edited, just soft-deleted) */
  editedText: string | null;
  /** Whether this entry is soft-deleted (hidden from view + LLM context) */
  isDeleted: boolean;
  /** Original text preserved for undo */
  originalText: string;
}

// In entrypoints/content.tsx (module-level)
const transcriptEdits = new Map<string, TranscriptEdit>();

// Apply edits to entries before dispatching to overlay and building LLM context
function applyEdits(entries: TranscriptEntry[]): TranscriptEntry[] {
  return entries
    .filter(entry => {
      const edit = transcriptEdits.get(entry.id);
      return !edit?.isDeleted;
    })
    .map(entry => {
      const edit = transcriptEdits.get(entry.id);
      if (edit?.editedText != null) {
        return { ...entry, text: edit.editedText };
      }
      return entry;
    });
}
```

### Pattern 2: Inline Edit Component with Controlled Input
**What:** Double-click activates a controlled `<input>` replacing the text span. Enter saves, Escape cancels.
**When to use:** Standard inline editing pattern for text fields in React.

```typescript
// In TranscriptPanel.tsx
const [editingId, setEditingId] = useState<string | null>(null);
const [editText, setEditText] = useState('');

// On double-click: enter edit mode
const handleDoubleClick = (entry: TranscriptEntryType) => {
  setEditingId(entry.id);
  setEditText(entry.text);
};

// On Enter: save edit via custom event
const handleKeyDown = (e: React.KeyboardEvent, entryId: string) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('transcript-edit', {
      detail: { id: entryId, editedText: editText }
    }));
    setEditingId(null);
  } else if (e.key === 'Escape') {
    setEditingId(null);
  }
};
```

### Pattern 3: Event-Based Communication Between Overlay and Content Script
**What:** The overlay (React) dispatches custom events for edit/delete/undo actions. Content script listens and applies changes to its edit map, then re-dispatches the transformed transcript.
**When to use:** When the React tree needs to communicate with module-level state in the content script (already established pattern in this codebase for reasoning requests, capture state, etc.)

```typescript
// Events FROM overlay (TranscriptPanel) TO content.tsx:
'transcript-edit'   -> { id: string, editedText: string }
'transcript-delete'  -> { id: string }
'transcript-undo'    -> { id: string }

// Content.tsx receives these, updates transcriptEdits Map,
// then re-dispatches 'transcript-update' with transformed entries
```

### Anti-Patterns to Avoid
- **Mutating background TranscriptBuffer entries:** The background owns the raw transcript. Edits are content-script-local concerns. Never send edit operations to the background.
- **Using contentEditable:** In Shadow DOM, contentEditable has inconsistent behavior with selection APIs. Use a controlled `<input>` element instead.
- **Storing edits in Zustand:** Edits are session-scoped (die on page reload, matching interview session lifecycle). Zustand persistence + webext-zustand sync would be unnecessary overhead.
- **Adding edit state to TranscriptEntry type:** The original TranscriptEntry interface should remain clean (it's the wire format from background). Edit metadata lives separately.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Undo/redo system | Complex undo tree | Simple `Map<id, { originalText }>` | Only need single-level undo (restore to original). The originalText is already captured when edit is created |
| Focus management | Manual DOM focus tracking | `useRef` + `autoFocus` on `<input>` | React handles focus lifecycle naturally |
| Scroll position preservation | Manual scroll save/restore | Existing `useAutoScroll` hook already handles this | Auto-scroll behavior is already correct |

**Key insight:** The undo requirement (EDIT-04) only asks for restoring original text, not a full undo/redo history. Storing `originalText` in the edit record is sufficient.

## Common Pitfalls

### Pitfall 1: Hotkey Conflict During Editing
**What goes wrong:** User is typing in an edit `<input>`, presses a key that matches the capture hotkey (e.g., Space), and it triggers capture mode instead of typing.
**Why it happens:** The `useCaptureMode` hook listens on `window` in capture phase (`true`), intercepting all keydowns before they reach the input.
**How to avoid:** When an edit input is focused, the capture hotkey handler must be suppressed. Check `e.target` -- if it's an `<input>` or `<textarea>`, skip hotkey processing. The Shadow DOM boundary means `document.activeElement` won't work; use `e.target` or `e.composedPath()` instead.
**Warning signs:** Pressing Space while editing a transcript entry triggers capture mode instead of inserting a space.

### Pitfall 2: Stale Transcript After Edit
**What goes wrong:** After editing an entry, the next `TRANSCRIPT_UPDATE` from background overwrites the edit because it contains the original text.
**Why it happens:** The background periodically broadcasts `TRANSCRIPT_UPDATE` with raw entries. If the content script replaces `currentTranscript` and dispatches to the overlay without applying edits, the UI reverts.
**How to avoid:** Apply edits AFTER receiving any `TRANSCRIPT_UPDATE`. The edit map is the overlay on top of the raw data. Every time `dispatchTranscriptUpdate()` is called, apply edits before dispatching to the overlay. The raw `currentTranscript` still stores the original for undo purposes.
**Warning signs:** Edited text flickers back to original when new transcript entries arrive.

### Pitfall 3: LLM Context Not Using Edited Text
**What goes wrong:** User edits a transcript entry, but the LLM still receives the original text.
**Why it happens:** `getFullTranscript()` and `getRecentTranscript()` read from `currentTranscript` (raw entries) without applying edits.
**How to avoid:** These functions must apply the edit overlay before formatting. Use `applyEdits(currentTranscript)` instead of `currentTranscript` directly in these functions. Also filter out soft-deleted entries.
**Warning signs:** LLM response references content the user deleted or corrected.

### Pitfall 4: Auto-scroll Disrupting Edit Mode
**What goes wrong:** User is editing a transcript entry. A new entry arrives, `useAutoScroll` scrolls to bottom, and the edit input scrolls out of view or loses focus.
**Why it happens:** `useAutoScroll` triggers `scrollIntoView` on every `entries.length` change.
**How to avoid:** Suppress auto-scroll when `editingId` is not null. Pass an `isEditing` flag to `useAutoScroll` or conditionally skip the scroll effect.
**Warning signs:** Input field disappears or focus is lost during active editing.

### Pitfall 5: React Memo Breaking Edits
**What goes wrong:** `TranscriptEntryRow` is wrapped in `memo()`. After an edit, the component doesn't re-render because the entry object reference hasn't changed (only the text is different in the overlay).
**Why it happens:** `memo()` does shallow comparison. If the same `TranscriptEntry` object is reused, memo skips re-render.
**How to avoid:** When applying edits, create new entry objects (`{ ...entry, text: edit.editedText }`). This ensures referential inequality triggers re-render. The edit map application already creates new objects via spread.
**Warning signs:** After saving an edit, the UI still shows the old text until a new transcript entry arrives.

## Code Examples

### Example 1: TranscriptEdit Type Addition
```typescript
// Source: src/types/transcript.ts (to be added)

/**
 * Edit overlay for a transcript entry.
 * Stored separately from the original entry to preserve undo capability.
 */
export interface TranscriptEdit {
  /** The user-corrected text (null if only soft-deleted, not text-edited) */
  editedText: string | null;
  /** Whether this entry is hidden from view and LLM context */
  isDeleted: boolean;
  /** Original text preserved for undo (copied at edit time) */
  originalText: string;
}
```

### Example 2: Edit Application in Content Script
```typescript
// Source: entrypoints/content.tsx (to be added)

const transcriptEdits = new Map<string, TranscriptEdit>();

/** Apply edit overlay to raw transcript entries */
function applyEdits(entries: TranscriptEntry[]): TranscriptEntry[] {
  return entries.reduce<TranscriptEntry[]>((acc, entry) => {
    const edit = transcriptEdits.get(entry.id);
    if (edit?.isDeleted) return acc; // Skip soft-deleted
    if (edit?.editedText != null) {
      acc.push({ ...entry, text: edit.editedText });
    } else {
      acc.push(entry);
    }
    return acc;
  }, []);
}

// Modify existing functions to use applyEdits:
function getRecentTranscript(): string {
  return formatEntries(applyEdits(currentTranscript).filter((e) => e.isFinal).slice(-5));
}

function getFullTranscript(): string {
  return formatEntries(applyEdits(currentTranscript).filter((e) => e.isFinal));
}

// Modify dispatchTranscriptUpdate to apply edits before sending to overlay
function dispatchTranscriptUpdate(entries: TranscriptEntry[]): void {
  currentTranscript = entries; // Keep raw for undo reference
  const displayEntries = applyEdits(entries);
  window.dispatchEvent(
    new CustomEvent<TranscriptUpdateEventDetail>('transcript-update', {
      detail: { entries: displayEntries },
    }),
  );
}
```

### Example 3: Inline Edit UI in TranscriptPanel
```typescript
// Source: src/overlay/TranscriptPanel.tsx (to be modified)

// Edit event dispatched to content.tsx
function dispatchEditEvent(id: string, editedText: string): void {
  window.dispatchEvent(
    new CustomEvent('transcript-edit', {
      detail: { id, editedText },
    }),
  );
}

function dispatchDeleteEvent(id: string): void {
  window.dispatchEvent(
    new CustomEvent('transcript-delete', {
      detail: { id },
    }),
  );
}

function dispatchUndoEvent(id: string): void {
  window.dispatchEvent(
    new CustomEvent('transcript-undo', {
      detail: { id },
    }),
  );
}
```

### Example 4: Hotkey Suppression During Editing
```typescript
// Source: src/hooks/useCaptureMode.ts (to be modified)

const handleKeyDown = useCallback(
  (e: KeyboardEvent) => {
    // Skip capture hotkey when user is typing in an input/textarea
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return;
    }

    if (!matchesHotkey(e, parsedHotkey)) return;
    // ... rest of existing handler
  },
  [parsedHotkey, onCapture, captureMode, getTranscriptSince],
);
```

## Existing Codebase Specifics

### Files to Modify

| File | Changes | Risk |
|------|---------|------|
| `src/types/transcript.ts` | Add `TranscriptEdit` interface | LOW - additive only |
| `src/overlay/TranscriptPanel.tsx` | Add inline edit UI, delete button, undo button, edit state management | MEDIUM - main component changes |
| `entrypoints/content.tsx` | Add edit map, event listeners, modify formatEntries pipeline | MEDIUM - must not break existing transcript flow |
| `src/hooks/useCaptureMode.ts` | Add input-focused guard to hotkey handler | LOW - single condition add |

### Files NOT to Modify

| File | Why |
|------|-----|
| `entrypoints/background.ts` | Background owns raw transcript; edits are content-script-local |
| `src/services/transcription/transcriptBuffer.ts` | Buffer is the source-of-truth for raw STT data |
| `src/store/index.ts` | No Zustand state needed for session-scoped edits |
| `src/types/messages.ts` | No new message types needed (edits use CustomEvent within content page) |
| `src/overlay/Overlay.tsx` | Transcript editing is fully contained in TranscriptPanel |

### Current TranscriptPanel Structure (to be enhanced)

The current `TranscriptEntryRow` renders: `[speaker] (timestamp) text`. The edit UI needs to:
1. Replace the text span with an `<input>` on double-click
2. Add a small delete button (X icon or trash)
3. Show "edited" indicator for modified entries
4. Show undo button for edited/deleted entries

### UI Constraints

The overlay panel is 340px wide default (min 280px), transcript panel is `h-28` (112px). Each entry is `text-sm` (14px). With the small panel size:
- Edit input should be inline (same row), not a separate form
- Delete/undo controls should be compact (icons, not text buttons)
- "Edited" indicator should be a small visual marker, not a large badge

### Data Lifecycle

```
1. STT produces entries --> TranscriptBuffer (background)
2. Background broadcasts TRANSCRIPT_UPDATE --> content.tsx
3. content.tsx stores raw in currentTranscript, applies edits, dispatches to overlay
4. User edits/deletes/undoes --> CustomEvent to content.tsx
5. content.tsx updates transcriptEdits Map, re-dispatches transformed entries
6. On LLM request: getFullTranscript() / getRecentTranscript() use applyEdits()
7. On page reload: edits are lost (session-scoped, matching interview session lifecycle)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| contentEditable for inline editing | Controlled `<input>` elements | N/A - best practice | Better control, no XSS risk, simpler state management |
| Global undo/redo (Ctrl+Z) | Per-entry undo (restore original) | N/A - scoped to requirements | Simpler implementation, matches EDIT-04 spec |
| Store edits in Zustand | Module-level Map in content script | N/A - architecture decision | Avoids webext-zustand sync overhead for session-scoped data |

## Open Questions

1. **Should edited entries show the original text on hover/tooltip?**
   - What we know: The todo file suggests this. The requirements (EDIT-01 through EDIT-04) don't explicitly mention it.
   - What's unclear: Whether this is in scope for Phase 20 or a future enhancement.
   - Recommendation: Include it -- it's trivial (title attribute on the edited indicator) and improves usability. The `originalText` is already stored in the edit record.

2. **Should edits survive across transcript re-broadcasts?**
   - What we know: Background sends `TRANSCRIPT_UPDATE` periodically (on each new entry, and on interim partials). The edit map must persist across these updates.
   - What's unclear: Nothing -- this is clear.
   - Recommendation: Yes, the edit map persists in module-level state. Raw entries are updated on each broadcast, edits are re-applied. Already addressed in the architecture.

3. **Should auto-scroll behavior change during editing?**
   - What we know: Current `useAutoScroll` scrolls on every `entries.length` change. During editing, this could disrupt the user.
   - Recommendation: Suppress auto-scroll when `editingId` is not null. Pass editing state as a second dependency or guard condition.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** (direct file reads):
  - `src/types/transcript.ts` -- TranscriptEntry interface (id, speaker, text, timestamp, isFinal)
  - `src/overlay/TranscriptPanel.tsx` -- Current rendering (memo pattern, TranscriptEntryRow)
  - `entrypoints/content.tsx` -- Transcript data flow (currentTranscript, formatEntries, getFullTranscript, getRecentTranscript, dispatchTranscriptUpdate)
  - `src/services/llm/PromptBuilder.ts` -- How fullTranscript and recentContext flow into LLM prompts
  - `src/hooks/useCaptureMode.ts` -- Hotkey handling (capture phase listeners)
  - `src/services/transcription/transcriptBuffer.ts` -- Background transcript persistence
  - `entrypoints/background.ts` -- TRANSCRIPT_UPDATE broadcast, TranscriptBuffer usage

### Secondary (MEDIUM confidence)
- **Existing todo** (`.planning/todos/pending/20260208-transcript-editing.md`) -- Provides broader feature ideas; Phase 20 requirements are a scoped subset

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries needed; all patterns exist in codebase
- Architecture: HIGH - Edit overlay map pattern is straightforward; data flow is well-understood from codebase reading
- Pitfalls: HIGH - All identified from direct codebase analysis (hotkey conflict, stale transcript, auto-scroll, memo)

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (stable -- no external dependencies or moving targets)
