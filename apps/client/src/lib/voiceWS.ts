type VoiceHandler = {
  onAudioChunk?: (chunk: ArrayBuffer) => void;
  onControl?: (msg: unknown) => void;
  onOpen?: () => void;
  onClose?: (ev?: CloseEvent) => void;
  onError?: (err?: Event) => void;
  onMaxReconnects?: () => void; // Called when max reconnect attempts reached
};

interface ReconnectConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  maxAttempts: 10,
  baseDelay: 1000,      // 1 second
  maxDelay: 30000,      // 30 seconds
  backoffMultiplier: 2,
};

export function createVoiceWS(
  url: string, 
  handlers: VoiceHandler,
  reconnectConfig: ReconnectConfig = DEFAULT_RECONNECT_CONFIG
) {
  // Mutable reference to current WebSocket instance
  let currentWs: WebSocket;
  let pingTimer: number | undefined;
  let lastPongAt = Date.now();
  let reconnectAttempts = 0;
  let reconnectTimer: number | undefined;
  let manualClose = false;

  function connect() {
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    currentWs = ws; // Update mutable reference

    ws.onopen = () => {
      // Reset reconnect state on successful connection
      reconnectAttempts = 0;
      manualClose = false;
      lastPongAt = Date.now(); // Reset pong timestamp for fresh connection
      
      console.log("VoiceWS: connected successfully");
      handlers.onOpen?.();
      
      pingTimer = window.setInterval(() => {
        try {
          if (currentWs.readyState === WebSocket.OPEN) {
            currentWs.send(JSON.stringify({ type: "ping", ts: Date.now() }));
          }
          if (Date.now() - lastPongAt > 15000) {
            console.warn("VoiceWS: no pong for 15s, closing to reconnect");
            currentWs.close();
          }
        } catch (e) {
          console.error("VoiceWS ping error", e);
        }
      }, 5000);
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        try {
          const msg = JSON.parse(ev.data);
          if (msg?.type === "pong") lastPongAt = Date.now();
          handlers.onControl?.(msg);
        } catch {
          console.warn("VoiceWS: control parse error");
        }
        return;
      }

      if (ev.data instanceof ArrayBuffer) {
        handlers.onAudioChunk?.(ev.data);
        return;
      }

      // Fallback for Blob (convert to ArrayBuffer)
      if (ev.data instanceof Blob) {
        console.debug("VoiceWS: Received Blob (slower path), converting...");
        const reader = new FileReader();
        reader.onload = () => handlers.onAudioChunk?.(reader.result as ArrayBuffer);
        reader.onerror = () => console.error("VoiceWS: Blob conversion failed");
        reader.readAsArrayBuffer(ev.data);
      }
    };

    ws.onerror = (err) => {
      console.error("VoiceWS: error", err);
      handlers.onError?.(err);
    };

    ws.onclose = (ev) => {
      if (pingTimer) clearInterval(pingTimer);
      
      console.log(`VoiceWS: closed (code=${ev.code}, clean=${ev.wasClean}, manual=${manualClose})`);
      handlers.onClose?.(ev);

      // Only auto-reconnect if not manually closed
      if (!manualClose) {
        scheduleReconnect();
      }
    };
  }

  function scheduleReconnect() {
    // Clear any existing timer
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }

    if (reconnectAttempts >= reconnectConfig.maxAttempts) {
      console.error(`VoiceWS: max reconnect attempts (${reconnectConfig.maxAttempts}) reached, giving up`);
      handlers.onMaxReconnects?.();
      return;
    }

    const delay = Math.min(
      reconnectConfig.baseDelay * Math.pow(reconnectConfig.backoffMultiplier, reconnectAttempts),
      reconnectConfig.maxDelay
    );

    console.log(
      `VoiceWS: reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1}/${reconnectConfig.maxAttempts})`
    );

    reconnectAttempts++;
    reconnectTimer = window.setTimeout(() => {
      connect(); // Reconnect and update currentWs reference
    }, delay);
  }

  function send(data: ArrayBuffer | string, retryCount = 0) {
    const maxBuffered = 256 * 1024; // 256KB
    const maxRetries = 20; // 20 × 50ms = 1 second max wait

    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) {
      console.warn("VoiceWS: cannot send, socket not open");
      return;
    }

    if (currentWs.bufferedAmount > maxBuffered) {
      if (retryCount >= maxRetries) {
        console.error("VoiceWS: backpressure timeout, closing connection");
        currentWs.close();
        return;
      }
      
      if (retryCount === 0) {
        console.warn(`VoiceWS: backpressure detected, buffered=${currentWs.bufferedAmount} bytes`);
      }
      
      setTimeout(() => send(data, retryCount + 1), 50);
      return;
    }

    try {
      if (typeof data === "string") currentWs.send(data);
      else currentWs.send(data);
    } catch (e) {
      console.error("VoiceWS send failed", e);
    }
  }

  function close() {
    manualClose = true; // Prevent auto-reconnect
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    if (currentWs) {
      currentWs.close();
    }
  }

  // Initial connection
  connect();

  // Return API that always uses current WebSocket reference
  return { 
    get ws() { return currentWs; },
    send, 
    close 
  };
}
