# VERIFY.md - Runtime Validation Checklist

**Created:** October 18, 2025  
**Phase 1 Verification:** ✅ COMPLETE  
**Phase 2 Runtime Testing:** ⏳ PENDING

## Overview

This document provides step-by-step verification procedures for runtime testing of Spotlight Trader. Phase 1 (backend/API verification) is complete. Phase 2 focuses on UI integration and end-to-end user flows.

## Phase 1: Backend Verification ✅ COMPLETE

### Polygon API ✅
- [x] Test SPY history endpoint (status 200, real data)
- [x] Test QQQ history endpoint (status 200, real data)
- [x] Verify numeric millisecond timestamps (not ISO strings)
- [x] Verify multi-timeframe rollups (5m, 15m)
- [x] Capture logs in POLYGON_REQUEST_LOGS.txt

**Result:** All tests passed. SPY: 100 bars, QQQ: 100 bars, status 200 OK.

### Sequence Calculation ✅
- [x] Grep all seq calculation sites
- [x] Verify `Math.floor(bar_start / 60000)` consistent across sources
- [x] Capture 20 consecutive bars with timestamps
- [x] Verify 100% match between calculated and actual seq
- [x] Verify monotonic sequence (no gaps or regressions)

**Result:** 100% match. All 20 bars verified in BARS_SEQ_AUDIT.md.

### SSE Resilience ✅
- [x] Test 35-second curl session
- [x] Capture ping events (10s heartbeat)
- [x] Verify per-connection watermark (lastSentSeq)
- [x] Verify Last-Event-ID header parsing
- [x] Verify gap-fill filtering (seq > sinceSeq)

**Result:** Heartbeat working, ping event captured with backpressure stats.

### Observability Endpoints ✅
- [x] Test GET /api/metrics (Prometheus format)
- [x] Test GET /api/diag (diagnostic JSON)
- [x] Verify metrics: sse_connections_total, sse_events_dropped_total
- [x] Verify diag data: epoch, memory, process stats

**Result:** Both endpoints working. Metrics: 2 SSE connections, 118 dropped events.

### OnDemand Replay ✅
- [x] Test POST /api/replay/start with SPY
- [x] Verify response: {ok: true, total: N}
- [x] Verify ReplayControls.tsx component exists
- [x] Verify component has date picker, speed controls, play/stop buttons

**Result:** Replay returned 67 bars. UI component verified at apps/client/src/features/replay/ReplayControls.tsx.

### Voice WebSocket ✅
- [x] Verify OpenAI Realtime SDK integration
- [x] Confirm auto-reconnect managed by SDK (not custom wrapper)
- [x] Verify tool execution working (10 tools)
- [x] Create VOICE_WS_AUDIT.md documenting findings

**Result:** SDK manages all WebSocket concerns. Phase 2A (custom wrapper) NOT NEEDED.

## Phase 2: UI Runtime Testing ⏳ PENDING

### Chart Multi-Timeframe Switching
**Goal:** Verify chart correctly switches between timeframes without gaps/duplicates

**Prerequisites:**
- Server running on port 5000
- Authenticated with PIN
- SPY chart open in browser

**Steps:**
1. Open chart for SPY at 1m timeframe
   - [ ] Verify chart loads with ~50-100 bars
   - [ ] Verify bars update in real-time (if market open) OR use replay
   - [ ] Check browser console for no errors

2. Switch to 5m timeframe
   - [ ] Click timeframe selector → 5m
   - [ ] Verify chart reloads with 5m bars
   - [ ] Verify rollup boundaries align to ET timezone
   - [ ] Check console: no "duplicate bar" or "stale sequence" warnings
   - [ ] Verify seq values match expected 5m buckets

3. Switch to 15m timeframe
   - [ ] Click timeframe selector → 15m
   - [ ] Verify chart reloads with 15m bars
   - [ ] Verify rollup boundaries correct
   - [ ] Check console for warnings

