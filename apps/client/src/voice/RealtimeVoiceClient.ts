import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';

interface VoiceClientConfig {
  instructions: string;
  voice?: 'alloy' | 'echo' | 'shimmer' | 'fable' | 'onyx' | 'nova';
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
  onMuteChange?: (isMuted: boolean) => void;
}

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

export class RealtimeVoiceClient {
  private session: RealtimeSession<unknown> | null = null;
  private config: VoiceClientConfig;
  private agent: RealtimeAgent;
  private connectionState: ConnectionState = 'idle';
  private isMuted = false;
  private sessionId: string | null = null;
  private currentApiKey: string | null = null;

  constructor(config: VoiceClientConfig) {
    this.config = config;
    
    // Create agent with configuration
    this.agent = new RealtimeAgent({
      name: 'Trading Coach',
      instructions: config.instructions,
      voice: config.voice || 'alloy',
    });

    this.log('init', { voice: config.voice || 'alloy' });
  }

  async connect(apiKey: string): Promise<void> {
    try {
      this.log('connect:start');
      this.connectionState = 'connecting';
      this.currentApiKey = apiKey;

      // Create session with all required fields for current API
      this.session = new RealtimeSession(this.agent);
      this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // Connect with API key (SDK handles WebRTC/WebSocket selection)
      await this.session.connect({
        apiKey: apiKey,
      });

      this.connectionState = 'connected';
      this.log('connect:success', { sessionId: this.sessionId });
      this.config.onConnected?.();
    } catch (error) {
      this.connectionState = 'error';
      this.log('connect:error', { error: (error as Error).message });
      this.config.onError?.(error as Error);
      throw error;
    }
  }

  async updateVoice(newVoice: 'alloy' | 'echo' | 'shimmer' | 'fable' | 'onyx' | 'nova'): Promise<void> {
    if (!this.currentApiKey) {
      throw new Error('Cannot update voice: no API key available');
    }

    try {
      this.log('voice:update:start', { newVoice });

      // SDK limitation: voice cannot be changed mid-session
      // We must disconnect and reconnect with new agent config
      const wasConnected = this.connectionState === 'connected';
      const apiKeyCopy = this.currentApiKey; // Preserve API key before disconnect
      
      if (wasConnected) {
        // Close session without clearing API key
        if (this.session) {
          await (this.session as any).close?.() || Promise.resolve();
          this.session = null;
          this.sessionId = null;
        }
        this.connectionState = 'idle';
        this.isMuted = false;
      }

      // Create new agent with updated voice
      this.agent = new RealtimeAgent({
        name: 'Trading Coach',
        instructions: this.config.instructions,
        voice: newVoice,
      });

      // Reconnect with new voice if we were previously connected
      if (wasConnected && apiKeyCopy) {
        await this.connect(apiKeyCopy);
      }

      this.log('voice:update:success', { voice: newVoice });
    } catch (error) {
      this.log('voice:update:error', { error: (error as Error).message });
      this.config.onError?.(error as Error);
      throw error;
    }
  }

  toggleMute(): void {
    if (!this.session || this.connectionState !== 'connected') {
      this.log('mute:error', { reason: 'not connected' });
      throw new Error('Cannot toggle mute: not connected');
    }

    const targetMutedState = !this.isMuted;
    
    try {
      // Control input audio modalities without dropping session
      const modalities = targetMutedState ? ['text'] : ['text', 'audio'];
      
      // Use transport.sendEvent to update modalities
      (this.session as any).transport?.sendEvent({
        type: 'session.update',
        session: {
          modalities,
        }
      });
      
      // Only update state after successful send
      this.isMuted = targetMutedState;
      this.log(this.isMuted ? 'mute:enabled' : 'mute:disabled', { modalities });
      this.config.onMuteChange?.(this.isMuted);
    } catch (error) {
      // State remains unchanged on error
      this.log('mute:toggle:error', { error: (error as Error).message });
      this.config.onError?.(error as Error);
      throw error; // Propagate to caller so UI can show error
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.log('disconnect:start', { sessionId: this.sessionId });
      
      if (this.session) {
        // Close the session (the SDK handles cleanup internally)
        await (this.session as any).close?.() || Promise.resolve();
        this.session = null;
        this.sessionId = null;
      }
      
      this.connectionState = 'idle';
      this.isMuted = false;
      this.currentApiKey = null;
      this.log('disconnect:success');
      this.config.onDisconnected?.();
    } catch (error) {
      this.log('disconnect:error', { error: (error as Error).message });
      this.config.onError?.(error as Error);
    }
  }

  isConnected(): boolean {
    return this.connectionState === 'connected' && this.session !== null;
  }

  getMutedState(): boolean {
    return this.isMuted;
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Structured logging for voice events (dev-only)
   * Format: [VoiceClient] action payload
   */
  private log(action: string, payload?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === 'development') {
      const logData = payload ? ` ${JSON.stringify(payload)}` : '';
      console.log(`[VoiceClient] ${action}${logData}`);
    }
  }
}
