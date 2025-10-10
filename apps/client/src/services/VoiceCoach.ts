/**
 * VoiceCoach - Enhanced barge-in and playback control
 * Provides instant audio interruption with gain ducking
 */

export function handleBargeIn(
  realtimeWs: WebSocket | null,
  playbackNode: AudioBufferSourceNode | null,
  gainNode: GainNode | null
): void {
  // 1. Cancel OpenAI response immediately
  try {
    if (realtimeWs?.readyState === WebSocket.OPEN) {
      realtimeWs.send(JSON.stringify({ type: 'response.cancel' }));
    }
  } catch (err) {
    console.warn('Failed to send response.cancel:', err);
  }

  // 2. Duck audio gain to 0 instantly (no fade)
  if (gainNode?.gain && playbackNode?.context) {
    gainNode.gain.setValueAtTime(0, playbackNode.context.currentTime);
  }

  // 3. Stop playback node
  try {
    playbackNode?.stop();
  } catch (err) {
    // Already stopped, ignore
  }
}

export interface AudioFrameQueue {
  frames: ArrayBuffer[];
  maxSize: number;
  addFrame: (frame: ArrayBuffer) => void;
  getNextFrame: () => ArrayBuffer | null;
  clear: () => void;
}

/**
 * Creates a backpressure-controlled audio frame queue
 * Drops oldest frames when queue exceeds maxSize
 */
export function createFrameQueue(maxSize = 8): AudioFrameQueue {
  const frames: ArrayBuffer[] = [];

  return {
    frames,
    maxSize,

    addFrame(frame: ArrayBuffer) {
      frames.push(frame);
      
      // Backpressure: drop oldest frames if queue too large
      while (frames.length > maxSize) {
        frames.shift();
      }
    },

    getNextFrame() {
      return frames.shift() || null;
    },

    clear() {
      frames.length = 0;
    },
  };
}

/**
 * Coalesces audio chunks into batches for efficient transmission
 * Reduces protocol overhead by bundling small frames
 */
export class AudioBatcher {
  private buffer: Int16Array[] = [];
  private batchDurationMs: number;
  private sampleRate: number;
  private lastFlush: number = Date.now();

  constructor(batchDurationMs = 40, sampleRate = 16000) {
    this.batchDurationMs = batchDurationMs;
    this.sampleRate = sampleRate;
  }

  add(chunk: Int16Array): Int16Array | null {
    this.buffer.push(chunk);

    const elapsed = Date.now() - this.lastFlush;
    const targetSamples = (this.batchDurationMs / 1000) * this.sampleRate;
    const currentSamples = this.buffer.reduce((sum, c) => sum + c.length, 0);

    // Flush if we have enough samples or timeout reached
    if (currentSamples >= targetSamples || elapsed >= this.batchDurationMs * 2) {
      return this.flush();
    }

    return null;
  }

  flush(): Int16Array | null {
    if (this.buffer.length === 0) return null;

    // Concatenate all chunks
    const totalLength = this.buffer.reduce((sum, c) => sum + c.length, 0);
    const batched = new Int16Array(totalLength);
    
    let offset = 0;
    for (const chunk of this.buffer) {
      batched.set(chunk, offset);
      offset += chunk.length;
    }

    this.buffer = [];
    this.lastFlush = Date.now();
    
    return batched;
  }

  clear(): void {
    this.buffer = [];
    this.lastFlush = Date.now();
  }
}
