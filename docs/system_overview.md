# Spotlight Trader - System Overview

## Project Architecture

Spotlight Trader is a real-time trading coach application built on a TypeScript monorepo with pnpm workspaces. The system emphasizes production-grade reliability, sub-millisecond latency, and professional trader ergonomics.

## Monorepo Structure

```
spotlight-trader/
├── apps/
│   ├── client/          # React 18 + Vite frontend
│   └── server/          # Node.js 20 Express backend
├── packages/
│   ├── shared/          # Shared types and utilities
│   └── config/          # Shared configuration
└── package.json         # Root workspace config
```

## Runtime Services

### Core Services

1. **Market Data Pipeline** - Polygon WebSocket for live ticks, REST for historical data, SSE for lossless streaming
2. **Voice Proxy** (`/ws/realtime`) - WebRTC-based OpenAI Realtime API integration with ephemeral tokens
3. **Tools Bridge** (`/ws/tools`) - WebSocket proxy for AI tool execution with retry/circuit breaker patterns
4. **Rules Engine Service** - Evaluates trading rules on `bar:new` events, emits signals
5. **Signals Service** - Persists signals to database, registers with Risk Governor
6. **Coach Advisor** - Generates AI explanations for signals using OpenAI
7. **Proactive Coaching Engine** - Monitors market data for pattern detection and coaching alerts
8. **EOD Scheduler** - Daily cron job for end-of-day journal summaries
9. **Telemetry Bridge** - Forwards market events to telemetry bus for observability
10. **Bar Builder** - Aggregates ticks into 1m bars + 50ms microbars
11. **Session VWAP Calculator** - Real-time VWAP tracking from tick data
12. **Audit Tap** - Optional passive market data consistency logger (disabled by default)
13. **Rules Sentinel** - Risk management and circuit breaker for trade context
14. **Trader Pattern Detector** - Analyzes journal history for behavioral patterns (FOMO, late entries)
15. **Knowledge Processing** - Ingests YouTube videos, PDFs, text notes with semantic chunking
16. **Feature Flag Service** - Runtime feature toggles persisted to database

### Background Jobs

- **EOD Summary Generator** - Runs daily via node-cron to generate trading journal summaries
- **Bar Finalize Timers** - Per-symbol timers to close 1m bars deterministically
- **Microbar Emitters** - 50ms interval timers for running wicks (ThinkorSwim-level smoothness)

## Data Flow: Tick → Chart Render

```
┌─────────────────┐
│  Polygon WS     │  Real-time tick ingestion
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  eventBus       │  Emits tick:${symbol}
│  (TypedEmitter) │
└────────┬────────┘
         │
         ├────────────────────┐
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌──────────────────┐
│  BarBuilder     │  │  SessionVWAP     │
│  (50ms micros)  │  │  (tick-level)    │
└────────┬────────┘  └──────────────────┘
         │
         ▼
┌─────────────────┐
│  bars1m buffer  │  Authoritative 1m source
│  (5000 bars)    │
└────────┬────────┘
         │
         ├─────────────────┐
         │                 │
         ▼                 ▼
┌─────────────────┐  ┌────────────────┐
│  Rollups        │  │  RingBuffer    │
│  (2m,5m,1h)     │  │  (fast cache)  │
└────────┬────────┘  └────────────────┘
         │
         ▼
┌─────────────────┐
│  eventBus       │  bar:new:${symbol}:${tf}
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  SSE Broadcaster│  /stream/market
│  (backpressure) │
└────────┬────────┘
         │
         ▼ (network)
┌─────────────────┐
│  Client SSE     │  connectMarketSSE()
│  (EventSource)  │
└────────┬────────┘
         │
         ├────────────────┐
         │                │
         ▼                ▼
┌─────────────────┐  ┌───────────────┐
│  sseBatch       │  │  Pane.tsx     │
│  (RAF batching) │  │  (validation) │
└────────┬────────┘  └───────┬───────┘
         │                   │
         ▼                   ▼
┌─────────────────┐  ┌───────────────┐
│  ChartView.tsx  │  │  Indicators   │
│  (LW Charts)    │  │  (EMA,BB,etc) │
└─────────────────┘  └───────────────┘
```

## Data Flow: Voice Tools

