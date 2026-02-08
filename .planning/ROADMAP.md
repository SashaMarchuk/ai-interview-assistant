# Roadmap: AI Interview Assistant

## Milestones

- ✅ **v1.0 MVP** - Phases 1-8 (shipped 2026-02-03)
- 🚧 **v1.1 Security & Reliability** - Phases 9-13 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-8) - SHIPPED 2026-02-03</summary>

8 phases, 30 plans, 48 requirements delivered.
See MILESTONES.md for details.

</details>

### 🚧 v1.1 Security & Reliability (In Progress)

**Milestone Goal:** Harden security, add compliance features, and fix critical reliability bugs before adding new capabilities.

**Phase Numbering:**
- Integer phases (9, 10, 11, 12, 13): Planned milestone work
- Decimal phases (e.g., 10.1): Urgent insertions (marked with INSERTED)

- [x] **Phase 9: Security Foundation** - Remove API keys from messages and fix store race condition (completed 2026-02-08)
- [x] **Phase 10: Encryption Layer** - Encrypt API keys at rest with AES-GCM (completed 2026-02-08)
- [x] **Phase 11: Transcript Resilience** - Persist transcript buffer across service worker restarts (completed 2026-02-08)
- [ ] **Phase 12: Circuit Breaker** - Wrap API calls with circuit breaker pattern for graceful failure handling
- [ ] **Phase 13: Compliance UI** - Privacy policy, consent modals, and recording warnings

## Phase Details

### Phase 9: Security Foundation
**Goal**: API keys are no longer exposed in chrome.runtime messages, and the background service worker handles messages reliably regardless of initialization timing
**Depends on**: Nothing (first phase of v1.1)
**Requirements**: SEC-01, REL-01
**Success Criteria** (what must be TRUE):
  1. Opening DevTools and inspecting chrome.runtime messages shows zero API key values in any message payload
  2. Sending a message to the background script immediately after service worker wakes up (cold start) results in correct handling -- no dropped or failed messages
  3. The background script reads API keys directly from the Zustand store, never from incoming message data
**Plans**: 1 plan

Plans:
- [x] 09-01-PLAN.md -- Remove API keys from messages + queue guard for store hydration

### Phase 10: Encryption Layer
**Goal**: API keys stored in chrome.storage.local are encrypted at rest, unreadable without the derived decryption key, with safe migration from plaintext
**Depends on**: Phase 9 (store race condition must be fixed before wrapping storage adapter)
**Requirements**: SEC-02
**Success Criteria** (what must be TRUE):
  1. Inspecting chrome.storage.local via DevTools shows encrypted (non-human-readable) values for all API key fields
  2. The extension continues to function normally after encryption migration -- all previously saved API keys still work for API calls
  3. Restarting Chrome (full browser restart) does not break decryption -- keys remain accessible to the extension
  4. Encryption uses WebCrypto AES-GCM with PBKDF2 key derivation from chrome.runtime.id + stored salt (not browser fingerprints or user agent)
**Plans**: 1 plan

Plans:
- [x] 10-01-PLAN.md -- Encrypt API keys at rest with AES-GCM + PBKDF2 and wire init chain

### Phase 11: Transcript Resilience
**Goal**: Active transcript data survives service worker termination -- no data loss during interviews
**Depends on**: Phase 10 (storage adapter must be finalized before adding new persistent writes)
**Requirements**: REL-02
**Success Criteria** (what must be TRUE):
  1. During active transcription, killing the service worker (via chrome://serviceworker-internals) and letting it restart preserves all transcript segments captured before termination
  2. Stopping transcription normally flushes the complete transcript to persistent storage with no missing segments
  3. A transcript that was being actively captured survives Chrome's 30-second idle timeout for service workers without data loss
**Plans**: 1 plan

Plans:
- [x] 11-01-PLAN.md -- Create TranscriptBuffer with debounced persistence and wire into background.ts

### Phase 12: Circuit Breaker
**Goal**: API calls fail gracefully with automatic recovery instead of hammering unresponsive services
**Depends on**: Phase 10 (encryption layer complete; circuit breaker is independent but sequential for solo developer)
**Requirements**: REL-03
**Success Criteria** (what must be TRUE):
  1. After 3+ consecutive API failures, subsequent calls are immediately rejected without making network requests (circuit OPEN state) and the UI shows a service unavailable indicator
  2. After the recovery timeout elapses, the circuit automatically transitions to HALF_OPEN and allows a test request through
  3. Circuit breaker state persists across service worker restarts -- killing the service worker while circuit is OPEN does not reset it to CLOSED
  4. When the failing service recovers, the circuit transitions back to CLOSED and normal operation resumes automatically
**Plans**: 1 plan

Plans:
- [ ] 12-01-PLAN.md -- Circuit breaker service with per-provider instances, persistent state, and background.ts integration

### Phase 13: Compliance UI
**Goal**: Users are informed about privacy implications and consent to recording before audio capture begins
**Depends on**: Phase 9 (no hard dependency on encryption/circuit breaker; compliance UI is independent React work)
**Requirements**: COMP-01, COMP-02
**Success Criteria** (what must be TRUE):
  1. On first extension use, a blocking privacy consent modal appears that must be accepted before any functionality is available
  2. The privacy policy document is accessible from the extension UI at any time (not just during first-time setup)
  3. Before each recording session, a dismissable recording consent warning appears reminding the user about audio capture
  4. A user who previously dismissed the per-session warning with "don't show again" does not see it on subsequent sessions
  5. A settings option exists to reset all consent acknowledgments (re-trigger first-time and per-session flows)
**Plans**: 2 plans

Plans:
- [ ] 13-01-PLAN.md -- Consent state slice + privacy policy content component
- [ ] 13-02-PLAN.md -- Consent UI gates + settings integration in popup

## Progress

**Execution Order:**
Phases 9 → 10 are sequential (hard dependencies). After Phase 10, Phases 11, 12, 13 can execute in parallel (separate terminals/branches).

**Parallelization Note:** User prefers running independent phases in parallel via separate Claude terminals on separate branches. Phases 11, 12, 13 touch different files and can safely parallelize after Phase 10 completes.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 9. Security Foundation | v1.1 | 1/1 | ✓ Complete | 2026-02-08 |
| 10. Encryption Layer | v1.1 | 1/1 | ✓ Complete | 2026-02-08 |
| 11. Transcript Resilience | v1.1 | 1/1 | ✓ Complete | 2026-02-08 |
| 12. Circuit Breaker | v1.1 | 0/1 | Not started | - |
| 13. Compliance UI | v1.1 | 0/2 | Not started | - |
