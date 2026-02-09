# Requirements: AI Interview Assistant

**Defined:** 2026-02-08
**Core Value:** Get something useful on screen fast enough to start speaking confidently during interviews

## v1.1 Requirements

Requirements for v1.1 Security & Reliability release. Each maps to roadmap phases.

### Security

- [ ] **SEC-01**: API keys are never transmitted via chrome.runtime messages — background reads keys directly from store
- [ ] **SEC-02**: API keys are encrypted at rest using WebCrypto AES-GCM with PBKDF2 key derivation from chrome.runtime.id + stored salt

### Reliability

- [ ] **REL-01**: Store initialization completes before message processing via queue guard pattern — no race condition on service worker wake
- [ ] **REL-02**: Transcript buffer persists to chrome.storage.local with debounced writes — no data loss on service worker termination
- [ ] **REL-03**: API calls are wrapped with circuit breaker pattern (CLOSED/OPEN/HALF_OPEN) with state persisted to chrome.storage.session

### Compliance

- [ ] **COMP-01**: Privacy policy document exists and is accessible from extension UI with first-time consent modal
- [ ] **COMP-02**: Recording consent warning displays on first use (blocking) and per-session (dismissable) before audio capture starts

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Session History

- **HIST-01**: User can browse session history with search and filter
- **HIST-02**: User can export session transcripts to JSON/text
- **HIST-03**: User can delete individual sessions from history

### Advanced Encryption

- **ENC-01**: User can optionally set a custom passphrase for API key encryption
- **ENC-02**: Extension provides key rotation mechanism for encryption keys

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Full session history UI | Storage layer comes first (v1.1); search/filter/browse UI is separate milestone |
| User passphrase encryption | Bad UX for interview tool — must re-enter on every browser launch |
| HIPAA/SOC2 compliance | Beyond scope for private-use extension |
| Configurable circuit breaker settings UI | Sensible defaults are sufficient; configuration adds complexity without value |
| Transcript encryption at rest | API keys are the sensitive data; transcripts are ephemeral interview content |
| Cloud backup of settings | Private-use extension, no server-side components |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 9: Security Foundation | Pending |
| SEC-02 | Phase 10: Encryption Layer | Pending |
| REL-01 | Phase 9: Security Foundation | Pending |
| REL-02 | Phase 11: Transcript Resilience | Pending |
| REL-03 | Phase 12: Circuit Breaker | Pending |
| COMP-01 | Phase 13: Compliance UI | Pending |
| COMP-02 | Phase 13: Compliance UI | Pending |

**Coverage:**
- v1.1 requirements: 7 total
- Mapped to phases: 7
- Unmapped: 0

---
*Requirements defined: 2026-02-08*
*Last updated: 2026-02-08 after roadmap creation*
