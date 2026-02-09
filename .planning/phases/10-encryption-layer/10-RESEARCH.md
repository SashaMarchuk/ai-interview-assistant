# Phase 10: Encryption Layer - Research

**Researched:** 2026-02-08
**Domain:** WebCrypto AES-GCM encryption of API keys at rest in Chrome MV3 extension storage
**Confidence:** HIGH

## Summary

Phase 10 encrypts the three API keys (ElevenLabs, OpenRouter, OpenAI) stored in `chrome.storage.local` so they are not human-readable when inspected via DevTools. The encryption uses the WebCrypto API (native, zero-dependency, available in service workers) with AES-GCM for authenticated encryption and PBKDF2 for key derivation from `chrome.runtime.id` + a random salt stored in `chrome.storage.local`.

The key architectural insight is that encryption/decryption happens transparently inside the Zustand persist storage adapter (`chromeStorage.ts`). The in-memory Zustand store always holds plaintext API keys -- encryption only applies at the storage boundary (write = encrypt, read = decrypt). This preserves the existing synchronous `useStore.getState().apiKeys` access pattern used throughout `background.ts` and avoids async refactoring of every consumer.

Migration from plaintext to encrypted storage must be atomic: read all plaintext keys, encrypt all, verify all decrypt correctly, only then remove plaintext. The encryption service must initialize BEFORE the Zustand store rehydrates, because `chromeStorage.getItem` needs a valid CryptoKey to decrypt the persisted state.

**Primary recommendation:** Create an `EncryptionService` singleton in `src/services/crypto/encryption.ts`, wrap `chromeStorage` with an `encryptedChromeStorage` adapter in `src/services/crypto/encryptedStorage.ts`, and initialize encryption in `background.ts` BEFORE `storeReadyPromise` resolves.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WebCrypto API (`crypto.subtle`) | Built-in (Chrome 37+) | AES-GCM encryption + PBKDF2 key derivation | Native browser API, zero bundle cost, available in service workers, hardware-accelerated, non-extractable keys |
| `chrome.storage.local` | MV3 built-in | Salt storage + encrypted state persistence | Already in use; prior decision locks salt to chrome.storage.local |
| Zustand persist middleware | ^4.5.7 (existing) | Transparent encrypt/decrypt at storage boundary | Already in use; `createJSONStorage` wraps the adapter cleanly |

### Supporting

No new libraries needed for Phase 10. The `idb` library (mentioned in prior v1.1 planning) is NOT needed here -- salt is stored in `chrome.storage.local` per prior decision, not IndexedDB.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PBKDF2 from `chrome.runtime.id` | Random CryptoKey stored in IndexedDB | IndexedDB stores structured-cloneable CryptoKey objects with `extractable: false`, eliminating key derivation entirely. Simpler, but adds IndexedDB dependency for a single value. Prior decision locks to `chrome.runtime.id` + salt |
| Salt in `chrome.storage.local` | Salt in IndexedDB | Defense-in-depth (attacker must access both storage backends). Prior decision chose `chrome.storage.local` for simplicity |
| Custom encrypt/decrypt in adapter | Third-party library (CryptoJS, tweetnacl) | WebCrypto is zero-cost, hardware-accelerated, and built-in. External libraries add bundle size for no benefit |
| Encrypt only `apiKeys` fields | Encrypt entire persisted state | Encrypting everything adds latency for non-sensitive data (templates, blur level). Only API keys are sensitive. Selective encryption is more performant |

**Installation:**
```bash
# No new packages needed for Phase 10
```

## Architecture Patterns

### Recommended Project Structure

```
src/services/crypto/
  encryption.ts          # EncryptionService singleton (WebCrypto wrapper)
  encryptedStorage.ts    # StateStorage adapter wrapping chromeStorage
src/store/
  chromeStorage.ts       # UNCHANGED -- base adapter
  index.ts               # MODIFIED -- use encryptedChromeStorage instead of chromeStorage
entrypoints/
  background.ts          # MODIFIED -- initialize encryption before store
```

### Pattern 1: Transparent Encryption at Storage Adapter Boundary

