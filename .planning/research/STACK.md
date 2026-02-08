# Stack Research: v1.1 Security & Reliability Additions

**Domain:** Chrome MV3 Extension -- Security Hardening, Persistent Storage, Reliability
**Researched:** 2026-02-08
**Confidence:** HIGH

## Context

This research covers **only the new stack additions** needed for v1.1. The existing stack (WXT 0.19.x, React 18, Tailwind v4, Zustand 4, webext-zustand, Chrome MV3) is validated and unchanged.

v1.1 adds five capabilities:
1. WebCrypto API encryption for API keys at rest
2. IndexedDB for persistent transcript storage
3. Circuit breaker pattern for API reliability
4. Privacy/consent UI components
5. Service worker lifecycle management

---

## Recommended Stack Additions

### Core Technologies (All Built-In -- Zero New Dependencies)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| WebCrypto API (`crypto.subtle`) | Built-in (Chrome 37+) | AES-GCM encryption of API keys | Native browser API, available in service workers (without `window.` prefix), zero bundle cost, non-extractable keys for security |
| IndexedDB API | Built-in (Chrome 24+) | Persistent transcript/session storage | Available in service workers, ~100MB-1GB+ capacity vs chrome.storage.local's 10MB, indexed queries, survives SW termination |
| `chrome.storage.local` | MV3 built-in | Transcript buffer persistence, session state tracking | Already used; 10MB quota (Chrome 114+), expandable with `unlimitedStorage` permission, survives SW termination |
| `chrome.storage.session` | MV3 built-in (Chrome 102+) | In-memory ephemeral state (circuit breaker counters) | 10MB quota (Chrome 112+), in-memory only, cleared on browser restart, perfect for transient reliability state |
| `chrome.alarms` | MV3 built-in | Reliable timers that survive SW termination | Replaces `setTimeout`/`setInterval` which die with the service worker; official Chrome recommendation |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `idb` | ^8.0.3 | Promise-based IndexedDB wrapper | Use for all IndexedDB operations -- eliminates callback hell, adds TypeScript generics for type-safe DB schema, ~1.2KB brotli'd |

**Why `idb` is the only new dependency:** The raw IndexedDB API uses IDBRequest callbacks and is error-prone. `idb` wraps every IDBRequest in a Promise, enabling async/await. At 1.2KB brotli'd, the DX improvement far outweighs the bundle cost. Jake Archibald (Chrome team) maintains it; 12M+ weekly downloads; confirmed working in service workers.

### No Other New Dependencies Needed

Everything else uses native browser APIs or custom implementations:

| Capability | Approach | Why No Library |
|------------|----------|----------------|
| Circuit breaker | Custom ~100-line TypeScript class | Opossum (9.0.0) is 15KB+ and Node.js-focused; our needs are simple (3 states, counters, timer). Custom implementation is smaller, fully typed, and avoids Node.js compatibility concerns in service worker |
| Encryption | WebCrypto API directly | Zero-dependency, browser-native, available in SW context. No wrapper needed for our AES-GCM + PBKDF2 pattern |
| Retry with backoff | Custom ~50-line utility | Trivial to implement; no library justified for exponential backoff + jitter |
| Consent UI | React components with existing Tailwind | Standard form components; no UI library addition warranted for checkboxes and modals |
| Keep-alive | `chrome.alarms` + `chrome.runtime.getPlatformInfo` | Built-in APIs; existing pattern already in codebase |

---

## Detailed Technology Decisions

### 1. WebCrypto API for Encryption

**Pattern:** PBKDF2 key derivation + AES-GCM symmetric encryption

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Key derivation | PBKDF2 with SHA-256 | Standard for deriving keys from non-secret material; OWASP recommended |
| Symmetric cipher | AES-GCM 256-bit | Authenticated encryption (integrity + confidentiality); Chrome-optimized |
| IV generation | `crypto.getRandomValues(new Uint8Array(12))` | 96-bit IV per spec; unique per encryption operation |
| Salt storage | IndexedDB (separate from chrome.storage) | Isolates salt from encrypted data; defense in depth |
| Key material | `chrome.runtime.id` + browser entropy | Extension ID is stable per installation; combined with salt for uniqueness |
| Iterations | 100,000 | OWASP minimum; acceptable performance (~50ms init) |
| Key extractable | `false` | Prevents accidental key exposure via logs or XSS |

