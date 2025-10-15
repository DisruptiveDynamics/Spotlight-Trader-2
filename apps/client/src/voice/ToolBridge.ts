export type ExecOpts = { timeoutMs?: number; retries?: number; backoffBaseMs?: number; corrId?: string };

type Circuit = { failures: number; openUntil: number | null };
type CacheEntry = { output: any; ts: number };

export class ToolBridge {
  private ws: WebSocket | undefined;
  private inflight = new Map<string, (result: any) => void>();
  private inflightTimers = new Map<string, number>();
  private backoffMs = 250;
  private reconnectTimer: number | undefined;

  // Resilience
  private circuit = new Map<string, Circuit>();
  private cache = new Map<string, CacheEntry>();

  // Optional HTTP fallback base (e.g., "/api/tools"); leave empty to skip REST fallback
  constructor(private url: string, private getToken: () => string, private httpFallbackBase = "") {}

  // Connection management
  connect() {
    const token = this.getToken();
    const wsUrl = `${this.url}?token=${encodeURIComponent(token)}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.backoffMs = 250;
      // no-op; ready
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "tool.result" && msg.id) {
          const resolve = this.inflight.get(msg.id);
          if (resolve) {
            this.clearInflight(msg.id);
            resolve(msg);
          }
        }
      } catch (err) {
        // swallow; malformed payloads shouldn't break the bridge
        console.error("[ToolBridge] parse error:", err);
      }
    };

    this.ws.onclose = () => {
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error("[ToolBridge] ws error:", err);
    };
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    for (const id of this.inflightTimers.keys()) this.clearInflight(id);
    this.inflight.clear();

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = undefined;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, Math.min((this.backoffMs *= 2), 5000));
  }

  private isOpen() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  private nextId() {
    return Math.random().toString(36).slice(2, 11);
  }

  // Circuit breaker helpers
  private getCircuit(name: string): Circuit {
    const now = Date.now();
    const entry = this.circuit.get(name) || { failures: 0, openUntil: null };
    if (entry.openUntil && entry.openUntil <= now) {
      // half-open reset
      entry.failures = 0;
      entry.openUntil = null;
      this.circuit.set(name, entry);
    }
    return entry;
  }

  private recordToolResult(name: string, ok: boolean) {
    const entry = this.getCircuit(name);
    if (ok) {
      entry.failures = 0;
      entry.openUntil = null;
    } else {
      entry.failures += 1;
      if (entry.failures >= 5 && !entry.openUntil) {
        // open for 20s
        entry.openUntil = Date.now() + 20_000;
      }
    }
    this.circuit.set(name, entry);
  }

  private isCircuitOpen(name: string) {
    const entry = this.getCircuit(name);
    return !!entry.openUntil && entry.openUntil > Date.now();
  }

  private clearInflight(id: string) {
    const t = this.inflightTimers.get(id);
    if (t) {
      clearTimeout(t);
      this.inflightTimers.delete(id);
    }
    this.inflight.delete(id);
  }

  // Core WS exec with timeout; returns raw server envelope { ok, output?, error?, latency_ms?, corrId? }
  async exec<T = unknown>(
    name: string,
    args: Record<string, unknown>,
    timeoutMs = 1500,
    corrId?: string,
  ): Promise<{ ok: boolean; output?: T; error?: string; latency_ms?: number; corrId?: string }> {
    // If WS not open, optionally try REST fallback
    if (!this.isOpen()) {
      if (this.httpFallbackBase) {
        try {
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), timeoutMs);
          const res = await fetch(`${this.httpFallbackBase}/${encodeURIComponent(name)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ args, corrId }),
            signal: ctrl.signal,
          });
          clearTimeout(to);
          if (res.ok) {
            const json = await res.json();
            this.recordToolResult(name, true);
            if (json?.output !== undefined) this.cache.set(name, { output: json.output, ts: Date.now() });
            return { ok: true, ...json };
          }
          this.recordToolResult(name, false);
          return { ok: false, error: `${res.status} ${res.statusText}`, corrId };
        } catch (e: any) {
          this.recordToolResult(name, false);
          return { ok: false, error: e?.message || "fetch_error", corrId };
        }
      }
      return { ok: false, error: "Tool bridge not connected", corrId };
    }

    const id = this.nextId();
    const started = performance.now();
    const payload = { type: "tool.exec", id, name, args, corrId };

    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.clearInflight(id);
        this.recordToolResult(name, false);
        resolve({ ok: false, error: "Tool execution timeout", corrId });
      }, timeoutMs);

      this.inflightTimers.set(id, timer);
      this.inflight.set(id, (msg: any) => {
        const latency_ms = typeof msg.latency_ms === "number" ? msg.latency_ms : Math.round(performance.now() - started);
        const ok = !!msg.ok;
        this.recordToolResult(name, ok);
        if (ok && msg.output !== undefined) {
          this.cache.set(name, { output: msg.output, ts: Date.now() });
        }
        resolve({ ok, output: msg.output, error: msg.error, latency_ms, corrId: msg.corrId ?? corrId });
      });

      try {
        this.ws!.send(JSON.stringify(payload));
      } catch (e: any) {
        this.clearInflight(id);
        this.recordToolResult(name, false);
        resolve({ ok: false, error: e?.message || "ws_send_failed", corrId });
      }
    });
  }

  // Resilient exec: timeout → retries (with jittered backoff) → breaker → cached fallback
  async execWithResilience<T = unknown>(
    name: string,
    args: Record<string, unknown>,
    opts: ExecOpts = {},
  ): Promise<{ ok: boolean; output?: T; error?: string; latency_ms?: number; corrId?: string; cached?: boolean }> {
    const timeoutMs = opts.timeoutMs ?? 1500;
    const retries = opts.retries ?? 2;
    const backoffBaseMs = opts.backoffBaseMs ?? 250;
    const corrId = opts.corrId;

    if (this.isCircuitOpen(name)) {
      const cached = this.cache.get(name);
      if (cached) return { ok: true, output: cached.output as T, latency_ms: 0, corrId, cached: true };
      return { ok: false, error: "circuit_open", corrId };
    }

    let attempt = 0;
    let lastErr: string | undefined;
    let lastLatency: number | undefined;

    while (attempt <= retries) {
      const res = await this.exec<T>(name, args, timeoutMs, corrId);
      if (res.ok) return res;
      lastErr = res.error;
      lastLatency = res.latency_ms;
      attempt++;
      if (attempt > retries) break;
      const jitter = Math.random() * 0.2 + 0.9;
      await new Promise((r) => setTimeout(r, backoffBaseMs * 2 ** (attempt - 1) * jitter));
    }

    // Fallback to last known good
    const cached = this.cache.get(name);
    if (cached) return { ok: true, output: cached.output as T, latency_ms: lastLatency, corrId, cached: true };
    return { ok: false, error: lastErr ?? "tool_exec_failed", corrId };
  }
}
