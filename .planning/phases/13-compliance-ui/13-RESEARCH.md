# Phase 13: Compliance UI - Research

**Researched:** 2026-02-08
**Domain:** React consent/privacy UI in Chrome MV3 extension (popup + content script overlay)
**Confidence:** HIGH

## Summary

Phase 13 is a pure UI/state-management task within the existing React + Zustand + Tailwind stack. No new libraries are needed. The work involves:

1. **A consent state slice** added to the existing Zustand store (persisted via `chrome.storage.local` through the existing `encryptedChromeStorage` adapter). This slice tracks three consent flags: `privacyPolicyAccepted`, `recordingConsentShown`, and `recordingConsentDismissedPermanently`.

2. **Two blocking UI gates**: a first-time privacy consent modal in the popup (blocking all tabs until accepted), and a per-session recording consent warning before audio capture starts (dismissable, with "don't show again" option).

3. **A privacy policy page** accessible from the popup at any time, and a settings option to reset all consent acknowledgments.

The codebase already follows a clean slice-based Zustand pattern (see `settingsSlice.ts`, `templatesSlice.ts`), a component-per-concern structure for settings (see `src/components/settings/`), and a popup with tabbed navigation. All patterns are well-established and can be directly extended.

**Primary recommendation:** Add a `consentSlice.ts` to the store with three boolean flags + setter/reset actions, gate the popup `App.tsx` behind a `PrivacyConsentModal` component, and intercept `handleStartCapture` in `App.tsx` with a `RecordingConsentWarning` component. Store the privacy policy as a static HTML/TSX page bundled as a WXT public asset.

## Standard Stack

### Core (already in project -- NO new dependencies needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^18.3.1 | UI components for consent modals | Already in project |
| Zustand | ^4.5.7 | Consent state persistence | Already in project, slice pattern established |
| Tailwind v4 | ^4.1.18 | Styling consent UI | Already in project, consistent with all existing UI |
| webext-zustand | ^0.2.0 | Cross-context sync of consent state | Already in project |
| WXT | ^0.19.0 | Extension framework, public assets | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| N/A | - | - | No new dependencies needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zustand slice for consent | Separate `chrome.storage.local` calls | Inconsistent with rest of codebase; Zustand already persists to chrome.storage |
| Static HTML privacy policy | External URL | External URL creates dependency; bundled asset is self-contained and works offline |
| React portal for modal | Inline conditional rendering | Portal adds complexity; inline rendering is simpler and matches existing popup patterns |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── store/
│   ├── consentSlice.ts          # NEW: Consent state + actions
│   ├── types.ts                 # MODIFY: Add ConsentSlice interface
│   └── index.ts                 # MODIFY: Combine consentSlice
├── components/
│   ├── consent/
│   │   ├── PrivacyConsentModal.tsx     # NEW: First-time blocking modal
│   │   ├── RecordingConsentWarning.tsx # NEW: Per-session recording warning
│   │   └── PrivacyPolicyContent.tsx    # NEW: Privacy policy text component
│   └── settings/
│       └── ConsentSettings.tsx         # NEW: Reset consents section
entrypoints/
├── popup/
│   └── App.tsx                  # MODIFY: Wrap in consent gate
```

### Pattern 1: Consent Gate in Popup (Blocking Modal)
**What:** The popup `App.tsx` checks `privacyPolicyAccepted` from store. If false, renders `PrivacyConsentModal` instead of normal content. No tabs, no settings, no capture -- just the consent modal.
**When to use:** First-time extension use, or after consent reset.
**Example:**
```typescript
// Source: Derived from existing App.tsx pattern (line 329-586)
function App() {
  const privacyPolicyAccepted = useStore((state) => state.privacyPolicyAccepted);
  const acceptPrivacyPolicy = useStore((state) => state.acceptPrivacyPolicy);

  // Blocking gate: must accept before any functionality
  if (!privacyPolicyAccepted) {
    return <PrivacyConsentModal onAccept={acceptPrivacyPolicy} />;
  }

  // Normal popup content below...
  return (
    <div className="w-96 bg-white">
      {/* existing tabs/content */}
    </div>
  );
}
```

### Pattern 2: Per-Session Recording Consent (Pre-Capture Gate)
**What:** Before `handleStartCapture()` proceeds, check if recording consent is needed. If `recordingConsentShown === false` OR (`recordingConsentDismissedPermanently === false` and this is a new session), show a dismissable warning.
**When to use:** Before each audio capture session starts.
**Example:**
```typescript
// Source: Derived from existing handleStartCapture in App.tsx (line 161-233)
const [showRecordingConsent, setShowRecordingConsent] = useState(false);