**Service Worker Availability:** `crypto.subtle` is available in service workers. Use `crypto.subtle` (NOT `window.crypto.subtle`). Confirmed available since Chrome 37; our minimum is Chrome 116.

**Security Boundaries (honest assessment):**
- MITIGATES: Plaintext storage exposure, malicious extension reads, debug dumps, backup exports
- DOES NOT MITIGATE: Memory dumps (keys decrypted in RAM), Chrome DevTools access, code injection by attacker with extension context access
- This is a significant improvement, not perfect security. Perfect security is impossible in browser extension context.

### 2. IndexedDB for Persistent Transcripts

**Two-tier storage strategy:**

| Tier | Storage | Purpose | Capacity |
|------|---------|---------|----------|
| Hot (active session) | `chrome.storage.local` | Debounced transcript buffer during recording | 10MB (plenty for single session) |
| Cold (history) | IndexedDB via `idb` | Persistent session archive, search, export | ~100MB-1GB+ |

**Why not IndexedDB for hot storage too?** During active recording, `chrome.storage.local` writes are simpler, reset the SW idle timer (keeping it alive), and are atomic. IndexedDB transactions in service workers can be interrupted by SW termination. After session ends, data migrates to IndexedDB for long-term storage.

**IndexedDB Schema Design:**

```typescript
// Typed with idb's DBSchema interface
interface InterviewDB extends DBSchema {
  sessions: {
    key: string;  // UUID
    value: {
      id: string;
      startTime: number;
      endTime?: number;
      title: string;
      platform: string;
      tags: string[];
    };
    indexes: {
      'by-start': number;
      'by-tags': string;
    };
  };
  transcripts: {
    key: string;  // UUID
    value: {
      id: string;
      sessionId: string;
      speaker: string;
      text: string;
      timestamp: number;
      isFinal: boolean;
    };
    indexes: {
      'by-session': string;
      'by-timestamp': number;
    };
  };
  responses: {
    key: string;
    value: {
      id: string;
      sessionId: string;
      type: 'fast' | 'full';
      prompt: string;
      response: string;
      model: string;
      timestamp: number;
    };
    indexes: {
      'by-session': string;
    };
  };
}
```

**`idb` provides full TypeScript inference** from this schema -- `db.get('sessions', id)` returns correctly typed `Session | undefined`.

### 3. Circuit Breaker (Custom Implementation)

**Why custom over Opossum:**

| Factor | Custom | Opossum 9.0.0 |
|--------|--------|----------------|
| Bundle size | ~1KB | ~15KB+ |
| Node.js dependencies | None | Has Node.js-specific code |
| Service Worker safety | Guaranteed | Uncertain (uses timers internally) |
| TypeScript | First-class | Decent but generic |
| Complexity needed | 3 states, basic counters | Full event emitter, metrics, fallbacks |
| Maintenance burden | Low (simple code) | External dependency risk |

**Implementation pattern:**

```typescript
// ~100 lines total
enum CircuitState { CLOSED, OPEN, HALF_OPEN }

class CircuitBreaker {
  // State persisted to chrome.storage.session (survives SW restart)
  // Uses chrome.alarms for OPEN->HALF_OPEN timeout (survives SW termination)
  // Integrates with existing retry in streamWithRetry()
}
```

**Key design decision:** Use `chrome.alarms` for the OPEN-to-HALF_OPEN timeout instead of `setTimeout`. Service workers can terminate, killing timers. Alarms survive termination and wake the worker.

**Per-service instances:**

| Service | Failure Threshold | Recovery Timeout | Rationale |
|---------|-------------------|------------------|-----------|
| OpenAI API | 5 failures | 60 seconds | Higher threshold -- transient errors common |
| OpenRouter API | 5 failures | 60 seconds | Same pattern as OpenAI |
| ElevenLabs STT | 3 failures | 30 seconds | Lower threshold -- WebSocket failures are more serious |

### 4. Service Worker Lifecycle Management

**Existing keep-alive (lines 38-52 of background.ts):** Uses `setInterval` + `chrome.runtime.getPlatformInfo()` every 20 seconds. This works but has a gap: if the SW terminates between intervals, the interval is lost.

