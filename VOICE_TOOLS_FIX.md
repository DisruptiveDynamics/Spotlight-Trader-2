# Voice Tools Fix - Real Data Integration

## Problem
The voice assistant was saying "I don't have access to real-time data" because the `get_chart_snapshot` tool handler was returning **empty placeholder data** instead of fetching from the ring buffer.

## Root Cause
```typescript
// BEFORE - apps/server/src/copilot/tools/handlers.ts
export async function getChartSnapshot(params) {
  return {
    symbol: params.symbol,
    timeframe: params.timeframe,
    bars: [],  // ❌ EMPTY!
    indicators: {},  // ❌ EMPTY!
    session: { high: 0, low: 0, open: 0 },
    volatility: 'medium',
    regime: 'chop',
  };
}
```

## Solution
Wired `get_chart_snapshot` to the **ring buffer** (the same data source your charts use):

```typescript
// AFTER - Now fetches real data
export async function getChartSnapshot(params) {
  const barCount = params.lookback || 50;
  const cachedBars = ringBuffer.getRecent(params.symbol, barCount);
  
  // Returns real bars with calculated indicators:
  // - VWAP (session)
  // - EMA 9 & 21
  // - Session high/low/open
  // - Volatility detection
  // - Regime detection (trend-up/trend-down/chop)
}
```

## What Changed

### Files Modified
1. **apps/server/src/copilot/tools/handlers.ts**
   - Added import: `import { ringBuffer } from '@server/cache/ring';`
   - Rewrote `getChartSnapshot()` to fetch real data
   - Added `calculateEMA()` helper function
   - Returns real bars, indicators, session stats, volatility, and regime

### Data Now Available to Voice Assistant
✅ **Real-time bars** - Last 50+ bars from ring buffer  
✅ **VWAP** - Session VWAP calculated from bars  
✅ **EMAs** - 9-period and 21-period EMAs  
✅ **Session stats** - High, low, open prices  
✅ **Volatility** - Low/medium/high based on price range  
✅ **Regime** - Trend-up, trend-down, or chop detection  

### Other Tools (Already Working)
✅ `evaluate_rules` - Uses rules sentinel (real data)  
✅ `propose_entry_exit` - Calculates R-multiples (real data)  
✅ `get_pattern_summary` - Uses pattern memory (real data)  
✅ `log_journal_event` - Writes to database (real data)  
✅ `get_recommended_risk_box` - Uses pattern stats (real data)  
✅ `generate_trade_plan` - Uses pattern memory (real data)  

## Testing

### How to Test
1. **Connect to voice assistant** (click the voice button in UI)
2. **Ask about a symbol**: "What's SPY doing right now?"
3. **The assistant should now**:
   - Call `get_chart_snapshot({ symbol: 'SPY', timeframe: '1m', lookback: 50 })`
   - Get real bars from the ring buffer
   - Analyze the data and respond with actual prices, trend, VWAP levels

### Expected Behavior
**Before**: "I don't have access to real-time data"  
**After**: "SPY is at $578.50, trending up above 9EMA at $577.80. Session VWAP is $577.50"

### Check Logs
When the voice assistant calls tools, you should see in server logs:
```
[VoiceProxy] Function call: { functionName: 'get_chart_snapshot', ... }
```

## Architecture Notes

### Data Flow
```
Market Ticks 
  → BarBuilder 
  → Ring Buffer (in-memory) 
  → get_chart_snapshot tool 
  → Voice Assistant (OpenAI)
  → User hears response
```

### Why This Works
- Ring buffer already has all the bars (same data source as charts)
- Voice tools now read from ring buffer
- No new data pipelines needed
- Zero latency (in-memory reads)

## Next Steps (Optional)

If the assistant still has issues:
1. Check if it's actually calling `get_chart_snapshot` (check server logs)
2. Verify the system prompt is loaded correctly (should say "You HAVE real-time data")
3. Test with a fresh voice session (disconnect/reconnect)

The data is now there. The voice assistant just needs to use its tools!