**What:** The `encryptedChromeStorage` adapter wraps the existing `chromeStorage` adapter. On `setItem`, it parses the Zustand JSON, encrypts only the `apiKeys` fields, and writes the modified JSON. On `getItem`, it reads, decrypts `apiKeys`, and returns the reconstituted JSON. The rest of the Zustand store (templates, models, blur level, hotkeys) passes through unencrypted.

**When to use:** Always for the AI Interview Assistant store. This is the only storage pattern.

**Why this approach:** Zustand persist middleware calls `storage.getItem(name)` and `storage.setItem(name, value)` where `value` is a JSON string with structure `{"state":{...},"version":0}`. The `state` object contains the partialized fields including `apiKeys`. By intercepting at this layer, all consumers (popup, content script, background) continue using `useStore.getState().apiKeys.openAI` synchronously. No consumer code changes needed.

**Persisted JSON structure (current, unencrypted):**
```json
{
  "state": {
    "apiKeys": {
      "elevenLabs": "sk-...",
      "openRouter": "or-...",
      "openAI": "sk-proj-..."
    },
    "models": { "fastModel": "gpt-4o-mini", "fullModel": "gpt-4o" },
    "blurLevel": 8,
    "hotkeys": { "capture": "Ctrl+Shift+Space" },
    "captureMode": "hold",
    "templates": [...],
    "activeTemplateId": "..."
  },
  "version": 0
}
```

**Persisted JSON structure (after encryption):**
```json
{
  "state": {
    "apiKeys": {
      "elevenLabs": "base64(iv+ciphertext)",
      "openRouter": "base64(iv+ciphertext)",
      "openAI": "base64(iv+ciphertext)"
    },
    "models": { "fastModel": "gpt-4o-mini", "fullModel": "gpt-4o" },
    "blurLevel": 8,
    "hotkeys": { "capture": "Ctrl+Shift+Space" },
    "captureMode": "hold",
    "templates": [...],
    "activeTemplateId": "..."
  },
  "version": 0
}
```

**Example:**
```typescript
// Source: Pattern derived from Zustand persist docs + WebCrypto MDN
import type { StateStorage } from 'zustand/middleware';
import { chromeStorage } from '@/store/chromeStorage';
import { encryptionService } from './encryption';

export const encryptedChromeStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const raw = await chromeStorage.getItem(name);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (parsed.state?.apiKeys) {
        const decrypted = { ...parsed.state.apiKeys };
        for (const [provider, value] of Object.entries(decrypted)) {
          if (typeof value === 'string' && value.length > 0) {
            try {
              decrypted[provider] = await encryptionService.decrypt(value);
            } catch {
              // Value might be plaintext (pre-migration) -- pass through
              decrypted[provider] = value;
            }
          }
        }
        parsed.state.apiKeys = decrypted;
      }
      return JSON.stringify(parsed);
    } catch {
      return raw; // fallback for non-JSON
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const parsed = JSON.parse(value);
      if (parsed.state?.apiKeys) {
        const encrypted = { ...parsed.state.apiKeys };
        for (const [provider, val] of Object.entries(encrypted)) {
          if (typeof val === 'string' && val.length > 0) {
            encrypted[provider] = await encryptionService.encrypt(val);
          }
        }
        parsed.state.apiKeys = encrypted;
      }
      await chromeStorage.setItem(name, JSON.stringify(parsed));
    } catch {
      // Fallback: write as-is if encryption fails
      await chromeStorage.setItem(name, value);
    }
  },

  removeItem: chromeStorage.removeItem,
};
```

**Confidence:** HIGH -- Zustand persist's `createJSONStorage` accepts any `StateStorage` implementation. The existing `chromeStorage` already proves this works. Wrapping it adds only the crypto layer.

### Pattern 2: EncryptionService Singleton with Lazy Init Guard

**What:** A singleton class that derives an AES-GCM-256 key from `chrome.runtime.id` via PBKDF2 on first call. Salt is generated once and stored in `chrome.storage.local`. The derived CryptoKey is cached in memory (non-extractable). All subsequent encrypt/decrypt calls use the cached key.

