export class ToolBridge {
  private ws: WebSocket | undefined;
  private inflightRequests = new Map<string, (result: any) => void>();
  private backoffMs = 250;
  private reconnectTimer: number | undefined;
  
  // [RESILIENCE] Circuit breaker state per tool
  private circuitState = new Map<string, {
    failures: number;
    openUntil: number | null;
  }>();
  
  // [RESILIENCE] Cache for last successful result per tool
  private cache = new Map<string, { output: any; ts: number }>();

  constructor(
    private url: string,
    private getToken: () => string,
  ) {}

  connect() {
    const token = this.getToken();
    const wsUrl = `${this.url}?token=${encodeURIComponent(token)}`;

    console.log("[ToolBridge] Connecting to:", wsUrl);

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log("[ToolBridge] Connected");
      this.backoffMs = 250;
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "tool.result") {
          const resolver = this.inflightRequests.get(msg.id);
          if (resolver) {
            this.inflightRequests.delete(msg.id);
            resolver(msg);
          }
        }
      } catch (err) {
        console.error("[ToolBridge] Failed to parse message:", err);
      }
    };

    this.ws.onclose = () => {
      console.log("[ToolBridge] Disconnected, reconnecting...");
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error("[ToolBridge] WebSocket error:", err);
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;

    this.reconnectTimer = window.setTimeout(
      () => {
        this.reconnectTimer = undefined;
        this.connect();
      },
      Math.min((this.backoffMs *= 2), 5000),
    );
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
  }

  async exec<T = unknown>(
    name: string,
    args: Record<string, unknown>,
    timeoutMs = 1200,
    corrId?: string, // [OBS] Optional correlation ID for tracing
  ): Promise<{ ok: boolean; output?: T; error?: string; latency_ms?: number; corrId?: string }> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return { ok: false, error: "Tool bridge not connected" };
    }

    const id = Math.random().toString(36).slice(2, 11);
    const request = {
      type: "tool.exec",
      id,
      name,
      args,
      corrId, // [OBS] Include correlation ID in request
    };

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.inflightRequests.delete(id);
        resolve({ ok: false, error: "Tool execution timeout" });
      }, timeoutMs);

      this.inflightRequests.set(id, (result: any) => {
        clearTimeout(timeout);

        if (result.ok) {
          resolve({
            ok: true,
            output: result.output,
            latency_ms: result.latency_ms,
            corrId: result.corrId, // [OBS] Return corrId from server
          });
        } else {
          resolve({
            ok: false,
            error: result.error,
            latency_ms: result.latency_ms,
            corrId: result.corrId, // [OBS] Return corrId from server
          });
        }
      });

      this.ws!.send(JSON.stringify(request));
    });
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // [RESILIENCE] Execute tool with timeout, retry, circuit breaker, and fallback
  async execWithResilience<T = unknown>(
    name: string,
    args: Record<string, unknown>,
    options: {
      timeoutMs?: number;
      retries?: number;
      backoffBaseMs?: number;
    } = {},
  ): Promise<{ ok: boolean; output?: T; error?: string; latency_ms?: number; cached?: boolean; corrId?: string }> {
    const { timeoutMs = 700, retries = 2, backoffBaseMs = 200 } = options;
    
    // [OBS] Generate correlation ID for end-to-end tracing
    const corrId = Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
    
    // Check circuit breaker
    const circuit = this.circuitState.get(name);
    if (circuit?.openUntil && Date.now() < circuit.openUntil) {
      // Circuit is open, return cached value if available
      const cached = this.cache.get(name);
      if (cached) {
        const ageSeconds = Math.floor((Date.now() - cached.ts) / 1000);
        return {
          ok: true,
          output: cached.output,
          cached: true,
          error: `Circuit open, using cached value (${ageSeconds}s old)`,
          corrId,
        };
      }
      return { ok: false, error: "Circuit breaker open, no cached value available", corrId };
    }
    
    // Attempt execution with retries
    for (let attempt = 0; attempt <= retries; attempt++) {
      const result = await this.exec<T>(name, args, timeoutMs, corrId); // [OBS] Pass corrId
      
      if (result.ok) {
        // Success - reset circuit and cache result
        this.circuitState.set(name, { failures: 0, openUntil: null });
        this.cache.set(name, { output: result.output, ts: Date.now() });
        return result;
      }
      
      // Failure - check if we should retry
      if (attempt < retries) {
        // Add jittered backoff before retry
        const jitter = Math.random() * backoffBaseMs;
        const delay = backoffBaseMs * Math.pow(2, attempt) + jitter;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Final failure - update circuit breaker
      const state = this.circuitState.get(name) || { failures: 0, openUntil: null };
      state.failures++;
      
      if (state.failures >= 5) {
        // Open circuit for 20 seconds
        state.openUntil = Date.now() + 20000;
        console.warn(`[ToolBridge] Circuit opened for ${name} after ${state.failures} failures`);
      }
      
      this.circuitState.set(name, state);
      
      // Return cached value if available
      const cached = this.cache.get(name);
      if (cached) {
        const ageSeconds = Math.floor((Date.now() - cached.ts) / 1000);
        return {
          ok: true,
          output: cached.output,
          cached: true,
          error: `Failed, using cached value (${ageSeconds}s old): ${result.error}`,
          corrId,
        };
      }
      
      return { ...result, corrId }; // [OBS] Include corrId in final result
    }
    
    // Should never reach here
    return { ok: false, error: "Unexpected retry loop exit" };
  }
}
