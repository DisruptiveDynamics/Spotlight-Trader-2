/**
 * MicProcessor AudioWorklet
 * Replaces deprecated ScriptProcessorNode for low-latency audio capture
 * Converts Float32 audio to PCM16 format for transmission
 */

class MicProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];

    // No input or empty channel
    if (!input || !input[0]) return true;

    const samples = input[0]; // Mono channel
    const pcm16 = new Int16Array(samples.length);

    // Convert Float32 [-1, 1] to Int16 [-32768, 32767]
    for (let i = 0; i < samples.length; i++) {
      const clamped = Math.max(-1, Math.min(1, samples[i]));
      pcm16[i] = clamped * 0x7fff;
    }

    // Transfer buffer ownership for zero-copy efficiency
    this.port.postMessage({ pcm: pcm16.buffer }, [pcm16.buffer]);

    return true; // Keep processor alive
  }
}

registerProcessor("mic-processor", MicProcessor);
