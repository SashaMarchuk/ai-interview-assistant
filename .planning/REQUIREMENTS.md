# Requirements: AI Interview Assistant

**Defined:** 2026-02-08
**Core Value:** Get something useful on screen fast enough to start speaking confidently during interviews

## v1.1 Requirements (Shipped)

Requirements for v1.1 Security & Reliability release. All delivered.

### Security

- [x] **SEC-01**: API keys are never transmitted via chrome.runtime messages — background reads keys directly from store
- [x] **SEC-02**: API keys are encrypted at rest using WebCrypto AES-GCM with PBKDF2 key derivation from chrome.runtime.id + stored salt

### Reliability

- [x] **REL-01**: Store initialization completes before message processing via queue guard pattern — no race condition on service worker wake
- [x] **REL-02**: Transcript buffer persists to chrome.storage.local with debounced writes — no data loss on service worker termination
- [x] **REL-03**: API calls are wrapped with circuit breaker pattern (CLOSED/OPEN/HALF_OPEN) with state persisted to chrome.storage.session

### Compliance

- [x] **COMP-01**: Privacy policy document exists and is accessible from extension UI with first-time consent modal
- [x] **COMP-02**: Recording consent warning displays on first use (blocking) and per-session (dismissable) before audio capture starts

## v2.0 Requirements

Requirements for v2.0 Enhanced Experience release. Each maps to roadmap phases.

### Markdown Rendering

- [ ] **MD-01**: LLM responses render as formatted Markdown with headers, bold/italic, lists, and paragraphs
- [ ] **MD-02**: Code blocks render with syntax highlighting, language label, and copy-to-clipboard button
- [ ] **MD-03**: Markdown rendering works correctly inside Shadow DOM overlay with proper styling
- [ ] **MD-04**: Streaming responses render incrementally as Markdown (no flicker or reparse lag)

### Reasoning Models

- [ ] **RSN-01**: User can select o-series reasoning models (o3-mini, o4-mini) from model picker
- [ ] **RSN-02**: GPT-5 series models are available in the model list and work correctly
- [ ] **RSN-03**: Reasoning models use correct API parameters (developer role, max_completion_tokens, reasoning_effort)
- [ ] **RSN-04**: User can control reasoning_effort level (low/medium/high) per request
- [ ] **RSN-05**: Dedicated reasoning button triggers reasoning model request with visual "thinking" indicator
- [ ] **RSN-06**: Reasoning models enforce minimum 25K token budget to prevent empty responses

### Cost Tracking

- [ ] **COST-01**: Token usage (prompt, completion, reasoning tokens) is captured from each LLM streaming response
- [ ] **COST-02**: Per-request cost is calculated and displayed in the overlay next to each response
- [ ] **COST-03**: Session cost total is visible during active interview session
- [ ] **COST-04**: Cost history is stored in IndexedDB with per-provider breakdown
- [ ] **COST-05**: Cost dashboard in popup shows historical usage with charts (per-provider, per-session, over time)

### File Personalization

- [ ] **FILE-01**: User can upload resume file (PDF/TXT) via popup settings
- [ ] **FILE-02**: User can upload or paste job description text via popup settings
- [ ] **FILE-03**: Uploaded file content is extracted client-side and stored in IndexedDB
- [ ] **FILE-04**: Resume and JD context are automatically injected into LLM prompts via PromptBuilder

### Enhanced Text Selection

- [ ] **SEL-01**: Selecting transcript text shows a floating tooltip with action buttons
- [ ] **SEL-02**: Tooltip offers quick prompts (explain, elaborate, correct) that send selected text + prompt to LLM
- [ ] **SEL-03**: User can customize quick prompt actions in settings

### Transcript Editing

- [ ] **EDIT-01**: User can inline-edit transcript entries (double-click to edit, Enter to save, Escape to cancel)
- [ ] **EDIT-02**: User can soft-delete transcript entries (hide from view and LLM context)
- [ ] **EDIT-03**: Edited transcript text is used in subsequent LLM requests instead of original
- [ ] **EDIT-04**: User can undo edits to restore original transcript text

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
| Full session history UI | Deferred to future milestone |
| User passphrase encryption | Bad UX for interview tool — must re-enter on every browser launch |
| HIPAA/SOC2 compliance | Beyond scope for private-use extension |
| Configurable circuit breaker settings UI | Sensible defaults sufficient |
| Transcript encryption at rest | API keys are the sensitive data; transcripts are ephemeral |
| Cloud backup of settings | Private-use extension, no server-side components |
| OpenAI Files API upload | Client-side extraction is more reliable and provider-agnostic |
| TTS audio feedback | Not needed for interview use case |
| Reasoning model streaming for o1 | o1 does not support streaming in Chat Completions API; non-streaming fallback used |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 9: Security Foundation | Shipped (v1.1) |
| SEC-02 | Phase 10: Encryption Layer | Shipped (v1.1) |
| REL-01 | Phase 9: Security Foundation | Shipped (v1.1) |
| REL-02 | Phase 11: Transcript Resilience | Shipped (v1.1) |
| REL-03 | Phase 12: Circuit Breaker | Shipped (v1.1) |
| COMP-01 | Phase 13: Compliance UI | Shipped (v1.1) |
| COMP-02 | Phase 13: Compliance UI | Shipped (v1.1) |
| MD-01 | Phase 15: Markdown Rendering | Pending |
| MD-02 | Phase 15: Markdown Rendering | Pending |
| MD-03 | Phase 15: Markdown Rendering | Pending |
| MD-04 | Phase 15: Markdown Rendering | Pending |
| RSN-01 | Phase 16: Reasoning Models | Pending |
| RSN-02 | Phase 16: Reasoning Models | Pending |
| RSN-03 | Phase 16: Reasoning Models | Pending |
| RSN-04 | Phase 16: Reasoning Models | Pending |
| RSN-05 | Phase 16: Reasoning Models | Pending |
| RSN-06 | Phase 16: Reasoning Models | Pending |
| COST-01 | Phase 17: Cost Tracking Capture | Pending |
| COST-02 | Phase 17: Cost Tracking Capture | Pending |
| COST-03 | Phase 17: Cost Tracking Capture | Pending |
| COST-04 | Phase 18: Cost Dashboard | Pending |
| COST-05 | Phase 18: Cost Dashboard | Pending |
| FILE-01 | Phase 19: File Personalization | Pending |
| FILE-02 | Phase 19: File Personalization | Pending |
| FILE-03 | Phase 19: File Personalization | Pending |
| FILE-04 | Phase 19: File Personalization | Pending |
| SEL-01 | Phase 21: Enhanced Text Selection | Pending |
| SEL-02 | Phase 21: Enhanced Text Selection | Pending |
| SEL-03 | Phase 21: Enhanced Text Selection | Pending |
| EDIT-01 | Phase 20: Transcript Editing | Pending |
| EDIT-02 | Phase 20: Transcript Editing | Pending |
| EDIT-03 | Phase 20: Transcript Editing | Pending |
| EDIT-04 | Phase 20: Transcript Editing | Pending |

**Coverage:**
- v1.1 requirements: 7 total (all shipped)
- v2.0 requirements: 23 total
- Mapped to phases: 23/23
- Unmapped: 0

---
*Requirements defined: 2026-02-08*
*Last updated: 2026-02-09 after v2.0 roadmap creation*
