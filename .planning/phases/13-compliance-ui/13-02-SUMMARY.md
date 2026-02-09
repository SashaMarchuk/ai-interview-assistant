---
phase: 13-compliance-ui
plan: 02
subsystem: consent-ui
tags: [react, consent, privacy, modal, recording-warning, settings, popup-gate]
dependency_graph:
  requires:
    - ConsentSlice type and implementation (13-01)
    - PrivacyPolicyContent component (13-01)
    - Consent fields persisted in combined store (13-01)
  provides:
    - PrivacyConsentModal blocking first-time gate
    - RecordingConsentWarning per-session capture intercept
    - ConsentSettings with policy view and reset
    - Consent-gated popup in App.tsx
  affects:
    - entrypoints/popup/App.tsx
tech_stack:
  added: []
  patterns:
    - Conditional render gate for blocking consent (early return before main JSX)
    - Inline consent intercept in capture flow (doStartCapture/handleStartCapture split)
    - Named export for reusable consent components, default export for settings components
key_files:
  created:
    - src/components/consent/PrivacyConsentModal.tsx
    - src/components/consent/RecordingConsentWarning.tsx
    - src/components/settings/ConsentSettings.tsx
  modified:
    - entrypoints/popup/App.tsx
key_decisions:
  - PrivacyConsentModal replaces popup content via early return (not overlay/portal) for simplicity
  - RecordingConsentWarning placed after Audio Capture section for visual proximity to Start button
  - doStartCapture/handleStartCapture split keeps consent logic separate from capture implementation
  - ConsentSettings uses inline PrivacyPolicyContent toggle (satisfies always-accessible policy requirement)
metrics:
  duration: 2m 44s
  completed: 2026-02-08
---

# Phase 13 Plan 02: Consent UI Gates Summary

Consent UI gates with privacy modal, recording warning, and settings reset -- three new components wired into App.tsx as blocking gates satisfying all five Phase 13 success criteria.

## Accomplishments

- Created `PrivacyConsentModal` component with privacy policy display, accept button, and required-note text
- Created `RecordingConsentWarning` component with amber-themed warning, don't-show-again checkbox, and cancel/proceed buttons
- Created `ConsentSettings` component with consent status display, view privacy policy toggle, and red destructive reset button
- Integrated privacy consent gate in App.tsx as early return before main content (blocks all tabs)
- Integrated recording consent intercept in capture flow via doStartCapture/handleStartCapture split
- Added Privacy & Consent section to Settings tab
- All five Phase 13 success criteria verified:
  - SC1: First-time privacy modal blocks popup
  - SC2: Privacy policy accessible from Settings > Privacy & Consent
  - SC3: Recording consent warning before each capture start
  - SC4: Don't-show-again checkbox persists via store
  - SC5: Reset All Consents button in Settings

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create PrivacyConsentModal and RecordingConsentWarning | 6b56a03 | src/components/consent/PrivacyConsentModal.tsx, src/components/consent/RecordingConsentWarning.tsx |
| 2 | Create ConsentSettings component | 363208d | src/components/settings/ConsentSettings.tsx |
| 3 | Integrate consent gates into popup App.tsx | feaea99 | entrypoints/popup/App.tsx |

## Files Created

- `src/components/consent/PrivacyConsentModal.tsx` -- Full-screen blocking modal with privacy policy and accept button
- `src/components/consent/RecordingConsentWarning.tsx` -- Inline amber-themed warning with checkbox and dual buttons
- `src/components/settings/ConsentSettings.tsx` -- Settings section with consent status, policy viewer, and reset button

## Files Modified

- `entrypoints/popup/App.tsx` -- Added consent imports, store selectors, recording consent local state, doStartCapture/handleStartCapture split, privacy consent early return gate, RecordingConsentWarning in capture tab, ConsentSettings in settings tab

## Decisions Made

1. **Early return gate (not overlay)**: PrivacyConsentModal replaces popup content via `if (!privacyPolicyAccepted) return <PrivacyConsentModal />` rather than overlaying. Simpler, no z-index issues, and matches the "must accept to use" requirement.
2. **doStartCapture/handleStartCapture split**: Keeps the consent check cleanly separated from the existing capture implementation. The Start button onClick still references handleStartCapture (the gated version).
3. **Inline policy viewer in settings**: Uses local useState toggle to show/hide PrivacyPolicyContent within ConsentSettings. Satisfies "accessible at any time" without needing a separate route or modal.
4. **Warning placement**: RecordingConsentWarning placed after Audio Capture section in capture tab for visual proximity to the Start button that triggers it.

## Deviations from Plan

None -- plan executed exactly as written.

## Issues

None.

## Next Phase Readiness

Phase 13 (Compliance UI) is now complete. Both plans executed successfully:
- Plan 01: Consent state slice and privacy policy content
- Plan 02: Consent UI gates integrated into popup

All v1.1 milestone phases (9-13) are complete. Ready for `/polish-milestone` workflow.

## Self-Check: PASSED

- [x] src/components/consent/PrivacyConsentModal.tsx exists
- [x] src/components/consent/RecordingConsentWarning.tsx exists
- [x] src/components/settings/ConsentSettings.tsx exists
- [x] 13-02-SUMMARY.md exists
- [x] Commit 6b56a03 found in git log
- [x] Commit 363208d found in git log
- [x] Commit feaea99 found in git log
- [x] TypeScript compiles with zero errors
- [x] Extension build (wxt build) succeeds
