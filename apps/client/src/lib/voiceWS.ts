type VoiceHandler = {
  onAudioChunk?: (chunk: ArrayBuffer) => void;
  onControl?: (msg: unknown) => void;
  onOpen?: () => void;
  onClose?: (ev?: CloseEvent) => void;
  onError?: (err?: Event) => void;
};

export function createVoiceWS(url: string, handlers: VoiceHandler) {
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";

  let pingTimer: number | undefined;
  let lastPongAt = Date.now();

  ws.onopen = () => {
    handlers.onOpen?.();
    pingTimer = window.setInterval(() => {
      try {
        ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
        if (Date.now() - lastPongAt > 15000) {
          console.warn("VoiceWS: no pong, closing to reconnect");
          ws.close();
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

    const reader = new FileReader();
    reader.onload = () => handlers.onAudioChunk?.(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(ev.data as Blob);
  };

  ws.onerror = (err) => handlers.onError?.(err);
  ws.onclose = (ev) => {
    if (pingTimer) clearInterval(pingTimer);
    handlers.onClose?.(ev);
  };

  function send(data: ArrayBuffer | string) {
    const maxBuffered = 256 * 1024;
    if (ws.bufferedAmount > maxBuffered) {
      setTimeout(() => send(data), 50);
      return;
    }
    try {
      if (typeof data === "string") ws.send(data);
      else ws.send(data);
    } catch (e) {
      console.error("VoiceWS send failed", e);
    }
  }

  return { ws, send, close: () => ws.close() };
}
