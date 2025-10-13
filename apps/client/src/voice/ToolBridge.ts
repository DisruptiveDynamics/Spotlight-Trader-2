export class ToolBridge {
  private ws?: WebSocket;
  private inflightRequests = new Map<string, (result: any) => void>();
  private backoffMs = 250;
  private reconnectTimer?: number;

  constructor(
    private url: string,
    private getToken: () => string
  ) {}

  connect() {
    const token = this.getToken();
    const wsUrl = `${this.url}?token=${encodeURIComponent(token)}`;
    
    console.log('[ToolBridge] Connecting to:', wsUrl);
    
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[ToolBridge] Connected');
      this.backoffMs = 250;
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        if (msg.type === 'tool.result') {
          const resolver = this.inflightRequests.get(msg.id);
          if (resolver) {
            this.inflightRequests.delete(msg.id);
            resolver(msg);
          }
        }
      } catch (err) {
        console.error('[ToolBridge] Failed to parse message:', err);
      }
    };

    this.ws.onclose = () => {
      console.log('[ToolBridge] Disconnected, reconnecting...');
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error('[ToolBridge] WebSocket error:', err);
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, Math.min(this.backoffMs *= 2, 5000));
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
    timeoutMs = 1200
  ): Promise<{ ok: boolean; output?: T; error?: string; latency_ms?: number }> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return { ok: false, error: 'Tool bridge not connected' };
    }

    const id = Math.random().toString(36).slice(2, 11);
    const request = {
      type: 'tool.exec',
      id,
      name,
      args,
    };

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.inflightRequests.delete(id);
        resolve({ ok: false, error: 'Tool execution timeout' });
      }, timeoutMs);

      this.inflightRequests.set(id, (result: any) => {
        clearTimeout(timeout);
        
        if (result.ok) {
          resolve({ 
            ok: true, 
            output: result.output, 
            latency_ms: result.latency_ms 
          });
        } else {
          resolve({ 
            ok: false, 
            error: result.error, 
            latency_ms: result.latency_ms 
          });
        }
      });

      this.ws!.send(JSON.stringify(request));
    });
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