async function handleStartCapture() {
  // Check if we need to show recording consent
  const consentState = useStore.getState();
  if (!consentState.recordingConsentDismissedPermanently) {
    setShowRecordingConsent(true);
    return; // Wait for user to dismiss
  }
  // Proceed with actual capture...
  doStartCapture();
}

function handleRecordingConsentAccept(dontShowAgain: boolean) {
  if (dontShowAgain) {
    useStore.getState().dismissRecordingConsentPermanently();
  }
  setShowRecordingConsent(false);
  doStartCapture();
}
```

### Pattern 3: Zustand Consent Slice (following existing slice pattern)
**What:** A new Zustand slice following the exact same pattern as `settingsSlice.ts` and `templatesSlice.ts`.
**When to use:** To persist consent state alongside other settings.
**Example:**
```typescript
// Source: Derived from settingsSlice.ts pattern (same StateCreator signature)
import type { StateCreator } from 'zustand';
import type { ConsentSlice, StoreState } from './types';

export const createConsentSlice: StateCreator<StoreState, [], [], ConsentSlice> = (set) => ({
  // State
  privacyPolicyAccepted: false,
  privacyPolicyAcceptedAt: null,
  recordingConsentDismissedPermanently: false,

  // Actions
  acceptPrivacyPolicy: () => {
    set(() => ({
      privacyPolicyAccepted: true,
      privacyPolicyAcceptedAt: new Date().toISOString(),
    }));
  },

  dismissRecordingConsentPermanently: () => {
    set(() => ({
      recordingConsentDismissedPermanently: true,
    }));
  },

  resetAllConsents: () => {
    set(() => ({
      privacyPolicyAccepted: false,
      privacyPolicyAcceptedAt: null,
      recordingConsentDismissedPermanently: false,
    }));
  },
});
```

### Pattern 4: Privacy Policy as Bundled Content
**What:** The privacy policy text lives as a React component (`PrivacyPolicyContent.tsx`) that can be rendered in the consent modal and also linked to from a dedicated popup view or scrollable section.
**When to use:** For both the first-time consent modal and the always-accessible privacy policy link.
**Example:**
```typescript
// Source: Standard React pattern
export function PrivacyPolicyContent() {
  return (
    <div className="prose prose-sm max-h-64 overflow-y-auto p-4 text-gray-700">
      <h2 className="text-base font-bold">Privacy Policy</h2>
      <p>This extension captures audio from your browser tab and microphone...</p>
      {/* Full policy text */}
    </div>
  );
}
```

### Anti-Patterns to Avoid
- **Don't store consent in a separate storage key outside the Zustand store:** The project has a unified persist pattern via `encryptedChromeStorage`. Breaking this creates inconsistency and makes the "reset all" action harder to implement.
- **Don't use `window.confirm()` or `alert()` for consent modals:** These don't work in Chrome extension popups and are terrible UX. Use React component modals.
- **Don't block the content script overlay with consent:** The consent gate should only be in the popup. The content script overlay on Google Meet only activates after capture is started from the popup, so the popup gate is sufficient.
- **Don't forget to persist consent state in `partialize`:** The store's `partialize` function (in `index.ts`) must include consent fields, or they'll reset on every popup open.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| State persistence | Custom localStorage/chrome.storage wrapper | Zustand persist (already set up) | Already working, tested, handles rehydration |
| Cross-context sync | Custom message passing for consent state | webext-zustand (already set up) | Background/popup/content already synced |
| Modal backdrop/overlay | Custom z-index/pointer-events management | Tailwind `fixed inset-0` + conditional render | Simple, no library needed, consistent with existing UI |

**Key insight:** The entire compliance UI can be built with existing project patterns -- slice, components, Tailwind classes. Zero new dependencies.

## Common Pitfalls

### Pitfall 1: Consent State Not Persisted Across Popup Opens
**What goes wrong:** User accepts privacy policy, closes popup, reopens it -- gets prompted again.
**Why it happens:** The `partialize` function in `src/store/index.ts` explicitly lists which state fields to persist. If consent fields are not added to `partialize`, they revert to defaults on each popup open.
**How to avoid:** Add all three consent fields (`privacyPolicyAccepted`, `privacyPolicyAcceptedAt`, `recordingConsentDismissedPermanently`) to the `partialize` return object in `src/store/index.ts`.
**Warning signs:** Consent modal appears every time popup opens.

### Pitfall 2: Recording Consent Blocks Hotkey-Triggered Capture
**What goes wrong:** User presses capture hotkey on Google Meet page, but recording consent hasn't been shown -- capture starts without consent.
**Why it happens:** The hotkey capture flow in `useCaptureMode.ts` goes through `onCapture` -> `sendLLMRequest` in `content.tsx`, which triggers `LLM_REQUEST` to background. It does NOT go through `handleStartCapture` in `App.tsx` popup. Audio capture is started separately from the popup.
**How to avoid:** The recording consent gate must be in the popup's capture flow (`handleStartCapture`), which is where audio capture is actually initiated. The hotkey flow only triggers LLM requests on already-captured audio, so it doesn't need separate consent gating. The key insight: audio capture ALWAYS starts from the popup's Start button.
**Warning signs:** Audio capturing without prior consent acknowledgment.

### Pitfall 3: "Don't Show Again" Resets on Extension Update
**What goes wrong:** User dismissed per-session warning permanently, but after extension update, it shows again.
**Why it happens:** If state is stored in memory or session storage, extension updates clear it. Also, if `onRehydrateStorage` or install handlers incorrectly reset consent.
**How to avoid:** Consent state is in Zustand's persist store which uses `chrome.storage.local` -- this survives extension updates by default. Do NOT reset consent state in `onRehydrateStorage` or `runtime.onInstalled` handlers.
**Warning signs:** Users report consent popping up after updates.

### Pitfall 4: Privacy Policy Content Not Scrollable in Popup
**What goes wrong:** Privacy policy text overflows the popup window (Chrome extension popups have max dimensions).
**Why it happens:** Chrome extension popup has a max height of ~600px. If the privacy policy is long, it needs its own scroll container.
**How to avoid:** Use `max-h-[300px] overflow-y-auto` on the policy content container within the modal. The existing popup uses `max-h-[500px] overflow-y-auto` for tab content (line 371 of App.tsx), so this pattern is established.
**Warning signs:** Policy text cut off, accept button not visible.

### Pitfall 5: Reset Consents Doesn't Re-Trigger First-Time Flow
**What goes wrong:** User clicks "Reset Consents" in settings but the privacy modal doesn't appear.
**Why it happens:** The popup's conditional rendering checks `privacyPolicyAccepted` which was just set to `false`, but React state hasn't re-rendered yet, or the settings tab is still visible.
**How to avoid:** The `resetAllConsents` action sets `privacyPolicyAccepted` to `false` in Zustand. Since `App.tsx` subscribes to this state, React will automatically re-render and show the `PrivacyConsentModal` gate. No special handling needed -- Zustand reactivity handles it.
**Warning signs:** Nothing happens after clicking reset.

## Code Examples

Verified patterns from the existing codebase:

### Adding a New Slice to the Combined Store
```typescript
// Source: src/store/index.ts (existing pattern, lines 28-55)
// Add consentSlice to the combined store creation:
export const useStore = create<StoreState>()(
  persist(
    (...a) => ({
      ...createSettingsSlice(...a),
      ...createTemplatesSlice(...a),
      ...createConsentSlice(...a),  // NEW
    }),
    {
      name: 'ai-interview-settings',
      storage: createJSONStorage(() => encryptedChromeStorage),
      partialize: (state) => ({
        // Existing fields...
        apiKeys: state.apiKeys,
        models: state.models,
        blurLevel: state.blurLevel,
        hotkeys: state.hotkeys,
        captureMode: state.captureMode,
        templates: state.templates,
        activeTemplateId: state.activeTemplateId,
        // NEW consent fields:
        privacyPolicyAccepted: state.privacyPolicyAccepted,
        privacyPolicyAcceptedAt: state.privacyPolicyAcceptedAt,
        recordingConsentDismissedPermanently: state.recordingConsentDismissedPermanently,
      }),
      // ...existing onRehydrateStorage
    }
  )
);
```

### ConsentSlice Type Definition
```typescript
// Source: Derived from src/store/types.ts patterns (SettingsSlice interface)
export interface ConsentSlice {
  /** Whether user has accepted the privacy policy (first-time gate) */
  privacyPolicyAccepted: boolean;
  /** ISO timestamp when privacy policy was accepted */
  privacyPolicyAcceptedAt: string | null;
  /** Whether user permanently dismissed per-session recording consent */
  recordingConsentDismissedPermanently: boolean;
  /** Accept the privacy policy */
  acceptPrivacyPolicy: () => void;
  /** Permanently dismiss the per-session recording consent */
  dismissRecordingConsentPermanently: () => void;
  /** Reset all consent acknowledgments (re-trigger all flows) */
  resetAllConsents: () => void;
}