```
┌──────────────────┐
│  Voice UI        │  User speaks
│  (PresenceBubble)│
└────────┬─────────┘
         │
         ▼ (WebRTC)
┌──────────────────┐
│  OpenAI Realtime │  gpt-realtime model
└────────┬─────────┘
         │
         ▼ (function call)
┌──────────────────┐
│  VoiceProxy      │  /ws/realtime
│  (WS proxy)      │
└────────┬─────────┘
         │
         ▼ (tool.exec over WS)
┌──────────────────┐
│  ToolsBridge     │  /ws/tools
│  (5s timeout)    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Tool Dispatcher │  voiceTools + copilotHandlers
│  (10 tools)      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  bars1m buffer   │  Real-time data access
│  RingBuffer      │
│  SessionVWAP     │
└──────────────────┘
```

## Installed Packages

### Root Dependencies

- **@openai/agents** (0.1.9) - OpenAI Agents SDK for voice interface
- **compression** (1.8.1) - HTTP response compression
- **date-fns** (4.1.0) + **date-fns-tz** (3.2.0) - Timezone-aware date handling
- **jsonwebtoken** (9.0.2) - JWT authentication
- **pdf-parse** (2.2.16) - PDF ingestion for knowledge base

### Client Dependencies

- **react** (18.2.0) + **react-dom** (18.2.0) - UI framework
- **lightweight-charts** (4.2.3) - TradingView-grade charting library
- **zustand** (5.0.8) - State management
- **framer-motion** (12.23.24) - Animation library for voice UI
- **@tanstack/react-query** (5.90.2) - Data fetching and caching
- **tailwindcss** (3.4.1) - Utility-first CSS
- **vite** (5.0.12) - Build tool and dev server
- **zod** (3.22.4) - Schema validation

### Server Dependencies

- **express** (4.18.2) - HTTP server
- **@polygon.io/client-js** (8.2.0) - Polygon.io SDK
- **drizzle-orm** (0.36.0) + **@neondatabase/serverless** (0.9.0) - PostgreSQL ORM and driver
- **openai** (4.104.0) - OpenAI API client
- **ws** (8.16.0) - WebSocket server
- **helmet** (7.1.0) - Security headers
- **cors** (2.8.5) - CORS middleware
- **cookie-parser** (1.4.7) - Cookie parsing
- **nanoid** (5.1.6) - ID generation
- **node-cron** (4.2.1) - Scheduled jobs
- **multer** (2.0.2) - File upload handling
- **youtube-transcript** (1.2.1) - YouTube transcript extraction
- **mathjs** (14.8.2) - Mathematical calculations
- **pino** (10.0.0) + **pino-pretty** (13.1.2) - Structured logging

### Dev Dependencies

- **typescript** (5.9.3) - Type system
- **vitest** (1.6.1) - Unit testing
- **eslint** (9.37.0) + plugins - Code linting
- **prettier** (3.6.2) - Code formatting
- **tsx** (4.20.6) - TypeScript execution
- **concurrently** (8.2.2) - Run multiple commands
- **kill-port** (2.0.1) - Port cleanup utility

## API Endpoints

### WebSocket Endpoints

#### `/ws/realtime`

**Purpose:** Voice coach WebRTC proxy to OpenAI Realtime API

**Authentication:** JWT token in query param `?t=<token>` or header `x-user-token`

**Payload Flow:**

```typescript
// Client → Server → OpenAI
{
  type: "audio.append",
  audio: base64EncodedAudio
}

// OpenAI → Server → Client
{
  type: "response.audio.delta",
  delta: base64EncodedAudio
}

// Function call injection (Copilot alerts)
{
  type: "conversation.item.create",
  item: {
    type: "function_call_output",
    call_id: string,
    output: string
  }
}
```

**Features:**

- Circuit breaker on OpenAI errors (60s cooldown)
- Memory bridge integration for coach insights
- CORS validation for allowed origins

#### `/ws/tools`

**Purpose:** Tool execution bridge for voice assistant

**Authentication:** JWT token in query param `?token=<token>`

**Request Payload:**

```typescript
{
  type: "tool.exec",
  id: string,              // Correlation ID
  name: string,            // Tool name (e.g., "get_current_price")
  args: Record<string, any>, // Tool arguments
  corrId?: string          // Optional correlation ID for tracing
}
```

