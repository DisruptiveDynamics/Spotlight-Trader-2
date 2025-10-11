import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';

interface VoiceClientConfig {
  instructions: string;
  voice?: 'alloy' | 'echo' | 'shimmer';
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
}

export class RealtimeVoiceClient {
  private session: RealtimeSession<unknown> | null = null;
  private config: VoiceClientConfig;
  private agent: RealtimeAgent;

  constructor(config: VoiceClientConfig) {
    this.config = config;
    
    // Create agent with configuration
    this.agent = new RealtimeAgent({
      name: 'Trading Coach',
      instructions: config.instructions,
      voice: config.voice || 'alloy',
    });
  }

  async connect(apiKey: string) {
    try {
      // Create session - automatically uses WebRTC in browser!
      this.session = new RealtimeSession(this.agent);

      // Connect with API key (SDK handles WebRTC/WebSocket selection)
      await this.session.connect({
        apiKey: apiKey,
      });

      this.config.onConnected?.();
    } catch (error) {
      this.config.onError?.(error as Error);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.session) {
        // Properly close the WebRTC session to release resources
        await this.session.disconnect();
        this.session = null;
      }
      this.config.onDisconnected?.();
    } catch (error) {
      console.error('Error disconnecting:', error);
      this.config.onError?.(error as Error);
    }
  }

  isConnected(): boolean {
    return this.session !== null;
  }
}
