#!/usr/bin/env bash
set -euo pipefail

API_PORT="${API_PORT:-4000}"
WEB_PORT="${VITE_PORT:-5173}"
API_ORIGIN="http://127.0.0.1:${API_PORT}"
SSE_PATH="${SSE_PATH:-/realtime/sse}"
VOICE_WS_URL="${VOICE_WS_URL:-ws://127.0.0.1:${API_PORT}/ws/realtime}"
LOG_DIR="./.diag"; LOG_FILE="${LOG_DIR}/api.debug.log"; mkdir -p "${LOG_DIR}"

echo "== env =="
( printenv | grep -E 'HISTORY_INIT_LIMIT|HISTORY_INIT_TIMEFRAME|TOOL_TIMEOUT_MS|API_PORT|VITE_PORT' ) || true
echo

DEBUG="${DEBUG:-Realtime*,Voice*,Tool*,SSE*,History*,Market*}"
LOG_LEVEL="${LOG_LEVEL:-debug}"
NODE_OPTIONS="--trace-warnings --unhandled-rejections=strict"

# Start API only (isolate server); adjust filter if your workspace name differs
( export DEBUG LOG_LEVEL NODE_OPTIONS API_PORT WEB_PORT
  pnpm --filter @spotlight/server dev 2>&1 | tee "${LOG_FILE}" ) &
API_PID=$!

sleep 3

echo "== health =="
time curl -fsS "${API_ORIGIN}/health" || echo "(no /health endpoint)"
echo

echo "== sse =="
SSE_URL="${API_ORIGIN}${SSE_PATH}"
curl -N "${SSE_URL}" 2>/dev/null | awk '
  BEGIN { c=0; start=systime(); print "  [SSE] connected at " strftime() }
  { print "  [" strftime() "] " $0; if ($0 ~ /^event: (bootstrap|seed)/) c++; if (c>=2) { print "  [SSE] got 2 events in " (systime()-start) "s"; exit 0 } }
' || echo "  (SSE: missing bootstrap/seed quickly)"
echo

echo "== voice-ws =="
node - <<'NODE'
const url = process.env.VOICE_WS_URL;
(async () => {
  if (!url) { console.error("VOICE_WS_URL not set"); process.exit(1); }
  const { WebSocket } = await import('ws').catch(() => ({ WebSocket: global.WebSocket }));
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

echo "== tool snapshot (if exists) =="
node - <<'NODE'
const origin = process.env.API_ORIGIN || "http://127.0.0.1:4000";
const url = `${origin}/tools/snapshot`; // change if your route differs
(async () => {
  const t0 = Date.now();
  try {
    const r = await fetch(url); const dt = Date.now()-t0; const body = await r.text();
    console.log(`[HTTP] ${url} -> ${r.status} in ${dt} ms`);
    console.log(body.slice(0, 300));
  } catch (e) {
    console.error(`[HTTP] ${url} failed:`, e?.message || e);
    process.exitCode = 1;
  }
})();
NODE
echo

echo "== grep errors =="
if command -v rg >/dev/null; then GREP=rg; else GREP="grep -R"; fi
$GREP -nE "ToolError|Session error|server_error|timeout|ECONN|empty_buffer|Waiting for data|Circuit|Unhandled|Rate limit" "${LOG_FILE}" || true
echo
echo "Logs at ${LOG_FILE} (tail -n 200 ${LOG_FILE})"
echo "API PID: ${API_PID}"
