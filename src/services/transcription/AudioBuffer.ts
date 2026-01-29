/**
 * Audio buffer for storing audio chunks during WebSocket disconnects.
 * Prevents audio loss during brief network interruptions by buffering
 * chunks locally and flushing them on reconnect.
 */
export class AudioBuffer {
  private chunks: ArrayBuffer[] = [];
  private readonly maxChunks: number;

  /**
   * Create a new audio buffer
   * @param maxChunks - Maximum number of chunks to buffer (default: 100, ~6 seconds at 16kHz)
   */
  constructor(maxChunks: number = 100) {
    this.maxChunks = maxChunks;
  }

  /**
   * Add a chunk to the buffer.
   * If buffer is at max capacity, drops the oldest chunk.
   * @param chunk - PCM audio data as ArrayBuffer
   */
  add(chunk: ArrayBuffer): void {
    if (this.chunks.length >= this.maxChunks) {
      // Drop oldest chunk to make room (FIFO)
      this.chunks.shift();
    }
    this.chunks.push(chunk);
  }

  /**
   * Flush all buffered chunks and clear the buffer.
   * @returns Array of buffered chunks in order (oldest first)
   */
  flush(): ArrayBuffer[] {
    const buffered = this.chunks;
    this.chunks = [];
    return buffered;
  }

  /**
   * Clear all buffered chunks without returning them.
   */
  clear(): void {
    this.chunks = [];
  }

  /**
   * Get the current number of buffered chunks.
   */
  get length(): number {
    return this.chunks.length;
  }
}
