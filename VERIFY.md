# SPOTLIGHT TRADER - VERIFICATION CHECKLIST

**Purpose:** End-to-end validation checklist for runtime testing  
**Date:** October 18, 2025  
**Status:** Ready for execution after code cleanup

## Prerequisites

- [x] TypeScript compilation passes (client + server)
- [x] ESLint errors fixed (all clean - 0 errors, 0 warnings)
- [ ] Server workflow running without errors
- [ ] Auth cookie obtained (st_auth JWT)
- [ ] Polygon API key configured (or OnDemand replay ready)

## 1. Chart Data Pipeline

### Test 1.1: Historical Data Fetch

**Command:**
```bash
curl -H "Cookie: st_auth=YOUR_JWT" \
  "http://localhost:5000/api/history?symbol=SPY&timeframe=1m&limit=20"
```

**Expected:**
- HTTP 200 OK
- JSON array with 20 bars
- Each bar has: `symbol`, `timestamp`, `seq`, `bar_start`, `bar_end`, `ohlcv`
- Sequence numbers increment monotonically
- bar_start and bar_end are 60000ms apart (1m timeframe)

**Actual:** ___ (PASS / FAIL / NOTES)

---

### Test 1.2: SSE Bar Streaming (1m timeframe)

**Command:**
```bash
curl -N -H "Cookie: st_auth=YOUR_JWT" \
  "http://localhost:5000/realtime/sse?symbols=SPY&timeframe=1m&sinceSeq=0"
```

**Expected:**
- Bootstrap event with current timestamp
- Epoch event with epochId
- Multiple bar events streaming continuously
- Ping events every 10 seconds
- No duplicate sequence numbers
- No "stale sequence" warnings

**Actual:** ___ (PASS / FAIL / NOTES)

---

### Test 1.3: Multi-Timeframe Switching

**Steps:**
1. Load chart on 1m timeframe
2. Switch to 5m timeframe
3. Switch to 15m timeframe
4. Switch back to 1m

**Expected:**
- Chart reloads with new bars each switch
- No freeze or infinite loading
- Sequence numbers consistent (5m bars have seq +5, 15m bars have seq +15)
- No duplicate bar warnings in browser console
- Bars display correct aggregation (5m bar = 5× 1m bars)

**Actual:** ___ (PASS / FAIL / NOTES)

---

### Test 1.4: OnDemand Replay

**Command:**
```bash
curl -X POST -H "Cookie: st_auth=YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"symbol":"SPY","date":"2025-10-15","timeframe":"1m","speed":2}' \
  http://localhost:5000/api/replay/start
```

**Expected:**
- HTTP 200 OK with `{ok:true, message:"Replay started"}`
- SSE stream begins emitting historical bars at 2× speed
- Bars from October 15, 2025 trading day (9:30 AM - 4:00 PM ET)
- Chart updates continuously without freezing
- ReplayControls UI shows play/pause and speed options

**Stop Command:**
```bash
curl -X POST -H "Cookie: st_auth=YOUR_JWT" \
  http://localhost:5000/api/replay/stop
```

**Actual:** ___ (PASS / FAIL / NOTES)

---

## 2. Voice Assistant (Nexa)

### Test 2.1: WebSocket Connection

**Steps:**
1. Click "Start Voice" button in UI
2. Observe browser console for connection logs
3. Wait 30 seconds

**Expected:**
- WebSocket connects successfully
- binaryType set to "arraybuffer"
- Ping messages sent every 5 seconds
- Pong responses received
- No parse errors or Blob warnings
- Connection stays alive for 60+ seconds

**Actual:** ___ (PASS / FAIL / NOTES)

---

### Test 2.2: Voice Tools Execution

**Steps:**
1. Start voice session
2. Ask: "What's the last price of SPY?"
3. Ask: "Show me the 5-minute chart"
4. Ask: "What's the VWAP?"

**Expected:**
- Tool calls logged in browser console
- `get_last_price` returns current price < 1000ms
- `switch_timeframe` switches chart successfully
- `get_last_vwap` returns VWAP value
- No "tool execution failed" errors

**Actual:** ___ (PASS / FAIL / NOTES)

---

### Test 2.3: Binary Audio Handling

**Steps:**
1. Start voice session
2. Speak continuously for 10 seconds
3. Monitor browser console

**Expected:**
- No "Error processing WebSocket message" errors
- No JSON parse errors on binary data
- onAudioChunk fires for each audio frame
- No Blob conversion warnings (should use ArrayBuffer)
- AudioBatcher backpressure < 10 frames

**Actual:** ___ (PASS / FAIL / NOTES)

---

### Test 2.4: Heartbeat & Reconnection

**Steps:**
1. Start voice session
2. Monitor ping/pong in console
3. Simulate network interruption (disable Wi-Fi for 20s)
4. Re-enable network

**Expected:**
- Ping sent every 5s
- Pong received within 1s
- After 15s of no pong → connection closes
- ⚠️ Manual reconnect required (no auto-reconnect yet)
- After reconnect, session resumes normally

**Actual:** ___ (PASS / FAIL / NOTES)

---

## 3. Authentication & Sessions

### Test 3.1: PIN Login

**Steps:**
1. Clear cookies (browser DevTools)
2. Navigate to http://localhost:5000
3. Enter 6-digit PIN
4. Submit

**Expected:**
- Redirect to main application
- st_auth cookie set (httpOnly, sameSite=lax)
- Cookie persists across page reloads
- Cookie maxAge = 30 days

**Actual:** ___ (PASS / FAIL / NOTES)

---

### Test 3.2: Protected Endpoint Access

