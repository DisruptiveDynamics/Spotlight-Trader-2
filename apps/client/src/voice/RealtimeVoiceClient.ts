import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";

import { ToolBridge } from "./ToolBridge";
import { createVoiceTools } from "./toolsWithExecute";

interface VoiceClientConfig {
  instructions: string;
  voice?: "alloy" | "echo" | "shimmer" | "fable" | "onyx" | "nova";
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
  onMuteChange?: (isMuted: boolean) => void;
}

type ConnectionState = "idle" | "connecting" | "connected" | "error";

export class RealtimeVoiceClient {
  private session: RealtimeSession<unknown> | null = null;
  private config: VoiceClientConfig;
  private agent: RealtimeAgent;
  private connectionState: ConnectionState = "idle";
  private isMuted = false;
  private sessionId: string | null = null;
  private toolBridge: ToolBridge | null = null;

  constructor(config: VoiceClientConfig) {
    this.config = config;

    // Agent will be configured with tools after ToolBridge is ready
    this.agent = new RealtimeAgent({
      name: "Nexa",
      instructions: config.instructions,
      voice: config.voice || "alloy",
      tools: [], // Will be set after ToolBridge connects
    });
  }

  async connect(): Promise<void> {
    if (this.connectionState === "connected") {
      console.warn("[RealtimeVoiceClient] Already connected");
      return;
    }

    try {
      this.connectionState = "connecting";

      const tokenRes = await fetch("/api/voice/token", {
        method: "POST",
        credentials: "include",
      });

      if (!tokenRes.ok) {
        const errorText = await tokenRes.text();
        console.error(
          `[RealtimeVoiceClient] Token request failed with status ${tokenRes.status}:`,
          errorText,
        );
        throw new Error(`Failed to get voice token: ${tokenRes.status} ${errorText}`);
      }

      const { token, toolsBridgeToken, sessionId } = await tokenRes.json();
      this.sessionId = sessionId;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const toolBridgeUrl = `${protocol}//${window.location.host}/ws/tools`;

      this.toolBridge = new ToolBridge(toolBridgeUrl, () => toolsBridgeToken);
      this.toolBridge.connect();

      // Create SDK tools with execute functions that call ToolBridge
      const voiceTools = createVoiceTools(this.toolBridge);
      
      // Recreate agent with tools now that ToolBridge is ready
      this.agent = new RealtimeAgent({
        name: "Nexa",
        instructions: this.config.instructions,
        voice: this.config.voice || "alloy",
        tools: voiceTools, // SDK tools with execute functions
      });

      // Connect to OpenAI with ephemeral token
      const session = new RealtimeSession(this.agent);
      await session.connect({ apiKey: token });
      this.session = session;

      console.log("[RealtimeVoiceClient] Agent configured with", voiceTools.length, "tools (SDK-managed)");

      // Access session for status logging
      const s = this.session as any;

      // Add error listener for debugging
      s.on?.("error", (err: any) => {
        console.error("[RealtimeVoiceClient] Session error:", {
          error: err,
          message: err?.message,
          timestamp: new Date().toISOString(),
        });
        this.config.onError?.(err);
      });

      // Optional: Log when tools are called (for debugging)
      s.on?.("response.function_call.created", (ev: { id: string; name: string }) => {
        console.log("[RealtimeVoiceClient] Tool called:", ev.name);
      });

      this.connectionState = "connected";
      this.config.onConnected?.();

      console.log("[RealtimeVoiceClient] Connected successfully");
    } catch (error) {
      this.connectionState = "error";
      this.config.onError?.(error as Error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.session) {
      const s = this.session as any;
      if (typeof s.disconnect === "function") {
        await s.disconnect();
      }
      this.session = null;
    }

    if (this.toolBridge) {
      this.toolBridge.disconnect();
      this.toolBridge = null;
    }

    this.connectionState = "idle";
    this.config.onDisconnected?.();
  }

  async toggleMute(): Promise<void> {
    if (!this.session) return;

    this.isMuted = !this.isMuted;
    const s = this.session as any;

    if (this.isMuted) {
      if (typeof s.mute === "function") {
        await s.mute();
      }
    } else {
      if (typeof s.unmute === "function") {
        await s.unmute();
      }
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
      throw new Error("Not connected");
    }

    const s = this.session as any;
    if (typeof s.sendUserMessage === "function") {
      await s.sendUserMessage({
        type: "input_text",
        text,
      });
    }
  }

  updateInstructions(instructions: string): void {
    this.config.instructions = instructions;
    if (this.session) {
      const s = this.session as any;
      if (typeof s.update === "function") {
        s.update({
          instructions,
        });
      }
    }
  }

  private async refreshContext(): Promise<void> {
    if (!this.session || !this.toolBridge) return;

    try {
      // Get current chart state
      const { useChartState } = await import("../state/chartState");
      const { active } = useChartState.getState();

      // Fetch latest price via tool bridge
      const priceResult = await this.toolBridge.exec(
        "get_last_price",
        { symbol: active.symbol },
        1000,
      );

      if (priceResult.ok && priceResult.output) {
        const output = priceResult.output as { value: number; symbol: string; ts: number };
        const contextUpdate = `Current ${active.symbol} price: $${output.value} (timeframe: ${active.timeframe})`;
        
        // Update session context with fresh data
        const s = this.session as any;
        if (typeof s.update === "function") {
          s.update({
            instructions: `${this.config.instructions}\n\n[LIVE CONTEXT] ${contextUpdate}`,
          });
        }

        console.log(`[RealtimeVoiceClient] Context refreshed: ${contextUpdate}`);
      }
    } catch (err) {
      console.warn("[RealtimeVoiceClient] Context refresh failed:", err);
      // Don't throw - context refresh is best-effort
    }
  }
}