**When to use:** All encryption/decryption operations.

**Critical constraint:** `chrome.runtime.id` is stable across extension updates (same ID as long as the extension is not uninstalled and reinstalled). Combined with a random salt, this produces a deterministic key that survives browser restarts and Chrome updates. Unlike `navigator.userAgent`, it does NOT change with browser version updates.

**Example:**
```typescript
// Source: MDN SubtleCrypto + Chrome runtime API docs
class EncryptionService {
  private key: CryptoKey | null = null;
  private initPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.key) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._doInit();
    await this.initPromise;
  }

  private async _doInit(): Promise<void> {
    // Get or create salt from chrome.storage.local
    const result = await chrome.storage.local.get('_encryption_salt');
    let saltArray: number[];

    if (result._encryption_salt) {
      saltArray = result._encryption_salt;
    } else {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      saltArray = Array.from(salt);
      await chrome.storage.local.set({ _encryption_salt: saltArray });
    }

    const salt = new Uint8Array(saltArray);

    // Derive key from chrome.runtime.id (stable across updates)
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(chrome.runtime.id),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    this.key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100_000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable
      ['encrypt', 'decrypt']
    );
  }

  async encrypt(plaintext: string): Promise<string> {
    if (!this.key) throw new Error('EncryptionService not initialized');
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV per AES-GCM spec
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.key,
      encoded
    );
    // Prepend IV to ciphertext, encode as base64
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return btoa(String.fromCharCode(...combined));
  }

  async decrypt(ciphertext: string): Promise<string> {
    if (!this.key) throw new Error('EncryptionService not initialized');
    const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      this.key,
      data
    );
    return new TextDecoder().decode(decrypted);
  }
}

export const encryptionService = new EncryptionService();
```

**Confidence:** HIGH -- Every API used (`crypto.subtle.importKey`, `deriveKey`, `encrypt`, `decrypt`) is confirmed available in Chrome service workers per MDN and Chromium extension group discussions. `chrome.runtime.id` is stable per Chrome API docs.

### Pattern 3: Initialization Order in Background Service Worker

**What:** The background service worker must initialize in a specific order. Encryption must be ready BEFORE the store rehydrates, because `encryptedChromeStorage.getItem` needs a valid CryptoKey to decrypt persisted API keys.

**Critical ordering:**
```
1. Register message listener synchronously (MV3 requirement) -- with queue guard
2. EncryptionService.initialize()                              -- async, ~50ms
3. Store rehydration (storeReadyPromise)                       -- calls encryptedChromeStorage.getItem
4. storeReady = true; drain message queue
```

**Phase 9 already implemented steps 1, 3, 4.** Phase 10 inserts step 2 between 1 and 3.

**Example (modification to background.ts):**
```typescript
import { encryptionService } from '../src/services/crypto/encryption';

// Step 1: Message listener with queue guard (ALREADY EXISTS from Phase 9)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ... existing queue guard logic ...
});

// Step 2: Initialize encryption FIRST, then store
async function initializeServices(): Promise<void> {
  await encryptionService.initialize();
  // Step 3: storeReadyPromise now uses encryptedChromeStorage
  // (modified in src/store/index.ts to use encryptedChromeStorage)
}

// Chain: encryption -> store -> drain queue
initializeServices().then(() => {
  // Wait for store to also be ready (storeReadyPromise from Phase 9)
  return storeReadyPromise;
}).then(() => {
  storeReady = true;
  // drain queue...
});
```

**Confidence:** HIGH -- This follows the pattern documented in `.planning/research/ARCHITECTURE.md` section 6 and implemented in Phase 9.

### Pattern 4: Atomic Migration from Plaintext to Encrypted

**What:** On first run after Phase 10 deployment, existing users have plaintext API keys in `chrome.storage.local`. The migration must: (1) detect plaintext keys, (2) encrypt all keys, (3) verify all encrypted keys decrypt correctly, (4) only then mark migration complete.

**When to use:** Once, on the first store rehydration after Phase 10 is deployed.

**Implementation approach -- transparent via adapter:**

