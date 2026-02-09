# Feature Landscape: v1.1 Security & Reliability

**Domain:** Chrome MV3 extension security hardening, privacy compliance, and reliability
**Researched:** 2026-02-08
**Scope:** v1.1 milestone features only (security, compliance, bug fixes, reliability)

---

## Table Stakes

Features that are mandatory for v1.1. Without these, the extension has active security vulnerabilities, legal exposure, and data loss bugs that make it unsuitable for real use.

### 1. API Keys Removed from Runtime Messages

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| Remove `apiKey` field from `StartTranscriptionMessage` | API keys currently transmitted via `chrome.runtime.sendMessage()`, visible in DevTools and interceptable by any extension component | Low | None |
| Background reads keys directly from Zustand store / chrome.storage | Background service worker already has access to the store via `useStore.getState()` | Low | Store ready (already implemented) |
| Remove apiKey from popup `handleStartTranscription()` | Popup currently sends `apiKey: apiKeys.elevenLabs` in message payload (App.tsx line 294) | Low | Background handler update |
| Update `StartTranscriptionMessage` interface in messages.ts | Remove `apiKey: string` field from the type definition | Low | None |

**Current vulnerability (confirmed in codebase):**
```typescript
// src/types/messages.ts line 171-176 - CONFIRMED: apiKey field exists
export interface StartTranscriptionMessage extends BaseMessage {
  type: 'START_TRANSCRIPTION';
  apiKey: string;  // <-- This must go
  languageCode?: string;
}
```

```typescript
// entrypoints/popup/App.tsx line 292-296 - CONFIRMED: key sent in message
const response = await chrome.runtime.sendMessage({
  type: 'START_TRANSCRIPTION',
  apiKey: apiKeys.elevenLabs,  // <-- Security risk
  languageCode: transcriptionLanguage || undefined,
} as ExtensionMessage);
```

**Impact:** Low implementation effort, high security value. The background service worker already calls `useStore.getState()` and has access to `apiKeys` -- the key just needs to be read there instead of received via message.

**Note:** LLM API keys are already read from store in background (confirmed in `handleLLMRequest()` at line 228-229). Only the transcription flow has this vulnerability. The fix establishes a consistent pattern: API keys never leave chrome.storage/Zustand.

### 2. API Key Encryption at Rest

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| AES-GCM encryption via WebCrypto API | Keys stored as plaintext JSON in chrome.storage.local, readable by any code with storage access | Medium | WebCrypto API (built-in) |
| Key derivation from browser/extension entropy | Derive encryption key using PBKDF2 with salt stored separately in IndexedDB | Medium | IndexedDB for salt storage |
| Transparent encrypt-on-write / decrypt-on-read | Encryption layer wraps the existing chromeStorage adapter without changing the Zustand store API | Medium | chromeStorage.ts refactor |
| Migration from plaintext to encrypted storage | Detect existing plaintext keys, encrypt, remove plaintext on extension update | Low | `chrome.runtime.onInstalled` |

**Complexity assessment:** Medium overall. The WebCrypto API is well-documented and built into all modern browsers. The main complexity is:
1. Deciding key derivation strategy (browser fingerprint vs extension-generated random key)
2. Handling the edge case where the derived key changes (user changes browser settings)
3. Migration path for existing users with plaintext keys

**Recommended approach:** Use `chrome.runtime.id` (stable per installation) + random salt stored in IndexedDB. This avoids the fragility of browser fingerprinting while providing reasonable protection. The salt in IndexedDB ensures the encryption key is not stored alongside the encrypted data.

**Security caveat (be honest about limits):** Chrome already encrypts storage on disk. Runtime encryption adds defense-in-depth against: (a) malicious extensions reading chrome.storage, (b) exported backups containing plaintext keys, (c) debug dumps. It does NOT protect against: memory inspection, debugger access, or code injection that can call the decrypt function. For private use (not Chrome Web Store), this is a reasonable security/UX tradeoff.

### 3. Store Sync Race Condition Fix

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| Guard message handlers against pre-hydration access | Messages can arrive before `storeReadyPromise` resolves, causing `useStore.getState()` to return defaults | Low | None |
| Message queuing during initialization | Queue incoming messages while store hydrates, process after ready | Low | None |
| Timeout fallback for slow hydration | If store fails to hydrate within 10s, proceed with defaults rather than blocking forever | Low | None |

**Current vulnerability (confirmed in codebase):**
```typescript
// entrypoints/background.ts line 123-127
// Store initialization is async
storeReadyPromise.then(() => {
  console.log('Store ready in service worker');
});

// BUT message listener is registered SYNCHRONOUSLY at line 436
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Messages CAN arrive before store is ready
  handleMessage(message, sender).then(sendResponse)...
});
```

