# Phase 7: Integration - Research

**Researched:** 2026-01-30
**Domain:** Chrome Extension Integration / Component Wiring
**Confidence:** HIGH

## Summary

Phase 7 is an integration phase that wires together three parallel tracks (Audio Pipeline, Overlay UI, Prompts/Settings) into a cohesive working extension. Unlike previous phases that built new features, this phase connects existing implementations and resolves any interface mismatches.

Research focused on understanding the current codebase state, identifying integration points, and documenting patterns for component wiring. The key finding is that **most integration is already complete** - Phase 4 (LLM Integration) already wired the majority of cross-track connections. The remaining work is primarily around:

1. **Graceful degradation** - Missing API keys, service failures, reconnection handling
2. **Settings reactivity** - Ensuring settings changes (blur, hotkeys) apply correctly
3. **Health indicators** - Visual feedback when services have issues
4. **End-to-end verification** - Full capture-to-response flow testing

**Primary recommendation:** Focus on gap analysis and graceful degradation rather than new wiring. The architecture is already integrated; this phase validates and hardens it.

## Standard Stack

The established libraries/tools already in use (no new dependencies needed):

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| webext-zustand | 0.2.0 | Cross-context state sync | Already integrated, handles popup/content/background sync |
| zustand | 4.5.7 | State management | Already integrated with chromeStorage persistence |
| eventsource-parser | 3.0.6 | SSE streaming for LLM | Already integrated in OpenRouterClient |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-rnd | 10.5.2 | Overlay drag/resize | Already integrated in Overlay component |
| use-chrome-storage | 1.3.2 | Position persistence | Already integrated in useOverlayPosition |

### No New Dependencies
This phase does not require any new libraries. All integration uses existing message passing, custom events, and Zustand store patterns already established.

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Current Integration Architecture

The codebase already implements a robust multi-context architecture:

```
Popup (Settings/Templates) <---> Service Worker <---> Content Script (Overlay)
                                      |
                                      v
                              Offscreen Document
                                      |
                                      v
                              ElevenLabs WebSocket
```

### Pattern 1: Message Passing for Cross-Context Communication
**What:** chrome.runtime.sendMessage/onMessage for Service Worker communication
**When to use:** Any communication between popup, content script, background
**Already Implemented:**
- `src/types/messages.ts` defines all message types as discriminated union
- `entrypoints/background.ts` handles all message routing
- `entrypoints/content.tsx` receives transcript and LLM updates

### Pattern 2: Custom Events for React-DOM Bridging
**What:** CustomEvent dispatch/listen for non-React-to-React communication
**When to use:** Passing data from module-level code to React components
**Already Implemented:**
- `transcript-update` event: Service Worker -> Content Script -> Overlay
- `llm-response-update` event: Service Worker -> Content Script -> Overlay
- `capture-state-update` event: CaptureProvider -> Overlay

### Pattern 3: Zustand Store Synchronization
**What:** webext-zustand wrapStore for cross-context state sync
**When to use:** Settings that need to be read from multiple contexts
**Already Implemented:**
- `src/store/index.ts` with storeReadyPromise
- Service Worker reads apiKeys, models, templates via useStore.getState()
- Content Script reads blurLevel, hotkeys via useStore hook

### Pattern 4: Health Indicator Pattern (To Be Implemented)
**What:** Visual indicators for service health issues only when there are problems
**When to use:** STT disconnect, LLM errors, missing config
**Implementation approach:**
```typescript
// Per CONTEXT.md decisions:
// - Health indicator only visible when there are issues
// - WebSocket disconnect: Show reconnecting indicator
// - LLM failure: Show error + auto-retry indicator
// - Missing API keys: Show "Configure API keys" prompt
```

### Anti-Patterns to Avoid
- **Polling for state:** Use message passing or custom events instead
- **Prop drilling through many layers:** Use custom events or Zustand
- **Blocking on integration:** Each integration point should be independent
- **Breaking existing working code:** Verify existing functionality after changes

## Don't Hand-Roll

