/**
 * AudioCapture - Low-latency microphone capture using AudioWorklet
 * Replaces deprecated ScriptProcessorNode for better performance
 */

export interface AudioCaptureConfig {
  sampleRate?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private onChunkCallback: ((pcm: Int16Array) => void) | null = null;

  /**
   * Request microphone permission BEFORE attempting to connect.
   * This ensures the browser shows the permission dialog immediately,
   * instead of silently failing during WebSocket setup.
   */
  static async requestMicPermission(config: AudioCaptureConfig = {}): Promise<MediaStream> {
    const {
      sampleRate = 24000,
      echoCancellation = true,
      noiseSuppression = true,
      autoGainControl = true,
    } = config;

    return navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation,
        noiseSuppression,
        autoGainControl,
        channelCount: 1,
        sampleRate,
      },
    });
  }

  /**
   * Ensures PCM16 data is exactly 960 bytes (480 Int16 samples = 20ms @ 24kHz).
   * This prevents "byte length should be a multiple of 2" errors and aligns with
   * OpenAI Realtime API's expected frame size for 24kHz PCM16.
   */
  static ensurePCM16FrameSize(pcm: Int16Array): Int16Array {
    const TARGET_SAMPLES = 480; // 20ms @ 24kHz

    if (pcm.length === TARGET_SAMPLES) {
      return pcm; // Already correct size
    }

    if (pcm.length > TARGET_SAMPLES) {
      // Truncate to exact size
      return pcm.slice(0, TARGET_SAMPLES);
    }

    // Pad with zeros if too short
    const padded = new Int16Array(TARGET_SAMPLES);
    padded.set(pcm);
    return padded;
  }

  async start(
    audioContext: AudioContext,
    onChunk: (pcm: Int16Array) => void,
    config: AudioCaptureConfig = {},
  ): Promise<void> {
    this.audioContext = audioContext;
    this.onChunkCallback = onChunk;

    const {
      sampleRate = 24000,
      echoCancellation = true,
      noiseSuppression = true,
      autoGainControl = true,
    } = config;

    // Request microphone with optimized constraints
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation,
        noiseSuppression,
        autoGainControl,
        channelCount: 1,
        sampleRate,
      },
    });

    // Load AudioWorklet processor with proper error handling
    try {
      const workletUrl = new URL("/worklets/micProcessor.js", window.location.origin).href;
      await this.audioContext.audioWorklet.addModule(workletUrl);

      // Create worklet node
      this.workletNode = new AudioWorkletNode(this.audioContext, "mic-processor");

      // Handle PCM chunks from worklet
      this.workletNode.port.onmessage = (e) => {
        if (e.data?.pcm && this.onChunkCallback) {
          const rawPCM = new Int16Array(e.data.pcm);
          const framedPCM = AudioCapture.ensurePCM16FrameSize(rawPCM);
          this.onChunkCallback(framedPCM);
        }
      };

      // Connect mic → worklet → destination
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.sourceNode.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);
    } catch (err) {
      console.warn("AudioWorklet failed, falling back to ScriptProcessor:", err);

      // Fallback to ScriptProcessorNode (deprecated but more compatible)
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const rawPCM = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const sample = inputData[i] ?? 0;
          const s = Math.max(-1, Math.min(1, sample));
          rawPCM[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        if (this.onChunkCallback) {
          const framedPCM = AudioCapture.ensurePCM16FrameSize(rawPCM);
          this.onChunkCallback(framedPCM);
        }
      };

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.sourceNode.connect(processor);
      processor.connect(this.audioContext.destination);

      // Store reference for cleanup
      (this as any).processorNode = processor;
    }
  }

  stop(): void {
    // Disconnect nodes
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode.port.onmessage = null;
      this.workletNode = null;
    }

    // Cleanup fallback processor if it exists
    const processorNode = (this as any).processorNode;
    if (processorNode) {
      processorNode.disconnect();
      processorNode.onaudioprocess = null;
      (this as any).processorNode = null;
    }

    // Stop media stream tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.onChunkCallback = null;
  }

  getMediaStream(): MediaStream | null {
    return this.mediaStream;
  }

  setEnabled(enabled: boolean): void {
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }
}
