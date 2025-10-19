# Verification Checklist

Use this checklist to validate the always-on streaming, observability, and performance upgrades.

## A. Always-On Polygon Streaming

- [ ] **WebSocket connects 24/7** (no market hours gating)
  ```bash
  # Check logs during off-hours (e.g., 2am ET)
  curl http://localhost:8080/api/market/status
  # Should show source=polygon (or sim if auth failed)
  ```

- [ ] **Mock mode only with FF_MOCK=true**
  ```bash
  # Without FF_MOCK in .env
  grep -i "mock" logs.txt
  # Should NOT see "mock mode active"
  
  # With FF_MOCK=true in .env
  grep -i "mock" logs.txt
  # Should see "FF_MOCK enabled"
  ```

- [ ] **Replay mode behind FF_REPLAY flag**
  ```bash
  # Check that replay doesn't auto-start in production
  ps aux | grep replay
  # Should be empty unless FF_REPLAY=true
  ```

## B. Observability - Structured Logging

- [ ] **LOG_LEVEL controls verbosity**
  ```bash
  # Set LOG_LEVEL=debug in .env, restart server
  tail -f logs.txt | grep "level.*debug"
  # Should see debug logs
  
  # Set LOG_LEVEL=error in .env, restart server
  tail -f logs.txt | grep "level.*info"
  # Should NOT see info logs
  ```

- [ ] **Chatty logs demoted to debug**
  ```bash
  # With LOG_LEVEL=info
  grep -i "ring buffer" logs.txt
  # Should be minimal or absent
  ```

## C. Observability - Prometheus Metrics

- [ ] **Metrics endpoint accessible**
  ```bash
  curl http://localhost:8080/api/metrics/prometheus
  # Should return Prometheus text format
  ```

- [ ] **Labeled metrics present**
  ```bash
  curl -s http://localhost:8080/api/metrics/prometheus | grep spotlight_sse_dropped_total
  # Example: spotlight_sse_dropped_total{symbol="SPY",timeframe="1m"} 0
  
  curl -s http://localhost:8080/api/metrics/prometheus | grep spotlight_ring_size
  # Example: spotlight_ring_size{symbol="SPY"} 450
  
  curl -s http://localhost:8080/api/metrics/prometheus | grep spotlight_sse_connections
  # Example: spotlight_sse_connections 2
  ```

## D. Performance - Multi-TF Rollup Cache

- [ ] **5m/15m requests are fast on cache hit**
  ```bash
  # First request (cold - slow)
  time curl "http://localhost:8080/api/history?symbol=SPY&timeframe=5m&limit=20"
  # Note time: ~500ms
  
  # Second request (warm - fast)
  time curl "http://localhost:8080/api/history?symbol=SPY&timeframe=5m&limit=20"
  # Note time: <50ms (10x speedup)
  ```

- [ ] **Cache invalidates on new 1m bar**
  ```bash
  # Wait for next 1m bar close, then retest
  time curl "http://localhost:8080/api/history?symbol=SPY&timeframe=5m&limit=20"
  # Should be slow again (cache invalidated)
  ```

## E. Performance - Inflight Deduplication

- [ ] **Concurrent requests coalesced**
  ```bash
  # Send 3 parallel requests
  for i in {1..3}; do
    curl "http://localhost:8080/api/history?symbol=SPY&timeframe=1m&limit=100" &
  done
  wait
  
  # Check logs for "Inflight deduplication"
  grep "Inflight deduplication" logs.txt
  # Should see 2x "using existing request"
  ```

## F. Reliability - Polygon History

- [ ] **Requests use milliseconds in path**
  ```bash
  # Check logs for Polygon API URLs
  grep "api.polygon.io" logs.txt | head -1
  # Should see: .../minute/1729346400000/1729364400000?...
  # NOT: .../minute/2025-10-19/2025-10-20?...
  ```

- [ ] **Non-200 responses logged with masked key**
  ```bash
  # Trigger error (invalid symbol)
  curl "http://localhost:8080/api/history?symbol=INVALID&timeframe=1m&limit=10"
  
  # Check logs
  grep "Polygon API error" logs.txt
  # Should see masked URL: apiKey=***
  # Should see first 300 chars of body
  ```