The message listener is correctly registered at the top level (required for MV3 service workers), but `handleMessage()` accesses `useStore.getState()` (line 228) which may return unhydrated defaults. The fix is NOT to move the listener registration (that would break MV3), but to add a guard inside `handleMessage()` that awaits `storeReadyPromise` before accessing store state.

**Recommended pattern:** Lazy store access in handler.
```
// Inside handleMessage, before accessing store:
if (!storeHydrated) await storeReadyPromise;
const state = useStore.getState();
```

This adds ~10-50ms latency only on the first message after service worker restart. Subsequent messages have zero overhead because `storeHydrated` will be `true`.

### 4. Transcript Persistence Across Service Worker Restarts

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| Debounced persistence of `mergedTranscript` to chrome.storage.local | Active transcript stored only in module-level `let mergedTranscript: TranscriptEntry[] = []` -- lost if service worker terminates | Low-Med | None |
| Recovery of transcript state on service worker restart | Load persisted transcript from storage when service worker wakes | Low | Persist mechanism |
| Session ID tracking for active recording | Know which transcript is "active" so recovery can restore it | Low | None |

**Current vulnerability (confirmed in codebase):**
```typescript
// entrypoints/background.ts line 21-23
let mergedTranscript: TranscriptEntry[] = [];
let interimEntries: Map<string, { source: 'tab' | 'mic'; text: string; timestamp: number }> =
  new Map();
```

These are module-level variables. Per Chrome's documentation: "Any global variables you set will be lost if the service worker shuts down." The service worker terminates after 30 seconds of inactivity. During active recording, the keep-alive mechanism (line 40-52) prevents this, but if anything disrupts it, transcript data is lost.