The `encryptedChromeStorage.getItem` adapter handles migration implicitly. When it reads each API key value:
- If the value looks like base64 ciphertext (encrypted), it decrypts it
- If decryption fails (because it is plaintext), it passes it through as-is
- On the next `setItem` call, all values are encrypted

This means migration happens naturally: the first read returns plaintext (graceful fallback), and the first write encrypts everything. No explicit migration step needed.

**However, there is a subtlety:** The `try/catch` in `getItem` around `decrypt` must reliably distinguish "this is plaintext" from "this is corrupted ciphertext." A plaintext string like `sk-proj-abc123` is NOT valid base64 of an AES-GCM ciphertext, so `atob()` will either fail or produce garbage that `crypto.subtle.decrypt` will reject with `OperationError`. Both cases are caught and fall through to plaintext passthrough. This is safe.

**For extra safety, add a migration version flag:**
```typescript
// In chrome.storage.local:
{ _encryption_version: 1 }

// On startup, if _encryption_version is missing or < 1:
// Read existing state, encrypt API keys, write back, set flag
```

**Confidence:** HIGH -- The fallback-on-decrypt-failure pattern is robust because AES-GCM will always reject non-ciphertext input.

### Anti-Patterns to Avoid

- **Using `navigator.userAgent` or `screen` properties for key derivation:** `screen` does not exist in service workers (throws `ReferenceError`). `navigator.userAgent` changes on every Chrome update, making all encrypted data undecryptable. Use ONLY `chrome.runtime.id` + stored salt.

- **Encrypting the entire persisted JSON blob:** Encrypting everything means decryption failure (corrupted data, salt loss) destroys ALL settings, not just API keys. Selective encryption of only the `apiKeys` fields limits blast radius.

- **Initializing encryption AFTER store rehydration:** If the store rehydrates before the CryptoKey is ready, `encryptedChromeStorage.getItem` cannot decrypt, and the store fills with encrypted gibberish or empty defaults.

- **Removing plaintext before verifying encrypted values decrypt:** The migration must verify that `decrypt(encrypt(key)) === key` before removing any plaintext. The adapter-based approach avoids this entirely by never explicitly removing plaintext -- it just encrypts on next write.

- **Using `window.crypto.subtle` in service worker:** There is no `window` in service workers. Use `crypto.subtle` directly.

- **Sharing IndexedDB database with other features:** If salt were in IndexedDB (it is NOT per prior decision), using the same database as future transcript storage could cause version conflicts that silently destroy the salt. Each feature should have its own database. Moot for Phase 10 since salt is in `chrome.storage.local`.

- **Storing the raw passphrase/key material in logs or error messages:** Never log `chrome.runtime.id` or the derived key. Log only success/failure of operations.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AES-GCM encryption | Custom XOR/stream cipher | `crypto.subtle.encrypt({ name: 'AES-GCM' })` | WebCrypto is hardware-accelerated, constant-time, and audited. Hand-rolled crypto is guaranteed insecure |
| Key derivation | Manual hashing loop | `crypto.subtle.deriveKey({ name: 'PBKDF2' })` | PBKDF2 with configurable iterations provides calibrated brute-force resistance |
| Random IV generation | Math.random or counter | `crypto.getRandomValues(new Uint8Array(12))` | CSPRNG is essential for GCM security; `Math.random` is not cryptographically secure |
| Base64 encoding | Manual byte-to-char mapping | `btoa(String.fromCharCode(...))` / `atob()` | Built-in, reliable, universally available |
| Storage adapter composition | Monkey-patching chromeStorage | New `encryptedChromeStorage` implementing `StateStorage` | Clean composition; original adapter remains testable independently |

**Key insight:** WebCrypto provides every primitive needed for this phase. Zero external dependencies. The only custom code is the adapter glue between WebCrypto and Zustand's storage interface.

## Common Pitfalls

### Pitfall 1: Key Derivation from Browser Fingerprint Breaks in Service Worker

