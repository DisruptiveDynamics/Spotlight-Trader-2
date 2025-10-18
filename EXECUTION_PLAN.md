# SPOTLIGHT TRADER - INTEGRATED EXECUTION PLAN

**Created:** October 18, 2025  
**Branch:** meta/refactor-foundation (353f048)  
**System:** Node v20.19.3, pnpm 10.18.1

## Status Matrix: Audit vs Master Plan

| Feature | Master Plan Assumes | Actual Status | Action |
|---------|---------------------|---------------|--------|
| **Seq Alignment** | Needs verification | ✅ COMPLETE | Document only |
| **SSE Heartbeat** | Needs implementation | ✅ PRESENT (line 297-308) | No action |
| **SSE Last-Event-ID** | Needs implementation | ✅ PRESENT (line 21-24) | No action |
| **OnDemand Replay** | Needs creation | ✅ COMPLETE | Verify only |
| **ReplayControls UI** | Needs creation | ✅ PRESENT | Verify only |
| **Voice Auto-Reconnect** | Needs implementation | ❌ MISSING | **IMPLEMENT** |
| **Safari Auth Cookies** | Needs fix | ⚠️ INCONSISTENT | **FIX** |
| **Prometheus /metrics** | Needs implementation | ⚠️ PARTIAL | **IMPLEMENT** |
| **Multi-TF Rollups** | Needs implementation | ⚠️ UNKNOWN | **VERIFY** |
| **/api/diag Endpoint** | Not mentioned | ❌ MISSING | **IMPLEMENT** |

## Baseline Configuration

```yaml
Runtime:
  node: v20.19.3
  pnpm: 10.18.1
  branch: meta/refactor-foundation
  commit: 353f048

Ports:
  server: 5000 (0.0.0.0)
  vite: embedded in unified dev mode

Endpoints:
  SSE: /realtime/sse?symbols=SPY&timeframe=1m&sinceSeq=0
  History: /api/history?symbol=SPY&timeframe=1m&limit=50
  Replay: /api/replay/{start,stop,speed}
  Voice: /voice/ws (WebSocket)
  Health: /health
  Metrics: /api/metrics (partial - not Prometheus format)

Features:
  SSE heartbeat: ✅ 10s ping with backpressure stats
  Last-Event-ID: ✅ Parsed from header
  OnDemand replay: ✅ Full implementation
  Voice WS: ✅ Binary handling, ❌ no auto-reconnect
  Auth: ⚠️ sameSite inconsistent (lax vs none)
```

## REVISED EXECUTION PLAN (Focus on Gaps)

### Phase 1: Quick Verification (30 min) ✅ COMPLETE

**What:** Confirm all "already done" items actually work
- [x] Seq alignment across all sources
- [x] SSE heartbeat observable
- [x] Last-Event-ID parsing present
- [x] Replay engine files exist
- [x] ESLint clean

**Result:** All verified. No rework needed.

---

### Phase 2A: Voice Auto-Reconnect (HIGH PRIORITY - 1 hour)

**File:** `apps/client/src/lib/voiceWS.ts` (already exists, needs enhancement)

**Current State:**
- ✅ Binary handling correct (arraybuffer)
- ✅ Heartbeat implemented (5s ping, 15s timeout)
- ✅ Backpressure management (256KB threshold)
- ❌ No automatic reconnection on close

**Implementation:**
```typescript
// Add to voiceWS.ts
interface ReconnectConfig {
  maxAttempts: number;      // 10
  baseDelay: number;        // 1000ms
  maxDelay: number;         // 30000ms
  backoffMultiplier: number;// 2
}

let reconnectAttempts = 0;
let reconnectTimer: number | undefined;

function scheduleReconnect(url: string, handlers: VoiceHandlers) {
  if (reconnectAttempts >= config.maxAttempts) {
    console.error("VoiceWS: max reconnects reached");
    handlers.onMaxReconnects?.();
    return;
  }
  
  const delay = Math.min(
    config.baseDelay * Math.pow(config.backoffMultiplier, reconnectAttempts),
    config.maxDelay
  );
  
  console.log(`VoiceWS: reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1})`);
  reconnectAttempts++;
  
  reconnectTimer = window.setTimeout(() => {
    createVoiceWS(url, handlers); // Re-create connection
  }, delay);
}

// In ws.onclose handler:
if (!manualClose) {
  scheduleReconnect(url, handlers);
}

// In ws.onopen handler:
reconnectAttempts = 0; // Reset on successful connection
```

**Test:**
- Disable network for 20s → verify auto-reconnect after 3 attempts
- Connection succeeds → counter resets
- Max attempts reached → error logged, no more retries

---

### Phase 2B: Safari Auth Cookie Fix (HIGH PRIORITY - 30 min)

**Current State:**
- PIN auth: `sameSite: "lax"`, `secure: isProd`
- Session auth: `sameSite: "none"`, `secure: true`
- **Problem:** Inconsistent config breaks Safari iframe

**Implementation:**

**File:** `apps/server/src/middleware/requirePin.ts` (edit existing)

```typescript
export function setAuthCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax", // Safari-safe in prod
    secure: isProd,                    // HTTPS required for sameSite=none
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });
}
```

**Why this works:**
- Production (HTTPS): `sameSite: "none"` + `secure: true` → Safari iframe ✅
- Development (HTTP): `sameSite: "lax"` + `secure: false` → localhost ✅

**Test on iPad Safari:**
- Login with PIN → cookie persists 24h
- Navigate routes → auth remains valid
- HMR reload → cookie NOT cleared

---

### Phase 2C: Prometheus /api/metrics (MEDIUM PRIORITY - 1 hour)