Problems that look simple but have existing solutions already in the codebase:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-context state | New sync mechanism | webext-zustand + storeReadyPromise | Already working, handles edge cases |
| Message type safety | String comparisons | isMessage() type guard | Existing type-safe pattern |
| Settings persistence | Manual chrome.storage | chromeStorage adapter with Zustand persist | Already integrated |
| Transcript updates | Direct setState | Custom events + message passing | Existing event system handles timing |
| LLM streaming | New streaming code | streamLLMResponse + LLM_STREAM messages | Complete infrastructure exists |

**Key insight:** Phase 7 should NOT create new infrastructure. All required infrastructure exists; this phase validates and connects it.

## Common Pitfalls

### Pitfall 1: Assuming Integration Means New Code
**What goes wrong:** Writing new integration code when connections already exist
**Why it happens:** Not fully analyzing existing codebase before planning
**How to avoid:** Audit existing code paths first, only add what's missing
**Warning signs:** Creating new files instead of modifying existing ones

### Pitfall 2: Race Conditions in Store Initialization
**What goes wrong:** Reading store before storeReadyPromise resolves
**Why it happens:** Forgetting async nature of webext-zustand
**How to avoid:** Always await storeReadyPromise before store operations
**Warning signs:** Undefined settings on first render, intermittent failures
**Already handled:** Content script awaits storeReadyPromise before rendering

### Pitfall 3: Breaking Existing Functionality
**What goes wrong:** Integration changes break working features
**Why it happens:** Not testing each change in isolation
**How to avoid:** One integration point per commit, verify after each
**Warning signs:** Multiple unrelated things stop working together

### Pitfall 4: Missing API Key Edge Cases
**What goes wrong:** Extension crashes or shows errors when API keys missing
**Why it happens:** Happy path tested but not empty state
**How to avoid:** Per CONTEXT.md, implement graceful degradation:
- Missing ElevenLabs: Allow start without STT, show warning
- Missing OpenRouter: Allow start without LLM (transcription only)
- Both missing: Show "Configure API keys" prompt in overlay

### Pitfall 5: Settings Not Applied Live
**What goes wrong:** User changes setting but UI doesn't update
**Why it happens:** Component not subscribed to store slice
**How to avoid:** Verify each setting uses useStore subscription
**Already correct for:** blurLevel (Overlay subscribes), hotkeys (useCaptureMode subscribes)

### Pitfall 6: Service Worker Termination During Streaming
**What goes wrong:** LLM stream cuts off mid-response
**Why it happens:** Chrome kills idle Service Workers after 30 seconds
**How to avoid:** Keep-alive pattern already implemented
**Already handled:** background.ts has keepAliveInterval with getPlatformInfo()

## Code Examples

Verified patterns already in the codebase:

### Reading Settings from Store (Background Context)
```typescript
// Source: entrypoints/background.ts
const state = useStore.getState();
const { apiKeys, models, templates } = state;

// Validate before use
if (!apiKeys.openRouter) {
  // Handle missing key gracefully
}
```

### Reading Settings from Store (React Component)
```typescript
// Source: src/overlay/Overlay.tsx
const blurLevel = useStore((state) => state.blurLevel);

// Reactively updates when setting changes in popup
<div style={{ backdropFilter: `blur(${blurLevel}px)` }}>
```

### Message Dispatch to Content Script
```typescript
// Source: entrypoints/background.ts
async function sendLLMMessageToMeet(message: LLMStreamMessage | LLMStatusMessage): Promise<void> {
  const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
  for (const tab of tabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {
        // Ignore - content script might not be loaded
      });
    }
  }
}
```

### Custom Event for React Bridge
```typescript
// Source: entrypoints/content.tsx
function dispatchTranscriptUpdate(entries: TranscriptEntry[]): void {
  currentTranscript = entries;
  window.dispatchEvent(
    new CustomEvent<TranscriptUpdateEventDetail>('transcript-update', {
      detail: { entries },
    })
  );
}
```

