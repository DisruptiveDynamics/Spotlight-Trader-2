import { websocketClient } from '@polygon.io/client-js';
import { validateEnv } from '@shared/env';
import { eventBus } from './eventBus';

const env = validateEnv(process.env);

export class PolygonWebSocket {
  private ws: ReturnType<typeof websocketClient> | null = null;
  private subscribedSymbols = new Set<string>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseBackoffMs = 1000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastMessageTime = 0;
  private isConnected = false;

  async connect() {
    try {
      // Stock Advanced plan uses real-time feed
      const wsUrl = 'wss://socket.polygon.io';
      console.log(`📡 Connecting to Polygon real-time feed`);

      this.ws = websocketClient(env.POLYGON_API_KEY, wsUrl).stocks();

      if (this.ws) {
        const ws = this.ws as any;

        ws.onopen = () => {
          console.log('✅ Polygon WebSocket connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.lastMessageTime = Date.now();
          this.startHeartbeat();
          
          // Manually send auth message (library not doing it automatically)
          ws.send(JSON.stringify({ action: 'auth', params: env.POLYGON_API_KEY }));
          
          this.resubscribe();
        };

        ws.onmessage = (event: any) => {
          this.lastMessageTime = Date.now();
          
          try {
            const response = event.data || event.response;
            if (!response) return;
            const messages = JSON.parse(response);
            messages.forEach((msg: any) => this.handleMessage(msg));
          } catch (err) {
            console.error('Failed to parse Polygon message:', err);
          }
        };

        ws.onerror = (error: any) => {
          console.error('Polygon WebSocket error:', error);
        };

        ws.onclose = () => {
          console.warn('Polygon WebSocket closed');
          this.isConnected = false;
          this.stopHeartbeat();
          this.reconnect();
        };
      }
    } catch (err) {
      console.error('Failed to connect to Polygon:', err);
      this.reconnect();
    }
  }

  private handleMessage(msg: any) {
    if (msg.ev === 'status') {
      console.log('Polygon status:', msg.message);
      return;
    }

    if (msg.ev === 'T') {
      const tick: any = {
        ts: msg.t,
        price: msg.p,
        size: msg.s,
      };
      eventBus.emit(`tick:${msg.sym}` as const, tick);
    }
  }

  subscribe(symbol: string) {
    this.subscribedSymbols.add(symbol);
    if (this.isConnected && this.ws) {
      (this.ws as any).send(
        JSON.stringify({
          action: 'subscribe',
          params: `T.${symbol}`,
        })
      );
    }
  }

  unsubscribe(symbol: string) {
    this.subscribedSymbols.delete(symbol);
    if (this.isConnected && this.ws) {
      (this.ws as any).send(
        JSON.stringify({
          action: 'unsubscribe',
          params: `T.${symbol}`,
        })
      );
    }
  }

  private resubscribe() {
    if (this.subscribedSymbols.size > 0 && this.ws) {
      const params = Array.from(this.subscribedSymbols)
        .map((sym) => `T.${sym}`)
        .join(',');
      (this.ws as any).send(
        JSON.stringify({
          action: 'subscribe',
          params,
        })
      );
    }
  }

  private reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    const backoff = Math.min(this.baseBackoffMs * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(`Reconnecting in ${backoff}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => this.connect(), backoff);
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        const timeSinceLastMessage = Date.now() - this.lastMessageTime;
        
        if (timeSinceLastMessage > 60000) {
          console.warn('No message received in 60s, reconnecting...');
          if (this.ws) {
            (this.ws as any).close();
          }
        } else {
          console.log('🫀 Polygon heartbeat');
        }
      }
    }, 30000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  close() {
    this.stopHeartbeat();
    if (this.ws) {
      (this.ws as any).close();
      this.ws = null;
    }
  }
}

export const polygonWs = new PolygonWebSocket();