**Current State:**
- Metrics registry exists (`apps/server/src/metrics/registry.ts`)
- Functions: `recordSSEConnection`, `recordSSEDisconnection`, etc.
- ❌ No Prometheus exposition endpoint

**Implementation:**

**New File:** `apps/server/src/routes/metricsProm.ts`

```typescript
import { Router } from "express";
import type { Router as RouterType } from "express";

const router: RouterType = Router();

// In-memory counters (replace with registry calls)
let sseConnections = 0;
let sseDroppedTotal = 0;
let polygonEmptyTotal = 0;

router.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/plain; version=0.0.4");
  
  const metrics = `
# HELP spotlight_sse_connections Current number of SSE connections
# TYPE spotlight_sse_connections gauge
spotlight_sse_connections ${sseConnections}

# HELP spotlight_sse_dropped_total Total SSE events dropped due to backpressure
# TYPE spotlight_sse_dropped_total counter
spotlight_sse_dropped_total ${sseDroppedTotal}

# HELP spotlight_polygon_empty_total Total Polygon API responses with empty results
# TYPE spotlight_polygon_empty_total counter
spotlight_polygon_empty_total ${polygonEmptyTotal}
`.trim();

  res.send(metrics);
});

export default router;
```

**Mount in:** `apps/server/src/index.ts`
```typescript
import metricsRouter from "./routes/metricsProm.js";
app.use("/api/metrics", metricsRouter);
```

**Test:**
```bash
curl http://localhost:5000/api/metrics
# Should return Prometheus text format
```

---

### Phase 2D: /api/diag Endpoint (MEDIUM PRIORITY - 45 min)

**Purpose:** Quick diagnostic snapshot for debugging

**New File:** `apps/server/src/routes/diag.ts`

```typescript
import { Router } from "express";
import type { Router as RouterType } from "express";
import { getEpochId, getEpochStartMs } from "@server/stream/epoch";
import { getMarketSource, getMarketReason } from "@server/market/bootstrap";

const router: RouterType = Router();

router.get("/", (_req, res) => {
  const diag = {
    timestamp: new Date().toISOString(),
    epoch: {
      id: getEpochId(),
      startMs: getEpochStartMs(),
    },
    market: {
      source: getMarketSource(),
      reason: getMarketReason(),
    },
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + "MB",
    },
    uptime: Math.round(process.uptime()) + "s",
  };
  
  res.json(diag);
});

export default router;
```

**Mount in:** `apps/server/src/index.ts`
```typescript
import diagRouter from "./routes/diag.js";
app.use("/api/diag", diagRouter);
```

---

### Phase 3: Multi-Timeframe Rollups (VERIFY EXISTING - 30 min)

**Question:** Does history service already support multi-TF via parameter?

**Action:** Check if this already works:
```bash
curl "http://localhost:5000/api/history?symbol=SPY&timeframe=5m&limit=20"
```

**If working:** Document and verify rollup logic uses 1m buffer
**If not:** Implement server-side rollup from bars1m

---

### Phase 4: Runtime Validation (Execute VERIFY.md - 2 hours)

Run complete test suite from VERIFY.md:
- Chart data pipeline (1m, 5m, 15m switching)
- OnDemand replay (already complete)
- Voice tools execution
- Auth persistence on Safari
- Network interruption recovery

---

## Deliverables Priority

**Immediate (next 2 hours):**
1. ✅ Voice auto-reconnect implementation
2. ✅ Safari auth cookie fix
3. ✅ Prometheus /metrics endpoint
4. ✅ /api/diag endpoint

**Next Session:**
5. Multi-timeframe rollup verification
6. Full VERIFY.md execution
7. Updated GRADES.yaml (target: 8.5+/10)

**Not Needed (Already Complete):**
- ❌ OnDemand replay engine creation
- ❌ ReplayControls UI creation
- ❌ SSE Last-Event-ID parsing
- ❌ SSE heartbeat implementation
- ❌ Sequence alignment fixes

---

## Acceptance Criteria (from Master Plan)

- [ ] Voice survives network loss without manual reload (**Voice auto-reconnect**)
- [ ] Safari auth stable; HMR doesn't invalidate sessions (**Cookie fix**)
- [ ] /api/metrics provides Prometheus format (**Metrics endpoint**)
- [ ] /api/diag provides 5-min triage signals (**Diag endpoint**)
- [x] Charts stream continuously without gaps (**Already verified**)
- [x] Replay behaves like live (**Already implemented**)
- [ ] Multi-TF rollups work cleanly (**Needs verification**)

---

## Risk Assessment

**Low Risk Implementations:**
- Voice auto-reconnect: Isolated client-side change
- Auth cookie: One-line config change
- Metrics endpoint: New route, no side effects
- Diag endpoint: Read-only snapshot

**Testing Required:**
- Voice reconnect under actual network loss
- Safari cookie behavior on real iPad/iPhone
- Prometheus metrics scraping compatibility

---

## Commands for Execution

```bash
# 1. Implement voice auto-reconnect
# Edit: apps/client/src/lib/voiceWS.ts

# 2. Fix auth cookie
# Edit: apps/server/src/middleware/requirePin.ts

# 3. Add Prometheus metrics
# Create: apps/server/src/routes/metricsProm.ts
# Edit: apps/server/src/index.ts

# 4. Add diag endpoint
# Create: apps/server/src/routes/diag.ts
# Edit: apps/server/src/index.ts

# 5. Verify lint
pnpm --filter @spotlight/server lint
pnpm --filter @spotlight/client lint

# 6. Restart server
# (Workflow auto-restarts)

# 7. Test endpoints
curl http://localhost:5000/api/metrics
curl http://localhost:5000/api/diag
```

---

## Next Action

**Execute Phase 2A-D immediately** (2-3 hours total), then pause for runtime validation and user feedback before tackling multi-TF rollups.
