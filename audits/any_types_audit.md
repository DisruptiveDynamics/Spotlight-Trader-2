# Type Hardening Audit: 'any' Usage in Core Modules

**Date:** October 14, 2025  
**Scope:** Streaming, Chart Rendering, Voice Tools  
**Strict Mode:** ✅ Enabled (strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true)

---

## Top 20 'any' Usages Requiring Type Strengthening

### HIGH PRIORITY (Streaming & Real-time Data)

#### 1. **apps/server/src/stream/sse.ts**
**Lines:** 109, 111, 126, 141, 158  
**Current:**
```typescript
const listeners: Array<{ event: string; handler: (data: any) => void }> = [];
const alertHandler = (signal: any) => { ... };
const microbarHandler = (data: any) => { ... };
const barHandler = (data: any) => { ... };
const tickHandler = (tick: any) => { ... };
```
**Risk:** Type-unsafe SSE event handlers could pass malformed data to clients  
**Fix:** Create typed event handlers with domain types (TradingAlert, MicroBar, Bar, Tick)

#### 2. **apps/server/src/stream/backpressure.ts:27**
**Current:**
```typescript
write(event: string, data: any, id?: string): void
```
**Risk:** SSE writer accepts unvalidated data  
**Fix:** Generic type parameter: `write<T>(event: string, data: T, id?: string)`

#### 3. **apps/server/src/market/polygonWs.ts**
**Lines:** 69, 76, 82, 99, 134  
**Current:**
```typescript
ws.onmessage = (event: any) => { ... };
messages.forEach((msg: any) => this.handleMessage(msg));
ws.onerror = (error: any) => { ... };
private handleMessage(msg: any) { ... }
const tick: any = { ... };
```
**Risk:** Polygon WebSocket messages untyped - could process invalid market data  
**Fix:** Create PolygonMessage, PolygonTick, PolygonAgg types based on Polygon.io schema

#### 4. **apps/server/src/market/auditTap.ts:39**
**Current:**
```typescript
private auditBar(symbol: string, bar: any): void
```
**Risk:** Audit logging accepts any bar structure  
**Fix:** Use `Bar` type from shared types

---

### MEDIUM PRIORITY (Chart Rendering)

#### 5. **apps/client/src/features/chart/Pane.tsx**
**Lines:** 37, 441, 466, 470, 473, 477, 480, 484, 509, 529  
**Current:**
```typescript
const [tooltip, setTooltip] = useState<{ x: number; y: number; data: any } | null>(null);
.filter((d: any) => !isNaN(d.value))
.map((b: any, i: number) => ({ ... }))
```
**Risk:** Chart data transformations untyped - could render invalid indicators  
**Fix:** Create ChartTooltipData, IndicatorPoint, BarWithIndicators types

#### 6. **apps/client/src/features/chart/Toolbar.tsx:277**
**Current:**
```typescript
const newVwap: any = { mode };
```
**Risk:** VWAP config untyped  
**Fix:** Create VwapConfig type

#### 7. **apps/client/src/lib/marketStream.ts**
**Lines:** 98, 151  
**Current:**
```typescript
.map((b: any) => ({ ... }))
const bars: Bar[] = rawBars.map((b: any) => ({ ... }))
```
**Risk:** SSE bar transformation assumes structure without validation  
**Fix:** Create RawBarDTO type, use Zod validation

#### 8. **apps/client/src/lib/history.ts**
**Lines:** 43, 56  
**Current:**
```typescript
(bar: any) => bar.timestamp > startTime
.map((bar: any) => ({ ... }))
```
**Risk:** Historical data fetch untyped  
**Fix:** Use HistoricalBarDTO type

#### 9. **apps/client/src/lib/sseBatch.ts:2**
**Current:**
```typescript
let queue: any[] = [];
```
**Risk:** SSE batch queue untyped - could batch incompatible events  
**Fix:** Generic type: `queue: SSEEvent[] = []`

---

### MEDIUM PRIORITY (Voice & Tools)

#### 10. **apps/server/src/realtime/voiceProxy.ts:307**
**Current:**
```typescript
let result: any = null;
```
**Risk:** Voice tool results untyped  
**Fix:** Create ToolResult union type for all voice tools

#### 11. **apps/server/src/voice/toolsBridge.ts**
**Lines:** 59, 101, 134  
**Current:**
```typescript
wss.on("connection", (ws, context: any) => { ... });
} catch (e: any) { ... }
function capPayload(output: any): any
```
**Risk:** WebSocket context and tool outputs untyped  
**Fix:** Create ToolBridgeContext, ToolOutput types; use `unknown` for errors

#### 12. **apps/server/src/voice/tools.ts**
**Lines:** 289, 311  
**Current:**
```typescript
entries: playbookEntries.map((r: any) => ({ ... }))
entries: glossaryEntries.map((r: any) => ({ ... }))
```
**Risk:** Memory entries untyped from database  
**Fix:** Use Drizzle's InferSelectModel or create MemoryEntry type

---

### LOW PRIORITY (Utility & Helpers)

#### 13. **apps/client/src/lib/retry.ts**
**Lines:** 5, 11  
**Current:**
```typescript
onRetry?: (attempt: number, error: any) => void;
let lastError: any;
```
**Risk:** Error types unspecified  
**Fix:** Use `Error | unknown` for lastError, document onRetry callback

---

## Domain Types to Create

