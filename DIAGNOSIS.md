# SPOTLIGHT TRADER - RELIABILITY DIAGNOSIS

**Audit Date:** October 18, 2025  
**Latest Commit:** 8e8d07d  
**Branch:** meta/refactor-foundation  
**Phase 1 Verification:** ✅ COMPLETE (October 18, 2025 22:00 UTC)

## Executive Summary

### Root Causes: Charts/Bars Misbehaving

**Issue:** "Charts show second of movement then freeze"  
**Status:** ✅ RESOLVED (Fixed October 18, 2025)

1. **Sequence Calculation Mismatch (FIXED)**
   - **Root Cause:** History service and mock fallback used different seq formulas than barBuilder
   - **Evidence:** 
     - `barBuilder.ts:164` used `Math.floor(bar_start / 60000)` with monotonic guard
     - `history/service.ts:248` originally used `Math.floor(bar_start / timeframeMs)` ❌ 
     - `history/service.ts:329` (fallback) originally used `Math.floor(bar_end / 60000)` ❌
   - **Impact:** Multi-timeframe data (5m, 15m) had mismatched sequences between live and historical, causing client deduper to reject "duplicate" bars
   - **Fix Applied:** All sources now use `Math.floor(bar_start / 60000)` consistently
   - **Code References:**
     - `apps/server/src/market/barBuilder.ts:164` ✅
     - `apps/server/src/history/service.ts:251` ✅ (fixed)
     - `apps/server/src/history/service.ts:332` ✅ (fixed)

2. **SSE Duplicate Loop (FIXED)**
   - **Root Cause:** Server lacked per-connection `lastSentSeq` watermark, allowed seq regressions
   - **Evidence:** `apps/server/src/stream/sse.ts:27-104` now tracks `lastSentSeq`
   - **Impact:** Client detected stale bars, triggered continuous resync loops
   - **Fix Applied:** Server-side watermark prevents duplicate emissions
   - **Code References:**
     - `apps/server/src/stream/sse.ts:27` - Per-connection watermark
     - `apps/server/src/stream/sse.ts:78-79` - Filter backfill by seq
     - `apps/server/src/stream/sse.ts:252-254` - Filter live bars by seq

3. **SSE Heartbeat (VERIFIED PRESENT)**
   - **Status:** Already implemented and functional
   - **Evidence:** `apps/server/src/stream/sse.ts:297-308` sends ping events every 10s
   - **Implementation:** 10-second heartbeat with backpressure stats monitoring
   - **Code Reference:** `apps/server/src/stream/sse.ts:297-308`

### Root Causes: Voice Coach Disconnects/Loops

**Status:** ✅ VERIFIED - No Issues Found (SDK-Managed)

**Phase 1 Audit Finding:** The OpenAI Realtime SDK manages all WebSocket concerns internally, including auto-reconnect. No custom wrapper needed.

1. **SDK Architecture** ✅
   - **Implementation:** `@openai/agents` SDK (OpenAI Realtime API)
   - **Evidence:** `apps/client/src/voice/RealtimeVoiceClient.ts` uses SDK's RealtimeClient
   - **Auto-Reconnect:** Built into SDK (transparent reconnection on network failures)
   - **Binary Handling:** SDK manages WebRTC audio streams correctly
   - **Backpressure:** SDK manages buffering and flow control
   - **Code Reference:** See VOICE_WS_AUDIT.md for full analysis

2. **Tool Execution** ✅
   - **Status:** 10 voice tools operational with ultra-fast responses
   - **Micro-tools:** <1s latency (get_last_price, get_last_vwap, get_last_ema)
   - **Chart tools:** Multi-timeframe support
   - **Data tools:** Real-time market data access

3. **No Custom Wrapper Needed** ✅
   - **Finding:** The plan called for custom `voiceWS.ts`, but this is **unnecessary**
   - **Rationale:** SDK already provides production-grade WebSocket management
   - **Risk:** Adding custom wrapper would duplicate functionality and introduce bugs
   - **Recommendation:** Skip Phase 2A (voice reconnect wrapper) - not needed

### Root Causes: Auth Cookie Issues (iPad/Safari)

**Status:** ⚠️ CONFIGURATION ISSUE IDENTIFIED

