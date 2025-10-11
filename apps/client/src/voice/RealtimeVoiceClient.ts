import { RealtimeClient } from '@openai/agents/realtime';

interface VoiceClientConfig {
  apiKey: string;
  instructions: string;
  voice?: 'alloy' | 'echo' | 'shimmer';
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
  onAudioResponse?: (audio: ArrayBuffer) => void;
  onTranscript?: (text: string) => void;
}

export class RealtimeVoiceClient {
  private client: RealtimeClient | null = null;
  private config: VoiceClientConfig;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;

  constructor(config: VoiceClientConfig) {
    this.config = config;
  }

  async connect() {
    try {
      // Initialize WebRTC client (SDK auto-selects WebRTC for browser)
      this.client = new RealtimeClient({
        apiKey: this.config.apiKey,
      });

      // Configure session
      await this.client.updateSession({
        instructions: this.config.instructions,
        modalities: ['text', 'audio'],
        voice: this.config.voice || 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
      });

      // Set up event listeners
      this.setupEventListeners();

      // Get microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Connect audio
      await this.client.connect();
      this.client.sendAudio(this.mediaStream);

      this.config.onConnected?.();
    } catch (error) {
      this.config.onError?.(error as Error);
      throw error;
    }
  }

  private setupEventListeners() {
    if (!this.client) return;

    this.client.on('conversation.item.created', (event: any) => {
      if (event.item?.type === 'message' && event.item?.role === 'assistant') {
        // Handle assistant response
      }
    });

    this.client.on('response.audio.delta', (event: any) => {
      // Handle audio delta
      if (event.delta) {
        const audioBuffer = Buffer.from(event.delta, 'base64');
        this.config.onAudioResponse?.(audioBuffer.buffer);
      }
    });

    this.client.on('conversation.item.input_audio_transcription.completed', (event: any) => {
      if (event.transcript) {
        this.config.onTranscript?.(event.transcript);
      }
    });

    this.client.on('error', (event: any) => {
      this.config.onError?.(new Error(event.error?.message || 'Unknown error'));
    });
  }

  async disconnect() {
    try {
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }

      if (this.client) {
        await this.client.disconnect();
        this.client = null;
      }

      this.config.onDisconnected?.();
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  }

  isConnected(): boolean {
    return this.client !== null;
  }
}