**What goes wrong:** Using `screen.width`, `screen.height`, or other DOM APIs for key derivation. These do not exist in service workers.
**Why it happens:** Code written assuming full browser context. The background script IS a service worker in MV3.
**How to avoid:** Use ONLY `chrome.runtime.id` (string, always available) as PBKDF2 input. Do NOT use `navigator.userAgent` (changes on Chrome updates).
**Warning signs:** `ReferenceError: screen is not defined` in service worker console.

### Pitfall 2: Chrome Update Changes User Agent, Keys Lost

**What goes wrong:** If `navigator.userAgent` is part of key derivation, every Chrome auto-update (every 2-4 weeks) produces a different derived key. All previously encrypted data becomes undecryptable.
**Why it happens:** User agent includes Chrome version number (e.g., `Chrome/131.0.6778.85`).
**How to avoid:** `chrome.runtime.id` is stable across Chrome updates. It only changes if the extension is uninstalled and reinstalled from a different source.
**Warning signs:** After Chrome auto-update, API keys silently fail. Console shows `DOMException: OperationError` from `crypto.subtle.decrypt`.

### Pitfall 3: Encryption Init Race with Store Rehydration

**What goes wrong:** The Zustand store rehydrates (calls `chromeStorage.getItem`) before `EncryptionService.initialize()` completes. The adapter tries to decrypt but has no CryptoKey yet.
**Why it happens:** Both encryption init and store rehydration are async. Without explicit ordering, they race.
**How to avoid:** Chain initialization: `await encryptionService.initialize()` BEFORE allowing store rehydration. The current codebase creates the store at module level (line 27 of `index.ts`), which means rehydration starts immediately on import. Phase 10 must ensure encryption initializes before the store module is imported, OR make the encrypted adapter wait for the encryption service internally.
**Warning signs:** Store state contains encrypted base64 strings where objects are expected. Settings page shows garbled text.

### Pitfall 4: Partial Migration Causes Key Loss

**What goes wrong:** Migration encrypts some keys, crashes, and the next run tries to decrypt already-encrypted values as if they were plaintext, or vice versa.
**Why it happens:** Non-atomic migration without verification.
**How to avoid:** The adapter-based approach handles this naturally: on read, try decrypt; on failure, assume plaintext. On write, always encrypt. No explicit migration step or flag needed for basic safety. Add a `_encryption_version` flag for explicit tracking.
**Warning signs:** "API key not configured" errors after extension update despite keys being previously saved.

### Pitfall 5: Large Ciphertext from btoa Spread Operator Stack Overflow

**What goes wrong:** `btoa(String.fromCharCode(...combined))` can overflow the call stack if `combined` is large. For API keys (~50-100 bytes), this is fine. For future use with larger payloads, it would break.
**Why it happens:** Spread operator `...` on a Uint8Array converts every byte to a function argument. V8's argument limit is ~65,536.
**How to avoid:** For API keys, the current approach is safe (keys are small strings). If extending to larger data in the future, use chunked encoding. Document this limitation.
**Warning signs:** `RangeError: Maximum call stack size exceeded` during encryption of large values.

### Pitfall 6: Salt Loss Makes All Encrypted Data Undecryptable

**What goes wrong:** If `_encryption_salt` is deleted from `chrome.storage.local` (e.g., user clears extension data, or code bug), PBKDF2 generates a different salt on next init, producing a different key. All previously encrypted values are permanently lost.
**Why it happens:** Salt is the entropy source that makes the derived key unique. Different salt = different key.
**How to avoid:** (1) Never delete `_encryption_salt` during normal operation. (2) If salt is lost, detect it (decrypt fails for all keys) and reset to empty/default API keys with a user-facing message. (3) Consider backing up salt to `chrome.storage.session` as a redundant copy (cleared on browser close but survives SW restarts within a session).
**Warning signs:** All API keys simultaneously fail to decrypt after the extension storage was cleared.

## Code Examples

Verified patterns from official sources:

### AES-GCM Encrypt with Random IV

```typescript
// Source: MDN SubtleCrypto.encrypt() - https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt
const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
const encoded = new TextEncoder().encode(plaintext);

const ciphertext = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv },
  key,       // CryptoKey from deriveKey
  encoded    // ArrayBuffer of plaintext
);
// ciphertext is ArrayBuffer containing encrypted data + 16-byte auth tag
```

