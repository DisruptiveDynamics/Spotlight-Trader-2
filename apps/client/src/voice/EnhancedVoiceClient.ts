import { VoiceActivityDetector } from './VAD';

type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'
  | 'offline';
type CoachState = 'listening' | 'thinking' | 'speaking' | 'idle' | 'muted';
type PermissionState = 'pending' | 'granted' | 'denied';
type VoiceClientListener = (state: ConnectionState) => void;
type StateListener = (state: CoachState) => void;
type AmplitudeListener = (level: number) => void;
type LatencyListener = (ms: number) => void;
type PermissionListener = (state: PermissionState) => void;

export class EnhancedVoiceClient {
  private ws: WebSocket | null = null;
  private vad: VoiceActivityDetector;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private analyserNode: AnalyserNode | null = null;
  private playbackQueue: AudioBuffer[] = [];
  private isPlaying = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private state: ConnectionState = 'disconnected';
  private coachState: CoachState = 'idle';
  private listeners = new Set<VoiceClientListener>();
  private stateListeners = new Set<StateListener>();
  private amplitudeListeners = new Set<AmplitudeListener>();
  private latencyListeners = new Set<LatencyListener>();
  private permissionListeners = new Set<PermissionListener>();
  private reconnectTimeout: number | null = null;
  private reconnectAttempts = 0;
  private reconnectDelays = [1000, 2000, 4000, 8000, 10000]; // Exponential backoff capped at 10s
  private maxReconnectAttempts = 10;
  private isMuted = false;
  private audioProcessor: ScriptProcessorNode | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;
  private amplitudeMonitorInterval: number | null = null;
  private lastRequestTime = 0;
  private permissionState: PermissionState = 'pending';
  private currentToken: string | null = null;
  private isBackgroundTab = false;

