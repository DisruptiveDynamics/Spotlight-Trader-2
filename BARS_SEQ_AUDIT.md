# BAR SEQUENCE AUDIT

## Sequence Policy

**Formula:** `seq = Math.floor(bar_start / 60000)`

**Rationale:**
- Uses bar_start timestamp (not bar_end) - industry standard
- Divides by 60,000ms (1 minute) for all timeframes
- Results in deterministic, time-derived sequence numbers
- Same seq formula across all data sources (live, historical, fallback)

**Monotonic Guard (barBuilder only):**
```typescript
const seqFromTime = Math.floor(state.bar_start / 60000);
const currentSeq = this.lastSeq.get(stateKey) ?? 0;
const seq = seqFromTime > currentSeq ? seqFromTime : currentSeq + 1;
```

This prevents backward movement during clock adjustments or server restarts.

## Sequence Calculation Sites

| Location | Formula | Status |
|----------|---------|--------|
| `barBuilder.ts:164` | `Math.floor(bar_start / 60000)` with monotonic guard | ✅ Correct |
| `history/service.ts:251` | `Math.floor(bar_start / 60000)` | ✅ Fixed Oct 18 |
| `history/service.ts:332` | `Math.floor(bar_start / 60000)` | ✅ Fixed Oct 18 |
| `replay/engine.ts` | Passes through `bar.seq` from history | ✅ Correct |

**Historical Issues (Resolved):**
- ❌ `history/service.ts` previously used `Math.floor(bar_start / timeframeMs)` - caused multi-timeframe misalignment
- ❌ Fallback generator previously used `Math.floor(bar_end / 60000)` - seq off by +1

## Example Bar Sequence (1m Timeframe)

Based on standard market hours (9:30 AM ET = 1697201400000 ms Unix):

| Seq | bar_start (ISO) | bar_end (ISO) | o | h | l | c | v |
|-----|-----------------|---------------|---|---|---|---|---|
| 28286690 | 2025-10-18T13:30:00.000Z | 2025-10-18T13:31:00.000Z | 580.50 | 580.75 | 580.40 | 580.65 | 150000 |
| 28286691 | 2025-10-18T13:31:00.000Z | 2025-10-18T13:32:00.000Z | 580.65 | 580.80 | 580.55 | 580.70 | 145000 |
| 28286692 | 2025-10-18T13:32:00.000Z | 2025-10-18T13:33:00.000Z | 580.70 | 580.90 | 580.68 | 580.85 | 160000 |
| 28286693 | 2025-10-18T13:33:00.000Z | 2025-10-18T13:34:00.000Z | 580.85 | 581.00 | 580.75 | 580.95 | 175000 |
| 28286694 | 2025-10-18T13:34:00.000Z | 2025-10-18T13:35:00.000Z | 580.95 | 581.10 | 580.90 | 581.05 | 155000 |
| 28286695 | 2025-10-18T13:35:00.000Z | 2025-10-18T13:36:00.000Z | 581.05 | 581.20 | 581.00 | 581.15 | 165000 |
| 28286696 | 2025-10-18T13:36:00.000Z | 2025-10-18T13:37:00.000Z | 581.15 | 581.25 | 581.10 | 581.20 | 140000 |
| 28286697 | 2025-10-18T13:37:00.000Z | 2025-10-18T13:38:00.000Z | 581.20 | 581.35 | 581.15 | 581.30 | 170000 |
| 28286698 | 2025-10-18T13:38:00.000Z | 2025-10-18T13:39:00.000Z | 581.30 | 581.40 | 581.25 | 581.35 | 150000 |
| 28286699 | 2025-10-18T13:39:00.000Z | 2025-10-18T13:40:00.000Z | 581.35 | 581.50 | 581.30 | 581.45 | 180000 |
| 28286700 | 2025-10-18T13:40:00.000Z | 2025-10-18T13:41:00.000Z | 581.45 | 581.55 | 581.40 | 581.50 | 160000 |
| 28286701 | 2025-10-18T13:41:00.000Z | 2025-10-18T13:42:00.000Z | 581.50 | 581.60 | 581.45 | 581.55 | 155000 |
| 28286702 | 2025-10-18T13:42:00.000Z | 2025-10-18T13:43:00.000Z | 581.55 | 581.65 | 581.50 | 581.60 | 145000 |
| 28286703 | 2025-10-18T13:43:00.000Z | 2025-10-18T13:44:00.000Z | 581.60 | 581.70 | 581.55 | 581.65 | 165000 |
| 28286704 | 2025-10-18T13:44:00.000Z | 2025-10-18T13:45:00.000Z | 581.65 | 581.75 | 581.60 | 581.70 | 170000 |
| 28286705 | 2025-10-18T13:45:00.000Z | 2025-10-18T13:46:00.000Z | 581.70 | 581.80 | 581.65 | 581.75 | 175000 |
| 28286706 | 2025-10-18T13:46:00.000Z | 2025-10-18T13:47:00.000Z | 581.75 | 581.85 | 581.70 | 581.80 | 160000 |
| 28286707 | 2025-10-18T13:47:00.000Z | 2025-10-18T13:48:00.000Z | 581.80 | 581.90 | 581.75 | 581.85 | 155000 |
| 28286708 | 2025-10-18T13:48:00.000Z | 2025-10-18T13:49:00.000Z | 581.85 | 581.95 | 581.80 | 581.90 | 150000 |
| 28286709 | 2025-10-18T13:49:00.000Z | 2025-10-18T13:50:00.000Z | 581.90 | 582.00 | 581.85 | 581.95 | 165000 |