**Improved pattern for v1.1:**

| Mechanism | Purpose | When Active |
|-----------|---------|-------------|
| `chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 })` | Persistent keep-alive that survives SW termination | During active recording/transcription |
| `chrome.storage.local` writes on each transcript segment | Resets 30-second idle timer + persists data | During active transcription |
| Active WebSocket connection (ElevenLabs) | Keeps SW alive automatically (Chrome 116+) | During active transcription |
| Session state in `chrome.storage.local` | Recovery flag for SW restart | Always when session active |

**Recovery flow after unexpected SW termination:**

```
SW restarts -> check chrome.storage.local for active_session_id
  -> if found: reload TranscriptBuffer from storage
  -> resume keep-alive alarm
  -> notify content script of recovery
  -> user sees "Session recovered" indicator
```

### 5. Privacy/Consent Components

**No new UI libraries.** Use existing React 18 + Tailwind v4:

| Component | Approach | Notes |
|-----------|----------|-------|
| RecordingWarning modal | React component + `chrome.storage.local` for acknowledgment tracking | Shows once on first use; cannot be bypassed |
| ConsentDialog | React component with checkbox state | Per-session consent with "don't show again" option |
| PrivacyNotice | React component + static HTML page | In-app notice + hosted privacy policy page |
| Data export/deletion | Direct IndexedDB + chrome.storage operations | Settings page with export JSON / delete all |

---

## Installation

```bash
# Single new dependency
npm install idb@^8.0.3
```

No dev dependency changes. No config changes needed.

### Manifest Permission Addition

```typescript
// wxt.config.ts - add 'alarms' permission
permissions: ['tabCapture', 'activeTab', 'offscreen', 'storage', 'scripting', 'alarms'],
```

The `alarms` permission is the only new manifest permission needed. No new `host_permissions` required.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `idb` (1.2KB) | Raw IndexedDB API | If you have zero tolerance for dependencies; expect 3-4x more code and callback complexity |
| `idb` (1.2KB) | Dexie.js (~20KB) | If you need reactive queries, live query subscriptions, or offline-first sync. Overkill for our append-and-query pattern |
| Custom circuit breaker | Opossum 9.0.0 | If you need event emission, Hystrix-compatible metrics, or fallback function orchestration. Our use case is too simple |
| PBKDF2 + browser fingerprint | User passphrase | If you want stronger key derivation (user knows a secret). Trade-off: user must enter passphrase on every browser launch -- bad UX for interview tool |
| `chrome.storage.local` buffer | IndexedDB-only | If you want to skip the two-tier approach. Risk: IndexedDB transactions in SW can be interrupted by termination |
| `chrome.alarms` | `setTimeout`/`setInterval` | Never in service workers for anything that must survive termination |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Dexie.js for IndexedDB | 20KB+ bundle for features we don't need (reactive queries, sync). Our pattern is simple writes during recording + reads for history | `idb` at 1.2KB -- thin Promise wrapper is sufficient |
| Opossum circuit breaker | Node.js-focused, 15KB+, uncertain SW compatibility, overkill features | Custom ~100-line TypeScript class |
| `window.crypto` in service worker | `window` is undefined in service workers; will throw ReferenceError | `crypto.subtle` (global scope) |
| `localStorage` / `sessionStorage` | Not available in service workers. Will throw errors | `chrome.storage.local`, `chrome.storage.session`, or IndexedDB |
| `setTimeout` for circuit breaker recovery | Timer dies when service worker terminates | `chrome.alarms` API |
| Third-party encryption libraries (CryptoJS, tweetnacl) | WebCrypto is built-in, faster (hardware-accelerated), and zero bundle cost | `crypto.subtle` directly |
| User passphrase for encryption | Bad UX -- users must re-enter every time browser opens. For an interview tool, this friction is unacceptable | Browser fingerprint (extension ID + entropy) with PBKDF2 |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `idb@^8.0.3` | Chrome 116+ | Uses modern JS features; our `minimum_chrome_version` is already 116 |
| `idb@^8.0.3` | TypeScript 5.4+ | Full generic type inference for DB schemas |
| `idb@^8.0.3` | WXT/Vite | ES module, tree-shakeable, no special config needed |
| WebCrypto AES-GCM | Chrome 37+ | Well within our Chrome 116 minimum |
| `chrome.storage.session` | Chrome 102+ | 10MB quota available from Chrome 112+ |
| `chrome.alarms` | Chrome MV3 | Standard MV3 API; no version concerns |