**Command:**
```bash
# Without auth
curl http://localhost:5000/api/history?symbol=SPY&timeframe=1m&limit=5

# With auth
curl -H "Cookie: st_auth=YOUR_JWT" \
  http://localhost:5000/api/history?symbol=SPY&timeframe=1m&limit=5
```

**Expected:**
- Without cookie: HTTP 401 Unauthorized
- With cookie: HTTP 200 OK with data

**Actual:** ___ (PASS / FAIL / NOTES)

---

### Test 3.3: Safari/iPad Cookie Persistence (if available)

**Steps:**
1. Open Safari on iPad
2. Navigate to Replit preview URL
3. Log in with PIN
4. Reload page
5. Navigate to different route

**Expected:**
- Cookie persists across reloads
- No auth expiration
- SSE streams work correctly
- ⚠️ Current sameSite=lax may fail in iframe contexts

**Actual:** ___ (PASS / FAIL / NOTES)

---

## 4. Error Handling & Edge Cases

### Test 4.1: Market Closed Behavior

**Steps:**
1. Run tests outside market hours (8 PM - 4 AM ET)
2. Request historical data

**Expected:**
- Polygon API returns empty results
- System falls back to realistic generator
- Bars still generated with synthetic data
- OnDemand replay still works (historical data available)

**Actual:** ___ (PASS / FAIL / NOTES)

---

### Test 4.2: Network Interruption

**Steps:**
1. Establish SSE connection
2. Disable network for 30s
3. Re-enable network

**Expected:**
- SSE connection closes
- Client detects disconnect
- Automatic reconnect with sinceSeq parameter
- No duplicate bars after reconnect
- Chart continues updating from last seq

**Actual:** ___ (PASS / FAIL / NOTES)

---

### Test 4.3: Invalid Symbol Request

**Command:**
```bash
curl -H "Cookie: st_auth=YOUR_JWT" \
  "http://localhost:5000/api/history?symbol=INVALID&timeframe=1m&limit=5"
```

**Expected:**
- Polygon returns empty results
- Fallback generator creates synthetic bars
- HTTP 200 OK (not 404)
- Bars marked as fallback in logs

**Actual:** ___ (PASS / FAIL / NOTES)

---

## 5. Performance & Observability

### Test 5.1: Latency Monitoring

**Steps:**
1. Check browser Network tab
2. Monitor SSE ping event timestamps
3. Check voice tool execution times

**Expected:**
- SSE ping every 10s ± 500ms
- Voice tool latency < 1000ms (micro-tools < 100ms)
- No backpressure warnings
- Chart updates within 100ms of bar emission

**Actual:** ___ (PASS / FAIL / NOTES)

---

### Test 5.2: Memory Leaks

**Steps:**
1. Load application
2. Switch timeframes 20 times
3. Start/stop voice session 10 times
4. Monitor browser Memory tab

**Expected:**
- Heap size stabilizes after 10 minutes
- No continuous memory growth
- SSE event listeners cleaned up on disconnect
- Voice WebSocket timers cleared on close

**Actual:** ___ (PASS / FAIL / NOTES)

---

### Test 5.3: Console Log Cleanliness

**Steps:**
1. Load application in production mode
2. Monitor browser console for 5 minutes

**Expected:**
- No errors or warnings
- Debug logs suppressed (if NODE_ENV=production)
- Only info-level logs visible
- No noisy heartbeat logs flooding console

**Actual:** ___ (PASS / FAIL / NOTES)

---

## 6. Code Quality

### Test 6.1: ESLint

**Command:**
```bash
pnpm --filter @spotlight/server lint
pnpm --filter @spotlight/client lint
```

**Expected:**
- 0 errors
- 0 warnings
- All unused imports removed
- No duplicate ring buffer files

**Actual:** ___ (PASS / FAIL / NOTES)

---

### Test 6.2: TypeScript Compilation

**Command:**
```bash
pnpm --filter @spotlight/server build
pnpm --filter @spotlight/client build
```

**Expected:**
- 0 type errors
- Build artifacts generated
- No emitted .d.ts errors

**Actual:** ___ (PASS / FAIL / NOTES)

---

## 7. Deployment Readiness

### Test 7.1: Production Build

**Command:**
```bash
NODE_ENV=production pnpm --filter @spotlight/server build
NODE_ENV=production pnpm --filter @spotlight/client build
```

**Expected:**
- Client build succeeds with minified bundle
- Server build succeeds with compiled JS
- All environment variables validated
- No development-only code included

**Actual:** ___ (PASS / FAIL / NOTES)

---

### Test 7.2: Health Check Endpoint

**Command:**
```bash
curl http://localhost:5000/health
```

**Expected:**
- HTTP 200 OK
- `{ok:true, timestamp: <ms>}`
- Response time < 100ms

**Actual:** ___ (PASS / FAIL / NOTES)

---

## Summary

**Tests Passed:** ___ / 23  
**Tests Failed:** ___  
**Tests Skipped:** ___

**Critical Issues:**
- ___

**Medium Issues:**
- ___

**Low Priority:**
- ___

**Overall Status:** READY / NEEDS WORK / BLOCKED

---

## Next Actions

Based on test results, prioritize:

1. **Fix Critical Blockers First**
   - Chart freezes
   - Auth failures
   - Voice disconnects

2. **Address Medium Issues**
   - ESLint errors
   - Cookie configuration
   - Auto-reconnect logic

3. **Polish & Optimize**
   - Add metrics endpoint
   - Improve logging
   - Document procedures

---

**Last Updated:** ___  
**Tested By:** ___  
**Environment:** Development / Production