// Update StoreState:
export type StoreState = SettingsSlice & TemplatesSlice & ConsentSlice;
```

### Settings Component for Consent Reset
```typescript
// Source: Derived from src/components/settings/BlurSettings.tsx pattern
import { useStore } from '../../store';

export default function ConsentSettings() {
  const resetAllConsents = useStore((state) => state.resetAllConsents);

  return (
    <div>
      <p className="text-sm text-gray-600 mb-2">
        Reset all privacy and recording consent acknowledgments.
        You will be prompted to accept the privacy policy and
        recording consent again.
      </p>
      <button
        onClick={resetAllConsents}
        className="px-4 py-2 rounded-lg font-medium text-sm bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
      >
        Reset All Consents
      </button>
    </div>
  );
}
```

### Recording Consent Intercept in Capture Flow
```typescript
// Source: Derived from entrypoints/popup/App.tsx handleStartCapture (lines 161-233)
// Add state for showing the recording consent warning:
const [showRecordingConsent, setShowRecordingConsent] = useState(false);
const recordingConsentDismissed = useStore(
  (state) => state.recordingConsentDismissedPermanently
);

async function handleStartCapture() {
  // Gate: show recording consent if not permanently dismissed
  if (!recordingConsentDismissed) {
    setShowRecordingConsent(true);
    return;
  }
  await doStartCapture();
}