4. Switch back to 1m timeframe
   - [ ] Click timeframe selector → 1m
   - [ ] Verify chart returns to 1m bars
   - [ ] Verify no data loss or gaps

5. Rapid switching test
   - [ ] Rapidly switch: 1m → 5m → 1m → 15m → 1m
   - [ ] Verify no crashes or memory leaks
   - [ ] Check console for errors

**Expected Results:**
- Charts load smoothly with correct bar counts
- Rollup boundaries align to ET timezone (9:30 AM, etc.)
- No duplicate/stale warnings in console
- Seq values monotonically increasing

**Sample Test Data:**
```
1m bar: {seq: 29346919, bar_start: 1760815143331, bar_end: 1760815203331}
5m bar: {seq: 1, bar_start: 1760795100000, bar_end: 1760795400000}
```

### SSE Reconnection Test
**Goal:** Verify client reconnects and resumes without data loss

**Steps:**
1. Open SPY chart at 1m timeframe
   - [ ] Note current lastSeq value in console/DevTools

2. Restart server while chart open
   ```bash
   # In server terminal
   pkill -f "tsx watch"
   pnpm --filter @spotlight/server dev:unified
   ```

3. Observe client behavior
   - [ ] Client detects server restart (epoch change)
   - [ ] Client reconnects via SSE
   - [ ] Gap-fill request fires with `sinceSeq=<lastSeq>`
   - [ ] Chart continues updating without user intervention
   - [ ] Check console: No duplicate warnings, only normal gap detection

**Expected Results:**
- Automatic reconnection within 5-10 seconds
- Gap-fill retrieves missing bars
- No manual refresh required
- Console shows reconnection events but no errors

### OnDemand Replay UI Test
**Goal:** Verify ReplayControls UI integration works end-to-end

**Prerequisites:**
- Find where ReplayControls is rendered in UI
  ```bash
  grep -r "ReplayControls" apps/client/src --include="*.tsx"
  ```

**Steps:**
1. Locate Replay Controls in UI
   - [ ] Find replay panel/controls (check toolbar, sidebar, settings)
   - [ ] If not visible, verify component is imported and rendered

2. Start replay session
   - [ ] Enter symbol: SPY
   - [ ] Select date (or leave blank for today)
   - [ ] Set speed: 4x
   - [ ] Click "Start Replay"

3. Verify replay behavior
   - [ ] Chart begins updating with historical bars
   - [ ] Bars stream at 4x speed (faster than real-time)
   - [ ] Voice tools work with replay data
   - [ ] Console shows replay events

4. Adjust speed
   - [ ] Move speed slider to 1x
   - [ ] Verify playback slows down
   - [ ] Move to 10x
   - [ ] Verify playback speeds up

5. Stop replay
   - [ ] Click "Stop Replay"
   - [ ] Verify chart stops updating
   - [ ] Verify button changes to "Start Replay"

**Expected Results:**
- Replay starts/stops on command
- Speed controls adjust playback rate
- Chart updates identically to live data
- Voice tools access replay data (not live)

### Voice Coach Integration Test
**Goal:** Verify voice tools access correct data during replay

**Steps:**
1. Start OnDemand replay for volatile window
   - Symbol: SPY
   - Date: (pick a high-volume trading day)
   - Speed: 2x

2. Activate voice coach
   - [ ] Click microphone button
   - [ ] Say: "What's the last price?"
   - [ ] Verify response uses replay data (not live)

3. Test tool latency
   - [ ] Say: "Get last VWAP"
   - [ ] Verify response time <1s (micro-tool)

4. Test chart-based tools
   - [ ] Say: "Show me a 5-minute chart"
   - [ ] Verify voice can trigger multi-TF requests

**Expected Results:**
- Voice tools use replay data when replay active
- Micro-tools respond <1s
- Coach operates identically with replay vs live data

