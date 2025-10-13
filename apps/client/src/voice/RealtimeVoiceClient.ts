import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import { ToolBridge } from "./ToolBridge";
import { toolSchemas } from "./toolSchemas";

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

    // Configure agent with tools upfront (SDK requires this)
    this.agent = new RealtimeAgent({
      name: "Nexa",
      instructions: config.instructions,
      voice: config.voice || "alloy",
      tools: toolSchemas as any, // Pass tool schemas to agent constructor
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

      // Connect to OpenAI with ephemeral token using correct API
      const session = new RealtimeSession(this.agent);
      await session.connect({ apiKey: token });
      this.session = session;

      console.log("[RealtimeVoiceClient] Agent configured with", toolSchemas.length, "tools");

      // Access session for event listeners
      const s = this.session as any;

      // Track pending function calls
      type PendingCall = { name: string; argsJson: string[] };
      const pendingCalls: Record<string, PendingCall> = {};

      // Event listener 1: Function call created
      s.on?.("response.function_call.created", (ev: { id: string; name: string }) => {
        console.log("[RealtimeVoiceClient] Function call created:", ev.name, ev.id);
        pendingCalls[ev.id] = { name: ev.name, argsJson: [] };
      });

      // Event listener 2: Arguments stream in chunks
      s.on?.("response.function_call.arguments.delta", (ev: { id: string; delta: string }) => {
        pendingCalls[ev.id]?.argsJson.push(ev.delta);
      });

      // Event listener 3: Arguments complete - execute tool and send result back
      s.on?.("response.function_call.completed", async (ev: { id: string }) => {
        const call = pendingCalls[ev.id];
        if (!call) {
          console.error("[RealtimeVoiceClient] No pending call for:", ev.id);
          return;
        }

        console.log("[RealtimeVoiceClient] Function call completed:", call.name, ev.id);

        // Parse arguments
        let args: any;
        try {
          args = JSON.parse(call.argsJson.join("") || "{}");
          console.log("[RealtimeVoiceClient] Parsed args:", args);
        } catch (e) {
          console.error("[RealtimeVoiceClient] Bad tool args JSON:", e);
          // Send error back to Realtime
          await s.response?.function_call?.output?.create({
            call_id: ev.id,
            output: JSON.stringify({ error: "Bad tool args JSON" }),
          });
          delete pendingCalls[ev.id];
          return;
        }

        // Execute tool via ToolBridge
        if (!this.toolBridge) {
          console.error("[RealtimeVoiceClient] Tool bridge not connected");
          await s.response?.function_call?.output?.create({
            call_id: ev.id,
            output: JSON.stringify({ error: "Tool bridge not connected" }),
          });
          delete pendingCalls[ev.id];
          return;
        }

        let result: any;
        try {
          console.log(`[RealtimeVoiceClient] Executing tool via bridge: ${call.name}`, args);
          
          // Smart timeout: 1200ms for micro-tools, 2000ms for snapshot/analysis
          const isMicroTool = call.name.startsWith("get_last_");
          const timeoutMs = isMicroTool ? 1200 : 2000;
          
          const bridgeResult = await this.toolBridge.exec(call.name, args, timeoutMs);

          if (bridgeResult.ok) {
            result = bridgeResult.output;
            console.log(`[RealtimeVoiceClient] Tool ${call.name} succeeded in ${bridgeResult.latency_ms}ms:`, result);
          } else {
            result = { error: bridgeResult.error || "Tool execution failed" };
            console.error(`[RealtimeVoiceClient] Tool ${call.name} failed:`, bridgeResult.error);
          }
        } catch (e: any) {
          result = { error: e?.message ?? "Tool execution failed" };
          console.error(`[RealtimeVoiceClient] Tool execution error:`, e);
        }

        // Send result back to Realtime
        await s.response?.function_call?.output?.create({
          call_id: ev.id,
          output: JSON.stringify(result),
        });

        // Tell the model it can continue producing its response
        await s.response?.create({});

        delete pendingCalls[ev.id];
        console.log(`[RealtimeVoiceClient] Sent tool result for ${call.name}`);
      });

      // Add error listener
      s.on?.("error", (err: any) => {
        console.error("[RealtimeVoiceClient] Session error:", err);
        this.config.onError?.(err);
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
}
