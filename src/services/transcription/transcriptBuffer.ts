import type { TranscriptEntry } from '../../types/transcript';

const STORAGE_KEY = '_transcript_buffer';
const ACTIVE_KEY = '_transcription_active';
const DEBOUNCE_MS = 2000;

/**
 * Persistent transcript buffer that survives service worker termination.
 * Uses chrome.storage.local with debounced writes to minimize I/O.
 * On SW restart, load() rehydrates entries from storage.
 */
export class TranscriptBuffer {
  private entries: TranscriptEntry[] = [];
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private loaded = false;

  /**
   * Load entries from chrome.storage.local.
   * Call once on SW startup (only if recovering from active transcription).
   */
  async load(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const stored = result[STORAGE_KEY];
      if (Array.isArray(stored)) {
        this.entries = stored;
        console.log('TranscriptBuffer: Loaded', this.entries.length, 'entries from storage');
      } else {
        this.entries = [];
      }
    } catch (error) {
      console.error('TranscriptBuffer: Failed to load from storage, starting fresh', error);
      this.entries = [];
    }
    this.loaded = true;
  }

  /**
   * Add a transcript entry in chronological order by timestamp.
   * Schedules a debounced save to storage.
   */
  add(entry: TranscriptEntry): void {
    // Find correct insertion index to maintain chronological order by timestamp
    let insertIndex = this.entries.length;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].timestamp <= entry.timestamp) {
        insertIndex = i + 1;
        break;
      }
      if (i === 0) {
        insertIndex = 0;
      }
    }

    this.entries.splice(insertIndex, 0, entry);
    this.dirty = true;
    this.scheduleSave();
  }

  /**
   * Return current entries array (for broadcast to content scripts).
   */
  getEntries(): TranscriptEntry[] {
    return this.entries;
  }

  /**
   * Schedule a debounced save to chrome.storage.local.
   */
  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => this.flush(), DEBOUNCE_MS);
  }

  /**
   * Immediately write entries to chrome.storage.local.
   * Called on debounce timer expiry and on STOP_TRANSCRIPTION.
   */
  async flush(): Promise<void> {
    if (!this.dirty) return;

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: this.entries });
      this.dirty = false;
    } catch (error) {
      console.error('TranscriptBuffer: Failed to flush to storage', error);
    }
  }

  /**
   * Clear all entries and remove from storage.
   * Called on START_TRANSCRIPTION for a fresh session.
   */
  async clear(): Promise<void> {
    this.entries = [];
    this.dirty = false;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      await chrome.storage.local.remove(STORAGE_KEY);
    } catch (error) {
      console.error('TranscriptBuffer: Failed to clear storage', error);
    }
  }

  /** Number of entries currently in the buffer. */
  get length(): number {
    return this.entries.length;
  }

  /** Whether load() has been called. */
  get isLoaded(): boolean {
    return this.loaded;
  }
}

/**
 * Set the transcription-active flag in chrome.storage.local.
 * Used to detect if SW was terminated during active transcription.
 */
export async function setTranscriptionActive(active: boolean): Promise<void> {
  try {
    if (active) {
      await chrome.storage.local.set({ [ACTIVE_KEY]: true });
    } else {
      await chrome.storage.local.remove(ACTIVE_KEY);
    }
  } catch (error) {
    console.error('TranscriptBuffer: Failed to set active flag', error);
  }
}

/**
 * Check if transcription was active when SW last ran.
 * Returns true if SW was terminated during active transcription.
 */
export async function wasTranscriptionActive(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(ACTIVE_KEY);
    return result[ACTIVE_KEY] === true;
  } catch (error) {
    console.error('TranscriptBuffer: Failed to read active flag', error);
    return false;
  }
}
