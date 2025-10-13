# Spotlight Trader - Diagnosis Report

**Date**: October 10, 2025  
**Status**: 2 Critical Issues Identified

## Issue #1: Charts Display Incorrect Data ❌

### Symptoms

- User reports charts showing wrong prices vs ThinkorSwim
- Historical chart data appears stale/incorrect

### Root Cause

The `/api/history` endpoint returns **empty response** (no JSON):

```bash
curl http://localhost:8080/api/history?symbol=SPY&timeframe=1m&limit=5
# Returns: (nothing)
```

### Evidence

- Server receiving live Polygon data correctly (SPY ~$648.48, QQQ ~$583.46)
- Thousands of ticks streaming per minute ✅
- Ring buffer may be empty or history service not working
- No bar finalization logs visible in server output

### Impact

- Charts load with stale/mock data
- SSE connection may establish but charts start from wrong baseline
- User sees incorrect prices

---

## Issue #2: Voice Assistant Reconnect Loop ❌

### Symptoms

- Voice assistant gets stuck in listening → reconnecting loop
- Console errors: `Error processing WebSocket message: [object Blob]`
- AudioBatcher backpressure warnings

### Root Cause

The Blob-to-base64 conversion fix was implemented but **client workflow not restarted**, so old code still running.

### Evidence from logs

```
Error processing WebSocket message: {} Data type: object Data: <Blob>
AudioBatcher: dropping oldest frame due to backpressure
```

### Fix Status

- Code fix implemented in `EnhancedVoiceClient.v2.ts` (chunked conversion)
- Needs client restart to take effect

---

## What's Working ✅

1. **Server Health**: `/health` endpoint returns 200 OK
2. **Polygon WebSocket**: Streaming thousands of ticks correctly
3. **Live Data Pipeline**: SPY/QQQ prices accurate vs market
4. **Heartbeat**: Polygon connection stable with regular heartbeats

---

## Next Steps

### Priority 1: Fix Chart Data

1. Investigate why `/api/history` returns empty
2. Check ring buffer population
3. Verify bar builder is finalizing bars
4. Test historical data endpoint returns valid JSON

### Priority 2: Restart Voice Client

1. Restart Client workflow to apply Blob fix
2. Verify no more parse errors
3. Add ping/pong heartbeat (not yet implemented)

### Priority 3: Verify & Test

1. Chart shows live TOS-matching prices
2. Voice stays connected without loops
3. Document verification steps