  constructor() {
    this.vad = new VoiceActivityDetector();
    this.vad.on('start', () => this.handleSpeechStart());
    this.vad.on('stop', () => this.handleSpeechStop());

    // Monitor tab visibility for mobile optimization
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.isBackgroundTab = document.hidden;
        if (this.isBackgroundTab) {
          this.stopAmplitudeMonitoring();
        } else if (this.mediaStream && !this.isMuted) {
          this.startAmplitudeMonitoring();
        }
      });
    }

    // Listen for online/offline events (registered once)
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());
    }
  }

  private handleOnline(): void {
    if (this.currentToken && this.state === 'offline') {
      // Cancel any pending reconnect timeout
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }

      // Close existing WebSocket if present (clear handlers first to prevent duplicate reconnects)
      if (this.ws) {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.close();
        this.ws = null;
      }

      this.reconnectAttempts = 0;
      this.connectWebSocket(this.currentToken);
    }
  }

  private handleOffline(): void {
    if (
      this.state === 'connected' ||
      this.state === 'connecting' ||
      this.state === 'reconnecting'
    ) {
      this.setState('offline');
    }
  }

  async connect(token: string): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.currentToken = token;
    this.setState('connecting');

    try {
      await this.setupAudioContext();
      await this.connectWebSocket(token);
    } catch (error) {
      console.error('Connection failed:', error);
      this.setState('error');

      if (error instanceof Error && error.message.includes('Permission denied')) {
        this.setPermissionState('denied');
      }
    }
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.cleanupAudio();
    this.setState('disconnected');
    this.setCoachState('idle');
    this.reconnectAttempts = 0;
    this.currentToken = null;
  }

  private async setupAudioContext(): Promise<void> {
    if (this.audioContext && this.mediaStream) {
      return;
    }

    this.audioContext = new AudioContext({ sampleRate: 24000 });

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.setPermissionState('granted');
      await this.vad.start();

      this.audioSource = this.audioContext.createMediaStreamSource(this.mediaStream);

      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;

      this.audioProcessor = this.audioContext.createScriptProcessor(2048, 1, 1);

      this.audioProcessor.onaudioprocess = (e) => {
        if (this.isMuted) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = this.float32ToPCM16(inputData);

        if (this.ws?.readyState === WebSocket.OPEN) {
          const buffer = new ArrayBuffer(pcm16.byteLength);
          const view = new Int16Array(buffer);
          view.set(pcm16);
          const audioEvent = {
            type: 'input_audio_buffer.append',
            audio: this.arrayBufferToBase64(buffer),
          };
          this.ws.send(JSON.stringify(audioEvent));
        }
      };

      this.audioSource.connect(this.analyserNode);
      this.analyserNode.connect(this.audioProcessor);
      this.audioProcessor.connect(this.audioContext.destination);

      this.startAmplitudeMonitoring();
    } catch (error) {
      console.error('Failed to setup audio:', error);
      this.setPermissionState('denied');
      throw error;
    }
  }

  private async connectWebSocket(token: string): Promise<void> {
    // Check if online before attempting connection
    if (!navigator.onLine) {
      this.setState('offline');
      this.scheduleReconnect(token);
      return;
    }

    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/realtime?t=${token}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.setState('connected');
      this.setCoachState('listening');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'response.audio.delta' && data.delta) {
          await this.handleAudioDelta(data.delta);
        }

        if (data.type === 'response.done' && this.lastRequestTime > 0) {
          const responseTime = Date.now() - this.lastRequestTime;
          this.notifyLatency(responseTime);
          this.lastRequestTime = 0;
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      // Check if it's a network error
      if (!navigator.onLine) {
        this.setState('offline');
      } else {
        this.setState('error');
      }
    };

    this.ws.onclose = () => {
      if (this.currentToken && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect(this.currentToken);
      } else {
        this.setState('disconnected');
        this.setCoachState('idle');
      }
    };
  }

  mute(): void {
    if (this.isMuted || !this.mediaStream) return;

    this.isMuted = true;
    const audioTrack = this.mediaStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = false;
    }
    this.vad.stop();
    this.setCoachState('muted');
  }

  unmute(): void {
    if (!this.isMuted || !this.mediaStream) return;

    this.isMuted = false;
    const audioTrack = this.mediaStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = true;
    }
    this.vad.start();
    this.setCoachState('listening');
  }

  toggleMute(): void {
    if (this.isMuted) {
      this.unmute();
    } else {
      this.mute();
    }
  }

  interrupt(): void {
    if (this.currentSource) {
      this.currentSource.stop();
      this.currentSource = null;
    }

    this.clearPlaybackQueue();

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'response.cancel' }));
    }

    if (!this.isMuted) {
      this.setCoachState('listening');
    }
  }

  private cleanupAudio(): void {
    this.stopAmplitudeMonitoring();
    this.vad.stop();

    if (this.audioProcessor) {
      this.audioProcessor.disconnect();
      this.audioProcessor = null;
    }

    if (this.audioSource) {
      this.audioSource.disconnect();
      this.audioSource = null;
    }

    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.clearPlaybackQueue();
  }

  private startAmplitudeMonitoring(): void {
    if (this.amplitudeMonitorInterval) return;

    const dataArray = new Uint8Array(this.analyserNode?.frequencyBinCount || 0);

    this.amplitudeMonitorInterval = window.setInterval(() => {
      if (!this.analyserNode || this.isMuted) {
        this.notifyAmplitude(0);
        return;
      }

      this.analyserNode.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i]! - 128) / 128;
        sum += normalized * normalized;
      }

      const rms = Math.sqrt(sum / dataArray.length);
      this.notifyAmplitude(Math.min(1, rms * 5));
    }, 50);
  }

  private stopAmplitudeMonitoring(): void {
    if (this.amplitudeMonitorInterval) {
      clearInterval(this.amplitudeMonitorInterval);
      this.amplitudeMonitorInterval = null;
    }
    this.notifyAmplitude(0);
  }

  private handleSpeechStart(): void {
    if (this.isMuted) return;

    this.interrupt();
    this.lastRequestTime = Date.now();
  }

  private handleSpeechStop(): void {
    if (this.isMuted) return;

    if (!this.isPlaying) {
      this.setCoachState('thinking');
    }
  }

  private async handleAudioDelta(deltaBase64: string): Promise<void> {
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

  private async playNextBuffer(): Promise<void> {
    if (this.playbackQueue.length === 0 || !this.audioContext) {
      this.isPlaying = false;
      if (!this.isMuted) {
        this.setCoachState('listening');
      }
      return;
    }

    this.isPlaying = true;
    this.setCoachState('speaking');
    const buffer = this.playbackQueue.shift()!;

    // iOS Safari compatibility: Resume AudioContext before playback
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (error) {
        console.error('Failed to resume AudioContext:', error);
      }
    }

    this.currentSource = this.audioContext.createBufferSource();
    this.currentSource.buffer = buffer;
    this.currentSource.connect(this.audioContext.destination);

    this.currentSource.onended = () => {
      this.currentSource = null;
      this.playNextBuffer();
    };

    this.currentSource.start();
  }

  private clearPlaybackQueue(): void {
    this.playbackQueue = [];
    this.isPlaying = false;
    this.currentSource = null;
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

  private scheduleReconnect(token: string): void {
    if (this.reconnectTimeout) return;

    // Only set reconnecting if not offline (preserve offline state)
    if (this.state !== 'offline') {
      this.setState('reconnecting');
    }

    const delayIndex = Math.min(this.reconnectAttempts, this.reconnectDelays.length - 1);
    const baseDelay = this.reconnectDelays[delayIndex] || 10000;
    
    // Add ±20% jitter
    const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);
    const delay = Math.max(100, baseDelay + jitter); // Minimum 100ms

    this.reconnectAttempts++;

    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectTimeout = null;
      this.connectWebSocket(token);
    }, delay);
  }

  private setState(newState: ConnectionState): void {
    this.state = newState;
    this.listeners.forEach((listener) => listener(newState));
  }

  private setCoachState(newState: CoachState): void {
    this.coachState = newState;
    this.stateListeners.forEach((listener) => listener(newState));
  }

  private notifyAmplitude(level: number): void {
    this.amplitudeListeners.forEach((listener) => listener(level));
  }

  private notifyLatency(ms: number): void {
    this.latencyListeners.forEach((listener) => listener(ms));
  }

  onStateChange(listener: VoiceClientListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onCoachStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onAmplitudeChange(listener: AmplitudeListener): () => void {
    this.amplitudeListeners.add(listener);
    return () => this.amplitudeListeners.delete(listener);
  }

  onLatencyChange(listener: LatencyListener): () => void {
    this.latencyListeners.add(listener);
    return () => this.latencyListeners.delete(listener);
  }

  getState(): ConnectionState {
    return this.state;
  }

  getCoachState(): CoachState {
    return this.coachState;
  }

  getPermissionState(): PermissionState {
    return this.permissionState;
  }

  isMicMuted(): boolean {
    return this.isMuted;
  }

  private setPermissionState(state: PermissionState): void {
    this.permissionState = state;
    this.permissionListeners.forEach((listener) => listener(state));
  }

  onPermissionChange(listener: PermissionListener): () => void {
    this.permissionListeners.add(listener);
    return () => this.permissionListeners.delete(listener);
  }
}