**Response Payload:**

```typescript
// Success
{
  type: "tool.result",
  id: string,
  ok: true,
  output: any,
  latency_ms: number,
  corrId: string
}

// Failure
{
  type: "tool.result",
  id: string,
  ok: false,
  error: string,
  latency_ms: number,
  corrId: string
}
```

**Features:**

- 5-second timeout per tool
- Retry logic with exponential backoff
- Circuit breaker pattern
- Result caching
- Observability metrics (latency, success rate)

### Server-Sent Events (SSE)

#### `/stream/market`

**Purpose:** Real-time market data stream (bars, microbars, ticks)

**Query Parameters:**

- `symbols` (string) - Comma-separated symbols (default: "SPY")
- `timeframe` (string) - Bar timeframe (default: "1m")
- `sinceSeq` (number) - Resume from sequence number (gap-filling)

**Event Types:**

```typescript
// Bootstrap - immediate connection confirmation
event: bootstrap
data: { now: number, warm: boolean, symbols: string[], timeframe: string }

// Epoch info - server restart detection
event: epoch
data: { epochId: string, epochStartMs: number, symbols: string[], timeframe: string }

// 1-minute bar (closed)
event: bar
data: {
  symbol: string,
  timeframe: string,
  seq: number,
  bar_start: number,  // Unix ms
  bar_end: number,    // Unix ms
  ohlcv: { o: number, h: number, l: number, c: number, v: number }
}

// 50ms microbar (running wick)
event: microbar
data: {
  symbol: string,
  timeframe: string,
  ts: number,         // Unix ms
  o: number,
  h: number,
  l: number,
  c: number,
  v: number
}

// Tick (time & sales)
event: tick
data: {
  symbol: string,
  price: number,
  size: number,
  ts: number,         // Unix ms
  conditions?: string[]
}
```

**Headers:**

- `X-Market-Source`: "polygon" | "rest" | "fallback"
- `X-Market-Reason`: Fallback reason (if applicable)
- `X-Epoch-Id`: Server epoch UUID (restart detection)
- `X-Epoch-Start-Ms`: Server start timestamp

#### `/api/agent/stream`

**Purpose:** Coach message stream

**Event Type:**

```typescript
event: coach
data: { message: string, timestamp: number }
```

#### `/api/copilot/callouts/stream`

**Purpose:** Real-time trading alert callouts

**Event Payload:**

```typescript
{
  id: string,
  symbol: string,
  setupTag: string,       // e.g., "SPY_BULL_FLAG"
  urgency: "action" | "watch",
  message: string,
  timestamp: number
}
```

### REST Endpoints

#### Charts

##### `GET /api/history`

**Purpose:** Fetch historical candles (paginated, gap-fillable)

**Query Parameters:**

- `symbol` (string, required) - Stock symbol
- `timeframe` (string) - "1m" | "2m" | "5m" | "10m" | "15m" | "30m" | "1h" (default: "1m")
- `limit` (number) - Bars to fetch (100-1000, default: 500)
- `before` (number) - Unix timestamp for pagination (scroll back)
- `sinceSeq` (number) - Sequence number for gap-filling (resume)

**Response:**

```typescript
[
  {
    symbol: string,
    timeframe: string,
    seq: number,
    bar_start: number,
    bar_end: number,
    ohlcv: { o: number, h: number, l: number, c: number, v: number },
  },
];
```

##### `POST /api/chart/timeframe`

**Purpose:** Server-side timeframe switching (experimental, feature-flagged)

**Request Body:**

```typescript
{
  symbol: string,
  timeframe: "1m" | "2m" | "5m" | "10m" | "15m" | "30m" | "1h"
}
```

**Response:**

```typescript
{
  ok: boolean,
  symbol: string,
  timeframe: string,
  barsCount?: number,
  error?: string
}
```

#### Voice

##### `GET /api/voice/preview?voice={voiceId}`

**Purpose:** Preview OpenAI TTS voices

**Response:** Audio/mpeg stream

**Valid Voices:** "alloy", "echo", "shimmer", "fable", "onyx", "nova"

##### `POST /api/voice/token`

**Purpose:** Generate ephemeral WebRTC tokens + tools bridge JWT

**Authentication:** Required (session cookie)

**Response:**