### AES-GCM Decrypt

```typescript
// Source: MDN SubtleCrypto.decrypt() - https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/decrypt
const decrypted = await crypto.subtle.decrypt(
  { name: 'AES-GCM', iv },  // same IV used for encryption
  key,                        // same CryptoKey
  ciphertext                  // ArrayBuffer from encrypt()
);
const plaintext = new TextDecoder().decode(decrypted);
```

### PBKDF2 Key Derivation from chrome.runtime.id

```typescript
// Source: MDN SubtleCrypto.deriveKey() + Chrome runtime API
const encoder = new TextEncoder();
const keyMaterial = await crypto.subtle.importKey(
  'raw',
  encoder.encode(chrome.runtime.id),  // stable extension identifier
  { name: 'PBKDF2' },
  false,
  ['deriveKey']
);

const key = await crypto.subtle.deriveKey(
  {
    name: 'PBKDF2',
    salt: storedSalt,        // Uint8Array from chrome.storage.local
    iterations: 100_000,     // OWASP minimum
    hash: 'SHA-256',
  },
  keyMaterial,
  { name: 'AES-GCM', length: 256 },
  false,                     // non-extractable
  ['encrypt', 'decrypt']
);
```

### Zustand persist with Custom Storage Adapter

```typescript
// Source: Current codebase src/store/index.ts + Zustand persist docs
import { createJSONStorage } from 'zustand/middleware';
import { encryptedChromeStorage } from '../services/crypto/encryptedStorage';

export const useStore = create<StoreState>()(
  persist(
    (...a) => ({
      ...createSettingsSlice(...a),
      ...createTemplatesSlice(...a),
    }),
    {
      name: 'ai-interview-settings',
      storage: createJSONStorage(() => encryptedChromeStorage), // <-- only change
      partialize: (state) => ({
        apiKeys: state.apiKeys,  // encrypted on write, decrypted on read
        models: state.models,
        // ... rest unchanged
      }),
    }
  )
);
```

### Salt Storage in chrome.storage.local