### 1. Streaming Types (packages/shared/src/types/streaming.ts)
```typescript
export interface SSEEvent<T = unknown> {
  event: string;
  data: T;
  id?: string;
  retry?: number;
}

export interface TradingAlert {
  id: string;
  symbol: string;
  type: 'entry' | 'exit' | 'stop' | 'target' | 'risk';
  message: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export interface MicroBar {
  symbol: string;
  timestamp: number;
  price: number;
  size: number;
  vwap?: number;
}
```

### 2. Chart Types (packages/shared/src/types/chart.ts)
```typescript
export interface ChartTooltipData {
  x: number;
  y: number;
  time: number;
  price: number;
  ohlcv?: OHLCV;
  indicators?: Record<string, number>;
}

export interface IndicatorPoint {
  time: number;
  value: number;
}

export interface BarWithIndicators extends Bar {
  indicators?: {
    ema9?: number;
    ema20?: number;
    vwap?: number;
    volume_ma?: number;
  };
}

export interface VwapConfig {
  mode: 'session' | 'anchored' | 'rolling';
  anchorTime?: number;
  period?: number;
}
```

### 3. Polygon Types (apps/server/src/market/types/polygon.ts)
```typescript
export interface PolygonMessage {
  ev: 'A' | 'T' | 'status' | 'error';
  sym?: string;
  p?: number;  // price
  s?: number;  // size
  t?: number;  // timestamp
  // ... full Polygon.io schema
}

export interface PolygonAgg {
  ev: 'A';
  sym: string;
  v: number;   // volume
  av: number;  // accumulated volume
  op: number;  // open
  vw: number;  // vwap
  o: number;   // official open
  c: number;   // close
  h: number;   // high
  l: number;   // low
  a: number;   // avg trade size
  z: number;   // num trades
  s: number;   // start timestamp
  e: number;   // end timestamp
}

export interface PolygonTick {
  ev: 'T';
  sym: string;
  p: number;   // price
  s: number;   // size
  t: number;   // timestamp
  c?: number[]; // conditions
  x?: number;   // exchange
}
```

### 4. Voice Tool Types (apps/server/src/voice/types.ts)
```typescript
export type ToolResult =
  | ChartSnapshotResult
  | PriceResult
  | VwapResult
  | EmaResult
  | RegimeResult
  | JournalResult
  | RulesResult
  | SignalsResult;

export interface ChartSnapshotResult {
  symbol: string;
  timeframe: string;
  bars: Bar[];
  indicators: Record<string, unknown>;
  session: { high: number; low: number; open: number };
  volatility: 'low' | 'medium' | 'high';
  regime: string;
  stale?: boolean;
  reason?: string;
}

export interface ToolBridgeContext {
  userId: string;
  sessionId: string;
  ip: string;
  userAgent: string;
}

export interface ToolOutput<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  truncated?: boolean;
}
```

### 5. DTO Types (for API boundaries)
```typescript
// apps/server/src/types/dto.ts
export interface RawBarDTO {
  symbol: string;
  timeframe: string;
  seq: number;
  bar_start: number;
  bar_end: number;
  ohlcv: {
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
  };
}

export interface HistoricalBarDTO {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
}
```

---

## Remaining High-Risk Untyped Zones

### 1. Dynamic Event Bus (apps/server/src/market/eventBus.ts)
**Issue:** EventEmitter with string-based events lacks type safety  
**Risk:** HIGH - could emit/listen for mismatched event types  
**Recommendation:** Use typed event emitter library (mitt, typed-emitter) or create event map

### 2. Polygon WebSocket Message Parsing
**Issue:** Complex nested conditionals parse untyped messages  
**Risk:** HIGH - malformed Polygon data could crash barBuilder  
**Recommendation:** Add Zod schema validation before processing

### 3. Chart Data Transformations (Pane.tsx map/filter chains)
**Issue:** Multiple chained transformations with implicit any  
**Risk:** MEDIUM - could render invalid data points  
**Recommendation:** Type intermediate steps, add runtime validation

### 4. Voice Tool Dispatcher (voiceProxy.ts switch statement)
**Issue:** Large switch with untyped results  
**Risk:** MEDIUM - tool results could be incompatible with OpenAI response format  
**Recommendation:** Create tool registry with typed signatures

### 5. SSE Event Serialization
**Issue:** JSON.stringify accepts any data without validation  
**Risk:** MEDIUM - could send malformed events to clients  
**Recommendation:** Add validation layer before serialization

---

## Type Coverage Metrics

### Before Hardening
- **Explicit any:** ~38 occurrences in core modules
- **Implicit any:** ~15 (map/filter/forEach without types)
- **Type coverage estimate:** ~85%

### After Hardening (Target)
- **Explicit any:** <5 (only in error handling, WebSocket raw events)
- **Implicit any:** 0
- **Type coverage estimate:** >95%

---

## Implementation Priority

### Phase 3a (Current): Critical Path
1. ✅ Create domain types (streaming, chart, voice)
2. ✅ Type SSE event handlers
3. ✅ Type Polygon message handlers
4. ✅ Type chart data transformations

### Phase 3b (Next): Validation Layer
1. Add Zod schemas for external data (Polygon, HTTP APIs)
2. Validate at API boundaries
3. Type event bus with event map

### Phase 3c (Future): Advanced Type Safety
1. Replace EventEmitter with typed alternative
2. Add branded types for IDs (UserId, SymbolId, BarSeq)
3. Use discriminated unions for state machines

---

## Notes

- Strict mode already enabled ✅
- noUncheckedIndexedAccess prevents index signature bugs ✅
- exactOptionalPropertyTypes ensures optional props are explicit ✅
- Most 'any' usage is in boundary code (SSE, WebSocket, JSON parsing)
- Core business logic is well-typed
- Chart rendering has most implicit any (map/filter chains)
