/**
 * Enhanced Voice Client v2 - Production-ready with Safari/iOS compatibility
 * 
 * Key Improvements:
 * - AudioWorklet instead of deprecated ScriptProcessorNode
 * - Gesture-based AudioContext unlock for Safari/iOS
 * - Enhanced barge-in with gain ducking
 * - Audio batching and backpressure control
 * - Idle detection and auto-sleep
 */

import { VoiceActivityDetector } from './VAD';
import { ensureAudioUnlocked, getAudioContext } from '../services/AudioManager';
import { AudioCapture } from '../services/AudioCapture';
import { handleBargeIn, AudioBatcher } from '../services/VoiceCoach';
import { getIdleDetector } from '../services/IdleDetector';

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
  private audioCapture: AudioCapture | null = null;
  private analyserNode: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private playbackQueue: AudioBuffer[] = [];
  private isPlaying = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private audioBatcher: AudioBatcher;
  
  private state: ConnectionState = 'disconnected';
  private coachState: CoachState = 'idle';
  private listeners = new Set<VoiceClientListener>();
  private stateListeners = new Set<StateListener>();
  private amplitudeListeners = new Set<AmplitudeListener>();
  private latencyListeners = new Set<LatencyListener>();
  private permissionListeners = new Set<PermissionListener>();
  
  private reconnectTimeout: number | null = null;
  private reconnectAttempts = 0;
  private reconnectDelays = [1000, 2000, 4000, 8000, 10000];
  private maxReconnectAttempts = 10;
  
  private isMuted = false;
  private amplitudeMonitorInterval: number | null = null;
  private lastRequestTime = 0;
  private permissionState: PermissionState = 'pending';
  private currentToken: string | null = null;
  private isBackgroundTab = false;
  private intentionalDisconnect = false;

  // Voice-specific error cooldown (prevents hammering OpenAI servers)
  private voiceErrorCount = 0;
  private voiceErrorCooldownUntil = 0;
  private readonly VOICE_ERROR_THRESHOLD = 3;
  private readonly VOICE_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

  constructor() {
    this.vad = new VoiceActivityDetector();
    this.vad.on('start', () => this.handleSpeechStart());
    this.vad.on('stop', () => this.handleSpeechStop());
    
    this.audioBatcher = new AudioBatcher(40, 24000); // 40ms batches at 24kHz to match OpenAI

    // Monitor tab visibility
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', async () => {
        this.isBackgroundTab = document.hidden;
        
        if (this.isBackgroundTab) {
          this.stopAmplitudeMonitoring();
          // Pause VAD when hidden to save battery
          if (this.vad) {
            this.vad.stop();
          }
        } else {
          // iOS fix: Resume AudioContext when tab becomes visible
          const audioContext = getAudioContext();
          if (audioContext && audioContext.state === 'suspended') {
            try {
              await audioContext.resume();
            } catch (err) {
              console.warn('[Voice] Failed to resume AudioContext:', err);
            }
          }
          
          if (this.audioCapture && !this.isMuted) {
            this.startAmplitudeMonitoring();
            this.vad.start();
          }
        }
      });
    }

    // Listen for online/offline events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());
    }

    // Setup idle detection
    const idleDetector = getIdleDetector();
    idleDetector.start(() => {
      console.log('🔕 User idle - entering sleep mode');
      this.disconnect();
    });
  }

  private async handleOnline(): Promise<void> {
    if (this.state === 'offline') {
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }

      if (this.ws) {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.close();
        this.ws = null;
      }

      this.reconnectAttempts = 0;
      
      try {
        const token = await this.freshToken();
        this.currentToken = token;
        await this.connectWebSocket(token);
      } catch (error) {
        console.error('Failed to get fresh token on online event:', error);
        this.setState('error');
      }
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

    // Check voice error cooldown
    const now = Date.now();
    if (now < this.voiceErrorCooldownUntil) {
      const remainingMs = this.voiceErrorCooldownUntil - now;
      const remainingSec = Math.ceil(remainingMs / 1000);
      console.warn(`[Voice] In cooldown period. ${remainingSec}s remaining. Use manualRetry() to override.`);
      return;
    }

    this.intentionalDisconnect = false;
    this.currentToken = token;
    this.setState('connecting');

    try {
      // Use AudioManager for gesture unlock (Safari/iOS)
      const audioContext = await ensureAudioUnlocked();
      if (!audioContext) {
        throw new Error('Failed to unlock audio context');
      }

      await this.setupAudioCapture(audioContext);
      await this.connectWebSocket(token);
    } catch (error) {
      console.error('Connection failed:', error);
      this.setState('error');

      if (error instanceof Error && error.message.includes('Permission denied')) {
        this.setPermissionState('denied');
      }
    }
  }

  // Manual retry after cooldown - exposed for UI
  async manualRetry(): Promise<void> {
    this.voiceErrorCount = 0;
    this.voiceErrorCooldownUntil = 0;
    
    try {
      const token = await this.freshToken();
      await this.connect(token);
    } catch (error) {
      console.error('[Voice] Manual retry failed:', error);
      throw error;
    }
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    
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

  private async setupAudioCapture(audioContext: AudioContext): Promise<void> {
    if (this.audioCapture) {
      return; // Already setup
    }

    try {
      // Create audio capture with AudioWorklet
      this.audioCapture = new AudioCapture();
      
      await this.audioCapture.start(
        audioContext,
        (pcm: Int16Array) => {
          if (this.isMuted) return;

          // Add to batcher (internally queues with backpressure)
          this.audioBatcher.add(pcm);
          
          // Drain queue with backpressure control
          this.drainAudioQueue();
        },
        {
          sampleRate: 24000, // Match OpenAI Realtime API sample rate
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      );

      this.setPermissionState('granted');
      
      // Setup analyser for amplitude monitoring BEFORE starting VAD
      this.analyserNode = audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;

      // Create gain node for barge-in ducking
      this.gainNode = audioContext.createGain();
      this.gainNode.gain.value = 1.0;

      const mediaStream = this.audioCapture.getMediaStream();
      if (mediaStream) {
        const source = audioContext.createMediaStreamSource(mediaStream);
        source.connect(this.analyserNode);
      }

      // Start VAD after audio pipeline is set up
      await this.vad.start();
      
      this.startAmplitudeMonitoring();
    } catch (error) {
      console.error('Failed to setup audio capture:', error);
      this.setPermissionState('denied');
      throw error;
    }
  }

  private async connectWebSocket(token: string): Promise<void> {
    if (!navigator.onLine) {
      this.setState('offline');
      this.scheduleReconnect();
      return;
    }

    // Use correct WebSocket URL - Replit proxies through port 5000
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/realtime?t=${encodeURIComponent(token)}`;
    console.log('[Voice] Connecting to:', wsUrl);
    this.ws = new WebSocket(wsUrl);
    
    // CRITICAL: Set binaryType to receive ArrayBuffer instead of Blob
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      this.setState('connected');
      this.setCoachState('listening');
      this.reconnectAttempts = 0;
      
      // Reset voice error count on successful connection
      this.voiceErrorCount = 0;
      this.voiceErrorCooldownUntil = 0;
      
      // Flush any pending audio batches from before reconnect
      this.drainAudioQueue();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = event.data;
        
        // Binary audio data (ArrayBuffer) - synchronous processing
        if (data instanceof ArrayBuffer) {
          this.handleAudioArrayBuffer(data);
          return;
        }
        
        // Blob fallback (shouldn't happen with binaryType='arraybuffer')
        if (data instanceof Blob) {
          console.warn('[Voice] Received Blob instead of ArrayBuffer - this indicates a bug');
          const reader = new FileReader();
          reader.onload = () => {
            if (reader.result instanceof ArrayBuffer) {
              this.handleAudioArrayBuffer(reader.result);
            }
          };
          reader.readAsArrayBuffer(data);
          return;
        }

        // Text message - parse as JSON
        if (typeof data === 'string') {
          const msg = JSON.parse(data);

          // Handle all OpenAI Realtime API message types
          switch (msg.type) {
            // Session events
            case 'session.created':
            case 'session.updated':
              console.log('[Voice] Session ready:', msg.type);
              break;

            // Conversation events
            case 'conversation.created':
            case 'conversation.item.created':
            case 'conversation.item.truncated':
            case 'conversation.item.deleted':
              break;

            // Input audio events
            case 'input_audio_buffer.committed':
            case 'input_audio_buffer.cleared':
              break;
            
            case 'input_audio_buffer.speech_started':
              this.setCoachState('thinking');
              break;
            
            case 'input_audio_buffer.speech_stopped':
              break;

            // Response events
            case 'response.created':
            case 'response.output_item.added':
            case 'response.output_item.done':
            case 'response.content_part.added':
              break;

            case 'response.audio.delta':
              if (msg.delta) {
                this.handleAudioDelta(msg.delta);
                this.setCoachState('speaking');
              }
              break;

            case 'response.audio.done':
              this.setCoachState('listening');
              break;

            case 'response.audio_transcript.delta':
              if (msg.delta) {
                console.log('[Voice] Transcript:', msg.delta);
              }
              break;

            case 'response.audio_transcript.done':
            case 'response.text.delta':
            case 'response.text.done':
            case 'response.function_call_arguments.delta':
            case 'response.function_call_arguments.done':
              break;

            case 'response.done':
              if (this.lastRequestTime > 0) {
                const responseTime = Date.now() - this.lastRequestTime;
                this.notifyLatency(responseTime);
                this.lastRequestTime = 0;
              }
              break;

            // Rate limit events
            case 'rate_limits.updated':
              break;

            // Error events
            case 'error':
              console.error('[Voice] Server error:', msg.error);
              
              // Track voice-specific errors and enter cooldown if threshold reached
              this.voiceErrorCount++;
              if (this.voiceErrorCount >= this.VOICE_ERROR_THRESHOLD) {
                this.voiceErrorCooldownUntil = Date.now() + this.VOICE_COOLDOWN_MS;
                console.warn(`[Voice] ${this.VOICE_ERROR_THRESHOLD} errors detected. Entering ${this.VOICE_COOLDOWN_MS / 60000}min cooldown.`);
                this.disconnect();
              }
              break;
            
            // Heartbeat response
            case 'pong':
              break;

            default:
              console.log('[Voice] Unhandled message type:', msg.type);
          }
        }
      } catch (error) {
        // Log error but don't trigger reconnect - parsing errors are not connection issues
        console.error('[Voice] Error processing message:', error instanceof Error ? error.message : String(error), error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      if (!navigator.onLine) {
        this.setState('offline');
      } else {
        this.setState('error');
      }
    };

    this.ws.onclose = (event) => {
      console.log('[Voice] WebSocket closed:', event.code, event.reason);
      
      // Don't reconnect if user intentionally disconnected
      if (this.intentionalDisconnect) {
        this.setState('disconnected');
        this.setCoachState('idle');
        return;
      }

      // Auto-reconnect with exponential backoff if not at max attempts
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.setState('reconnecting');
        this.scheduleReconnect();
      } else {
        console.log('[Voice] Max reconnect attempts reached');
        this.setState('disconnected');
        this.setCoachState('idle');
      }
    };
  }

  private handleSpeechStart(): void {
    if (!this.isMuted) {
      // Enhanced barge-in with gain ducking
      handleBargeIn(this.ws, this.currentSource, this.gainNode);
      this.currentSource = null;
      this.clearPlaybackQueue();
      this.setCoachState('listening');
    }
  }

  private handleSpeechStop(): void {
    if (!this.isMuted && !this.isPlaying) {
      this.setCoachState('thinking');
    }
  }

  private handleAudioArrayBuffer(arrayBuffer: ArrayBuffer): void {
    const audioContext = getAudioContext();
    if (!audioContext) return;

    // Int16Array requires byte length to be a multiple of 2
    if (arrayBuffer.byteLength % 2 !== 0) {
      console.warn('[Voice] Received odd byte length audio buffer, truncating last byte:', arrayBuffer.byteLength);
      arrayBuffer = arrayBuffer.slice(0, arrayBuffer.byteLength - 1);
    }

    // Convert PCM16 ArrayBuffer directly to Float32 for playback
    const float32 = this.pcm16ToFloat32(new Int16Array(arrayBuffer));

    // CRITICAL: OpenAI Realtime API outputs 24kHz PCM16
    // Create buffer with correct 24kHz rate so browser resamples properly
    const audioBuffer = audioContext.createBuffer(
      1,
      float32.length,
      24000  // OpenAI output sample rate
    );
    audioBuffer.getChannelData(0).set(float32);

    this.playbackQueue.push(audioBuffer);

    if (!this.isPlaying) {
      this.playNextBuffer();
    }
  }

  private handleAudioDelta(deltaBase64: string): void {
    try {
      const audioContext = getAudioContext();
      if (!audioContext) return;

      const pcm16 = this.base64ToArrayBuffer(deltaBase64);
      const float32 = this.pcm16ToFloat32(new Int16Array(pcm16));

      // CRITICAL: OpenAI Realtime API outputs 24kHz PCM16
      // Create buffer with correct 24kHz rate so browser resamples properly
      const audioBuffer = audioContext.createBuffer(
        1,
        float32.length,
        24000  // OpenAI output sample rate
      );
      audioBuffer.getChannelData(0).set(float32);

      this.playbackQueue.push(audioBuffer);

      if (!this.isPlaying) {
        this.playNextBuffer();
      }
    } catch (error) {
      console.error('[Voice] Failed to decode audio delta:', error instanceof Error ? error.message : String(error), 'Delta length:', deltaBase64?.length);
    }
  }

  private playNextBuffer(): void {
    const audioContext = getAudioContext();
    if (!audioContext || this.playbackQueue.length === 0) {
      this.isPlaying = false;
      this.setCoachState('idle');
      return;
    }

    this.isPlaying = true;
    this.setCoachState('speaking');

    const buffer = this.playbackQueue.shift()!;
    this.currentSource = audioContext.createBufferSource();
    this.currentSource.buffer = buffer;

    // Connect through gain node for barge-in control
    if (this.gainNode) {
      this.gainNode.gain.setValueAtTime(1.0, audioContext.currentTime);
      this.currentSource.connect(this.gainNode);
      this.gainNode.connect(audioContext.destination);
    } else {
      this.currentSource.connect(audioContext.destination);
    }

    this.currentSource.onended = () => {
      this.currentSource = null;
      this.playNextBuffer();
    };

    this.currentSource.start();
  }

  mute(): void {
    if (this.isMuted) return;

    this.isMuted = true;
    this.audioCapture?.setEnabled(false);
    this.vad.stop();
    this.setCoachState('muted');
  }

  unmute(): void {
    if (!this.isMuted) return;

    this.isMuted = false;
    this.audioCapture?.setEnabled(true);
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
    handleBargeIn(this.ws, this.currentSource, this.gainNode);
    this.currentSource = null;
    this.clearPlaybackQueue();

    if (!this.isMuted) {
      this.setCoachState('listening');
    }
  }

  private drainAudioQueue(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Check WebSocket backpressure (bufferedAmount in bytes)
    const MAX_BUFFERED = 32768; // 32KB threshold
    const MAX_QUEUE_FRAMES = 30; // Bounded queue size to prevent backpressure
    
    // Drop oldest frames if queue exceeds max size
    const pendingCount = this.audioBatcher.getPendingCount();
    if (pendingCount > MAX_QUEUE_FRAMES) {
      const dropCount = pendingCount - MAX_QUEUE_FRAMES;
      console.warn(`[Voice] Audio queue overflow, dropping ${dropCount} oldest frames`);
      for (let i = 0; i < dropCount; i++) {
        this.audioBatcher.getNextBatch(); // Discard
      }
    }
    
    while (
      this.audioBatcher.getPendingCount() > 0 &&
      this.ws.bufferedAmount < MAX_BUFFERED
    ) {
      const batch = this.audioBatcher.getNextBatch();
      if (!batch) break;

      const buffer = batch.buffer as ArrayBuffer;
      const audioEvent = {
        type: 'input_audio_buffer.append',
        audio: this.arrayBufferToBase64(buffer),
      };
      this.ws.send(JSON.stringify(audioEvent));
    }
  }

  private cleanupAudio(): void {
    this.stopAmplitudeMonitoring();
    this.vad.stop();

    // Stop any currently playing audio to prevent leaks
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (err) {
        // Already stopped, ignore
      }
      this.currentSource = null;
    }

    if (this.audioCapture) {
      this.audioCapture.stop();
      this.audioCapture = null;
    }

    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    if (this.playbackQueue.length > 0) {
      this.clearPlaybackQueue();
    }

    this.audioBatcher.clear();
  }

  private clearPlaybackQueue(): void {
    this.playbackQueue = [];
  }

  private async freshToken(): Promise<string> {
    // Use demo mode for POC - GET endpoint doesn't require auth
    const res = await fetch('/api/voice/token?demo=true', { 
      method: 'GET', 
      credentials: 'include' 
    });
    if (!res.ok) {
      throw new Error(`Token fetch failed: ${res.status}`);
    }
    const { token } = await res.json();
    return token as string;
  }

  private scheduleReconnect(delay = 1000): void {
    const backoffDelay =
      this.reconnectDelays[Math.min(this.reconnectAttempts, this.reconnectDelays.length - 1)] || delay;
    const jitter = Math.random() * 1000;

    this.setState('reconnecting');
    this.reconnectAttempts++;

    this.reconnectTimeout = window.setTimeout(async () => {
      try {
        const token = await this.freshToken();
        this.currentToken = token;
        await this.connectWebSocket(token);
      } catch (error) {
        console.error('Failed to get fresh token for reconnect:', error);
        this.scheduleReconnect(Math.min(backoffDelay * 2, 30000));
      }
    }, backoffDelay + jitter);
  }

  // Amplitude monitoring
  private startAmplitudeMonitoring(): void {
    if (this.amplitudeMonitorInterval || !this.analyserNode) return;

    const bufferLength = this.analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    this.amplitudeMonitorInterval = window.setInterval(() => {
      if (!this.analyserNode || this.isBackgroundTab) return;

      this.analyserNode.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const normalized = (dataArray[i]! - 128) / 128;
        sum += normalized * normalized;
      }

      const rms = Math.sqrt(sum / bufferLength);
      this.notifyAmplitude(rms);
    }, 100);
  }

  private stopAmplitudeMonitoring(): void {
    if (this.amplitudeMonitorInterval) {
      clearInterval(this.amplitudeMonitorInterval);
      this.amplitudeMonitorInterval = null;
    }
  }

  // State management
  private setState(state: ConnectionState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }

  private setCoachState(state: CoachState): void {
    this.coachState = state;
    this.stateListeners.forEach((listener) => listener(state));
  }

  private setPermissionState(state: PermissionState): void {
    this.permissionState = state;
    this.permissionListeners.forEach((listener) => listener(state));
  }

  private notifyAmplitude(level: number): void {
    this.amplitudeListeners.forEach((listener) => listener(level));
  }

  private notifyLatency(ms: number): void {
    this.latencyListeners.forEach((listener) => listener(ms));
  }

  // Event listeners
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

  onLatency(listener: LatencyListener): () => void {
    this.latencyListeners.add(listener);
    return () => this.latencyListeners.delete(listener);
  }

  onPermissionChange(listener: PermissionListener): () => void {
    this.permissionListeners.add(listener);
    return () => this.permissionListeners.delete(listener);
  }

  // Utility methods
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private pcm16ToFloat32(pcm16: Int16Array): Float32Array {
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i]! / 32768.0;
    }
    return float32;
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
}