### Graceful Error Handling (Pattern to Apply)
```typescript
// Pattern for missing API key handling
if (!apiKeys.elevenLabs) {
  // Per CONTEXT.md: Allow start without STT, show warning
  console.warn('ElevenLabs API key not configured - transcription unavailable');
  // UI should show warning indicator, not block functionality
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manifest V2 background page | Manifest V3 Service Worker + Offscreen | Chrome MV3 migration | WebSocket must be in Offscreen |
| Direct chrome.storage calls | Zustand persist middleware | Project design | Consistent state management |
| Prop drilling | Custom events + Zustand | Project design | Cleaner component architecture |

**Deprecated/outdated:**
- None in current codebase - all patterns are current MV3 best practices

## Integration Gap Analysis

Based on codebase review, here are the **actual integration gaps** to address:

### Already Integrated (No Work Needed)
| Integration Point | Status | Evidence |
|-------------------|--------|----------|
| Pipeline -> Overlay (transcripts) | COMPLETE | TRANSCRIPT_UPDATE message, transcript-update event |
| Pipeline -> Overlay (LLM responses) | COMPLETE | LLM_STREAM/LLM_STATUS messages, llm-response-update event |
| Pipeline -> Settings (API keys) | COMPLETE | background.ts reads apiKeys from store |
| Pipeline -> Settings (models) | COMPLETE | background.ts reads models.fastModel/fullModel from store |
| Overlay -> Settings (blur) | COMPLETE | Overlay.tsx subscribes to blurLevel |
| Overlay -> Settings (hotkeys) | COMPLETE | useCaptureMode reads hotkeys.capture |
| Hotkeys -> Pipeline -> Overlay | COMPLETE | Full flow via CaptureProvider -> LLM_REQUEST -> LLM_STREAM |

### Needs Work (Per CONTEXT.md Decisions)
| Gap | CONTEXT.md Decision | Implementation Needed |
|-----|---------------------|----------------------|
| Missing API key handling | Allow partial operation with warnings | Add graceful degradation checks |
| WebSocket disconnect indicator | Show reconnecting indicator | Add UI state for ElevenLabs reconnection |
| LLM error + retry indicator | Show error immediately, auto-retry | Add retry logic with UI feedback |
| Health indicator (issues only) | Only visible when issues exist | Add conditional health status component |
| Both API keys missing | Show "Configure API keys" prompt | Add overlay setup prompt state |
| Settings restart requirement | API key/model changes require restart | Document or enforce session restart |
| Tab return behavior | Resume capture automatically | Verify or implement visibility change handler |
| Transcript persistence | Survives page refresh | Verify or implement storage |

## Open Questions

Things that couldn't be fully resolved from code analysis:

1. **Transcript persistence across refresh**
   - What we know: mergedTranscript[] lives in Service Worker module state
   - What's unclear: Does Service Worker state survive tab refresh?
   - Recommendation: Test behavior, may need chrome.storage.session for transcript

2. **Tab return behavior**
   - What we know: No explicit visibility change handler found
   - What's unclear: Does capture automatically resume on tab focus?
   - Recommendation: Test behavior, add handler if needed

3. **Settings restart requirement**
   - What we know: CONTEXT.md says API key/model changes require restart
   - What's unclear: Should this be enforced (disable capture) or just documented?
   - Recommendation: Per discussion, enforce session restart with UI prompt

## Sources

### Primary (HIGH confidence)
- Codebase analysis: All files in src/, entrypoints/
- .planning/STATE.md - Technical decisions and patterns
- .planning/phases/07-integration/07-CONTEXT.md - User decisions

### Secondary (MEDIUM confidence)
- [Chrome Extensions E2E Testing](https://developer.chrome.com/docs/extensions/how-to/test/end-to-end-testing) - Testing patterns
- [webext-zustand npm](https://www.npmjs.com/package/webext-zustand) - Cross-context patterns

### Tertiary (LOW confidence)
- [GitHub: webext-pegasus/store-zustand](https://www.npmjs.com/package/@webext-pegasus/store-zustand) - Alternative approach (not used)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Direct codebase analysis, packages already in package.json
- Architecture: HIGH - Direct codebase analysis, patterns documented in STATE.md
- Integration gaps: HIGH - Compared CONTEXT.md decisions against codebase state
- Pitfalls: MEDIUM - Based on Chrome extension patterns and MV3 documentation

**Research date:** 2026-01-30
**Valid until:** N/A - Integration phase specific to current codebase state