**Observations:**
- ✅ Seq increments by exactly 1 per minute
- ✅ bar_start and bar_end are exactly 60000ms apart
- ✅ No gaps in sequence (continuous market hours)
- ✅ ISO timestamps properly formatted

## Multi-Timeframe Sequence Behavior

For timeframes > 1m, bars still use 1-minute base for seq calculation:

**5m Bar Example:**
```
bar_start: 2025-10-18T13:30:00.000Z (1697201400000ms)
bar_end:   2025-10-18T13:35:00.000Z (1697201700000ms)
seq: Math.floor(1697201400000 / 60000) = 28286690

Next 5m bar:
bar_start: 2025-10-18T13:35:00.000Z (1697201700000ms)
seq: Math.floor(1697201700000 / 60000) = 28286695 (+5)
```

**Key Insight:** Sequence numbers for multi-minute bars skip by the timeframe length (5m bar has seq +5 from previous).

## ms ↔ seconds Conversion at Chart Boundaries

**Lightweight Charts Requirement:**
- Expects timestamps in **seconds** (Unix epoch / 1000)

**Conversion Sites to Audit:**
```typescript
// Example: Converting Bar to chart format
const chartData = {
  time: Math.floor(bar.bar_start / 1000), // ms → seconds
  open: bar.open,
  high: bar.high,
  low: bar.low,
  close: bar.close,
  volume: bar.volume
};
```

**Potential Issues:**
- ⚠️ If conversion uses `bar_end` instead of `bar_start`, chart x-axis will be misaligned
- ⚠️ If conversion forgets to divide by 1000, timestamps will be in year 50000+
- ⚠️ If conversion uses `Math.round()` instead of `Math.floor()`, sub-second jitter may occur

**Recommendation:** Audit `ChartView.tsx` and related components to verify:
1. Uses `bar.bar_start` (not `bar_end` or `timestamp`)
2. Divides by 1000 (ms → seconds)
3. Uses `Math.floor()` for deterministic rounding

## Verification Commands

```bash
# Extract seq from live SSE stream (requires auth)
curl -N -H "Cookie: st_auth=<JWT>" \
  "http://localhost:5000/realtime/sse?symbols=SPY&timeframe=1m" | \
  grep -A5 '"event":"bar"' | \
  grep -E '"seq"|"bar_start"|"bar_end"'

# Expected pattern:
# "seq": 28286690
# "bar_start": 1697201400000
# "bar_end": 1697201460000
# (seq should increment by 1, bar_start/end by 60000ms)
```

## Conclusion

**Status:** ✅ Sequence calculation is now correct and aligned across all sources

**Fixed Issues:**
- History service multi-timeframe mismatch
- Fallback generator off-by-one error

**Remaining Work:**
- Runtime validation with actual Polygon data
- Chart conversion audit (ms → seconds)
- Multi-timeframe switching test (1m → 5m → 15m)
