# AI Voice Coach Playbook

## Tool-Call Patterns for Spotlight Trader

This document defines the canonical tool-call sequences for the AI voice coach to ensure consistent, data-driven responses.

---

## 1. Symbol Query Pattern

**Trigger:** User asks "What's the setup on {SYMBOL}?" or mentions a symbol

**Sequence:**

```
1. get_chart_snapshot({symbol, timeframe="1m", barCount=50})
2. evaluate_rules({symbol, timeframe="1m"})
3. If setup forming → get_pattern_summary({symbol, setupTag, timeframe})
4. If GREEN status → propose_entry_exit({...})
5. Speak 1-line response with probabilities
6. log_journal_event({type: "note", ...}) if noteworthy
```

**Example Flow:**

```typescript
// User: "What's happening with SPY?"

// Step 1: Get current state
const snapshot = await get_chart_snapshot({
  symbol: "SPY",
  timeframe: "1m",
  barCount: 50,
});

// Step 2: Check risk status
const rules = await evaluate_rules({
  symbol: "SPY",
  timeframe: "1m",
});

// Step 3: If GREEN and setup detected
if (rules.status === "GREEN" && snapshot.setupDetected) {
  const pattern = await get_pattern_summary({
    symbol: "SPY",
    setupTag: snapshot.setupTag,
    timeframe: "1m",
  });

  // Step 4: Calculate trade
  const proposal = await propose_entry_exit({
    symbol: "SPY",
    timeframe: "1m",
    type: "long",
    price: snapshot.price,
    stop: snapshot.suggestedStop,
    target1: snapshot.suggestedTarget,
    rationale: `${snapshot.setupTag} with ${pattern.winRate}% win rate`,
  });

  // Speak: "SPY A entry 581.00, SL 579.80, TP 582.50, R:R 1.3. Volume confirming."
}
```

**Default Parameters:**

- `timeframe`: `"1m"` (unless user specifies otherwise)
- `barCount`: `50` (cap at `200`)
- `setupTag`: Infer from snapshot (e.g., `"vwap_reclaim"`, `"orb"`, `"ema_pullback"`)

---

## 2. Alert Fired Pattern

**Trigger:** [ALERT] event from trigger system (VWAP reclaim, ORB, sweep, etc.)

**Sequence:**

```
1. get_chart_snapshot({symbol, timeframe, barCount=50})
2. get_pattern_summary({symbol, setupTag, timeframe})
3. evaluate_rules({symbol, timeframe})
4. If GREEN → propose_entry_exit({...})
5. Speak 1-line callout with win rate
6. log_journal_event({type: "decision", decision: "watch", ...})
```

**Example Flow:**

```typescript
// Alert: "[ALERT] VWAP reclaim on SPY..."

// Step 1 & 2: Verify and get stats (parallel)
const [snapshot, pattern] = await Promise.all([
  get_chart_snapshot({ symbol: "SPY", timeframe: "1m", barCount: 50 }),
  get_pattern_summary({ symbol: "SPY", setupTag: "vwap_reclaim", timeframe: "1m" }),
]);

// Step 3: Risk check
const rules = await evaluate_rules({
  symbol: "SPY",
  timeframe: "1m",
  setupQuality: "A",
});

// Step 4: If blocked
if (rules.status !== "GREEN") {
  // Speak: "Risk RED. Cooldown 1800s — no entry."
  return;
}

// Step 5: Calculate entry
const proposal = await propose_entry_exit({
  symbol: "SPY",
  timeframe: "1m",
  type: "long",
  price: snapshot.price,
  stop: snapshot.vwap - 0.2,
  target1: snapshot.vwap + 1.5,
  rationale: `VWAP reclaim, ${pattern.winRate}% win rate`,
});

// Speak: "SPY A entry 581.00, SL 579.80, TP 582.50, R:R 1.3. 73% win rate."
```

**Critical Rules:**

- **Always include win rate or "no edge"** explicitly
- **Always check rules before proposing** entry
- **Default to 1m timeframe** for intraday alerts

---

## 3. Trade Taken/Closed Pattern

**Trigger:** User accepts/rejects a callout, or manually enters/exits

**Sequence:**

```
1. log_journal_event({type: "entry"|"exit"|"decision", ...})
2. If accepted → get_recommended_risk_box({...}) to validate
3. If exit → calculate realized R and log
```

**Example Flow (Entry):**

```typescript
// User accepts SPY entry

// Step 1: Log the decision
await log_journal_event({
  type: "entry",
  symbol: "SPY",
  timeframe: "1m",
  decision: "accept",
  reasoning: "VWAP reclaim with volume confirmation",
  qualityGrade: "A",
});

// Step 2: Validate stop/target placement
const riskBox = await get_recommended_risk_box({
  symbol: "SPY",
  setupTag: "vwap_reclaim",
  entry: 581.0,
  stop: 579.8,
});

// If stop too tight: suggest adjustment
// If stop reasonable: confirm
```

**Example Flow (Exit):**

```typescript
// User exits SPY trade

// Calculate realized R
const realizedR = (exitPrice - entryPrice) / (entryPrice - stopPrice);

await log_journal_event({
  type: "exit",
  symbol: "SPY",
  timeframe: "1m",
  decision: "close",
  reasoning: `Exit at TP1, realized ${realizedR.toFixed(2)}R`,
  qualityGrade: "A",
  realizedR,
});

// Speak: "Exit logged. +1.3R on SPY."
```

---