```typescript
// Source: Prior decision + Chrome storage API
// Salt is NOT secret -- it provides uniqueness for PBKDF2 derivation
// Stored as number[] (JSON-serializable form of Uint8Array)

// Write:
const salt = crypto.getRandomValues(new Uint8Array(16));
await chrome.storage.local.set({ _encryption_salt: Array.from(salt) });

// Read:
const result = await chrome.storage.local.get('_encryption_salt');
const salt = new Uint8Array(result._encryption_salt);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Plaintext API keys in chrome.storage | AES-GCM encrypted at rest | Phase 10 | Keys unreadable in DevTools storage inspector |
| Browser fingerprint for key derivation | `chrome.runtime.id` + stored salt | Prior decision override | Keys survive Chrome updates and service worker restarts |
| IndexedDB for salt storage | `chrome.storage.local` for salt | Prior decision | Simpler, fewer moving parts, no IDB version conflicts |
| Separate encrypt/decrypt API | Transparent adapter wrapping Zustand persist | Phase 10 | Zero consumer code changes |

**Deprecated/outdated:**
- Using `navigator.userAgent` for key derivation: Fundamentally broken because UA changes on every Chrome update
- Using `screen` properties in service workers: `screen` object does not exist in service worker scope
- CryptoJS / tweetnacl libraries: Unnecessary when WebCrypto provides native AES-GCM. These add bundle size with no benefit

**Future (not in Phase 10 scope):**
- W3C WebExtensions Secure Storage proposal (1Password-drafted): Would provide native encrypted storage API for extensions. Currently a proposal, not implemented in any browser. When available, would replace this entire encryption layer.
- User passphrase encryption (ENC-01 in REQUIREMENTS.md): Stronger but worse UX. Deferred to future release.
- Key rotation mechanism (ENC-02 in REQUIREMENTS.md): Deferred to future release.

## Exact Files That Need Changes

### New Files

| File | Purpose | Size Estimate |
|------|---------|---------------|
| `src/services/crypto/encryption.ts` | EncryptionService singleton -- PBKDF2 derivation, AES-GCM encrypt/decrypt | ~80 lines |
| `src/services/crypto/encryptedStorage.ts` | `encryptedChromeStorage` StateStorage adapter wrapping `chromeStorage` | ~60 lines |

### Modified Files

| File | Change | Risk |
|------|--------|------|
| `src/store/index.ts` | Replace `chromeStorage` with `encryptedChromeStorage` in `createJSONStorage()` | LOW -- single import swap |
| `entrypoints/background.ts` | Initialize `encryptionService` before `storeReadyPromise`; chain init order | MEDIUM -- modifies init flow |

### Unchanged Files (verify)

| File | Why Unchanged |
|------|---------------|
| `src/store/chromeStorage.ts` | Base adapter remains as-is; new adapter composes on top |
| `src/store/settingsSlice.ts` | Store actions unchanged; encryption is transparent at adapter level |
| `src/store/types.ts` | No type changes; apiKeys remain `{ elevenLabs: string; ... }` |
| `src/components/settings/ApiKeySettings.tsx` | UI unchanged; reads/writes plaintext via Zustand actions |
| `entrypoints/popup/App.tsx` | No changes; API keys accessed via store (already no keys in messages from Phase 9) |
| `entrypoints/offscreen/main.ts` | No changes; receives API key via internal message from background |

**Total files changed:** 4 (2 new, 2 modified)
**New dependencies:** 0
**Manifest changes:** None

## Security Assessment

### Threats Mitigated

| Threat | How Mitigated |
|--------|---------------|
| Plaintext key exposure in DevTools Storage tab | Keys stored as base64 AES-GCM ciphertext |
| Malicious extension reading chrome.storage | Cannot decrypt without `chrome.runtime.id` of THIS extension |
| Debug dump/backup containing plaintext keys | Exported storage contains only ciphertext |
| Key exposure via chrome.storage.local.get in console | Returns encrypted values |

### Threats NOT Mitigated (honest)

| Threat | Why Not | Acceptable? |
|--------|---------|-------------|
| Memory dump (keys decrypted in RAM) | Zustand store holds plaintext in memory | YES -- unavoidable in browser context |
| Chrome DevTools debugger | Attacker with DevTools can call `useStore.getState()` | YES -- if attacker has DevTools, encryption is moot |
| Code injection with extension context | Injected code can call `encryptionService.decrypt()` | YES -- same privilege level |
| Salt and ciphertext in same storage | Attacker with storage access has both | PARTIALLY -- they still need `chrome.runtime.id` (per-install unique) |
| Extension uninstall+reinstall | New `chrome.runtime.id` = different key = old ciphertext lost | YES -- expected behavior, API keys gone anyway |

**Overall:** This raises the bar significantly against casual inspection and cross-extension reads. It is NOT protection against a determined attacker with full extension context access. This is consistent with the security model of browser extensions.

## Performance Assessment

| Operation | Estimated Time | When Called |
|-----------|---------------|-------------|
| `EncryptionService.initialize()` | ~50-100ms | Once per SW startup |
| `encrypt(apiKey)` | ~5-10ms per key | On every store write (3 keys max) |
| `decrypt(apiKey)` | ~5-10ms per key | On store rehydration (once per SW startup) |
| **Total init overhead** | **~80-130ms** | **Once per service worker lifecycle** |

This is acceptable. Store rehydration already takes ~50-100ms. Adding ~80ms for encryption init and ~30ms for decrypting 3 keys is negligible for an interview assistant that is not latency-critical at startup.

## Open Questions

1. **Should the encrypted adapter handle non-background contexts (popup, content script)?**
   - What we know: Only the background service worker creates the primary store with `wrapStore`. Popup and content scripts receive state via `webext-zustand` sync, which sends the already-decrypted in-memory state.
   - What's unclear: Whether `createJSONStorage(() => encryptedChromeStorage)` is ever called in popup/content script contexts.
   - Recommendation: Based on codebase analysis, `src/store/index.ts` is imported by all contexts. However, `wrapStore` in non-background contexts only syncs state via messages -- it does NOT read from `chrome.storage.local` directly. The encryption adapter will be imported but `getItem`/`setItem` should only be called by the persist middleware in the background context. Add a guard: if `encryptionService` is not initialized, fall through to plain `chromeStorage`. This handles the case where popup imports the store module before encryption is ready.

2. **Should we encrypt empty string values?**
   - What we know: Default API key values are empty strings (`''`). Encrypting empty strings produces non-empty ciphertext.
   - What's unclear: Whether this matters.
   - Recommendation: Skip encryption for empty strings (`val.length === 0`). This avoids unnecessary crypto operations and makes it easy to distinguish "no key configured" from "key configured but encrypted."

3. **How to handle the store creation timing in `src/store/index.ts`?**
   - What we know: The store is created at module level (`export const useStore = create<StoreState>()(persist(...))`). This means rehydration starts as soon as the module is imported. Encryption must be ready before this import.
   - What's unclear: Whether to use dynamic import, lazy init in the adapter, or restructure the init chain.
   - Recommendation: Make the `encryptedChromeStorage` adapter internally await `encryptionService.initialize()` on first `getItem` call (lazy init with cached promise). This way, the store module can be imported at any time; the first rehydration call will trigger encryption init if it has not happened yet. The background service worker can ALSO call `encryptionService.initialize()` early for deterministic ordering.

## Sources

### Primary (HIGH confidence)

- [MDN SubtleCrypto](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto) -- AES-GCM, PBKDF2, encrypt/decrypt API, service worker availability
- [MDN SubtleCrypto.encrypt()](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt) -- AES-GCM parameters, IV requirements
- [Chrome runtime API](https://developer.chrome.com/docs/extensions/reference/api/runtime) -- `chrome.runtime.id` property, stability
- [Chromium Extensions Group: WebCrypto in MV3 SW](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/VCXF9rZXr5Y) -- `crypto.subtle` availability in service workers
- Codebase analysis -- `src/store/chromeStorage.ts`, `src/store/index.ts`, `entrypoints/background.ts` -- current adapter pattern and init flow
- `.planning/research/ARCHITECTURE.md` -- Init ordering, encryption integration point design
- `.planning/research/PITFALLS.md` -- Pitfalls 1, 2, 3, 5, 8, 11 directly relevant to this phase

### Secondary (MEDIUM confidence)

- [Chrome Extension Encryption (codestudy.net)](https://www.codestudy.net/blog/chrome-extension-encrypting-data-to-be-stored-in-chrome-storage/) -- Complete AES-GCM + PBKDF2 pattern for Chrome extensions
- [WebCrypto AES-GCM PBKDF2 Medium](https://medium.com/@thomas_40553/how-to-secure-encrypt-and-decrypt-data-within-the-browser-with-aes-gcm-and-pbkdf2-057b839c96b6) -- Browser encryption patterns
- [Zustand persist docs](https://zustand.docs.pmnd.rs/middlewares/persist) -- persist middleware JSON structure, StateStorage interface
- [W3C Secure Storage Proposal](https://github.com/w3c/webextensions/blob/main/proposals/secure-storage.md) -- Future native API (not yet implemented)
- [Saving CryptoKeys in IndexedDB (GitHub Gist)](https://gist.github.com/saulshanabrook/b74984677bccd08b028b30d9968623f5) -- Alternative: storing non-extractable CryptoKey objects

### Tertiary (LOW confidence)

- None -- all findings verified against official docs or codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all native APIs, no dependencies, confirmed available in service worker context
- Architecture: HIGH -- transparent adapter pattern proven by existing `chromeStorage`, init ordering documented
- Pitfalls: HIGH -- verified against existing `.planning/research/PITFALLS.md` analysis and MDN documentation
- Migration: HIGH -- adapter-based fallback on decrypt failure handles plaintext transparently

**Research date:** 2026-02-08
**Valid until:** 2026-03-10 (30 days -- stable domain, no fast-moving dependencies)
