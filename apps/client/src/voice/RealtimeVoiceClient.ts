import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';
import { ToolBridge } from './ToolBridge';
import { toolSchemas } from './toolSchemas';

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
  private toolBridge: ToolBridge | null = null;

  constructor(config: VoiceClientConfig) {
    this.config = config;
    
    this.agent = new RealtimeAgent({
      name: 'Nexa',
      instructions: config.instructions,
      voice: config.voice || 'alloy',
      tools: toolSchemas,
    });
  }

  async connect(): Promise<void> {
    if (this.connectionState === 'connected') {
      console.warn('[RealtimeVoiceClient] Already connected');
      return;
    }

    try {
      this.connectionState = 'connecting';

      const tokenRes = await fetch('/api/voice/token', {
        method: 'POST',
        credentials: 'include',
      });

      if (!tokenRes.ok) {
        throw new Error('Failed to get voice token');
      }

      const { token, apiKey, sessionId } = await tokenRes.json();
      this.currentApiKey = apiKey;
      this.sessionId = sessionId;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const toolBridgeUrl = `${protocol}//${window.location.host}/ws/tools`;
      
      this.toolBridge = new ToolBridge(toolBridgeUrl, () => token);
      this.toolBridge.connect();

      this.session = await this.agent.connect(apiKey);

      this.session.on('function_call', async (call: any) => {
        console.log('[RealtimeVoiceClient] Function call:', call.name, call.arguments);

        if (!this.toolBridge) {
          console.error('[RealtimeVoiceClient] Tool bridge not connected');
          return;
        }

        try {
          const result = await this.toolBridge.exec(call.name, call.arguments || {});
          
          if (result.ok) {
            console.log(`[RealtimeVoiceClient] Tool ${call.name} succeeded:`, result.output);
            await call.response.create({
              output: JSON.stringify(result.output),
            });
          } else {
            console.error(`[RealtimeVoiceClient] Tool ${call.name} failed:`, result.error);
            await call.response.create({
              output: JSON.stringify({ error: result.error }),
            });
          }
        } catch (err: any) {
          console.error(`[RealtimeVoiceClient] Tool execution error:`, err);
          await call.response.create({
            output: JSON.stringify({ error: err.message }),
          });
        }
      });

      this.connectionState = 'connected';
      this.config.onConnected?.();
      
      console.log('[RealtimeVoiceClient] Connected successfully');
    } catch (error) {
      this.connectionState = 'error';
      this.config.onError?.(error as Error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.session) {
      await this.session.disconnect();
      this.session = null;
    }

    if (this.toolBridge) {
      this.toolBridge.disconnect();
      this.toolBridge = null;
    }

    this.connectionState = 'idle';
    this.config.onDisconnected?.();
  }

  async toggleMute(): Promise<void> {
    if (!this.session) return;

    this.isMuted = !this.isMuted;
    
    if (this.isMuted) {
      await this.session.mute();
    } else {
      await this.session.unmute();
    }

    this.config.onMuteChange?.(this.isMuted);
  }

  getMuteState(): boolean {
    return this.isMuted;
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.session) {
      throw new Error('Not connected');
    }

    await this.session.sendUserMessage({
      type: 'input_text',
      text,
    });
  }

  updateInstructions(instructions: string): void {
    this.config.instructions = instructions;
    if (this.session) {
      this.session.update({
        instructions,
      });
    }
  }
}