## 4. Uncertainty/Failure Handling

**Pattern:** AI feels uncertain or tool call fails

**Sequence:**

```
1. Say "Let me check"
2. Call get_chart_snapshot (and others as needed)
3. If tool fails → retry once
4. If still failing → state the missing piece
```

**Example Flow:**

```typescript
// User: "Is SPY breaking out?"

// AI uncertain → check first
try {
  const snapshot = await get_chart_snapshot({
    symbol: "SPY",
    timeframe: "1m",
    barCount: 50,
  });

  // Analyze and respond with data
  // "SPY at 581.00, VWAP 580.50, volume 1.2×. Building toward breakout."
} catch (error) {
  // Retry once
  try {
    const snapshot = await get_chart_snapshot({ symbol: "SPY", timeframe: "1m" });
    // ...
  } catch (retryError) {
    // State the issue
    // Speak: "Snapshot unavailable — waiting for bars."
  }
}
```

**Forbidden Phrases:**

- ❌ "I don't have real-time data"
- ❌ "I can't access the market"
- ❌ "No live data available"

**Instead:**

- ✅ "Let me check" → call tools
- ✅ "Snapshot unavailable — waiting for bars" (if tools fail)

---

## 5. Proactive Pattern Detection

**Pattern:** AI detects setup FORMING (not just formed)

**Sequence:**

```
1. get_chart_snapshot to confirm
2. Alert trader with "building toward" language
3. Don't wait for full confirmation
```

**Example:**

```typescript
// Detect: Price approaching VWAP from below

const snapshot = await get_chart_snapshot({
  symbol: "SPY",
  timeframe: "1m",
  barCount: 50,
});

const distanceToVWAP = (snapshot.vwap - snapshot.price) / snapshot.price;

if (distanceToVWAP > 0 && distanceToVWAP < 0.002) {
  // Speak: "SPY building toward VWAP test, volume increasing."
  // Don't wait for full reclaim - early awareness is the edge
}
```

---

## 6. Trader Mistake Detection

**Pattern:** Trader shows emotion or violates their plan

**Sequence:**

```
1. log_journal_event with mistake tag
2. Gentle immediate feedback
3. Pattern reminder on next similar setup
```

**Example:**

```typescript
// User chases entry after breakout

await log_journal_event({
  type: "decision",
  symbol: "NVDA",
  timeframe: "1m",
  decision: "accept",
  reasoning: "Chased entry after momentum shift - ignored plan",
  qualityGrade: "C",
});

// Speak now: "Entry logged. Watch for chasing."

// Later when similar setup:
// "Remember: last 3 NVDA chases stopped out. Wait for pullback."
```

---

## Output Contracts

### 1-Line Advice Format

```
{SYMBOL} {grade} entry {entry}, SL {stop}, TP {target}, R:R {rr}. {note}
```

**Examples:**

- `"SPY A entry 581.00, SL 579.80, TP 582.50, R:R 1.3. Volume confirming."`
- `"QQQ B entry 502.50, SL 501.20, TP 504.00, R:R 1.2. Pullback to 9 EMA."`

### Risk Block Format

```
Risk {status}. Cooldown {seconds}s — no entry.
```

**Examples:**

- `"Risk RED. Cooldown 1800s — no entry."`
- `"Risk YELLOW. Daily loss -4.2% — reduce size."`

### No Edge Format

```
No edge now; volume {factor}×, {regime} regime.
```

**Examples:**

- `"No edge now; volume 0.6×, chop regime."`
- `"SPY: No edge now; RSI mid-range, declining volume."`

---

## Debouncing Rules

- **Max 1 voice message per symbol per 10 seconds**
- Multiple alerts within window → combine or drop
- Critical risk alerts override debounce

**Implementation:**

```typescript
const lastAlertTime = new Map<string, number>();

function shouldSpeak(symbol: string): boolean {
  const now = Date.now();
  const last = lastAlertTime.get(symbol) || 0;

  if (now - last < 10000) {
    return false; // Debounce
  }

  lastAlertTime.set(symbol, now);
  return true;
}
```

---

## Testing Checklist

- [ ] **Verify-then-speak order**: Tools called before voice response
- [ ] **Risk block messaging**: "Risk RED. Cooldown Xs — no entry"
- [ ] **No-data guard**: Forbidden phrases trigger tool calls
- [ ] **Debounce logic**: Max 1 message per symbol per 10s
- [ ] **1-line advice**: Consistent format from proposal data
- [ ] **Win rate inclusion**: Always state edge or "no edge"
- [ ] **Journal logging**: Auto-logs entries/exits/decisions
- [ ] **Tool retry**: Retries once on failure before stating unavailable

---

## Quick Reference

| Scenario     | First Tool Call                              | Output Format                      |
| ------------ | -------------------------------------------- | ---------------------------------- |
| Symbol query | `get_chart_snapshot`                         | Data-driven 1-liner                |
| Alert fired  | `get_chart_snapshot` → `get_pattern_summary` | "{SYMBOL} {grade} entry..."        |
| Risk blocked | `evaluate_rules`                             | "Risk {status}. Cooldown Xs"       |
| No setup     | `get_chart_snapshot`                         | "No edge now; volume X×, {regime}" |
| Trade taken  | `log_journal_event`                          | "Entry logged. {note}"             |
| Uncertain    | "Let me check" → tools                       | Verified answer                    |
| Tool fails   | Retry → state issue                          | "Snapshot unavailable"             |