**Recommended approach:** Debounced writes to chrome.storage.local (every 2-5 seconds during active transcription). This is the interim fix; full IndexedDB persistence (feature #7) replaces it for long-term storage.

**Storage budget:** A typical 30-minute interview produces ~200-500 transcript entries at ~100 bytes each = ~50KB. Well within chrome.storage.local's 10MB quota.

---

## Differentiators

Features that go beyond basic security and make the extension notably more robust and trustworthy than typical side-projects.

### 5. Privacy Policy + Consent UI

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| Privacy policy document (PRIVACY.md) | Legal compliance, user trust, Chrome Web Store readiness | Low | None |
| First-time privacy notice in popup | Users see what data is collected before first use | Low | `chrome.storage.local` for acceptance tracking |
| Data export (JSON) | GDPR right to data portability | Low-Med | Data aggregation from storage + IndexedDB |
| Data deletion mechanism | GDPR right to erasure, user control | Low | `chrome.storage.local.clear()` + IndexedDB clear |

**Why this is a differentiator (not just table stakes):** For private use only (not Chrome Web Store), a privacy policy is not legally required. Building it anyway demonstrates care for users and prepares for future distribution. The export/delete mechanisms are genuinely useful features that also happen to satisfy GDPR.

**Key contents for the privacy policy:**
- All processing is local (no backend servers)
- Audio is streamed to ElevenLabs via user's own API key (not stored)
- Transcripts stored locally in browser
- API keys encrypted at rest
- No analytics, no tracking, no data sharing
- Third-party policies: OpenAI (user's key), ElevenLabs (user's key)

### 6. Recording Consent Warnings

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| First-time legal warning modal | Educate users about recording laws, reduce developer liability | Low | `chrome.storage.local` for acknowledgment |
| Per-session consent reminder (dismissable) | Ongoing reminder before each recording session | Low | None |
| "Don't show again" option | Avoid UX friction for informed users | Low | Settings storage |
| Reset consent dialogs in Settings | Allow users to re-read warnings | Low | None |

**UX decision:** The first-time warning should be a blocking modal that requires checkbox acknowledgment. The per-session reminder should be a lightweight confirmation dialog with "Don't show again" option. This balances legal protection with usability.

**Important context:** This extension is for private use, not Chrome Web Store. However, recording laws apply regardless of distribution channel. Two-party consent states (CA, FL, IL, MA, WA, etc.) make recording without consent a criminal offense. The warning protects both the developer and the user.

### 7. Persistent Transcripts with IndexedDB

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| IndexedDB database for sessions and transcripts | Unlimited storage vs chrome.storage.local's 10MB limit | Medium | `idb` npm package (recommended) |
| Session lifecycle (create, update, end) | Track interview sessions with metadata | Medium | Background service integration |
| Transcript segment persistence during active session | Real-time writes to IndexedDB (replaces feature #4 for long-term) | Medium | Feature #4 (interim) or direct |
| Session search by date range | Find past interview transcripts | Low-Med | IndexedDB indexes |
| Session deletion (cascading) | Delete session + all associated transcripts and LLM responses | Low | IndexedDB transactions |

**Why IndexedDB over chrome.storage.local:**

| Criterion | chrome.storage.local | IndexedDB |
|-----------|---------------------|-----------|
| Capacity | 10MB (5MB without unlimitedStorage) | ~100MB-1GB+ |
| Query capability | Key-value only | Indexed queries, key ranges |
| Performance at scale | Degrades with large values | Designed for large datasets |
| Available in service worker | Yes | Yes |
| Complexity | Simple | More complex API (mitigated by `idb` wrapper) |

**Recommended library:** `idb` by Jake Archibald (~1.19kB brotli). Wraps IndexedDB with Promises instead of callbacks. Full TypeScript support. Widely used in Chrome extensions. No dependencies.

**Schema design:**
- `sessions` store: id, startTime, endTime, title, metadata
- `transcripts` store: id, sessionId (indexed), text, speaker, timestamp (indexed)
- `responses` store: id, sessionId (indexed), prompt, response, model, timestamp

**Relationship to feature #4:** Feature #4 (transcript persistence in chrome.storage.local) serves as the immediate bug fix. Feature #7 (IndexedDB) is the long-term solution. If both are in the same milestone, implement #7 directly and skip #4's chrome.storage approach. If #4 ships first, it serves as a stop-gap until #7 replaces it.

### 8. Circuit Breaker for API Reliability

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| Circuit breaker state machine (CLOSED/OPEN/HALF_OPEN) | Stop hammering failing APIs, allow recovery | Medium | None |
| Configurable failure threshold and timeout | Different services have different failure profiles | Low | Settings store |
| Per-service circuit breakers | OpenAI, ElevenLabs fail independently | Low | None |
| Exponential backoff with jitter | Prevent thundering herd on recovery | Low | None |
| User-visible status for circuit state | "Service temporarily unavailable, retrying in 45s" | Low | Connection state UI (already exists) |
| Respect `Retry-After` header | OpenAI rate limits include this header | Low | HTTP response parsing |

**Current state:** The codebase already has basic retry logic with exponential backoff for LLM requests (background.ts lines 169-213, `streamWithRetry()`). The circuit breaker adds the critical missing piece: stop retrying after repeated failures and give the service time to recover.

**Existing retry code to enhance:**
```typescript
// entrypoints/background.ts line 34-36
const MAX_LLM_RETRIES = 3;
const LLM_RETRY_DELAY_MS = 1000;
```

The circuit breaker wraps around this existing retry logic, not replacing it:
```
Request -> Circuit Breaker check -> Retry with backoff -> Success/Failure
                                                              |
                                                    Track in circuit breaker
```

**ElevenLabs already has reconnection logic** (ElevenLabsConnection.ts lines 347-361, `MAX_RECONNECT_ATTEMPTS = 3`). The circuit breaker would wrap the initial connection attempt, not the WebSocket reconnection.

**Implementation note:** A lightweight ~50-line CircuitBreaker class is sufficient. No external library needed. The `opossum` npm package is overkill for this use case (it's designed for Node.js microservices, not browser extensions).

---

## Anti-Features

Features to explicitly NOT build in this milestone.

### 1. User-Provided Encryption Passphrase

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Require user to enter a passphrase to unlock API keys each session | Terrible UX for an interview assistant -- user must type passphrase under interview pressure every time | Use derived key from extension ID + salt. Less secure but practical for the use case |

### 2. Cloud Backup of Encrypted Keys

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Sync encrypted API keys via chrome.storage.sync | Adds complexity, sync quota is only 100KB, encrypted data may not decrypt on different browsers with different derived keys | Keep keys local only. User re-enters on new browser |

### 3. End-to-End Encryption of Transcripts

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Encrypt all transcript data in IndexedDB | Massive performance overhead for real-time transcription (encrypt every segment during interview), transcripts are not as sensitive as API keys | Store transcripts in plaintext IndexedDB. Chrome's built-in storage isolation provides adequate protection for interview transcripts |

### 4. HIPAA / SOC2 Compliance

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full regulatory compliance framework | Way beyond scope for a private-use Chrome extension | Document what data is stored and how in privacy policy. Defer compliance work until Chrome Web Store or enterprise distribution |

### 5. Configurable Circuit Breaker Settings UI

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Settings page where user can adjust failure thresholds, timeouts, backoff multipliers | Exposes implementation details that users do not care about during interviews | Use sensible defaults (5 failures = open, 60s timeout, 2x backoff). No user-facing configuration |

### 6. Full Session History UI in v1.1

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Search, filter, browse, export UI for session history | Large UI effort that belongs in a feature milestone, not a security/reliability milestone | Build the IndexedDB storage layer only. UI for session browsing can be a separate milestone |

---

## Feature Dependencies

```
Independent (can be done in parallel):
  [1] API Keys from Messages  (no deps)
  [3] Store Race Condition    (no deps)
  [5] Privacy Policy          (no deps)
  [6] Recording Consent       (no deps)

Sequential:
  [1] API Keys from Messages
   |
   v
  [2] API Key Encryption at Rest
      (must remove from messages first, then encrypt storage)
      (also depends on understanding where keys are read from)

  [4] Transcript Persistence (chrome.storage interim)
   |
   v
  [7] Persistent Transcripts with IndexedDB
      (replaces #4's approach with proper storage)
      (OR implement #7 directly and skip #4)

  [8] Circuit Breaker
      (independent, but should be done after #1 and #3
       to ensure API calls work correctly first)
```

**Optimal implementation order:**
1. Fix [1] API keys from messages (fast, unblocks [2])
2. Fix [3] Store race condition (fast, independent)
3. Add [6] Recording consent (fast, independent, blocks first-use)
4. Add [5] Privacy policy (fast, can be done alongside code work)
5. Add [2] API key encryption (medium, depends on [1])
6. Add [7] IndexedDB persistence (medium, replaces need for [4])
7. Add [8] Circuit breaker (medium, independent)
8. Skip [4] -- subsumed by [7] if in same milestone

---

## Complexity Assessment Summary

| # | Feature | Complexity | Effort | Priority | Risk |
|---|---------|------------|--------|----------|------|
| 1 | API keys from messages | Low | 2-4 hours | P0 | Low |
| 2 | API key encryption | Medium | 1-1.5 days | P0 | Medium (migration edge cases) |
| 3 | Store race condition | Low | 2-4 hours | P0 | Low |
| 4 | Transcript persistence (interim) | Low-Med | 0.5-1 day | P0 | Low |
| 5 | Privacy policy + consent UI | Low | 0.5-1 day | P1 | Low |
| 6 | Recording consent warnings | Low | 0.5-1 day | P1 | Low |
| 7 | IndexedDB persistent transcripts | Medium | 2-3 days | P1 | Medium (schema design) |
| 8 | Circuit breaker | Medium | 1-1.5 days | P1 | Low |

**Total estimated effort for v1.1:** 7-10 days

**Risk assessment:**
- Feature #2 (encryption) has the highest risk due to migration from plaintext and key derivation strategy decisions
- Feature #7 (IndexedDB) has moderate risk around schema design decisions that affect future extensibility
- All other features are low risk with well-established patterns

---

## MVP Recommendation for v1.1

**Must ship (P0):**
1. [1] Remove API keys from runtime messages -- critical security fix, trivial to implement
2. [3] Fix store race condition -- reliability fix, trivial to implement
3. [4 or 7] Transcript persistence -- data loss prevention, moderate effort

**Should ship (P1):**
4. [2] API key encryption -- defense-in-depth security
5. [6] Recording consent -- legal protection
6. [8] Circuit breaker -- API reliability

**Can defer to v1.2 (P2):**
7. [5] Privacy policy + full consent UI -- not legally required for private use
8. [7] Full IndexedDB session system with schema -- if #4 ships as interim fix

**Reasoning:** The P0 items address active bugs and security vulnerabilities. P1 items provide defense-in-depth and reliability improvements. P2 items are "nice to have" that prepare for future distribution but are not blocking for private use.

---

## Sources

- [Chrome Extension Security Best Practices](https://developer.chrome.com/docs/extensions/mv3/security/) -- HIGH confidence
- [Chrome Extension Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) -- HIGH confidence (official docs)
- [Chrome Storage and Cookies](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies) -- HIGH confidence (official docs)
- [Web Crypto API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) -- HIGH confidence (official docs)
- [SubtleCrypto: encrypt() (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt) -- HIGH confidence (official docs)
- [idb - IndexedDB with Promises](https://github.com/jakearchibald/idb) -- HIGH confidence (widely used, active maintenance)
- [Circuit Breaker Pattern (Martin Fowler)](https://martinfowler.com/bliki/CircuitBreaker.html) -- HIGH confidence (canonical reference)
- [Chrome Web Store Privacy Requirements](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) -- HIGH confidence (official docs)
- [Circuit Breaker in TypeScript](https://dev.to/wallacefreitas/circuit-breaker-pattern-in-nodejs-and-typescript-enhancing-resilience-and-stability-bfi) -- MEDIUM confidence (community article)
- [API Key Security in Chrome Extensions](https://dev.to/notearthian/how-to-secure-api-keys-in-chrome-extension-3f19) -- MEDIUM confidence (community article)
- [DMLP Recording Laws Guide](https://www.dmlp.org/legal-guide/recording-phone-calls-and-conversations) -- HIGH confidence (legal reference)
