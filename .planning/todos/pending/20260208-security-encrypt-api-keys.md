---
created: 2026-02-08
title: Security Fix - Encrypt API Keys in Storage
area: bug
priority: P0
version: v1.1
complexity: medium
estimate: 1-2 days
files:
  - src/services/crypto/encryption.ts
  - src/store/chromeStorage.ts
  - src/store/settingsStore.ts
---

## Problem

**CRITICAL SECURITY ISSUE:** API keys stored in plaintext in chrome.storage.local.

**Location:**
- `src/store/chromeStorage.ts`

**Current state:**
```typescript
// ❌ INSECURE - Plaintext storage
chrome.storage.local.set({
  apiKeys: {
    openai: 'sk-proj-...',
    elevenlabs: 'el-...'
  }
});
```

**Risk:**
- Any code in extension context can read keys
- Malicious extensions can access chrome.storage
- Exported backups contain plaintext keys
- Debug dumps expose keys

**Chrome's encryption:** Chrome encrypts storage on disk, but decrypted in runtime = vulnerable to code injection.

## User Impact

- **Security:** Keys accessible to malware/malicious extensions
- **Cost:** Stolen keys incur API charges
- **Privacy:** Unauthorized access to user conversations

## Solution

### Encryption Strategy

Use **WebCrypto API** with a derived key based on user's browser session.

**Architecture:**
```
User Input → Encrypt (WebCrypto) → chrome.storage.local (encrypted)
                ↑                           ↓
           Derived Key               Read encrypted
                ↓                           ↓
        IndexedDB (salt)              Decrypt (WebCrypto)
                                            ↓
                                      Use API Key
```

### Encryption Service

```typescript
// src/services/crypto/encryption.ts

class EncryptionService {
  private key: CryptoKey | null = null;
  private readonly SALT_KEY = 'encryption_salt';

  /**
   * Initialize encryption key
   * Derives key from browser entropy + stored salt
   */
  async initialize(): Promise<void> {
    // Get or create salt
    let salt = await this.getSalt();
    if (!salt) {
      salt = crypto.getRandomValues(new Uint8Array(16));
      await this.storeSalt(salt);
    }

    // Derive encryption key from salt + browser fingerprint
    const keyMaterial = await this.getKeyMaterial();
    this.key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false, // not extractable
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt sensitive data
   */
  async encrypt(plaintext: string): Promise<string> {
    if (!this.key) {
      throw new Error('Encryption not initialized');
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);

    // Generate random IV for each encryption
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      this.key,
      data
    );

    // Combine IV + encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);

    // Return base64
    return btoa(String.fromCharCode(...combined));
  }

  /**
   * Decrypt sensitive data
   */
  async decrypt(ciphertext: string): Promise<string> {
    if (!this.key) {
      throw new Error('Encryption not initialized');
    }

    // Decode base64
    const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));

    // Extract IV and encrypted data
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      this.key,
      encrypted
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }

  /**
   * Get key material from browser entropy
   */
  private async getKeyMaterial(): Promise<CryptoKey> {
    // Use browser fingerprint as key material
    const fingerprint = await this.getBrowserFingerprint();
    const encoder = new TextEncoder();
    const keyData = encoder.encode(fingerprint);

    return crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
  }

  /**
   * Browser fingerprint for key derivation
   */
  private async getBrowserFingerprint(): Promise<string> {
    // Combine multiple browser identifiers
    const components = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      // Extension ID is stable per installation
      chrome.runtime.id
    ];

    return components.join('|');
  }

  /**
   * Store salt in IndexedDB (separate from chrome.storage)
   */
  private async storeSalt(salt: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('encryption', 1);

      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        db.createObjectStore('salt');
      };

      request.onsuccess = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        const tx = db.transaction('salt', 'readwrite');
        tx.objectStore('salt').put(salt, this.SALT_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };

      request.onerror = () => reject(request.error);
    });
  }

  private async getSalt(): Promise<Uint8Array | null> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('encryption', 1);

      request.onsuccess = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('salt')) {
          resolve(null);
          return;
        }

        const tx = db.transaction('salt', 'readonly');
        const getRequest = tx.objectStore('salt').get(this.SALT_KEY);

        getRequest.onsuccess = () => resolve(getRequest.result || null);
        getRequest.onerror = () => reject(getRequest.error);
      };

      request.onerror = () => reject(request.error);
    });
  }
}

export const encryptionService = new EncryptionService();
```

