# Top 5 Risk Hotspots - Phase 1 Baseline Audit

**Date:** October 14, 2025  
**Audit Scope:** Full system baseline review

## Executive Summary

Based on the Phase 1 baseline audit, the following 5 areas present the highest operational and reliability risks. These are ranked by impact × likelihood of failure.

---

## 🔴 #1: Voice Proxy Circuit Breaker Lockout

**Severity:** HIGH  
**Location:** `apps/server/src/realtime/voiceProxy.ts:76-97`

### Issue
When OpenAI Realtime API returns errors, the voice proxy enters a **60-second cooldown** that rejects ALL new voice connections system-wide. This is a global circuit breaker that can lock out all users simultaneously.

### Risk Scenario
- OpenAI has a transient API hiccup (5 seconds)
- Circuit breaker triggers and locks for 60 seconds
- All traders lose voice coaching during a critical market move
- User frustration and potential missed trade opportunities

### Current Mitigation
- Users see: "OpenAI voice service is temporarily unavailable. Please retry in X seconds."
- WebSocket closes with code 1008

### Recommendation
- **Per-user cooldown** instead of global cooldown
- **Progressive backoff** (5s → 15s → 60s) instead of immediate 60s
- **Health check endpoint** to pre-validate OpenAI availability before opening connections
- **Fallback to text-based coach API** (see TODO in `PresenceBubble.tsx:393`)

---

## 🟠 #2: SSE Gap-Filling Resync Complexity

**Severity:** MEDIUM-HIGH  
**Location:** `apps/client/src/lib/marketStream.ts:73-112`

### Issue
The SSE reconnection logic has 3 different resync paths:
1. **sinceSeq gap-fill** - Fetch missing bars since last sequence
2. **Server restart detection** (epoch change) - Full 50-bar resync
3. **Duplicate rejection recovery** - Force resync after 3 rejections in 5 seconds

Each path has different failure modes, and incorrect resync can cause:
- **Duplicate candles** (visual chart glitches)
- **Missing bars** (gaps in chart data)
- **Sequence number drift** (client/server desync)

### Risk Scenario
- Server restarts during active trading
- Client detects epoch change and triggers resync
- Network hiccup during resync causes partial fetch
- Client ends up with 23/50 bars, sequence number is wrong
- Subsequent bars fail validation, chart freezes

### Current Mitigation
- 3-attempt exponential backoff on fetch failure
- `market:resync-start` event for UI feedback (splash overlay)
- Epoch ID tracking in headers

### Recommendation
- **Idempotent resync** - Always fetch full snapshot on reconnect (ignore partial state)
- **Sequence number validation** - Server should reject out-of-sequence clients and force full resync
- **Circuit breaker on resync loops** - If 3 resyncs fail in 60s, show error modal and stop retrying
- **Add health check** (`/api/stream/health`) to validate connection before attempting resync

---

## 🟠 #3: Tool Execution 5-Second Timeout

**Severity:** MEDIUM  
**Location:** `apps/server/src/voice/toolsBridge.ts:66-71`

### Issue
All voice tools have a **hard 5-second timeout**. Complex tools (e.g., analyzing 50 bars of historical data, calculating multi-timeframe patterns) may legitimately take >5s, especially during database load or high server CPU.

### Risk Scenario
- User asks: "What's the 1-hour trend for SPY?"
- Tool needs to fetch 60 bars from database + calculate EMA
- Database query takes 3s, calculation takes 2.5s
- **Total: 5.5 seconds → timeout**
- User gets: "tool execution failed"
- Coach hallucinates a response without real data

### Current Mitigation
- Timeout error is logged with correlation ID
- Retry logic attempts the same tool again (may hit timeout again)
- Circuit breaker pattern prevents infinite retry loops

### Recommendation
- **Per-tool timeout configuration** - Fast tools (get_current_price) = 2s, complex tools (analyze_pattern) = 10s
- **Streaming responses** - For long-running tools, send progress updates every 2s
- **Query optimization** - Add database indexes on `bar_end` and `symbol` columns
- **Cache recent calculations** - EMA/BB values for last 100 bars per symbol

---

## 🟡 #4: In-Memory State Loss on Server Restart

