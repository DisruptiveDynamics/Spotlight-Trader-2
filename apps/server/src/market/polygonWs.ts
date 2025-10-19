import { websocketClient } from "@polygon.io/client-js";
import { validateEnv } from "@shared/env";
import { eventBus } from "./eventBus";
import { mockTickGenerator } from "./mockTickGenerator";
import { logger } from "@server/logger";

const env = validateEnv(process.env);

// [OBS] Feature flags for mock/replay modes
const FF_MOCK = process.env.FF_MOCK === "true";

export class PolygonWebSocket {
  private ws: ReturnType<typeof websocketClient> | null = null;
  private subscribedSymbols = new Set<string>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseBackoffMs = 1000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastMessageTime = 0;
  private isConnected = false;
  private useMockData = false;
  private useWebSocket = false; // Track if WebSocket is active (separate from mock mode)

  async connect() {
    try {
      // [ALWAYS-ON] Remove time-based gating - connect 24/7
      // If Polygon is closed, stream will be silent (which is fine)
      // Only use mock data if FF_MOCK flag is explicitly enabled
      if (FF_MOCK) {
        logger.info("FF_MOCK enabled - using mock tick generator");
        this.useMockData = true;
        this.useWebSocket = false;
        this.isConnected = true;
        this.resubscribe(); // Start mock tick generators
        return;
      }

      // Stock Advanced plan uses real-time feed
      const wsUrl = "wss://socket.polygon.io";
      logger.info("Connecting to Polygon real-time feed (always-on mode)");

      this.useMockData = false;
      this.useWebSocket = true;
      this.ws = websocketClient(env.POLYGON_API_KEY, wsUrl).stocks();

      if (this.ws) {
        const ws = this.ws as any;

        ws.onopen = () => {
          logger.info("Polygon WebSocket connected");
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.lastMessageTime = Date.now();
          this.startHeartbeat();

          // Stop mock generators when switching to real WebSocket data
          if (this.useWebSocket) {
            this.subscribedSymbols.forEach(symbol => {
              mockTickGenerator.stop(symbol);
            });
          }

          // Manually send auth message (library not doing it automatically)
          ws.send(JSON.stringify({ action: "auth", params: env.POLYGON_API_KEY }));

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
            logger.error({ err }, "Failed to parse Polygon message");
          }
        };

        ws.onerror = (error: any) => {
          logger.error({ error }, "Polygon WebSocket error");
        };

        ws.onclose = () => {
          logger.warn("Polygon WebSocket closed");
          this.isConnected = false;
          this.stopHeartbeat();
          this.reconnect();
        };
      }
    } catch (err) {
      logger.error({ err }, "Failed to connect to Polygon");
      this.reconnect();
    }
  }

  private handleMessage(msg: any) {
    if (msg.ev === "status") {
      logger.debug({ status: msg.status, message: msg.message }, "Polygon status");
      
      // Detect TRUE authentication failures only (not benign errors)
      const authFailed = msg.status === "auth_failed" || 
                        (msg.status === "error" && msg.message && (
                          msg.message.toLowerCase().includes("authentication") ||
                          msg.message.toLowerCase().includes("unauthorized") ||
                          msg.message.toLowerCase().includes("invalid api key")
                        ));
      
      if (authFailed) {
        logger.error("Polygon authentication failed - falling back to mock data");
        this.useMockData = true;
        this.useWebSocket = false;
        this.isConnected = false;
        
        // Close WebSocket and start mock generators
        if (this.ws) {
          (this.ws as any).close();
          this.ws = null;
        }
        
        // Start mock generators for all subscribed symbols
        this.subscribedSymbols.forEach(symbol => {
          mockTickGenerator.start(symbol);
        });
      }
      return;
    }

    if (msg.ev === "T") {
      logger.debug({ symbol: msg.sym, price: msg.p, size: msg.s }, "Polygon tick");
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

    if (this.useMockData || FF_MOCK) {
      // Start mock tick generator for this symbol (FF_MOCK enabled)
      mockTickGenerator.start(symbol);
      return;
    }

    if (this.isConnected && this.ws && this.useWebSocket) {
      (this.ws as any).send(
        JSON.stringify({
          action: "subscribe",
          params: `T.${symbol}`,
        }),
      );
    }
  }

  unsubscribe(symbol: string) {
    this.subscribedSymbols.delete(symbol);

    if (this.useMockData || FF_MOCK) {
      // Stop mock tick generator (FF_MOCK enabled)
      mockTickGenerator.stop(symbol);
      return;
    }

    if (this.isConnected && this.ws && this.useWebSocket) {
      (this.ws as any).send(
        JSON.stringify({
          action: "unsubscribe",
          params: `T.${symbol}`,
        }),
      );
    }
  }

  private resubscribe() {
    if (this.useMockData || FF_MOCK) {
      // Start mock generators for all subscribed symbols (FF_MOCK enabled)
      for (const symbol of this.subscribedSymbols) {
        mockTickGenerator.start(symbol);
      }
      return;
    }

    if (this.subscribedSymbols.size > 0 && this.ws && this.useWebSocket) {
      const params = Array.from(this.subscribedSymbols)
        .map((sym) => `T.${sym}`)
        .join(",");
      (this.ws as any).send(
        JSON.stringify({
          action: "subscribe",
          params,
        }),
      );
    }
  }

  private reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnection attempts reached");
      return;
    }

    const backoff = Math.min(this.baseBackoffMs * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(`Reconnecting in ${backoff}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => this.connect(), backoff);
  }

  private startHeartbeat() {
    // Don't need heartbeat for mock data
    if (this.useMockData || FF_MOCK) return;

    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected && !this.useMockData && !FF_MOCK) {
        const timeSinceLastMessage = Date.now() - this.lastMessageTime;

        if (timeSinceLastMessage > 60000) {
          logger.warn("No message received in 60s, reconnecting...");
          if (this.ws) {
            (this.ws as any).close();
          }
        } else {
          logger.debug("Polygon heartbeat");
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

    if (this.useMockData) {
      mockTickGenerator.stopAll();
    }

    if (this.ws) {
      (this.ws as any).close();
      this.ws = null;
    }
  }

  /**
   * Check if system is currently using mock data
   * Returns false during overnight hours - we still use Polygon REST API then
   */
  isUsingMockData(): boolean {
    return this.useMockData;
  }

  /**
   * Check if WebSocket is actively connected for real-time ticks
   */
  isUsingWebSocket(): boolean {
    return this.useWebSocket && this.isConnected;
  }
}

export const polygonWs = new PolygonWebSocket();
