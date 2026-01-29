/**
 * PCM Processor AudioWorklet
 *
 * Converts Float32 audio samples to 16-bit PCM Int16 format.
 * Buffers samples and sends 100ms chunks via postMessage.
 *
 * This file runs in AudioWorklet thread - must be vanilla JS.
 */

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Buffer for accumulated samples
    this.buffer = [];
    // 100ms at 16kHz = 1600 samples
    // Audio is typically captured at 48kHz but will be resampled before this processor
    this.bufferSize = 1600;
  }

  /**
   * Convert Float32 sample [-1, 1] to 16-bit PCM Int16
   * @param {number} sample - Float32 sample value
   * @returns {number} - Int16 value
   */
  floatTo16BitPCM(sample) {
    // Clamp to [-1, 1] range
    const clamped = Math.max(-1, Math.min(1, sample));
    // Convert to Int16: negative values scale to -32768, positive to 32767
    return clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
  }

  /**
   * Process audio input - called by AudioWorklet system
   * @param {Float32Array[][]} inputs - Input audio data
   * @param {Float32Array[][]} outputs - Output audio data (unused)
   * @param {Object} parameters - Audio parameters (unused)
   * @returns {boolean} - true to keep processor alive
   */
  process(inputs, outputs, parameters) {
    // Get first input, first channel (mono)
    const input = inputs[0];
    if (!input || !input[0]) {
      // No input available, keep processor alive
      return true;
    }

    const channelData = input[0];

    // Convert each sample to Int16 and add to buffer
    for (let i = 0; i < channelData.length; i++) {
      const int16Value = this.floatTo16BitPCM(channelData[i]);
      this.buffer.push(int16Value);
    }

    // When buffer has enough samples, send chunk
    while (this.buffer.length >= this.bufferSize) {
      // Extract chunk from buffer
      const chunkSamples = this.buffer.splice(0, this.bufferSize);

      // Create Int16Array and copy samples
      const chunk = new Int16Array(chunkSamples);

      // Send via postMessage with transferable ArrayBuffer
      this.port.postMessage(chunk.buffer, [chunk.buffer]);
    }

    // Return true to keep processor alive
    return true;
  }
}

// Register the processor with the AudioWorklet system
registerProcessor('pcm-processor', PCMProcessor);
