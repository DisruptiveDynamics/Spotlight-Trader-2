type VADEvent = "start" | "stop";
type VADListener = () => void;

export class VoiceActivityDetector {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private animationId: number | null = null;
  private listeners = new Map<VADEvent, Set<VADListener>>();
  private isSpeaking = false;
  private threshold = 0.015;
  private holdMs = 250;
  private lastSpeechTime = 0;

  async start() {
    if (this.audioContext) {
      return;
    }

    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    source.connect(this.analyser);

    this.detect();
  }

  private detect() {
    if (!this.analyser) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const check = () => {
      if (!this.analyser) return;

      this.analyser.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const normalized = (dataArray[i]! - 128) / 128;
        sum += normalized * normalized;
      }

      const rms = Math.sqrt(sum / bufferLength);

      const now = Date.now();

      if (rms > this.threshold) {
        this.lastSpeechTime = now;
        if (!this.isSpeaking) {
          this.isSpeaking = true;
          this.emit("start");
        }
      } else if (this.isSpeaking && now - this.lastSpeechTime > this.holdMs) {
        this.isSpeaking = false;
        this.emit("stop");
      }

      this.animationId = requestAnimationFrame(check);
    };

    check();
  }

  stop() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;
    this.isSpeaking = false;
  }

  on(event: VADEvent, listener: VADListener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off(event: VADEvent, listener: VADListener) {
    this.listeners.get(event)?.delete(listener);
  }

  private emit(event: VADEvent) {
    this.listeners.get(event)?.forEach((listener) => listener());
  }

  getMediaStream(): MediaStream | null {
    return this.mediaStream;
  }
}
