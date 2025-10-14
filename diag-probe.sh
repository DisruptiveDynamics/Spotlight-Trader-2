#!/usr/bin/env bash
set -euo pipefail
API_PORT="${API_PORT:-4000}"
API_ORIGIN="http://127.0.0.1:${API_PORT}"
SSE_PATH="${SSE_PATH:-/realtime/sse}"
VOICE_WS_URL="${VOICE_WS_URL:-ws://127.0.0.1:${API_PORT}/ws/realtime}"
LOG_DIR="./.diag"; LOG_FILE="${LOG_DIR}/api.debug.log"; mkdir -p "${LOG_DIR}"

echo "== health =="
time curl -fsS "${API_ORIGIN}/health" || echo "(no /health endpoint)"
echo

echo "== sse =="
SSE_URL="${API_ORIGIN}${SSE_PATH}"
curl -N "${SSE_URL}" 2>/dev/null | awk '
  BEGIN { c=0; start=systime(); print "  [SSE] connected at " strftime() }
  { print "  [" strftime() "] " $0;
    if ($0 ~ /^event: (bootstrap|seed)/) c++;
    if (c>=2) { print "  [SSE] got 2 events in " (systime()-start) "s"; exit 0 }
  }' || echo "  (SSE: missing bootstrap/seed quickly)"
echo

echo "== voice-ws =="
node - <<'NODE'
const url = process.env.VOICE_WS_URL;
(async () => {
  if (!url) { console.error("VOICE_WS_URL not set"); process.exit(1); }
  const { WebSocket } = await import('ws');
  const t0 = Date.now();
  const ws = new WebSocket(url);
  ws.on('open', () => {
    console.log(`[WS] open in ${Date.now()-t0} ms -> ${url}`);
    try { ws.send(JSON.stringify({ type:"ping", ts: Date.now() })); } catch {}
    setTimeout(() => ws.close(), 200);
  });
  ws.on('error', e => {
    console.error(`[WS] error after ${Date.now()-t0} ms:`, e?.message || e);
    process.exitCode = 1;
  });
})();
NODE
echo

echo "== grep server logs (if present) =="
# If your server tees logs to .diag/api.debug.log, surface common issues
if [[ -f .diag/api.debug.log ]]; then
  if command -v rg >/dev/null; then GREP=rg; else GREP="grep -R"; fi
  $GREP -nE "ToolError|Session error|server_error|timeout|ECONN|empty_buffer|Waiting for data|Circuit|Unhandled|Rate limit" ".diag/api.debug.log" || true
else
  echo "(no .diag/api.debug.log found)"
fi
