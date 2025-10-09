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
  private isConnected = false;

  async connect() {
    try {
      const wsUrl = env.NODE_ENV === 'production' 
        ? 'wss://socket.polygon.io' 
        : 'wss://delayed.polygon.io';

      this.ws = websocketClient(env.POLYGON_API_KEY, wsUrl).stocks();

      this.ws.onopen = () => {
        console.log('✅ Polygon WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.resubscribe();
      };

      this.ws.onmessage = ({ response }) => {
        try {
          const messages = JSON.parse(response);
          messages.forEach((msg: any) => this.handleMessage(msg));
        } catch (err) {
          console.error('Failed to parse Polygon message:', err);
        }
      };

      this.ws.onerror = (error: any) => {
        console.error('Polygon WebSocket error:', error);
      };

      this.ws.onclose = () => {
        console.warn('Polygon WebSocket closed');
        this.isConnected = false;
        this.stopHeartbeat();
        this.reconnect();
      };
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
      const tick = {
        ts: msg.t,
        price: msg.p,
        size: msg.s,
        side: undefined as 'buy' | 'sell' | undefined,
      };
      eventBus.emit(`tick:${msg.sym}` as const, tick);
    }
  }

  subscribe(symbol: string) {
    this.subscribedSymbols.add(symbol);
    if (this.isConnected && this.ws) {
      this.ws.send({
        action: 'subscribe',
        params: `T.${symbol}`,
      });
    }
  }

  unsubscribe(symbol: string) {
    this.subscribedSymbols.delete(symbol);
    if (this.isConnected && this.ws) {
      this.ws.send({
        action: 'unsubscribe',
        params: `T.${symbol}`,
      });
    }
  }

  private resubscribe() {
    if (this.subscribedSymbols.size > 0 && this.ws) {
      const params = Array.from(this.subscribedSymbols)
        .map((sym) => `T.${sym}`)
        .join(',');
      this.ws.send({
        action: 'subscribe',
        params,
      });
    }
  }

  private reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    const backoff = Math.min(
      this.baseBackoffMs * Math.pow(2, this.reconnectAttempts),
      30000
    );
    this.reconnectAttempts++;

    console.log(`Reconnecting in ${backoff}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => this.connect(), backoff);
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        console.log('🫀 Polygon heartbeat');
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
      this.ws.close();
      this.ws = null;
    }
  }
}

export const polygonWs = new PolygonWebSocket();