- [ ] **seq = floor(bar_start / 60000) for 1m**
  ```bash
  curl "http://localhost:8080/api/history?symbol=SPY&timeframe=1m&limit=5" | jq '.[0] | {seq, bar_start}'
  # Verify: seq == floor(bar_start / 60000)
  ```

## G. Reliability - SSE Dedupe

- [ ] **Last-Event-ID honored on reconnect**
  ```bash
  # Connect SSE, note last seq
  curl -N "http://localhost:8080/stream/market?symbols=SPY" | head -20
  # Note: id: 28595539
  
  # Reconnect with Last-Event-ID header
  curl -N -H "Last-Event-ID: 28595539" "http://localhost:8080/stream/market?symbols=SPY" | head -20
  # Should NOT receive bars with seq <= 28595539
  ```

- [ ] **Client dedupe by seq**
  ```bash
  # Open browser console
  # Monitor marketStream logs
  # Should see "Duplicate bar detected" if server sends seq <= lastSeq
  ```

## H. SSE Backpressure

- [ ] **Buffer capacity configurable**
  ```bash
  # Set SSE_BUFFER_CAP=1000 in .env, restart
  grep "bufferCap.*1000" logs.txt
  # Should see connection with bufferCap: 1000
  ```

- [ ] **Drops tracked per symbol/timeframe**
  ```bash
  # Overload SSE with rapid events
  # Check metrics
  curl -s http://localhost:8080/api/metrics/prometheus | grep spotlight_sse_dropped_total
  # Should increment if drops occur
  ```

## I. Client Idle Status

- [ ] **Idle status after VITE_MARKET_IDLE_MS**
  ```bash
  # Set VITE_MARKET_IDLE_MS=300000 (5 min) in client .env
  # Open chart, wait 5 minutes with no bars
  # UI should show "Connected (idle)"
  ```

## J. End-to-End Integration

- [ ] **SSE reconnect preserves state**
  ```bash
  # Open chart, note last bar seq
  # Restart server
  # Client should reconnect via Last-Event-ID
  # No duplicates or gaps
  ```

- [ ] **Metrics stable under load**
  ```bash
  # Run for 10 minutes
  watch -n 5 'curl -s http://localhost:8080/api/metrics/prometheus | grep spotlight_sse_connections'
  # Should remain stable (no memory leaks)
  ```

## K. Documentation

- [ ] **BARS_SEQ_AUDIT.md present and accurate**
  ```bash
  cat docs/BARS_SEQ_AUDIT.md
  # Verify 20 consecutive bars with seq policy
  ```

- [ ] **POLYGON_REQUEST_LOGS.txt shows masked keys**
  ```bash
  cat docs/POLYGON_REQUEST_LOGS.txt | grep "apiKey="
  # Should see: apiKey=***
  ```

- [ ] **VOICE_WS_AUDIT.md confirms reconnect behavior**
  ```bash
  cat docs/VOICE_WS_AUDIT.md | grep "20-second"
  # Should describe 20s offline test
  ```

## Safari Cookie Persistence

- [ ] **Session cookies persist on Safari**
  ```bash
  # Open Safari, log in
  # Close tab, reopen
  # Should remain logged in (no re-auth required)
  ```

## Rollback Plan

If issues arise:
1. Set `LOG_LEVEL=error` to reduce log noise
2. Set `SSE_BUFFER_CAP=100` to revert backpressure tuning
3. Disable flags: `FF_MOCK=false`, `FF_REPLAY=false`
4. Revert commit and redeploy previous version

## Sign-Off

- [ ] All checklist items verified
- [ ] No errors in logs (LOG_LEVEL=info)
- [ ] Metrics stable under 10min load test
- [ ] Performance targets met (cache speedup >10x)
- [ ] Documentation complete and accurate

**Verified by:** _________________  
**Date:** _________________  
**Commit:** _________________