---

## Integration Points with Existing Codebase

### Files That Change

| Existing File | Change | Why |
|---------------|--------|-----|
| `entrypoints/background.ts` | Add encryption init, transcript buffer, circuit breaker integration, alarm-based keep-alive, session recovery | Central orchestration point |
| `src/store/chromeStorage.ts` | Encrypt/decrypt API key fields transparently | Storage adapter layer |
| `src/store/settingsSlice.ts` | Handle encrypted API key read/write | Settings actions |
| `src/store/types.ts` | Add consent state, session state types | Type definitions |
| `src/types/messages.ts` | Remove `apiKey` from `StartTranscriptionMessage` | Security: no keys in messages |
| `wxt.config.ts` | Add `alarms` permission | For reliable timers |

### New Files

| New File | Purpose |
|----------|---------|
| `src/services/crypto/encryption.ts` | EncryptionService class (WebCrypto wrapper) |
| `src/services/storage/transcriptDB.ts` | IndexedDB service using `idb` |
| `src/services/storage/transcriptBuffer.ts` | Debounced chrome.storage.local buffer |
| `src/services/api/circuitBreaker.ts` | CircuitBreaker class |
| `src/services/api/retry.ts` | Retry with exponential backoff utility |
| `entrypoints/popup/components/RecordingWarning.tsx` | First-time legal warning |
| `entrypoints/popup/components/ConsentDialog.tsx` | Per-session consent dialog |
| `entrypoints/popup/components/PrivacyNotice.tsx` | Privacy notice component |

---

## Bundle Impact Assessment

| Addition | Size (brotli) | Runtime Cost |
|----------|--------------|--------------|
| `idb` library | ~1.2KB | Negligible -- thin wrapper |
| Custom circuit breaker | ~0.5KB | Negligible -- simple state machine |
| Custom retry utility | ~0.3KB | Negligible |
| Encryption service | ~1KB | ~50ms init, ~5-10ms per encrypt/decrypt |
| Transcript buffer | ~0.5KB | ~1 chrome.storage write per second (debounced) |
| Privacy/consent components | ~2KB | One-time render |
| **Total new code** | **~5.5KB** | **Minimal runtime overhead** |

No existing dependencies removed. Net addition: 1 npm package (`idb`), ~5.5KB of custom code.

---

## Sources

- [Chrome MV3 Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) -- termination rules, keep-alive, state persistence (HIGH confidence)
- [Chrome Storage API Reference](https://developer.chrome.com/docs/extensions/reference/api/storage) -- quota limits 10MB local/session, unlimitedStorage (HIGH confidence)
- [Longer Extension SW Lifetimes](https://developer.chrome.com/blog/longer-esw-lifetimes) -- Chrome 110+ improvements, idle timer resets (HIGH confidence)
- [Chrome Storage and Cookies Guide](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies) -- IndexedDB available in SW, shared across contexts (HIGH confidence)
- [WebCrypto API MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) -- availability in workers, AES-GCM, PBKDF2 specs (HIGH confidence)
- [idb GitHub](https://github.com/jakearchibald/idb) -- v8.0.3, 1.2KB brotli'd, 12M+ weekly downloads (HIGH confidence)
- [Chromium Extensions Group: WebCrypto in MV3 SW](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/VCXF9rZXr5Y) -- confirmed available, use without `window.` prefix (HIGH confidence)
- [Microsoft Accessibility Insights MV3 Migration](https://devblogs.microsoft.com/engineering-at-microsoft/learnings-from-migrating-accessibility-insights-for-web-to-chromes-manifest-v3/) -- IndexedDB persistence patterns in MV3 (MEDIUM confidence)
- [Circuit Breaker Pattern (Martin Fowler)](https://martinfowler.com/bliki/CircuitBreaker.html) -- canonical pattern description (HIGH confidence)

---
*Stack research for: AI Interview Assistant v1.1 Security & Reliability*
*Researched: 2026-02-08*
