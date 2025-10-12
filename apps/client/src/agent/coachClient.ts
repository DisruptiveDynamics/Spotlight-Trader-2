export function connectCoachStream(onMessage: (m: any) => void) {
  const es = new EventSource('/api/agent/stream');
  es.addEventListener('coach', (ev) => {
    try { onMessage(JSON.parse((ev as MessageEvent).data)); } catch {}
  });
  return () => es.close();
}

export async function pushLatency(rtt: number, sseReconnects?: number) {
  await fetch('/api/agent/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'latency', rtt, sseReconnects }),
  });
}