### Safari Auth Cookie Test (iPad/iPhone)
**Goal:** Verify PIN auth persists on mobile Safari

**Prerequisites:**
- iPad or iPhone with Safari
- Access to Replit HTTPS URL

**Steps:**
1. Open app in Safari
   - [ ] Navigate to https://[replit-url]
   - [ ] Enter 6-digit PIN
   - [ ] Verify authentication succeeds

2. Test persistence
   - [ ] Close Safari tab
   - [ ] Reopen app URL
   - [ ] Verify auto-login (no PIN re-entry needed)

3. Test 24-hour expiry
   - [ ] Wait 24+ hours
   - [ ] Reopen app
   - [ ] Verify prompted to re-enter PIN

4. HMR test (dev only)
   - [ ] Edit client code to trigger HMR
   - [ ] Verify auth NOT lost during hot reload
   - [ ] Check console for auth warnings

**Expected Results:**
- PIN auth works on first try
- Cookie persists across sessions
- 24-hour expiry enforced
- HMR doesn't invalidate auth

### Load Test: Multiple SSE Connections
**Goal:** Verify server handles concurrent SSE streams

**Setup:**
```bash
# Open 5 concurrent SSE connections
for i in {1..5}; do
  (curl -N -b /tmp/cookies.txt \
    "http://localhost:5000/realtime/sse?symbol=SPY&timeframe=1m" \
    > /tmp/sse_$i.log 2>&1 &)
done
```

**Steps:**
1. Monitor server metrics
   - [ ] curl http://localhost:5000/api/metrics
   - [ ] Verify `sse_active_connections` = 5
   - [ ] Check `sse_events_dropped_total` doesn't spike

2. Wait 60 seconds
   - [ ] Verify all 5 connections receive bars
   - [ ] Check for ping events in all streams

3. Kill connections
   - [ ] pkill -f "curl.*sse"
   - [ ] Verify `sse_active_connections` returns to 0

**Expected Results:**
- Server handles 5+ concurrent connections
- No dropped events or backpressure issues
- Metrics accurately track connection count

## Phase 3: Edge Case Testing

### Sparse Trading Hours
- [ ] Test during pre-market (4-9:30 AM ET)
- [ ] Verify charts handle sparse bars correctly
- [ ] Check for excessive gap-fill requests

### Market Closed
- [ ] Test OnDemand replay when market closed
- [ ] Verify fallback messaging
- [ ] Ensure no crash or error loops

### Network Interruption (Voice)
- [ ] Disable network for 10-20 seconds
- [ ] Re-enable network
- [ ] Verify SDK auto-reconnects without manual refresh

## Success Criteria

**Phase 2 Complete When:**
- ✅ Multi-TF switching works (1m ↔ 5m ↔ 15m)
- ✅ SSE reconnection seamless (no data loss)
- ✅ OnDemand replay UI functional
- ✅ Voice tools work with replay data
- ✅ Safari auth cookies persist correctly
- ✅ Load test passes (5+ concurrent SSE)

**Production Ready When:**
- ✅ All Phase 1 tests passed
- ✅ All Phase 2 tests passed
- ✅ All Phase 3 edge cases handled
- ✅ Zero critical bugs in 24-hour soak test

## Known Limitations
- Rate limiting not implemented for Polygon API (could hit limits)
- Structured logging (Winston/Pino) not yet added
- No explicit client-side reconnection backoff (relies on browser defaults)

## Test Artifacts
- BASELINE.txt - Environment snapshot
- BARS_SEQ_AUDIT.md - 20-bar sequence verification
- POLYGON_REQUEST_LOGS.txt - API response samples
- VOICE_WS_AUDIT.md - Voice WebSocket analysis
- DIAGNOSIS.md - Root cause analysis (updated)
- GRADES.yaml - Subsystem grades (updated to 9.2/10)
- PHASE1_VERIFICATION_COMPLETE.md - Phase 1 summary