function handleConsentProceed(dontShowAgain: boolean) {
  if (dontShowAgain) {
    useStore.getState().dismissRecordingConsentPermanently();
  }
  setShowRecordingConsent(false);
  doStartCapture();
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cookie-based consent banners | In-app consent modals with state persistence | 2020+ (GDPR/CCPA era) | Extension-local consent is simpler than web consent since no third-party tracking |
| Separate consent storage | Unified state management (Zustand/Redux) | 2022+ | Single source of truth for all app state including consent |
| External privacy policy URLs | Bundled privacy policy content | Chrome MV3 (2023+) | MV3 service workers can't reliably open external pages; bundled is more reliable |

**Deprecated/outdated:**
- `window.confirm()` for consent: Does not work in Chrome extension popup context (popup has no parent window for dialogs).
- Storing consent in cookies: Extensions don't use cookies. `chrome.storage.local` is the standard.

## Open Questions

1. **Privacy Policy Content Authorship**
   - What we know: A privacy policy component needs to exist. The extension captures tab audio and microphone input, uses ElevenLabs for STT, and OpenAI/OpenRouter for LLM.
   - What's unclear: Who writes the actual privacy policy text? Legal review needed?
   - Recommendation: Create a placeholder privacy policy that covers the technical facts (what data is captured, where it's sent, what's stored locally). Mark it as "draft" with a TODO for legal review. The planner should include the technical content but note that legal review is out of scope.

2. **Recording Consent UX: Per-Session vs Per-Capture**
   - What we know: Success criteria says "before each recording session" with "don't show again" option. The popup starts/stops capture via Start/Stop buttons.
   - What's unclear: Does "session" mean each time the user clicks Start, or each time the popup opens? The success criteria says "per-session" and the dismissable aspect with "don't show again" suggests per-capture-start until permanently dismissed.
   - Recommendation: Treat "session" as "each capture start attempt." Show the warning every time the user clicks Start, until they check "don't show again." This is the most conservative and user-friendly interpretation.

3. **Content Script Overlay Consent Gate**
   - What we know: The content script overlay on Google Meet only becomes useful after capture is started from the popup. Capture always starts from the popup's Start button.
   - What's unclear: Should the overlay itself show any consent UI?
   - Recommendation: No. The popup is the single point of control for starting capture. The overlay has no independent recording capability. Gating only in the popup is sufficient per the success criteria.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/store/index.ts`, `src/store/types.ts`, `src/store/settingsSlice.ts`, `src/store/templatesSlice.ts` -- established slice patterns
- Codebase analysis: `entrypoints/popup/App.tsx` -- popup structure, capture flow, tab navigation, existing settings
- Codebase analysis: `entrypoints/content.tsx` -- content script architecture, overlay injection
- Codebase analysis: `entrypoints/background.ts` -- message handling, capture lifecycle
- Codebase analysis: `src/components/settings/BlurSettings.tsx` -- settings component pattern
- Codebase analysis: `src/store/chromeStorage.ts`, `src/services/crypto/encryptedStorage.ts` -- persistence layer
- Codebase analysis: `package.json` -- dependency list confirming no new libs needed

### Secondary (MEDIUM confidence)
- Chrome Extensions documentation: `chrome.storage.local` persists across extension updates (well-established Chrome API behavior)
- Chrome Extensions documentation: Extension popup max dimensions and rendering constraints

### Tertiary (LOW confidence)
- None -- all findings are based on direct codebase analysis and well-known Chrome extension behavior.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all patterns exist in codebase
- Architecture: HIGH -- direct extension of existing slice/component patterns, verified by reading all relevant source files
- Pitfalls: HIGH -- identified from concrete code paths (partialize, handleStartCapture, useCaptureMode) in the codebase

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (stable -- no external dependencies or fast-moving APIs involved)