### Integration with Settings Store

```typescript
// src/store/settingsStore.ts

import { encryptionService } from '@/services/crypto/encryption';

export const settingsStore = {
  async setApiKey(provider: 'openai' | 'elevenlabs', key: string) {
    // ✅ Encrypt before storing
    const encrypted = await encryptionService.encrypt(key);

    await chrome.storage.local.set({
      [`apiKey_${provider}_encrypted`]: encrypted
    });
  },

  async getApiKey(provider: 'openai' | 'elevenlabs'): Promise<string | null> {
    const result = await chrome.storage.local.get(`apiKey_${provider}_encrypted`);
    const encrypted = result[`apiKey_${provider}_encrypted`];

    if (!encrypted) return null;

    // ✅ Decrypt when reading
    try {
      return await encryptionService.decrypt(encrypted);
    } catch (error) {
      console.error('Decryption failed:', error);
      return null;
    }
  }
};
```

### Migration Strategy

**Handle existing plaintext keys:**

```typescript
async function migrateToEncryption() {
  // Read old plaintext keys
  const oldData = await chrome.storage.local.get('apiKeys');

  if (oldData.apiKeys) {
    // Encrypt each key
    for (const [provider, key] of Object.entries(oldData.apiKeys)) {
      await settingsStore.setApiKey(provider, key);
    }

    // Remove plaintext keys
    await chrome.storage.local.remove('apiKeys');

    console.log('API keys encrypted successfully');
  }
}

// Run on extension startup
chrome.runtime.onInstalled.addListener(async () => {
  await encryptionService.initialize();
  await migrateToEncryption();
});
```

### Implementation Steps

1. **Create encryption service**
   - WebCrypto API wrapper
   - Key derivation from browser fingerprint
   - Salt storage in IndexedDB

2. **Update settings store**
   - Encrypt on write
   - Decrypt on read
   - Handle decryption errors

3. **Migration**
   - Detect plaintext keys
   - Encrypt and replace
   - Remove old plaintext

4. **Initialize on startup**
   - Background script initializes encryption
   - Run migration if needed

5. **Testing**
   - Verify encryption/decryption
   - Test migration from plaintext
   - Test across browser restarts
   - Verify keys work with APIs

### Security Considerations

**Threats mitigated:**
- ✅ Plaintext storage exposure
- ✅ Malicious extension reading keys
- ✅ Debug dump leaking keys
- ✅ Export backup exposure

**Remaining threats:**
- ⚠️ Memory dumps (keys decrypted in RAM)
- ⚠️ Code injection (attacker can call decrypt)
- ⚠️ Debugger access (Chrome DevTools)

**Note:** Perfect security impossible in browser extension context. This raises the bar significantly.

### Alternative: User-Provided Passphrase

**More secure but worse UX:**
```typescript
// Derive key from user passphrase
async deriveKeyFromPassphrase(passphrase: string) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: this.salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
```

**Trade-off:** User must enter passphrase each time = bad UX for interview assistant.

### Files to Update

- `src/services/crypto/encryption.ts` (new)
- `src/store/chromeStorage.ts`
- `src/store/settingsStore.ts`
- `entrypoints/background.ts` (initialize encryption)

### Testing Checklist

- [ ] Encryption service initializes
- [ ] Encrypt/decrypt works correctly
- [ ] Salt persists in IndexedDB
- [ ] Migration from plaintext works
- [ ] Keys work after encryption
- [ ] Keys persist across restart
- [ ] Decryption errors handled gracefully
- [ ] Performance acceptable (<100ms per operation)
- [ ] No plaintext keys in chrome.storage
- [ ] No plaintext keys in memory dumps (best effort)

### Performance Impact

- **Encryption:** ~5-10ms per key
- **Decryption:** ~5-10ms per key
- **Initialization:** ~50ms (once per session)

**Acceptable for occasional operations** (saving settings, starting transcription).

### Dependencies

- WebCrypto API (built-in)
- IndexedDB (built-in)

## References

- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [AES-GCM Best Practices](https://soatok.blog/2020/05/13/why-aes-gcm-sucks/)
- [OWASP: Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