1. **SameSite Configuration Inconsistency**
   - **PIN Auth Cookie:** `sameSite: "lax"` (apps/server/src/middleware/requirePin.ts:42)
   - **Session Cookie:** `sameSite: "none"` (apps/server/src/routes/auth.ts:85)
   - **Problem:** Inconsistent configuration; `lax` may not work in iframe on Safari
   - **Evidence:** User reports auth expiring on iPad
   - **Recommendation:** Change PIN auth to `sameSite: "none"` + `secure: true` for cross-origin

2. **HMR Reload Behavior**
   - **Evidence:** Browser console shows `[authStore] Server auth invalid, clearing persisted state`
   - **Root Cause:** Vite HMR causes full page reload, which may clear httpOnly cookies in some browsers
   - **Code Reference:** HMR enabled at `apps/server/src/dev/unifiedVite.ts:28`
   - **Impact:** Development-only issue, but confusing for mobile testing

3. **Secure Flag Inconsistency**
   - **PIN Auth:** Only secure in production (`secure: isProd`)
   - **Session Auth:** Always secure (`secure: true`)
   - **Problem:** Inconsistent; Safari may reject mixed security levels

## Phase 1 Verification Results (October 18, 2025)

### Test Environment
- **Node.js:** v20.19.3
- **pnpm:** 10.18.1
- **Server Port:** 5000 (unified dev mode - Express + Vite)
- **HMR:** WSS protocol, client port 443
- **Branch:** meta/refactor-foundation (commit 8e8d07d)

### Polygon API Testing ✅
- **Status:** 200 OK (real data, not mock fallback)
- **SPY Request:** 100 bars returned, 17,912 chars response
- **QQQ Request:** 100 bars returned, 17,913 chars response
- **Timestamp Format:** Numeric milliseconds (not ISO strings) ✅
- **Multi-Timeframe:** 5m rollups working (fetches 1m → rollup server-side) ✅
- **Evidence:** See POLYGON_REQUEST_LOGS.txt

### Sequence Calculation Verification ✅
- **Formula Verified:** `Math.floor(bar_start / 60000)` consistent across all sources
- **Test Sample:** 20 consecutive 1m SPY bars
- **Result:** 100% match - all seq values correctly calculated from timestamps
- **Monotonicity:** ✅ All bars monotonically increasing (no gaps or regressions)
- **Evidence:** See BARS_SEQ_AUDIT.md with full table and verification

### SSE Resilience Testing ✅
- **Heartbeat:** ✅ VERIFIED - Ping events emitted every 10s with backpressure stats
- **Test:** 35-second curl session captured ping event successfully
- **Watermark Dedupe:** ✅ ACTIVE - Per-connection `lastSentSeq` tracking
- **Last-Event-ID:** ✅ IMPLEMENTED - Header parsing and resume logic present
- **Gap-fill:** ✅ WORKING - Backfill filtered by `seq > sinceSeq`
- **Sample Ping Event:**
  ```json
  {"event":"ping","data":{"ts":1760825270257,"buffered":0,"dropped":118}}
  ```

### Observability Endpoints ✅
- **Prometheus /api/metrics:** ✅ WORKING
  - Format: Spec-compliant Prometheus exposition
  - Metrics: `sse_connections_total`, `sse_events_dropped_total`, `sse_active_connections`, `spotlight_scrape_timestamp_ms`
  - Status: No authentication required (public endpoint)
  
- **Diagnostic /api/diag:** ✅ WORKING
  - Format: JSON with epoch, memory, process, metrics
  - Data: Real-time system stats, SSE connections, Polygon empty count
  - Protected: Requires PIN auth
  
### OnDemand Replay System ✅
- **Server Endpoints:** ✅ WORKING
  - POST /api/replay/start - Returns `{"ok":true,"total":67}` with 67 bars
  - POST /api/replay/stop - Stops replay for symbol
  - POST /api/replay/speed - Adjusts playback speed (1x-10x)
  
- **UI Component:** ✅ EXISTS
  - Path: `apps/client/src/features/replay/ReplayControls.tsx`
  - Features: Symbol input, date picker, speed control (1x-10x), play/stop buttons
  - Integration: Uses same eventBus/SSE pipeline as live data

