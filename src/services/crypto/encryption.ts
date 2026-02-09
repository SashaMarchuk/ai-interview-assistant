/**
 * Encryption Service
 *
 * Provides AES-GCM-256 encryption/decryption for sensitive data at rest
 * using WebCrypto APIs. Key is derived via PBKDF2 from chrome.runtime.id
 * and a stored random salt, ensuring keys are extension-instance-specific.
 *
 * Usage:
 * ```ts
 * import { encryptionService } from '@/services/crypto/encryption';
 *
 * await encryptionService.initialize();
 * const ciphertext = await encryptionService.encrypt('sk-secret-key');
 * const plaintext = await encryptionService.decrypt(ciphertext);
 * ```
 */

const SALT_STORAGE_KEY = '_encryption_salt';
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 100_000;

class EncryptionService {
  private key: CryptoKey | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Whether the service has been initialized with a derived key.
   */
  get isInitialized(): boolean {
    return !!this.key;
  }

  /**
   * Initialize the encryption service by deriving the AES-GCM key.
   * Idempotent -- returns immediately if already initialized.
   * Deduplicates concurrent calls via shared promise.
   */
  async initialize(): Promise<void> {
    if (this.key) return;

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInit();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  /**
   * Encrypt a plaintext string to base64-encoded AES-GCM ciphertext.
   * The 12-byte IV is prepended to the ciphertext before base64 encoding.
   *
   * @throws Error if service is not initialized
   */
  async encrypt(plaintext: string): Promise<string> {
    if (!this.key) {
      throw new Error('EncryptionService: not initialized. Call initialize() first.');
    }

    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.key,
      encoder.encode(plaintext),
    );

    // Prepend IV to ciphertext for storage
    const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), IV_LENGTH);

    return btoa(String.fromCharCode(...combined));
  }

  /**
   * Decrypt a base64-encoded AES-GCM ciphertext back to plaintext.
   * Expects the 12-byte IV prepended to the ciphertext.
   *
   * @throws Error if service is not initialized
   * @throws DOMException if ciphertext is invalid or tampered
   */
  async decrypt(ciphertext: string): Promise<string> {
    if (!this.key) {
      throw new Error('EncryptionService: not initialized. Call initialize() first.');
    }

    const raw = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
    const iv = raw.slice(0, IV_LENGTH);
    const data = raw.slice(IV_LENGTH);

    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, this.key, data);

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Internal: derive AES-GCM-256 key from chrome.runtime.id + stored salt.
   */
  private async _doInit(): Promise<void> {
    const salt = await this._getOrCreateSalt();
    const encoder = new TextEncoder();

    // Import chrome.runtime.id as PBKDF2 key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(chrome.runtime.id),
      { name: 'PBKDF2' },
      false,
      ['deriveKey'],
    );

    // Derive AES-GCM-256 key (non-extractable)
    this.key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt.buffer as ArrayBuffer,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable
      ['encrypt', 'decrypt'],
    );

  }

  /**
   * Internal: get existing salt from storage or create a new one.
   * Salt is stored as a JSON-serializable number array.
   */
  private async _getOrCreateSalt(): Promise<Uint8Array> {
    const result = await chrome.storage.local.get(SALT_STORAGE_KEY);
    const stored = result[SALT_STORAGE_KEY];

    if (stored && Array.isArray(stored) && stored.length === SALT_LENGTH) {
      return new Uint8Array(stored);
    }

    // Generate new salt
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    await chrome.storage.local.set({ [SALT_STORAGE_KEY]: Array.from(salt) });
    return salt;
  }
}

/** Singleton encryption service instance */
export const encryptionService = new EncryptionService();