```typescript
{
  token: string,           // Voice session JWT (60s TTL)
  toolsBridgeJwt: string,  // Tools bridge JWT
  sessionId: string
}
```

**Rate Limit:** 10 tokens per hour per user

#### Authentication

##### `POST /api/auth/start`

**Purpose:** Initiate magic link auth

**Request Body:**

```typescript
{
  email: string;
}
```

**Response:**

```typescript
{ success: boolean, message: string }
```

##### `GET /api/auth/callback?token=<token>`

**Purpose:** Magic link callback handler

**Response:** HTTP redirect to "/" with `sid` cookie

##### `POST /api/auth/demo`

**Purpose:** Demo login (dev/Replit only)

**Response:**

```typescript
{ success: boolean, userId: string }
```

Sets `sid` httpOnly cookie.

##### `GET /api/auth/session`

**Purpose:** Validate current session

**Response:**

```typescript
{ valid: boolean, userId?: string }
```

##### `GET /api/auth/me`

**Purpose:** Get current user info

**Response:**

```typescript
{
  userId: string,
  email: string
}
```

##### `POST /api/auth/logout`

**Purpose:** End session

**Response:**

```typescript
{
  success: boolean;
}
```

#### Market

##### `GET /api/market/status`

**Purpose:** Current market data source and session status

**Response:**

```typescript
{
  source: "polygon" | "rest" | "fallback",
  session: "PRE" | "RTH" | "A/H" | "CLOSED",
  reason?: string
}
```

**Headers:**

- `X-Market-Source`: Same as `source`
- `X-Market-Reason`: Fallback reason (if applicable)

#### Health

##### `GET /api/livez`

**Purpose:** Kubernetes-style liveness probe

**Response:** `{ ok: true, timestamp: number }`

##### `GET /api/readyz`

**Purpose:** Kubernetes-style readiness probe

**Response:** `{ ok: true, timestamp: number }`

##### `GET /api/healthz`

**Purpose:** Combined health check

**Response:** `{ ok: true, timestamp: number }`

## Security Model

- **Helmet.js** - Security headers (XSS, clickjacking, MIME sniffing)
- **CORS** - Strict allowlist for APP_ORIGIN and ADMIN_ORIGIN
- **JWT Auth** - Short-lived tokens (60s for voice, configurable for sessions)
- **httpOnly Cookies** - Session cookies with `sameSite: "none"`, `secure: true`
- **Connection Limits** - Rate limiting on voice token generation (10/hr)
- **Input Validation** - Zod schemas for all API inputs
- **Environment Validation** - Zod schema for required env vars at startup

## Database (Neon PostgreSQL)

**ORM:** Drizzle with `@neondatabase/serverless`

**Schema Management:** `npm run db:push` (no manual SQL migrations)

**Tables:**

- `users` - User accounts
- `sessions` - Active sessions
- `magicLinks` - Passwordless auth tokens
- `rules` - Versioned trading rules
- `signals` - Generated trading signals
- `journals` - Trade journal entries
- `memories` - Pgvector-based coach memory (playbook, glossary, postmortem, knowledge)
- `featureFlags` - Runtime feature toggles
- `knowledge_chunks` - Semantic chunks from YouTube/PDF/text uploads

## Performance Characteristics

- **SSE Connection Time:** <100ms (bootstrap sent immediately)
- **Bar Latency:** <50ms (tick → bar:new emission)
- **Microbar Frequency:** 50ms (20 updates/sec, ThinkorSwim-level)
- **Tool Execution Timeout:** 5s (with retry/circuit breaker)
- **Chart Update Batching:** requestAnimationFrame (60fps cap)
- **Ring Buffer Size:** 5000 bars per symbol (~3.5 trading days at 1m)

## Feature Flags

Runtime toggles stored in database:

- `timeframeServerSource` - Server-side timeframe switching
- `auditTap` - Market data consistency logging
- `proactiveCoach` - Proactive coaching engine
- `toolsPoweredVoice` - Force tool usage in voice responses

## Observability

- **Telemetry Bus** - Centralized event publication for metrics
- **Tool Execution Metrics** - Latency, success rate per tool
- **SSE Connection Tracking** - Per-user connection counts
- **Latency HUD** - Client-side SSE ping/pong monitoring
- **Circuit Breaker Logging** - OpenAI error cooldown events