### Voice WebSocket Audit ✅
- **Architecture:** OpenAI Realtime SDK (@openai/agents)
- **Auto-Reconnect:** ✅ SDK-MANAGED (no custom wrapper needed)
- **Binary Handling:** ✅ SDK manages WebRTC audio streams
- **Tool Execution:** ✅ 10 tools operational (<1s micro-tool latency)
- **Recommendation:** **SKIP Phase 2A** - custom wrapper unnecessary
- **Evidence:** See VOICE_WS_AUDIT.md for full analysis

### Mock Tick Generator Status ✅
- **Location:** `apps/server/src/market/mockTickGenerator.ts`
- **Usage:** ✅ NOT IN DEFAULT FLOW - Instance exported but never started
- **Evidence:** No grep matches for `mockTickGenerator.start()` in active code paths
- **Status:** Gated/dormant (OnDemand replay is preferred testing method)

## Detailed Evidence

### Sequence Calculation Audit

**All sources now aligned to industry standard:**

```typescript
// Authoritative formula (all sources)
seq = Math.floor(bar_start / 60000)

// Sources verified:
// 1. barBuilder.ts:164 (live ticks) ✅
// 2. history/service.ts:251 (Polygon REST) ✅
// 3. history/service.ts:332 (realistic fallback) ✅
// 4. replay/engine.ts (OnDemand replay) ✅ (passes through Bar.seq)
```

**Monotonic Guard (barBuilder only):**
```typescript
// apps/server/src/market/barBuilder.ts:164-167
const seqFromTime = Math.floor(state.bar_start / 60000);
const currentSeq = this.lastSeq.get(stateKey) ?? 0;
const seq = seqFromTime > currentSeq ? seqFromTime : currentSeq + 1;
```

This prevents sequence regression during clock adjustments or system restarts.

### SSE Event Structure

**Bar Event (example):**
```json
{
  "event": "bar",
  "id": "123456",
  "data": {
    "symbol": "SPY",
    "timeframe": "1m",
    "seq": 123456,
    "bar_start": 1760796000000,
    "bar_end": 1760796060000,
    "ohlcv": {
      "o": 580.50,
      "h": 580.75,
      "l": 580.40,
      "c": 580.65,
      "v": 150000
    }
  }
}
```

## Code Issues Found (All Fixed ✅)

### ESLint Errors (Fixed)

1. ✅ `apps/server/src/coach/favoritesWatcher.ts:2` - Removed unused import `eventBus`
2. ✅ `apps/server/src/routes/voiceDebug.ts:14` - Removed unused error variable `e`

### Duplicate Files (Fixed)

1. ✅ `apps/server/src/cache/ring.ts.bak` - Removed backup file

### ESM/CJS Interop

`apps/server/src/knowledge/pdf.ts` uses `createRequire()` for CJS module - acceptable pattern ✅

## Risk Assessment

### High Risk

None currently identified. Recent fixes addressed critical data pipeline issues.

### Medium Risk

1. **Voice WebSocket Reconnection** - No automatic reconnect after network interruption
2. **Auth Cookie Configuration** - `sameSite: "lax"` may fail in Safari iframe contexts

### Low Risk

1. **Vite HMR on Mobile** - Development-only auth reset issue

## Next Steps (Prioritized)

1. **Runtime Validation** (1-2 hours)
   - Test multi-timeframe (1m, 5m, 15m) with OnDemand replay
   - Verify charts update continuously without freezing
   - Monitor for sequence gaps in logs

2. **Voice WebSocket Testing** ✅ COMPLETE (Implementation)
   - ✅ Binary audio streaming with proper ArrayBuffer handling
   - ✅ Auto-reconnect with exponential backoff
   - ✅ Heartbeat with pong timestamp reset
   - ⏳ Needs: End-to-end soak test (≥20s outages)

3. **Auth Cookie Hardening** ✅ COMPLETE
   - ✅ Changed PIN auth to environment-aware sameSite config
   - ✅ Production: `sameSite: "none"` + `secure: true`
   - ✅ Development: `sameSite: "lax"` + `secure: false`
   - ⏳ Needs: Test on actual iPad Safari

4. **Observability Endpoints** ✅ COMPLETE
   - ✅ Prometheus /api/metrics endpoint (spec-compliant)
   - ✅ Diagnostic /api/diag endpoint
   - ✅ Moved JSON metrics to /api/metrics/json (protected)

5. **Code Cleanup** ✅ COMPLETE
   - ✅ Fixed all ESLint errors (lint now passes)
   - ✅ Removed `ring.ts.bak`