**Severity:** MEDIUM  
**Location:** `apps/server/src/chart/bars1m.ts`, `apps/server/src/cache/ring.ts`

### Issue
Two critical in-memory buffers are lost on server restart/crash:
1. **bars1m buffer** (5000 bars = ~3.5 trading days) - Authoritative 1m bar source
2. **ringBuffer** (configurable size) - Fast cache for history queries

On restart:
- All historical bars are lost
- First client reconnect triggers cold start (fetches 500 bars from Polygon REST API)
- REST API has rate limits (5 requests/minute for free tier)
- If 10 clients reconnect simultaneously = 10 REST calls = rate limit hit

### Risk Scenario
- Server crashes during market hours (e.g., uncaught exception, OOM)
- Server restarts automatically
- 50 active traders refresh their charts
- All 50 clients trigger cold start history fetch
- Polygon REST API rate limit exceeded
- **30+ clients get 429 Too Many Requests**
- Charts stay blank for 60+ seconds until rate limit resets

### Current Mitigation
- SSE sends bootstrap event immediately (even with no data)
- Client shows loading state during history fetch
- Bars are re-buffered as new data arrives

### Recommendation
- **Redis persistence** (Upstash) - Persist bars1m buffer to Redis on every new bar (async, non-blocking)
- **Pre-warm on startup** - Fetch last 500 bars from Polygon REST before accepting SSE connections
- **Shared cache across restarts** - Use Redis as source of truth, in-memory as cache
- **Graceful shutdown** - On SIGTERM, persist current state before exiting

---

## 🟡 #5: Market Session Detection Holiday Gaps

**Severity:** MEDIUM  
**Location:** `apps/server/src/market/session.ts`

### Issue
Market session logic uses **day-of-week and US equities hours** (9:30-16:00 ET) but does not account for market holidays. The TODO comment explicitly acknowledges this:

```typescript
// TODO: Use holidays as closed for now (holiday calendar integration)
```

This means:
- On Thanksgiving (Thursday), system shows "RTH" (market open)
- On Good Friday, system shows "RTH" (market open)
- No Polygon data flows (market actually closed)
- Users see "Market Open" status but charts are frozen

### Risk Scenario
- December 24 (Christmas Eve early close at 1 PM ET)
- System shows "RTH" until 4 PM
- Market actually closes at 1 PM
- User attempts to trade at 2 PM
- No data updates, but UI shows "open"
- User thinks system is broken

### Current Mitigation
- Polygon data source status (`X-Market-Source` header) shows "fallback" or "rest" when live stream is unavailable
- Market status endpoint (`/api/market/status`) provides source + session + reason

### Recommendation
- **Integrate holiday calendar** - Use NYSE calendar API or static list of 2025 holidays
- **Polygon market status API** - Query Polygon's market status before showing "open"
- **Early close handling** - Detect early close days (e.g., day before holiday) and adjust session times
- **Fallback to market status API** - If no ticks received for 5 minutes during "RTH", query external status

---

## Risk Mitigation Priority

1. **Immediate (This Sprint):**
   - #1: Per-user voice cooldown (prevent global lockout)
   - #3: Per-tool timeout configuration (prevent premature failures)

2. **Short-term (Next 2 Sprints):**
   - #2: Idempotent SSE resync logic (reduce chart glitches)
   - #5: Holiday calendar integration (prevent false "open" status)

3. **Medium-term (Next Quarter):**
   - #4: Redis persistence layer (survive restarts gracefully)

---

## Additional Observations

### Low-Priority Risks (Not in Top 5)

- **Light theme missing** (`apps/client/src/index.css:34`) - TODO comment, but dark theme is production-ready
- **Signals service not wired to frontend** (`apps/client/src/features/chart/hooks/useChartContext.ts:70`) - TODO comment, backend is functional
- **Demo login rate limiting** - Currently allows unlimited retries (but feature-flagged for dev only)

### Positive Findings

- **No circular dependencies** (Grade A)
- **Strong ESLint enforcement** (prevents many common issues)
- **Event-driven architecture** (clean separation of concerns)
- **Comprehensive error handling** (process-level handlers for uncaught exceptions)

---

**Next Steps:** Proceed to Phase 2 (Architecture Hardening) to address top 3 risks.
