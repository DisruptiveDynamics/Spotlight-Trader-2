import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";

import { ToolBridge } from "./ToolBridge";
import { toolSchemas } from "./toolSchemas";

// ============================================================================
// DIAGNOSTIC HELPERS - For detailed logging and error handling
// ============================================================================

type AnyObj = Record<string, any>;

function shortId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function safeJson(obj: any, len = 2000): string {
  try {
    const s = JSON.stringify(obj);
    return s.length > len ? s.slice(0, len) + '...<truncated>' : s;
  } catch (e) {
    return String(obj);
  }
}

async function sendStructuredErrorToSession(s: AnyObj, ev: AnyObj, err: Error): Promise<void> {
  try {
    const payload = {
      type: 'error',
      error: {
        message: 'Tool result submission failed',
        details: err?.message ?? String(err),
        eventId: ev?.id ?? ev?.callId ?? null,
      },
    };
    if (typeof s?.response?.create === 'function') {
      await s.response.create(payload);
      console.info('[diagnostic] Sent structured error via s.response.create', safeJson(payload));
    } else if (typeof s?.create === 'function') {
      await s.create(payload);
      console.info('[diagnostic] Sent structured error via s.create', safeJson(payload));
    } else {
      console.warn('[diagnostic] No session.create available to send structured error', Object.keys(s ?? {}));
    }
  } catch (sendErr) {
    console.error('[diagnostic] Failed to send structured error to session:', sendErr);
  }
}

// ============================================================================

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
        const callId = shortId();
        console.log(`[VOICE-DIAG-${callId}] 📞 Function call CREATED:`, {
          eventId: ev.id,
          toolName: ev.name,
          timestamp: new Date().toISOString(),
        });
        pendingCalls[ev.id] = { name: ev.name, argsJson: [] };
      });

      // Event listener 2: Arguments stream in chunks
      s.on?.("response.function_call.arguments.delta", (ev: { id: string; delta: string }) => {
        pendingCalls[ev.id]?.argsJson.push(ev.delta);
      });

      // Event listener 3: Arguments complete - execute tool and send result back
      s.on?.("response.function_call.completed", async (ev: { id: string }) => {
        const diagId = shortId();
        const call = pendingCalls[ev.id];
        if (!call) {
          console.error(`[VOICE-DIAG-${diagId}] ❌ No pending call for:`, ev.id);
          return;
        }

        console.log(`[VOICE-DIAG-${diagId}] ✅ Function call COMPLETED:`, {
          eventId: ev.id,
          toolName: call.name,
          timestamp: new Date().toISOString(),
        });

        // Parse arguments
        let args: any;
        try {
          args = JSON.parse(call.argsJson.join("") || "{}");
          console.log(`[VOICE-DIAG-${diagId}] 📋 Parsed args:`, safeJson(args, 500));
        } catch (e) {
          console.error(`[VOICE-DIAG-${diagId}] ❌ Bad tool args JSON:`, e);
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
          console.log(`[VOICE-DIAG-${diagId}] 🔧 Executing tool via ToolBridge:`, {
            toolName: call.name,
            args: safeJson(args, 300),
            timestamp: new Date().toISOString(),
          });

          // Adaptive per-tool timeouts for optimal performance
          const TOOL_TIMEOUTS: Record<string, number> = {
            // Micro-tools: Cache hits expected, ultra-fast
            get_last_price: 800,
            get_last_vwap: 800,
            get_last_ema: 1200, // Needs calculation
            // Chart data: Fast from bars1m buffer
            get_chart_snapshot: 1500,
            get_market_regime: 1500,
            // Complex analysis: Longer timeout
            propose_entry_exit: 2500,
            get_recommended_risk_box: 2500,
            generate_trade_plan: 3000,
            // Database queries: Medium timeout
            get_recent_journal: 2000,
            get_active_rules: 2000,
            get_recent_signals: 2000,
            search_playbook: 2000,
            search_glossary: 2000,
            // State-changing operations: Longer timeout
            evaluate_rules: 2500,
            log_journal_event: 2500,
          };

          const timeoutMs = TOOL_TIMEOUTS[call.name] ?? 2000;

          const bridgeResult = await this.toolBridge.exec(call.name, args, timeoutMs);

          if (bridgeResult.ok) {
            result = bridgeResult.output;
            console.log(`[VOICE-DIAG-${diagId}] ✅ Tool ${call.name} SUCCEEDED in ${bridgeResult.latency_ms}ms:`, {
              resultPreview: safeJson(result, 500),
              latency: bridgeResult.latency_ms,
            });
          } else {
            result = { error: bridgeResult.error || "Tool execution failed" };
            console.error(`[VOICE-DIAG-${diagId}] ❌ Tool ${call.name} FAILED:`, {
              error: bridgeResult.error,
              latency: bridgeResult.latency_ms,
            });
          }
        } catch (e: any) {
          result = { error: e?.message ?? "Tool execution failed" };
          console.error(`[VOICE-DIAG-${diagId}] ❌ Tool execution ERROR:`, e);
        }

        // Send result back to OpenAI with detailed logging
        const payload = { call_id: ev.id, output: JSON.stringify(result) };
        console.log(`[VOICE-DIAG-${diagId}] 📤 SUBMITTING result to OpenAI:`, {
          callId: ev.id,
          payloadSize: payload.output.length,
          payloadPreview: safeJson(result, 300),
          sessionShape: {
            hasResponse: !!s.response,
            hasFunctionCall: !!s.response?.function_call,
            hasOutput: !!s.response?.function_call?.output,
            hasCreate: typeof s.response?.function_call?.output?.create === 'function',
          },
        });

        try {
          await s.response?.function_call?.output?.create(payload);
          console.log(`[VOICE-DIAG-${diagId}] ✅ Result SUBMITTED successfully`);
        } catch (submitErr: any) {
          console.error(`[VOICE-DIAG-${diagId}] ❌ Result submission FAILED:`, {
            error: submitErr?.message || String(submitErr),
            errorType: submitErr?.constructor?.name,
            fullError: safeJson(submitErr, 1000),
          });
          throw submitErr;
        }

        // [CONTEXT REFRESH] Inject latest chart data before AI responds
        await this.refreshContext();

        // Tell the model it can continue producing its response
        await s.response?.create({});

        delete pendingCalls[ev.id];
        console.log(`[VOICE-DIAG-${diagId}] 🎉 Tool cycle complete for ${call.name}`);
      });

      // Add error listener
      s.on?.("error", (err: any) => {
        const diagId = shortId();
        console.error(`[VOICE-DIAG-${diagId}] 🔥 Session ERROR:`, {
          error: err,
          errorType: typeof err,
          errorKeys: err ? Object.keys(err) : [],
          fullError: safeJson(err, 2000),
          timestamp: new Date().toISOString(),
        });
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
