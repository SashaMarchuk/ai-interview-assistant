# v1.1 Security & Reliability Research Summary

**Project:** AI Interview Assistant Chrome Extension
**Domain:** Chrome MV3 Extension Security Hardening & Reliability Improvements
**Researched:** 2026-02-08
**Confidence:** HIGH

## Executive Summary

v1.1 addresses critical security vulnerabilities and reliability bugs in the AI Interview Assistant Chrome extension. Research confirms that all required capabilities (API key encryption, persistent storage, circuit breaker pattern, compliance UI) can be implemented using native Chrome MV3 APIs with only one new dependency (`idb` at 1.2KB). The extension currently stores API keys in plaintext, transmits them via runtime messages (visible in DevTools), and loses all transcript data when the service worker terminates—all easily fixable with well-established patterns.

The recommended approach leverages WebCrypto API for AES-GCM encryption (zero bundle cost), chrome.storage.local for transcript buffering, and custom circuit breaker implementation over third-party libraries. Research identified seven critical pitfalls—most related to service worker lifecycle management and encryption key derivation—that must be avoided to prevent permanent data loss. The most dangerous pitfall is browser fingerprint-based key derivation using `screen.width/height`, which does not exist in service workers and would cause complete encryption failure.

Key risk mitigation: initialize encryption before store rehydration, use only service-worker-safe APIs for key derivation (`chrome.runtime.id` + stored salt, NOT browser fingerprints), persist circuit breaker state to chrome.storage.session, and implement atomic migration from plaintext to encrypted storage. Following the recommended architecture and phase ordering prevents all identified critical pitfalls.

## Key Findings

### Recommended Stack

