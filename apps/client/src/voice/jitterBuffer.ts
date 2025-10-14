/**
 * [PHASE-6] TTS Jitter Buffer
 * Smooths out TTS audio chunk delivery with configurable buffering
 * Handles overflow by dropping oldest chunks and tracking drops
 */

import { perfMetrics } from "@shared/perf/metrics";

interface AudioChunk {
  data: ArrayBuffer | Blob;
  timestamp: number;
  seq: number;
}

export interface JitterBufferConfig {
  targetDelayMs: number; // Target buffer delay (default: 150ms)
  maxDelayMs: number; // Maximum buffer delay (default: 350ms)
  onChunkReady: (chunk: ArrayBuffer | Blob) => void;
}

export class TTSJitterBuffer {
  private config: JitterBufferConfig;
  private buffer: AudioChunk[] = [];
  private nextSeq = 0;
  private playbackSeq = 0;
  private playbackTimer: number | null = null;
  private firstChunkReceived = false;
  private bufferStartTime = 0;

  constructor(config: JitterBufferConfig) {
    this.config = config;
  }

  /**
   * Add an audio chunk to the buffer
   */
  addChunk(data: ArrayBuffer | Blob): void {
    const chunk: AudioChunk = {
      data,
      timestamp: Date.now(),
      seq: this.nextSeq++,
    };

    this.buffer.push(chunk);

    // Check for overflow
    if (this.bufferSizeMs() > this.config.maxDelayMs) {
      this.handleOverflow();
    }

    // Start playback if this is the first chunk
    if (!this.firstChunkReceived) {
      this.firstChunkReceived = true;
      this.bufferStartTime = Date.now();
      
      // Wait for target delay before starting playback
      setTimeout(() => {
        this.startPlayback();
      }, this.config.targetDelayMs);
    }
  }

  /**
   * Get current buffer size in milliseconds
   */
  private bufferSizeMs(): number {
    if (this.buffer.length === 0) return 0;
    
    const oldest = this.buffer[0]!;
    const newest = this.buffer[this.buffer.length - 1]!;
    
    return newest.timestamp - oldest.timestamp;
  }

  /**
   * Handle buffer overflow by dropping oldest chunks
   */
  private handleOverflow(): void {
    while (this.buffer.length > 0 && this.bufferSizeMs() > this.config.maxDelayMs) {
      const dropped = this.buffer.shift();
      
      if (dropped) {
        console.warn(`[TTSJitterBuffer] Dropped chunk ${dropped.seq} due to overflow`);
        perfMetrics.recordTTSJitterDrop();
      }
    }
  }

  /**
   * Start playback at configured intervals
   */
  private startPlayback(): void {
    if (this.playbackTimer !== null) return;

    // Play chunks at a reasonable rate (e.g., every 50ms)
    const playbackIntervalMs = 50;

    this.playbackTimer = window.setInterval(() => {
      this.playNextChunk();
    }, playbackIntervalMs);
  }

  /**
   * Play the next chunk in the buffer
   */
  private playNextChunk(): void {
    if (this.buffer.length === 0) {
      return;
    }

    // Get the oldest chunk that matches playback sequence
    const chunkIndex = this.buffer.findIndex((c) => c.seq === this.playbackSeq);

    if (chunkIndex === -1) {
      // Chunk not found, likely dropped - skip to next
      this.playbackSeq++;
      return;
    }

    const chunk = this.buffer.splice(chunkIndex, 1)[0]!;
    this.playbackSeq++;

    // Emit chunk to audio player
    this.config.onChunkReady(chunk.data);
  }

  /**
   * Stop playback and clear buffer
   */
  stop(): void {
    if (this.playbackTimer !== null) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }

    this.buffer = [];
    this.nextSeq = 0;
    this.playbackSeq = 0;
    this.firstChunkReceived = false;
    this.bufferStartTime = 0;
  }

  /**
   * Get buffer statistics
   */
  getStats() {
    return {
      bufferLength: this.buffer.length,
      bufferSizeMs: this.bufferSizeMs(),
      playbackSeq: this.playbackSeq,
      nextSeq: this.nextSeq,
    };
  }
}
