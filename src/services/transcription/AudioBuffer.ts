/**
 * Audio buffer for storing audio chunks during WebSocket disconnects.
 * Prevents audio loss during brief network interruptions by buffering
 * chunks locally and flushing them on reconnect.
 *
 * Uses a circular buffer for O(1) add/remove operations instead of
 * Array.shift() which is O(n).
 */
export class AudioBuffer {
  private chunks: (ArrayBuffer | null)[];
  private head: number = 0; // Next read position
  private tail: number = 0; // Next write position
  private count: number = 0;
  private readonly maxChunks: number;

  /**
   * Create a new audio buffer
   * @param maxChunks - Maximum number of chunks to buffer (default: 100, ~6 seconds at 16kHz)
   */
  constructor(maxChunks: number = 100) {
    this.maxChunks = maxChunks;
    // Pre-allocate array for better memory performance
    this.chunks = new Array(maxChunks).fill(null);
  }

  /**
   * Add a chunk to the buffer.
   * If buffer is at max capacity, drops the oldest chunk (O(1) operation).
   * @param chunk - PCM audio data as ArrayBuffer
   */
  add(chunk: ArrayBuffer): void {
    if (this.count >= this.maxChunks) {
      // Buffer full - overwrite oldest (advance head)
      this.head = (this.head + 1) % this.maxChunks;
    } else {
      this.count++;
    }
    this.chunks[this.tail] = chunk;
    this.tail = (this.tail + 1) % this.maxChunks;
  }

  /**
   * Flush all buffered chunks and clear the buffer.
   * @returns Array of buffered chunks in order (oldest first)
   */
  flush(): ArrayBuffer[] {
    if (this.count === 0) {
      return [];
    }

    const buffered: ArrayBuffer[] = new Array(this.count);
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.maxChunks;
      buffered[i] = this.chunks[idx]!;
      this.chunks[idx] = null; // Allow GC
    }

    this.head = 0;
    this.tail = 0;
    this.count = 0;
    return buffered;
  }

  /**
   * Clear all buffered chunks without returning them.
   */
  clear(): void {
    // Clear references to allow GC
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.maxChunks;
      this.chunks[idx] = null;
    }
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }

  /**
   * Get the current number of buffered chunks.
   */
  get length(): number {
    return this.count;
  }
}
