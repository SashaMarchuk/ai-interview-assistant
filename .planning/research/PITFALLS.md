# Domain Pitfalls: v1.1 Security, Reliability & Compliance

**Domain:** Adding encryption, IndexedDB storage, circuit breaker, compliance features to existing Chrome MV3 extension
**Researched:** 2026-02-08
**Confidence:** HIGH (verified against codebase + official documentation + community reports)

---

## Critical Pitfalls

Mistakes that cause data loss, broken encryption, or security regressions.

---

### Pitfall 1: Browser Fingerprint Key Derivation Breaks in Service Worker

**What goes wrong:** The proposed encryption todo (`20260208-security-encrypt-api-keys.md`) derives the encryption key from a "browser fingerprint" that includes `screen.width`, `screen.height`, and `navigator.userAgent`. The `screen` object does **not exist in service workers** -- service workers have no access to `window` or DOM-related APIs. This means the encryption service will throw a `ReferenceError` when initialized in the background service worker.

**Why it happens:** The todo was written assuming all encryption code runs in a context with full browser APIs. But in Chrome MV3, the background script IS a service worker. `navigator.userAgent` is available via `WorkerNavigator`, but `screen.width`, `screen.height`, `new Date().getTimezoneOffset()` work, while `screen` does not.

**Consequences:**
- Encryption service fails to initialize in the service worker
- API keys cannot be encrypted or decrypted
- Extension becomes non-functional if encryption is required before key access
- If the fingerprint approach works in popup (where `screen` exists) but not in the service worker, you get mismatched keys -- data encrypted in one context cannot be decrypted in another

**Prevention:**
- Use ONLY APIs available in `ServiceWorkerGlobalScope` for key derivation: `chrome.runtime.id` (stable per installation), `self.navigator.userAgent`, and `Date().getTimezoneOffset()`
- Better approach: generate a random key on first install, store the CryptoKey object directly in IndexedDB (IndexedDB can store structured-cloneable CryptoKey objects natively)
- If deriving from a passphrase/entropy, derive in one canonical context and cache the CryptoKey in IndexedDB
- Test encryption init in the actual service worker, not in a page context

**Detection:** Error in service worker console: `ReferenceError: screen is not defined` on first key derivation attempt

**Codebase reference:** The current background.ts (`entrypoints/background.ts`) runs as a service worker. Line 228 calls `useStore.getState()` to read API keys -- after encryption, this will need the encryption service initialized first.

