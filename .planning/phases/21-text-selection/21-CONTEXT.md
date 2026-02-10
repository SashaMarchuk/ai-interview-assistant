# Phase 21: Enhanced Text Selection - Context

**Gathered:** 2026-02-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Selecting any text in the overlay (transcripts or AI responses) shows a floating tooltip with quick prompt actions that send selected text to the LLM. Users can customize which quick prompt actions appear via popup settings. This phase does NOT add new LLM capabilities — it provides a quick-action interface for existing LLM functionality.

</domain>

<decisions>
## Implementation Decisions

### Tooltip Appearance & Actions
- Compact horizontal toolbar style (like Notion's selection toolbar — clean, minimal)
- Small triangular arrow pointer connecting tooltip to selection
- Tooltip position relative to selection: Claude's discretion (above/below with flip logic)
- Buttons show icon + short text labels (e.g., "💡 Explain")
- Tooltip stays visible after clicking an action (supports multiple actions on same selection)
- Clicked button shows spinner/loading indicator while LLM request is in flight
- Selected text stays highlighted until response arrives
- Quick fade-in animation (~150ms) when tooltip appears
- 200ms debounce delay before showing tooltip (avoids flickering during selection)
- Quick prompts always use the fast model (lightweight tasks)
- Response displayed in the existing response panel (not inline)
- Quick prompt requests can run concurrently with ongoing LLM requests

### Quick Prompt Set
- 4 default actions: Explain, Elaborate, Summarize, Counter-argument
- Maximum 4 actions in toolbar at any time
- Selected text sent as primary context: "Explain this: [selected text]"
- Counter-argument uses interview-aware framing: "Provide a counter-argument to this point, as an interviewer might challenge it"
- Response panel shows action label + text snippet as header (e.g., "💡 Explain: 'microservices architecture...'")
- Quick prompt responses append below existing response content (not replace)
- Keyboard shortcut for the first action (e.g., Ctrl+Shift+E for Explain on current selection)
- Custom prompts support {{selection}} template variable for flexible text placement

### Customization in Settings
- Full CRUD: users can add, remove, edit, and reorder actions (up to max 4)
- Dedicated "Quick Prompts" tab in popup settings
- "Reset to defaults" button restores original 4 actions
- Drag-and-drop reordering with grab handles
- Icon picker from ~10-15 predefined icons when creating custom prompts
- "Test" button sends prompt with sample text and shows preview response before saving
- {{selection}} template variable supported in custom prompt text
- Quick prompt configurations stored in Zustand store (synced via webext-zustand)

### Selection Behavior & Edge Cases
- Tooltip only appears for click-and-drag selections (not double-click — reserved for Phase 20 transcript editing)
- Any selection length triggers tooltip (no minimum character threshold)
- Works in both transcript panel and response panel
- Works on code blocks and prose — code selections are valid (explain a code snippet)
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

</decisions>

<specifics>
## Specific Ideas

- Tooltip should feel like Notion's selection toolbar — compact, horizontal, clean
- Counter-argument prompt should be interview-aware: "as an interviewer might challenge it"
- Response panel header pattern: "💡 Explain: 'microservices architecture...'" — shows provenance of the quick prompt result
- Drag-and-drop for reordering (not arrow buttons) — even for just 4 items, the UX should feel polished

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 21-text-selection*
*Context gathered: 2026-02-09*