**Zero new runtime dependencies except one.** All capabilities use native Chrome MV3 APIs (WebCrypto, IndexedDB, chrome.storage, chrome.alarms) that are built into Chrome 116+. The only addition is `idb@^8.0.3` (1.2KB brotli'd), a Promise-based IndexedDB wrapper that eliminates callback hell and provides full TypeScript generics.

**Core technologies:**
- **WebCrypto API (crypto.subtle)** — AES-GCM encryption of API keys at rest with PBKDF2 key derivation. Available in service workers without `window.` prefix, zero bundle cost, hardware-accelerated.
- **chrome.storage.local** — Debounced transcript buffer persistence (10MB quota, expandable with unlimitedStorage permission). Already used throughout codebase; extends existing pattern for reliability.
- **chrome.alarms** — Reliable timers that survive service worker termination. Replaces `setTimeout`/`setInterval` for circuit breaker OPEN-to-HALF_OPEN transitions and keep-alive management.
- **IndexedDB + idb** — Persistent transcript storage for long-term history (100MB+ capacity vs chrome.storage.local's 10MB). Available in service workers, indexed queries, structured-cloneable CryptoKey storage.
- **Custom circuit breaker** — Lightweight ~100-line TypeScript class. Opossum (15KB+, Node.js-focused) is overkill; custom implementation is smaller, fully typed, and service-worker-safe.

**What NOT to use:** Browser fingerprints (screen.width, window properties) for key derivation—these APIs don't exist in service workers. Dexie.js (20KB) for IndexedDB—reactive queries are unnecessary for append-and-query patterns. User passphrases for encryption—terrible UX for interview tool (must re-enter on every browser launch).

### Expected Features

**Must have (table stakes — P0 security/reliability fixes):**
- **Remove API keys from runtime messages** — Currently visible in DevTools and interceptable. Background already has store access; simple refactor to read keys directly instead of receiving via message payload.
- **Fix store race condition** — Messages can arrive before `storeReadyPromise` resolves. Solution: queue messages during init, drain after ready. DO NOT delay listener registration (breaks MV3 event delivery).
- **Transcript buffer persistence** — Module-level `mergedTranscript[]` array lost on service worker termination. Debounced writes to chrome.storage.local prevent data loss during active sessions.
- **API key encryption at rest** — WebCrypto AES-GCM with PBKDF2 derivation from `chrome.runtime.id` + stored salt. Transparent encrypt-on-write, decrypt-on-read via chromeStorage adapter wrapper.

**Should have (differentiators — P1 compliance/resilience):**
- **Privacy policy + consent UI** — First-time legal warning modal (blocking), per-session reminder (dismissable). Not legally required for private use, but demonstrates care and prepares for Chrome Web Store distribution.
- **Circuit breaker for API reliability** — Wrap existing retry logic with CLOSED/OPEN/HALF_OPEN state machine. Per-service instances (OpenAI, ElevenLabs) with configurable thresholds. Persist state to chrome.storage.session to survive service worker restarts.
- **Session history with IndexedDB** — Move beyond interim chrome.storage.local buffering to full-featured session management. Schema: `sessions`, `transcripts`, `responses` stores with indexed queries by sessionId and timestamp.

**Defer (v2+):**
- **Full session history UI** — Storage layer comes first; search/filter/browse UI is separate milestone.
- **User passphrase encryption** — Bad UX for interview tool; stick with derived key from extension ID.
- **HIPAA/SOC2 compliance** — Beyond scope for private-use extension.

### Architecture Approach

The extension has four execution contexts with distinct capabilities: background service worker (message hub, LLM calls, store primary), offscreen document (audio capture, WebSocket STT), popup (settings UI, capture controls), and content script (overlay rendering). v1.1 changes concentrate in the background service worker, with minimal modifications to popup (consent flow, remove apiKey from messages) and offscreen (circuit breaker for token requests).

**Major components:**

1. **EncryptionService (background only)** — Initialize once in service worker using crypto.subtle. Derive AES-GCM key from PBKDF2(chrome.runtime.id + salt). Salt stored in separate IndexedDB. Wrap chromeStorage adapter to transparently encrypt/decrypt API keys during persist/rehydrate. Never initialize in popup/content script to avoid key derivation inconsistencies.

2. **TranscriptBuffer (background only)** — Replace module-level `mergedTranscript[]` array with service that debounces writes to chrome.storage.local (every 1-2 seconds during active recording). On service worker restart, load from storage and resume. Flush immediately on STOP_TRANSCRIPTION and chrome.runtime.onSuspend to prevent last-segment loss.

3. **CircuitBreaker (background + offscreen)** — Wrap LLM API calls and ElevenLabs token requests. Persist state (failureCount, state, nextAttempt) to chrome.storage.session. Use chrome.alarms for OPEN-to-HALF_OPEN timeout instead of setTimeout (alarms survive service worker termination). In-memory state is acceptable fallback if persistence adds complexity.

4. **ConsentFlow (popup only)** — RecordingWarning modal (first-time, blocking), ConsentDialog (per-session, dismissable with "don't show again"). Store acknowledgment flags in chrome.storage.local directly (not Zustand store) as one-time values. Integrate into App.tsx before START_CAPTURE/START_TRANSCRIPTION messages.

**Critical initialization order:**
```
1. Register message listener with queue guard (synchronous, top-level, required by MV3)
2. EncryptionService.initialize() (async, derives key from IDB salt)
3. await storeReadyPromise (decrypt + rehydrate via encrypted chromeStorage)
4. TranscriptBuffer.load() (recover active session if SW restarted)
5. storeReady = true; drain message queue
```

### Critical Pitfalls

Research identified 16 pitfalls, 7 critical. Top 5 that cause permanent data loss or complete feature failure:

1. **Browser fingerprint key derivation using `screen.width`/`screen.height` breaks in service workers** — The `screen` object does not exist in ServiceWorkerGlobalScope. ReferenceError on encryption init. Use ONLY `chrome.runtime.id` + stored salt for key derivation. Test encryption in actual service worker context, not popup.

2. **Plaintext-to-encrypted migration causes permanent key loss** — If migration reads plaintext, encrypts, removes plaintext, and then encryption service fails mid-way, some keys are lost forever. Solution: atomic migration with verification. Encrypt ALL keys, verify ALL decrypt correctly, THEN remove plaintext. Keep migration version flag. Never remove plaintext until encrypted versions are verified working.

3. **User agent changes on browser update make all encrypted data undecryptable** — Chrome auto-updates every 2-4 weeks, changing `navigator.userAgent` string. If key derived from UA, every update breaks decryption. Do NOT use `navigator.userAgent` for key derivation. `chrome.runtime.id` is stable across updates.

4. **Moving message listener registration behind await breaks MV3 event delivery** — Chrome requires event listeners registered synchronously at top level. If listener registration is inside async init, messages that wake the service worker are dropped. Keep current pattern: register synchronously, queue messages if store not ready, drain after init completes.

5. **Circuit breaker state lost on service worker termination defeats its purpose** — In-memory circuit breaker resets to CLOSED after 30 seconds of inactivity. Extension keeps hammering failing APIs. Persist circuit breaker state to chrome.storage.session. Use chrome.alarms for OPEN-to-HALF_OPEN timeout, not setTimeout (timers die with service worker).

**Additional critical pitfall:** IndexedDB version conflict between encryption salt storage and future persistent transcripts feature. Solution: use SEPARATE databases (`encryption-db`, `transcripts-db`) or store salt in chrome.storage.local instead of IndexedDB (simpler, fewer moving parts).

## Implications for Roadmap

Based on research, suggested phase structure for v1.1:

### Phase 1: Foundation — Security Quick Wins
**Rationale:** Remove active vulnerabilities with minimal code change. Unblocks encryption work.
**Delivers:** API keys no longer visible in DevTools, store initialization guaranteed before message handling.
**Addresses:** FEATURES.md #1 (remove keys from messages), #3 (store race condition)
**Avoids:** PITFALLS.md #4 (message listener registration)
**Effort:** 2-4 hours total
**Research needed:** None (trivial refactor of existing patterns)

**Tasks:**
- Remove `apiKey` field from `StartTranscriptionMessage` interface
- Update `handleMessage()` to read API keys from `useStore.getState()` instead of message payload
- Implement message queue guard pattern for store initialization race

### Phase 2: Encryption Layer
**Rationale:** Foundational infrastructure required for Phase 3 (store must use encrypted adapter before any new writes). Highest complexity due to migration concerns.
**Delivers:** API keys encrypted at rest with AES-GCM, transparent encryption/decryption via storage adapter wrapper.
**Uses:** WebCrypto API (STACK.md), PBKDF2 + chrome.runtime.id (not browser fingerprint)
**Addresses:** FEATURES.md #2 (API key encryption)
**Avoids:** PITFALLS.md #1 (service worker API availability), #2 (migration atomicity), #3 (UA instability), #5 (IDB version conflict)
**Effort:** 1-1.5 days
**Research needed:** None (WebCrypto patterns well-documented)

**Tasks:**
- Create `EncryptionService` class with init, encrypt, decrypt methods
- Store salt in chrome.storage.local (simpler than IndexedDB for single value)
- Wrap `chromeStorage` adapter with encryption layer
- Implement atomic migration: read all plaintext, encrypt all, verify all, then remove plaintext
- Add migration version flag and health check

### Phase 3: Transcript Resilience
**Rationale:** Fixes critical data loss bug. Depends on Phase 2 encryption being in place (storage adapter finalized).
**Delivers:** Transcripts persist across service worker restarts, no data loss during active sessions.
**Uses:** chrome.storage.local debounced writes (STACK.md), chrome.alarms keep-alive (ARCHITECTURE.md)
**Addresses:** FEATURES.md #4 (transcript persistence)
**Avoids:** PITFALLS.md #7 (debounce timer loss), #10 (storage quota exhaustion)
**Effort:** 0.5-1 day
**Research needed:** None (extends existing keep-alive pattern)

**Tasks:**
- Create `TranscriptBuffer` service with debounced persistence
- Replace module-level `mergedTranscript[]` array
- Extend `startKeepAlive()` to cover active transcription (not just LLM streaming)
- Implement recovery flow: load transcript from storage on service worker restart
- Add flush on STOP_TRANSCRIPTION and onSuspend

### Phase 4: API Resilience (Circuit Breaker)
**Rationale:** Independent of encryption/persistence work; can run parallel to Phase 3 if resources allow. Wraps existing retry logic.
**Delivers:** Circuit breaker stops hammering failing APIs, allows recovery, surfaces "service unavailable" status to users.
**Uses:** chrome.storage.session for state persistence (STACK.md), chrome.alarms for recovery timeout (ARCHITECTURE.md)
**Addresses:** FEATURES.md #8 (circuit breaker)
**Avoids:** PITFALLS.md #6 (state loss on SW termination)
**Effort:** 1-1.5 days
**Research needed:** None (standard pattern, well-documented)

**Tasks:**
- Create `CircuitBreaker` class with CLOSED/OPEN/HALF_OPEN state machine
- Persist state to chrome.storage.session
- Use chrome.alarms for OPEN-to-HALF_OPEN timeout
- Wrap existing `streamWithRetry()` for LLM calls
- Add circuit breaker for ElevenLabs token requests in offscreen context
- Surface circuit state in UI connection status

### Phase 5: Compliance UI
**Rationale:** Independent UI work, no dependencies on encryption/storage. Can parallelize with Phases 3-4.
**Delivers:** First-time legal warning, per-session consent flow, privacy policy document.
**Uses:** React components (existing stack), chrome.storage.local for acknowledgment tracking (ARCHITECTURE.md)
**Addresses:** FEATURES.md #5 (privacy policy), #6 (consent warnings)
**Avoids:** PITFALLS.md #9 (consent UX dark patterns)
**Effort:** 0.5-1 day
**Research needed:** None (standard React component work)

**Tasks:**
- Create `RecordingWarning.tsx` modal (blocking, first-time only)
- Create `ConsentDialog.tsx` (per-session, dismissable)
- Write `PRIVACY.md` document
- Integrate consent flow into App.tsx before capture start
- Add "Reset consent dialogs" option to Settings

### Phase Ordering Rationale

- **Phase 1 first (Foundation):** Removes active security vulnerabilities with minimal risk. Must come before Phase 2 because encryption layer wraps the storage adapter that Phase 1's race condition fix depends on.
- **Phase 2 second (Encryption):** Must be in place before Phase 3 because TranscriptBuffer writes to storage, and the encrypted storage adapter must be active for all writes. Migration complexity justifies dedicated phase.
- **Phases 3-5 can parallelize:** Circuit breaker (Phase 4) and compliance UI (Phase 5) are independent of transcript persistence (Phase 3). If single developer, do Phase 3 before 4 (data loss is higher priority than API resilience).
- **Phase 5 last if sequential:** UI work is lowest risk and can be deferred if timeline pressured. But first-time consent modal should ship before distributing to users.

**Dependency graph:**
```
Phase 1 (Foundation)
  |
  v
Phase 2 (Encryption) --> Phase 3 (Transcript Resilience)
  |                           |
  |                           v
  +----------------------> Phase 4 (Circuit Breaker) [can parallelize with Phase 3]
                              |
                              v
                         Phase 5 (Compliance UI) [can parallelize with Phases 3-4]
```

### Research Flags

**Phases with standard patterns (skip research-phase):**
- **Phase 1:** Trivial refactor of existing message handling and store access patterns. No research needed.
- **Phase 3:** Extends existing keep-alive pattern and chrome.storage.local usage already in codebase. No research needed.
- **Phase 5:** Standard React component work with existing Tailwind stack. No research needed.

**Phases with complexity (but research already complete):**
- **Phase 2 (Encryption):** High complexity due to migration and service worker API constraints, but research complete (WebCrypto patterns, key derivation strategy, migration approach all documented in STACK.md and PITFALLS.md).
- **Phase 4 (Circuit Breaker):** Moderate complexity (state persistence, chrome.alarms usage), but circuit breaker pattern is canonical and chrome.alarms usage is well-documented.

**Future phases needing research (v2.1+):**
- **Full IndexedDB session history:** Schema design, query optimization, export formats would benefit from targeted research. Current research covers basic IndexedDB setup but not advanced query patterns or migration from chrome.storage.local buffer to full IDB schema.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified against official Chrome docs. WebCrypto availability in service workers confirmed via Chromium Extensions group discussion. `idb` library widely used (12M+ weekly downloads). No speculative dependencies. |
| Features | HIGH | Features extracted from existing TODOs in `.planning/todos/pending/`. Complexity estimates validated against codebase structure. All features have precedent in Chrome extension ecosystem. |
| Architecture | HIGH | Based on detailed codebase analysis (background.ts, chromeStorage.ts, ElevenLabsConnection.ts reviewed). Service worker lifecycle patterns verified against official Chrome MV3 migration guides. Integration points identified in existing code. |
| Pitfalls | HIGH | All critical pitfalls sourced from official Chrome docs, Chromium Extensions discussions, or verified community reports. Pitfall #1 (screen API unavailability) confirmed via MDN WorkerGlobalScope docs. Pitfall #4 (listener registration) confirmed via Chrome service worker lifecycle docs. |

**Overall confidence:** HIGH

### Gaps to Address

**No significant research gaps.** All features, technologies, and patterns are well-documented with official sources. Minor validation needed during implementation:

- **Encryption migration edge cases:** Test migration with partially corrupted storage, verify behavior when chrome.storage.local.get fails mid-migration. Addressed by atomic migration pattern in Phase 2.
- **Circuit breaker state persistence overhead:** Measure chrome.storage.session write latency during high-frequency API calls. If >10ms per write, switch to batched writes or in-memory only. Addressable during Phase 4 implementation.
- **chrome.storage.local quota for transcript buffering:** Current estimate is 50KB per 30-minute session, well under 10MB quota. Validate with real interview transcripts. If quota concerns emerge, request `unlimitedStorage` permission (already recommended in STACK.md).

**One architectural decision to validate during Phase 2:** Salt storage location (chrome.storage.local vs IndexedDB). Research recommends chrome.storage.local for simplicity (single value, no schema management, no version conflict risk). Validate that salt does not need to be in separate storage tier from encrypted data for security purposes. Current assessment: salt in chrome.storage.local is acceptable (salt is not secret, only needs to be stable).

## Sources

### Primary (HIGH confidence)
- [Chrome MV3 Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) — Termination rules, keep-alive patterns, event listener registration requirements
- [Chrome Storage API Reference](https://developer.chrome.com/docs/extensions/reference/api/storage) — Quota limits, chrome.storage.local vs session behavior
- [Chrome Storage and Cookies Guide](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies) — IndexedDB availability in service workers, content script storage isolation
- [WebCrypto API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) — crypto.subtle availability, AES-GCM patterns, PBKDF2 specs
- [WorkerGlobalScope Navigator (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/navigator) — Confirms `screen` object unavailable in service workers
- [Chromium Extensions Group: WebCrypto in MV3 SW](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/VCXF9rZXr5Y) — Verified crypto.subtle available in service workers without `window.` prefix
- [idb GitHub](https://github.com/jakearchibald/idb) — v8.0.3, 1.2KB brotli'd, TypeScript generics, 12M+ weekly downloads
- [Circuit Breaker Pattern (Martin Fowler)](https://martinfowler.com/bliki/CircuitBreaker.html) — Canonical state machine description

### Secondary (MEDIUM confidence)
- [Microsoft Accessibility Insights MV3 Migration](https://devblogs.microsoft.com/engineering-at-microsoft/learnings-from-migrating-accessibility-insights-for-web-to-chromes-manifest-v3/) — IndexedDB persistence patterns in service workers
- [MV3 Async Init Race Condition Discussion](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/bnH_zx2LjQY) — Message queuing workaround for listener registration timing
- [Chrome Extension Security Best Practices](https://developer.chrome.com/docs/extensions/mv3/security/) — API key handling recommendations
- [Handling IndexedDB Upgrade Version Conflict](https://dev.to/ivandotv/handling-indexeddb-upgrade-version-conflict-368a) — Version conflict resolution patterns
- [Saving Web Crypto Keys using IndexedDB (GitHub Gist)](https://gist.github.com/saulshanabrook/b74984677bccd08b028b30d9968623f5) — CryptoKey structured cloning examples

### Tertiary (LOW confidence, not used for critical decisions)
- [API Key Security in Chrome Extensions (DEV)](https://dev.to/notearthian/how-to-secure-api-keys-in-chrome-extension-3f19) — Community approaches to key security
- [Circuit Breaker in TypeScript (DEV)](https://dev.to/wallacefreitas/circuit-breaker-pattern-in-nodejs-and-typescript-enhancing-resilience-and-stability-bfi) — Implementation examples
- [DMLP Recording Laws Guide](https://www.dmlp.org/legal-guide/recording-phone-calls-and-conversations) — Legal context for consent warnings

---
*Research completed: 2026-02-08*
*Ready for roadmap: yes*
*Synthesized from: STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md*