**Sources:**
- [WorkerGlobalScope: navigator property (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/navigator)
- [Window is not defined in service workers (Workbox #1482)](https://github.com/GoogleChrome/workbox/issues/1482)

---

### Pitfall 2: Plaintext-to-Encrypted Migration Causes Permanent Key Loss

**What goes wrong:** During migration from plaintext to encrypted storage, if the encryption service fails to initialize (see Pitfall 1), or if the migration runs partially (encrypts some keys, removes plaintext, crashes before completing), users permanently lose their API keys.

**Why it happens:** The proposed migration in the todo does: (1) read plaintext, (2) encrypt each key, (3) remove plaintext. If step 2 fails for any key, step 3 has already removed the plaintext for previously-processed keys. Also, `chrome.runtime.onInstalled` only fires once per install/update -- if migration fails silently, there is no retry mechanism.

**Consequences:**
- Users must re-enter all API keys after extension update
- If they don't notice, transcription and LLM features silently fail
- Support tickets spike after v1.1 release
- Worst case: users blame the extension and uninstall

**Prevention:**
- Implement atomic migration: read ALL plaintext keys, encrypt ALL keys, verify ALL decryption works, THEN remove plaintext
- Keep a migration version flag in storage: `{ migration_v: 2, completed: true }`
- If migration fails, leave plaintext in place and retry on next service worker restart (not just onInstalled)
- Add a migration health check: on every service worker startup, verify that stored encrypted keys can be decrypted successfully
- Never remove plaintext until encrypted versions are verified working
- Log migration results for debugging

**Detection:** Users report "API keys disappeared" or "Please reconfigure your settings" after updating to v1.1

**Codebase reference:** Current store persists API keys via Zustand persist middleware to `chrome.storage.local` under key `ai-interview-settings` (see `src/store/index.ts:33`). Migration must account for this specific storage structure, not raw key-value pairs.

---

### Pitfall 3: WebCrypto Key Regenerated on Browser Update Changes User Agent

**What goes wrong:** If the encryption key is derived from `navigator.userAgent` and the browser auto-updates (e.g., Chrome 130 to Chrome 131), the user agent string changes. PBKDF2 derives a different key. All previously encrypted data becomes undecryptable.

**Why it happens:** The user agent string includes the Chrome version number (e.g., `Chrome/130.0.6723.69`). Chrome auto-updates frequently. Any fingerprint-based key derivation that includes version-specific strings is inherently fragile.

**Consequences:**
- After every Chrome update, all encrypted API keys become garbage
- Users must re-enter API keys every 2-4 weeks (Chrome's update cycle)
- Extension appears broken with no clear error message

**Prevention:**
- Do NOT derive encryption keys from browser fingerprints. This is a fundamentally flawed approach for data that must persist across browser updates
- Instead, generate a random 256-bit AES-GCM key using `crypto.getRandomValues()` on first install
- Store the CryptoKey in IndexedDB (CryptoKey is structured-cloneable and can be stored with `extractable: false` for security)
- Alternatively, use a random salt stored in IndexedDB + a static extension-specific passphrase (like `chrome.runtime.id`) for PBKDF2 derivation -- `chrome.runtime.id` is stable across updates
- If you must use PBKDF2, use ONLY stable inputs: `chrome.runtime.id` + stored salt

**Detection:** After Chrome auto-update, encrypted API keys fail to decrypt. Console shows `DOMException: OperationError` from `crypto.subtle.decrypt`

**Sources:**
- [Web Crypto API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Saving Web Crypto Keys using IndexedDB (GitHub Gist)](https://gist.github.com/saulshanabrook/b74984677bccd08b028b30d9968623f5)

---

### Pitfall 4: Store Race Condition Fix Breaks Message Handling on Service Worker Restart

**What goes wrong:** The todo (`20260208-fix-store-race-condition.md`) proposes awaiting `storeReadyPromise` before registering message listeners. But Chrome MV3 requires ALL event listeners to be registered synchronously at the top level of the service worker script. If you register `chrome.runtime.onMessage.addListener` inside an async function after an await, Chrome may miss events that arrive during the async gap.

**Why it happens:** When a service worker is terminated and re-awakened by an incoming message, Chrome replays the event to registered listeners. If the listener is not yet registered (because it's inside an async init that hasn't completed), the message is dropped silently. The current codebase CORRECTLY registers the listener synchronously at line 436 of `background.ts`.

**Consequences:**
- Messages sent during store initialization are silently dropped
- Popup sends START_CAPTURE but background never receives it
- Users click buttons that appear to do nothing
- Problem is intermittent and hard to reproduce (depends on service worker wake-up timing)

**Prevention:**
- Keep the current pattern: register `chrome.runtime.onMessage.addListener` synchronously at the top level
- Inside the handler, await `storeReadyPromise` before accessing store state (lazy store access pattern)
- Alternatively, use the message queuing pattern: register handler immediately, queue messages if store not ready, process queue after store initializes
- The correct fix is NOT to delay listener registration but to delay store-dependent logic inside the handler

```typescript
// CORRECT: Register synchronously, await store inside handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true;
});

async function handleMessage(message, sender) {
  // Wait for store only when we need it
  if (needsStore(message.type)) {
    await storeReadyPromise;
  }
  // Now safe to access store
  const state = useStore.getState();
}
```

**Detection:** Intermittent failures where popup actions do nothing. Console may show no errors at all (message simply never arrives).

**Codebase reference:** Current `entrypoints/background.ts:436` correctly registers the listener synchronously. The proposed fix in the todo would break this.

**Sources:**
- [Handle events with service workers (Chrome)](https://developer.chrome.com/docs/extensions/get-started/tutorial/service-worker-events)
- [MV3 Extension Service Worker Async Init Discussion](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/bnH_zx2LjQY)

---

### Pitfall 5: IndexedDB Salt Storage Fails Silently on Version Mismatch

**What goes wrong:** The encryption todo opens IndexedDB with version 1 and creates a `salt` object store in `onupgradeneeded`. But if a future feature (like persistent transcripts) also opens an IndexedDB database -- possibly the same one with a different version -- the version mismatch triggers `onupgradeneeded` again, potentially with code that doesn't know about the `salt` store, leading to data loss.

**Why it happens:** IndexedDB's `onupgradeneeded` fires when opening a database with a higher version number. If two separate features independently manage database versions, one can overwrite or fail to preserve the other's stores. Additionally, if the encryption service opens the DB with version 1, but the persistent transcripts feature later opens the same DB with version 2, the `onupgradeneeded` handler for version 2 may not include code to preserve the `salt` store.

**Consequences:**
- Encryption salt is lost during a database upgrade triggered by another feature
- All encrypted data becomes permanently undecryptable (same effect as Pitfall 3)
- Data corruption happens silently -- no error is thrown

**Prevention:**
- Use SEPARATE IndexedDB databases for separate concerns: `encryption-db` for encryption salt/keys, `transcripts-db` for persistent transcripts
- Never share a database between features that have independent version lifecycles
- In `onupgradeneeded`, always use `event.oldVersion` to incrementally apply migrations rather than unconditionally creating stores
- Add a check: if the `salt` store already exists, do not recreate it
- Consider storing the encryption salt in `chrome.storage.local` instead of IndexedDB (simpler, fewer moving parts, and the salt is not secret -- it just needs to be stable)

**Detection:** After updating the extension with new IndexedDB schema, encrypted keys silently fail to decrypt. Console shows `NotFoundError: Failed to execute 'transaction' on 'IDBDatabase': One of the specified object stores was not found.`

**Sources:**
- [Using IndexedDB (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB)
- [Handling IndexedDB Upgrade Version Conflict](https://dev.to/ivandotv/handling-indexeddb-upgrade-version-conflict-368a)

---

### Pitfall 6: Circuit Breaker State Lost on Service Worker Termination

**What goes wrong:** The circuit breaker todo implements the circuit breaker as an in-memory JavaScript object with `failureCount`, `successCount`, `state`, and `nextAttempt` fields. When Chrome terminates the service worker (after 30 seconds of inactivity), ALL this state is wiped. The circuit breaker effectively resets to CLOSED after every idle period, defeating its purpose.

**Why it happens:** Chrome MV3 service workers are ephemeral. Any `let`, `const`, `class` instance, or `Map` stored in module scope is destroyed when the worker terminates. The circuit breaker pattern assumes a long-running process, which is the opposite of how MV3 service workers work.

**Consequences:**
- Circuit breaker never actually opens: after 5 failures the worker goes idle, restarts, and the failure count is zero
- The extension keeps hammering a failing API endpoint instead of backing off
- Wasted API credits and poor user experience
- During rate limiting, the extension makes things worse by continuing to send requests

**Prevention:**
- Persist circuit breaker state to `chrome.storage.session` (cleared on browser close, which is appropriate for circuit breaker state)
- On service worker startup, rehydrate circuit breaker state from storage
- Debounce state persistence (write at most once per second, not on every failure/success)
- Use `chrome.alarms` API instead of `setTimeout` for the OPEN-to-HALF_OPEN transition timer -- `setTimeout` is cleared when the worker terminates, but alarms survive
- Alternative: keep the circuit breaker stateless and use exponential backoff only (simpler, fewer persistence concerns)

**Detection:** API calls continue to fail repeatedly even though the circuit should be open. No "Service temporarily unavailable" message ever appears to the user.

**Sources:**
- [Extension Service Worker Lifecycle (Chrome)](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Circuit Breaker Pattern (Microsoft)](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker)

---

### Pitfall 7: Transcript Debounce Timer Lost on Service Worker Termination

**What goes wrong:** The transcript persistence todo uses `setTimeout` for debouncing writes to `chrome.storage.local`. When Chrome terminates the service worker between the last segment arrival and the debounce timer firing, the unsaved segments are lost forever.

**Why it happens:** The existing code already stores transcript data in memory (`let mergedTranscript: TranscriptEntry[] = []` at `background.ts:21`). The proposed debounced persistence adds a `setTimeout` delay before writing to storage. If the service worker terminates during that delay window (1000ms), the pending write never executes.

**Consequences:**
- Last 1 second of transcript is lost on every service worker termination
- During active transcription, the keep-alive interval prevents this
- But if transcription stops and the user doesn't interact for 30 seconds, any pending debounced write is lost
- Edge case: user stops transcription, final debounced write is pending, service worker terminates before it fires

**Prevention:**
- Write immediately on STOP_TRANSCRIPTION (flush the debounce)
- Write immediately on `chrome.runtime.onSuspend` (fires before Chrome terminates the service worker -- but not reliably for all termination causes)
- Use a write-through cache: write every segment immediately to storage, use debouncing only for broadcast/UI updates (not for persistence)
- For the offscreen document (where transcription actually runs), this is less of an issue since offscreen documents persist longer, but the merged transcript is assembled in the background service worker
- Consider: `beforeunload` in the offscreen document as a last-chance save

**Detection:** Users notice the last few words of a transcription session are missing when they review the saved transcript.

**Codebase reference:** The keep-alive interval at `background.ts:40-46` prevents SW termination during active LLM streaming, and should similarly cover active transcription. But the gap is after transcription stops and before the debounced save completes.

---

## Moderate Pitfalls

---

### Pitfall 8: Encryption Adds Async Overhead to Every Store Read

**What goes wrong:** Currently, `useStore.getState()` returns the store state synchronously. After adding encryption, every API key read requires async decryption (`crypto.subtle.decrypt` returns a Promise). This breaks the synchronous access pattern used throughout the codebase.

**Why it happens:** WebCrypto API is entirely Promise-based. There is no synchronous decryption API. The current code reads API keys synchronously in message handlers (e.g., `background.ts:229`: `const { apiKeys, models } = state`).

**Prevention:**
- Decrypt API keys on store rehydration (once, at startup) and keep decrypted values in the in-memory Zustand store
- Only encrypt when writing to `chrome.storage.local` (the persist middleware's `setItem`)
- Only decrypt when reading from `chrome.storage.local` (the persist middleware's `getItem`)
- The Zustand persist middleware already uses async storage -- the `chromeStorage` adapter in `src/store/chromeStorage.ts` is already async. Add encrypt/decrypt there, transparently
- Never expose encrypted values through the Zustand store's `getState()` -- always store decrypted in memory

**Detection:** TypeScript errors across the codebase where `state.apiKeys.openAI` was accessed synchronously but now requires `await`. If not caught by types, runtime `[object Promise]` appears as API key values.

---

### Pitfall 9: Consent Modal Blocks Extension Functionality as Dark Pattern

**What goes wrong:** The proposed consent system requires users to check three separate checkboxes every time they start recording. If the per-session dialog cannot be dismissed, users who have already consented are forced through friction on every use. This creates hostility toward the extension and may itself constitute a dark pattern (unnecessary repeated consent).

**Why it happens:** Overzealous compliance implementation. The todo proposes a "Don't show again" checkbox, but requiring three separate checkboxes for something the user already acknowledged is excessive friction for an interview assistant that needs to start quickly.

**Prevention:**
- First-time consent: YES, mandatory, blocking, comprehensive
- Per-session reminder: small, non-blocking banner (not a modal) saying "Recording active -- ensure all parties have consented"
- "Don't show again" should be prominent and respected permanently (not reset on updates)
- Never require re-consent unless the privacy policy materially changes
- Avoid requiring multiple checkboxes -- one clear acknowledgment is sufficient for repeat use
- The "Start Recording" button label itself can serve as ongoing consent: rename to "Start Recording (consented)" or show a small indicator

**Detection:** User complaints about "too many popups" or uninstalls correlated with the consent dialog flow

**Sources:**
- [GDPR Dark Patterns (FairPatterns)](https://www.fairpatterns.com/post/gdpr-dark-patterns-how-they-undermine-compliance-risk-legal-penalties)
- [UX Patterns for High Consent Rates](https://cookie-script.com/guides/ux-patterns-for-high-consent-rates)

---

### Pitfall 10: chrome.storage.local Quota Exhaustion During Long Interviews

**What goes wrong:** The transcript persistence todo writes transcript segments to `chrome.storage.local`, which has a 10MB limit (5MB in Chrome 113 and earlier). A 60-minute interview can generate 2000+ segments at ~500 bytes each = ~1MB per session. After 10 sessions without cleanup, storage is full. New writes throw `QUOTA_BYTES_PER_ITEM` or quota exceeded errors.

**Why it happens:** `chrome.storage.local` is shared between ALL extension data: settings, templates, transcript buffers, consent flags, migration flags, and now encrypted keys. The 10MB limit fills faster than expected.

**Prevention:**
- Request `"unlimitedStorage"` permission in manifest.json (removes the 10MB cap, limited only by disk space)
- Even with unlimited storage, implement a storage budget: warn at 50MB, auto-cleanup old sessions at 100MB
- Implement transcript compression: store only final segments, drop partial/interim data from persistence
- Move transcript storage to IndexedDB early (not as a "future" feature) -- IndexedDB has much larger quotas
- Always handle quota errors gracefully: if write fails, log the error but do not crash the extension
- Never store `ArrayBuffer` audio data in `chrome.storage.local` -- only text transcripts

**Detection:** `chrome.storage.local.set` calls start throwing errors. Settings changes stop persisting. Extension appears to forget configuration.

**Sources:**
- [chrome.storage API (Chrome)](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Storage and Cookies (Chrome)](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies)

---

### Pitfall 11: webext-zustand Initialization Race After Encryption Layer Added

**What goes wrong:** Adding encryption to the `chromeStorage` adapter makes `getItem` and `setItem` async (they already are, but now they're slower due to crypto operations). During service worker restart, `webext-zustand`'s `wrapStore` call races with the Zustand persist middleware's `rehydrate`. If the encryption service hasn't initialized yet (no CryptoKey available), the rehydrate reads encrypted data and cannot decrypt it, resulting in the store being populated with encrypted gibberish or empty defaults.

**Why it happens:** The initialization order becomes: (1) service worker starts, (2) `wrapStore` runs, (3) Zustand persist middleware calls `chromeStorage.getItem`, (4) `getItem` needs to decrypt, (5) but encryption service hasn't initialized its CryptoKey yet from IndexedDB.

**Prevention:**
- Initialize the encryption service BEFORE creating the Zustand store
- Make the `chromeStorage` adapter aware of the encryption service lifecycle: if crypto not ready, queue the read and resolve once ready
- Alternatively, initialize crypto inside `chromeStorage.getItem` lazily (with a cached promise to prevent multiple initializations)
- Add a timeout: if crypto init takes more than 5 seconds, fall back to reading plaintext (handles migration period gracefully)
- Test the initialization sequence by logging timestamps: crypto init -> store rehydrate -> wrapStore -> handler registration

**Detection:** Store state contains encrypted strings where objects are expected. Settings page shows garbled text or empty fields after service worker restart.

---

### Pitfall 12: Offscreen Document Cannot Access IndexedDB Created by Service Worker

**What goes wrong:** IndexedDB databases are scoped to the origin, and Chrome extension service workers and offscreen documents share the same origin (`chrome-extension://EXTENSION_ID`). However, there can be timing issues: if the service worker creates an IndexedDB database and the offscreen document tries to open it simultaneously, or if version numbers conflict, one context blocks the other.

**Why it happens:** IndexedDB's `onupgradeneeded` blocks all other connections to the same database until the upgrade transaction completes. If the service worker is in the middle of a database upgrade when the offscreen document tries to open the same database, the offscreen document's open request is blocked until the upgrade finishes or times out.

**Prevention:**
- Coordinate IndexedDB access: only one context should own database creation and migration
- The service worker should be the sole owner of database schema management
- The offscreen document should only read/write data, never trigger version upgrades
- Use the `onblocked` event to handle database locking gracefully
- Consider: the offscreen document doesn't need direct IndexedDB access -- it can send data to the service worker via messages, and the service worker persists to IndexedDB

**Detection:** `IDBOpenDBRequest` hangs in the offscreen document. The `onblocked` event fires but is not handled, causing the operation to stall silently.

---

## Minor Pitfalls

---

### Pitfall 13: AES-GCM IV Reuse Catastrophe

**What goes wrong:** AES-GCM requires a unique initialization vector (IV) for every encryption operation with the same key. If the IV is reused (e.g., using a deterministic IV derived from the key name), an attacker can XOR two ciphertexts to recover plaintext.

**Prevention:**
- Always generate a fresh random IV with `crypto.getRandomValues(new Uint8Array(12))` for each encryption call
- Store the IV alongside the ciphertext (prepend it, as the todo proposes)
- Never derive the IV from the data being encrypted or from a counter that might reset
- The proposed code in the todo handles this correctly -- ensure it is not "simplified" during implementation

---

### Pitfall 14: Base64 Encoding Performance for Large Encrypted Payloads

**What goes wrong:** The proposed encryption uses `btoa(String.fromCharCode(...combined))` to convert encrypted ArrayBuffer to base64 for storage. For large payloads (full transcript encryption), the spread operator `...` on a large Uint8Array can cause stack overflow.

**Prevention:**
- Use chunked base64 encoding (same pattern already used in `ElevenLabsConnection.ts:225-230`)
- For API keys (small strings), this is not an issue
- If encrypting transcripts in the future, use a streaming base64 encoder or store ArrayBuffer directly in IndexedDB (which supports it natively)

---

### Pitfall 15: Privacy Policy URL Becomes Invalid

**What goes wrong:** Chrome Web Store requires a Privacy Policy URL. If the URL breaks (GitHub repo goes private, domain expires, hosting changes), the extension can be removed from the Chrome Web Store.

**Prevention:**
- Host the privacy policy on a stable, controlled URL (GitHub Pages is fine)
- Bundle a copy of the privacy policy inside the extension as an HTML page
- Add the privacy policy URL to the manifest.json
- Set up monitoring for the URL

---

### Pitfall 16: Consent Timestamp Not Persisted Across Contexts

**What goes wrong:** The recording consent flag is stored in `chrome.storage.local`, but the popup reads it asynchronously. If the popup opens and the storage read hasn't completed, the consent dialog flashes briefly even for users who already consented.

**Prevention:**
- Cache the consent state in the Zustand store (already synced across contexts via `webext-zustand`)
- Use `chrome.storage.local.get` with a callback in the popup's init, showing a loading state until the check completes
- Never show the consent dialog and then hide it -- only render it after confirming the user hasn't consented

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Severity | Mitigation |
|---|---|---|---|
| API Key Encryption | Fingerprint-based key derivation breaks in SW | CRITICAL | Use `chrome.runtime.id` + stored salt only, or store CryptoKey in IDB |
| API Key Encryption | Browser update changes user agent, keys lost | CRITICAL | Do not use UA in key derivation |
| Plaintext Migration | Partial migration causes key loss | CRITICAL | Atomic migration with verification before plaintext removal |
| Store Race Condition | Moving listener registration behind await | CRITICAL | Keep synchronous registration, await store inside handler |
| IndexedDB Salt | Version conflict with other IDB features | HIGH | Separate databases per feature |
| Circuit Breaker | In-memory state lost on SW termination | HIGH | Persist to chrome.storage.session, use chrome.alarms |
| Transcript Persistence | Debounce timer lost on SW termination | HIGH | Write-through for persistence, debounce only for UI |
| Transcript Persistence | Storage quota exhaustion | MODERATE | Request unlimitedStorage, implement cleanup |
| Encryption + Store | Async decryption breaks sync store access | MODERATE | Decrypt on rehydration, store decrypted in memory |
| Consent UX | Over-aggressive consent blocks UX | MODERATE | First-time modal only, non-blocking reminder after |
| Encryption Init | Crypto not ready when store rehydrates | MODERATE | Initialize crypto before store creation |
| IDB Access | Cross-context database locking | LOW | Single owner for schema, message-based access from offscreen |

---

## Integration Pitfalls (Features Interacting With Each Other)

### Encryption + Store Sync
The encryption service, Zustand store, `webext-zustand` sync, and `chrome.storage.local` persistence form a dependency chain. The initialization order MUST be:
1. Encryption service initializes (loads CryptoKey from IndexedDB)
2. Zustand store creates with encrypted `chromeStorage` adapter
3. `wrapStore` called for `webext-zustand` sync
4. Message handlers can now access decrypted state

If any step fails or is reordered, the store contains either encrypted gibberish or stale defaults.

### Circuit Breaker + Keep-Alive
The existing keep-alive interval (`background.ts:38-52`) runs during active LLM streaming. If the circuit breaker opens (API unavailable), the LLM request fails immediately and keep-alive stops. But the circuit breaker's OPEN-to-HALF_OPEN timer needs to survive the subsequent service worker termination. This requires `chrome.alarms`, not `setTimeout`.

### Transcript Persistence + Encryption (Future)
If transcripts are later encrypted before storage, the async encryption adds latency to every segment save. With debouncing at 1 second and encryption taking 5-10ms per segment, this is fine. But if encrypting the entire transcript array on each save (not individual segments), a 1000-segment transcript could take 1-5 seconds to encrypt, blocking the service worker.

### Consent + First-Use Flow
The consent dialog, privacy notice, recording warning, and store initialization all compete for the user's attention on first launch. Order them carefully:
1. Privacy policy acceptance (one-time, brief)
2. Recording consent warning (one-time, comprehensive)
3. API key setup (functional requirement)
4. Never show consent AND privacy AND settings all at once

---

## Sources

**Official Documentation:**
- [Extension Service Worker Lifecycle (Chrome)](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Longer Extension Service Worker Lifetimes (Chrome Blog)](https://developer.chrome.com/blog/longer-esw-lifetimes)
- [chrome.storage API (Chrome)](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Storage and Cookies (Chrome)](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies)
- [Web Crypto API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Using IndexedDB (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB)
- [WorkerGlobalScope: navigator property (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/navigator)

**Community / Technical Reports:**
- [MV3 Extension Service Worker Async Init (Chromium Groups)](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/bnH_zx2LjQY)
- [webext-redux Race Condition Fix (GitHub PR #111)](https://github.com/tshaddix/webext-redux/pull/111/files)
- [Zustand Chrome Extension Discussion (#2020)](https://github.com/pmndrs/zustand/discussions/2020)
- [Window is not defined in service workers (Workbox #1482)](https://github.com/GoogleChrome/workbox/issues/1482)
- [Saving Web Crypto Keys using IndexedDB (GitHub Gist)](https://gist.github.com/saulshanabrook/b74984677bccd08b028b30d9968623f5)
- [Chrome Extension Encryption (codestudy.net)](https://www.codestudy.net/blog/chrome-extension-encrypting-data-to-be-stored-in-chrome-storage/)
- [Handling IndexedDB Upgrade Version Conflict (DEV)](https://dev.to/ivandotv/handling-indexeddb-upgrade-version-conflict-368a)
- [GDPR Dark Patterns (FairPatterns)](https://www.fairpatterns.com/post/gdpr-dark-patterns-how-they-undermine-compliance-risk-legal-penalties)
- [UX Patterns for High Consent Rates (CookieScript)](https://cookie-script.com/guides/ux-patterns-for-high-consent-rates)
- [Vibe Engineering: MV3 Service Worker Keepalive (Medium)](https://medium.com/@dzianisv/vibe-engineering-mv3-service-worker-keepalive-how-chrome-keeps-killing-our-ai-agent-9fba3bebdc5b)
- [Microsoft: Learnings from Migrating to MV3](https://devblogs.microsoft.com/engineering-at-microsoft/learnings-from-migrating-accessibility-insights-for-web-to-chromes-manifest-v3/)
- [Circuit Breaker Pattern (Microsoft Azure)](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker)
- [Secure Storage Proposal (W3C WebExtensions)](https://github.com/w3c/webextensions/blob/main/proposals/secure-storage.md)
