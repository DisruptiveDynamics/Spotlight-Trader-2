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

  async start(
    audioContext: AudioContext,
    onChunk: (pcm: Int16Array) => void,
    config: AudioCaptureConfig = {}
  ): Promise<void> {
    this.audioContext = audioContext;
    this.onChunkCallback = onChunk;

    const {
      sampleRate = 16000,
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

    // Load AudioWorklet processor
    try {
      await this.audioContext.audioWorklet.addModule('/worklets/micProcessor.js');
    } catch (err) {
      console.warn('AudioWorklet not supported, using fallback');
      throw new Error('AudioWorklet not available');
    }

    // Create worklet node
    this.workletNode = new AudioWorkletNode(this.audioContext, 'mic-processor');
    
    // Handle PCM chunks from worklet
    this.workletNode.port.onmessage = (e) => {
      if (e.data?.pcm && this.onChunkCallback) {
        this.onChunkCallback(new Int16Array(e.data.pcm));
      }
    };

    // Connect mic → worklet → destination
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.sourceNode.connect(this.workletNode);
    this.workletNode.connect(this.audioContext.destination);
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
