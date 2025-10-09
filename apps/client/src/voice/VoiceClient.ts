import { VoiceActivityDetector } from './VAD';

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
type VoiceClientListener = (state: ConnectionState) => void;
type StateListener = (state: 'listening' | 'thinking' | 'speaking' | 'idle') => void;

export class VoiceClient {
  private ws: WebSocket | null = null;
  private vad: VoiceActivityDetector;
  private audioContext: AudioContext | null = null;
  private playbackQueue: AudioBuffer[] = [];
  private isPlaying = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private state: ConnectionState = 'disconnected';
  private coachState: 'listening' | 'thinking' | 'speaking' | 'idle' = 'idle';
  private listeners = new Set<VoiceClientListener>();
  private stateListeners = new Set<StateListener>();
  private reconnectTimeout: number | null = null;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;
  private isMicEnabled = false;
  private audioProcessor: ScriptProcessorNode | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;

  constructor() {
    this.vad = new VoiceActivityDetector();
    this.vad.on('start', () => this.handleSpeechStart());
    this.vad.on('stop', () => this.handleSpeechStop());
  }

  async connect(token: string) {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.setState('connecting');

    const wsUrl = `ws://${window.location.hostname}:4000/ws/realtime?t=${token}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.setState('connected');
      this.reconnectAttempts = 0;
      this.startAudioCapture();
    };

    this.ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'response.audio.delta' && data.delta) {
          await this.handleAudioDelta(data.delta);
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.setState('error');
    };

    this.ws.onclose = () => {
      this.setState('disconnected');
      this.stopAudioCapture();
      this.scheduleReconnect(token);
    };
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.stopAudioCapture();
    this.setState('disconnected');
  }

  private async startAudioCapture() {
    this.audioContext = new AudioContext({ sampleRate: 24000 });

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    await this.vad.start();

    this.audioSource = this.audioContext.createMediaStreamSource(stream);
    this.audioProcessor = this.audioContext.createScriptProcessor(2048, 1, 1);

    this.audioProcessor.onaudioprocess = (e) => {
      if (!this.isMicEnabled) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = this.float32ToPCM16(inputData);

      if (this.ws?.readyState === WebSocket.OPEN) {
        const audioEvent = {
          type: 'input_audio_buffer.append',
          audio: this.arrayBufferToBase64(pcm16.buffer),
        };
        this.ws.send(JSON.stringify(audioEvent));
      }
    };

    this.audioSource.connect(this.audioProcessor);
    this.audioProcessor.connect(this.audioContext.destination);
  }

  async enableMic() {
    this.isMicEnabled = true;
    await this.vad.start();
    this.setCoachState('listening');
  }

  disableMic() {
    this.isMicEnabled = false;
    this.vad.stop();
    this.setCoachState('idle');
  }

  isMicActive(): boolean {
    return this.isMicEnabled;
  }

  private stopAudioCapture() {
    this.vad.stop();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.clearPlaybackQueue();
  }

  private handleSpeechStart() {
    if (!this.isMicEnabled) return;

    if (this.currentSource) {
      this.currentSource.stop();
      this.currentSource = null;
    }

    this.clearPlaybackQueue();

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'response.cancel' }));
    }

    this.setCoachState('listening');
  }

  private handleSpeechStop() {
    if (!this.isMicEnabled) return;

    if (!this.isPlaying) {
      this.setCoachState('thinking');
    }
  }

  private async handleAudioDelta(deltaBase64: string) {
    if (!this.audioContext) return;

    const pcm16 = this.base64ToArrayBuffer(deltaBase64);
    const float32 = this.pcm16ToFloat32(new Int16Array(pcm16));

    const audioBuffer = this.audioContext.createBuffer(
      1,
      float32.length,
      this.audioContext.sampleRate
    );
    audioBuffer.getChannelData(0).set(float32);

    this.playbackQueue.push(audioBuffer);

    if (!this.isPlaying) {
      this.playNextBuffer();
    }
  }

  private async playNextBuffer() {
    if (this.playbackQueue.length === 0 || !this.audioContext) {
      this.isPlaying = false;
      this.setCoachState('idle');
      return;
    }

    this.isPlaying = true;
    this.setCoachState('speaking');
    const buffer = this.playbackQueue.shift()!;

    this.currentSource = this.audioContext.createBufferSource();
    this.currentSource.buffer = buffer;
    this.currentSource.connect(this.audioContext.destination);

    this.currentSource.onended = () => {
      this.currentSource = null;
      this.playNextBuffer();
    };

    this.currentSource.start();
  }

  private clearPlaybackQueue() {
    this.playbackQueue = [];
    this.isPlaying = false;
    this.currentSource = null;
    this.setCoachState('idle');
  }

  private float32ToPCM16(float32: Float32Array): Int16Array {
    const pcm16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]!));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm16;
  }

  private pcm16ToFloat32(pcm16: Int16Array): Float32Array {
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i]! / (pcm16[i]! < 0 ? 0x8000 : 0x7fff);
    }
    return float32;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private scheduleReconnect(token: string) {
    if (this.reconnectTimeout) return;

    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts) + Math.random() * 1000,
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;

    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect(token);
    }, delay);
  }

  private setState(newState: ConnectionState) {
    this.state = newState;
    this.listeners.forEach((listener) => listener(newState));
  }

  private setCoachState(newState: 'listening' | 'thinking' | 'speaking' | 'idle') {
    this.coachState = newState;
    this.stateListeners.forEach((listener) => listener(newState));
  }

  onStateChange(listener: VoiceClientListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onCoachStateChange(listener: StateListener) {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  getState(): ConnectionState {
    return this.state;
  }

  getCoachState(): 'listening' | 'thinking' | 'speaking' | 'idle' {
    return this.coachState;
  }
}
