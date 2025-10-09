# Spotlight Trader

## Overview

Spotlight Trader is a production-grade real-time trading coach application built as a TypeScript monorepo. It combines market data streaming, voice-based AI coaching, rule-based trading alerts, and journaling capabilities. The system processes live market data from Polygon.io, delivers real-time charts and alerts via Server-Sent Events, and provides an interactive voice coach powered by OpenAI's Realtime API through WebSocket connections.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

### October 9, 2025 - Realtime Voice Coach Implementation

- Implemented complete voice coaching system with OpenAI Realtime API integration
- **Server-Side Auth**: HS256 JWT token signing/verification with 60-second TTL using SESSION_SECRET
- **Voice Proxy** (`realtime/voiceProxy.ts`): WebSocket upgrade handler at `/ws/realtime` with:
  - Origin validation against APP_ORIGIN/ADMIN_ORIGIN allowlist
  - Connection limits (max 3 concurrent per user)
  - session.update sent as FIRST upstream frame before client frames
  - Bidirectional frame forwarding with response.cancel passthrough for instant interrupt
  - 25-second heartbeat intervals for connection health
- **Coach Policy** (`coach/policy.ts`): Concise trading coach system prompt focused on real-time intraday coaching
- **Token Endpoint**: POST `/api/voice/token` for fetching short-lived authentication tokens
- **Client VAD** (`voice/VAD.ts`): WebAudio-based voice activity detection with RMS threshold and 250ms hold time
- **Voice Client** (`voice/VoiceClient.ts`):
  - Mic enable/disable controls with VAD pause/resume
  - Instant playback cancellation via AudioBufferSource.stop()
  - State management: listening → thinking → speaking → idle transitions
  - Exponential backoff reconnection with jitter
- **Coach UI** (`CoachBubble.tsx`): Floating bubble with power/mic toggles, state indicators, keyboard shortcuts (T for talk, Esc for stop)
- **Critical Fixes**: Properly gated mic controls, instant audio interrupt on speech detection, complete state transition flow

### October 9, 2025 - Market Data Pipeline Complete

- Implemented complete deterministic market data pipeline with lossless resume capability
- **Event Bus**: TypeScript-safe EventEmitter wrapper with typed events (`tick:symbol`, `microbar:symbol`, `bar:new:symbol:1m`)
- **Polygon WebSocket**: Reconnection with exponential backoff (1s→32s), heartbeat monitoring, subscription management, tick normalization
- **Bar Builder**: Deterministic sequencing using timestamp-based seq (`Math.floor(bar_start / 60000)`), 250ms microbars, strict 1-minute bar finalization, no mutation of finalized bars
- **Ring Buffer**: Redis-backed circular buffer storing last 5000 bars per symbol with `getSinceSeq()` and `getRecent()` methods
- **History Service**: Polygon REST backfill with automatic ring buffer caching for gap-free resume
- **SSE Endpoint** (`/stream/market`): Real-time streaming with lossless resume via `sinceSeq`, 15s heartbeat, backfill on reconnect
- **Wiring**: Finalized bars automatically persisted to ring buffer via event listeners in `wiring/index.ts`
- **Testing**: Unit tests for bar builder rollover logic, seq monotonicity, and ring buffer slice operations
- **Critical Fix**: Aligned seq computation between real-time and historical bars to ensure continuous sequences across restarts

## System Architecture

### Monorepo Structure

The application uses **pnpm workspaces** to organize code into logical packages:

- **apps/client**: React 18 frontend with Vite bundler, TypeScript, and Tailwind CSS for the trading dashboard
- **apps/server**: Node.js 20 Express backend handling REST APIs, WebSocket voice proxy, and SSE market data streams
- **packages/shared**: Shared TypeScript types, Zod validation schemas, and environment configuration
- **packages/config**: Centralized ESLint (flat config), Prettier, and TypeScript configuration bases

This structure enables code sharing, independent deployment, and clear separation of concerns between frontend, backend, and shared utilities.

### Real-Time Data Pipeline

The market data flow follows a **deterministic, lossless architecture**:

1. **Polygon WebSocket Client** (`polygonWs.ts`) maintains a single persistent connection to Polygon.io's level-1 trade/quote stream with automatic reconnection, exponential backoff, and heartbeat monitoring
2. **Event Bus** (`eventBus.ts`) provides typed event distribution using Node.js EventEmitter with strongly-typed event names and payloads
3. **Bar Builder** (`barBuilder.ts`) consumes ticks and produces:
   - **Microbars** (250ms aggregates) for ultra-responsive UI updates
   - **1-minute bars** with strict monotonic sequencing and immutable finalized state
   - Explicit rollover logic driven by exchange timestamps (not server time) to prevent data corruption
4. **Ring Buffer Cache** (`ring.ts`) stores the last 5,000 finalized bars per symbol in memory for fast resume/backfill operations
5. **History Service** (`history/service.ts`) provides intelligent backfill by first checking the ring buffer, then falling back to Polygon REST API for historical data

**Key Design Decision**: The bar builder never mutates finalized bars. Each bar gets a strictly increasing sequence number (`seq`) and explicit `bar_start`/`bar_end` timestamps. This guarantees deterministic replay and safe distributed consumption.

### Communication Protocols

**Server-Sent Events (SSE)** for market data (`/stream/market`):

- Streams finalized 1-minute bars and microbars per subscribed symbol
- Supports lossless resume via `sinceSeq` query parameter
- Emits trading alerts from the rules engine when conditions trigger
- Choice rationale: SSE provides automatic reconnection, event IDs for resume, and lower overhead than WebSocket for unidirectional streaming

**WebSocket** for voice coach (`/ws/realtime`):

- Proxies bidirectional audio between browser and OpenAI Realtime API
- Implements instant interrupt capability via `response.cancel` commands
- Uses server-side Voice Activity Detection (VAD) from OpenAI
- Security: Requires short-lived HS256 JWT (60-second validity) and strict origin validation; limited to 3 concurrent connections per user

### Data Storage Strategy

**Neon PostgreSQL** with **Drizzle ORM**:

- Schema includes versioned trading rules, user customizations, signals with explanations, and journal entries
- pgvector extension planned for semantic memory in coach's "brain"
- Choice rationale: Neon provides serverless Postgres with connection pooling, automatic scaling, and branch-based workflows ideal for development

**Redis (Upstash)** planned for:

- Session management
- Rate limiting
- Distributed ring buffer persistence (optional)

**In-Memory Structures**:

- Ring buffer for hot market data (last 5,000 bars per symbol)
- Bar builder state (current bar accumulation, microbars)
- Choice rationale: Sub-millisecond latency for tick processing; persistence via periodic snapshots to Redis if needed

### Security Model

- **Helmet.js**: Configures HTTP security headers including CSP, prevents clickjacking
- **CORS**: Strict origin allowlist from environment variables (`APP_ORIGIN`, `ADMIN_ORIGIN`)
- **WebSocket Authentication**: Short-lived JWT tokens (60s TTL) prevent replay attacks
- **Connection Limits**: Maximum 3 realtime voice connections per user to prevent resource exhaustion
- **Environment Validation**: Zod schemas enforce required configuration at startup, failing fast on misconfiguration

### Frontend Architecture

**React 18 with TypeScript**:

- Component structure: Chart view, Coach bubble (talk/stop controls), Settings panel, Rules browser, Journal interface
- **Lightweight Charts** library for financial charting with real-time updates
- State management: React hooks (no Redux/Zustand initially; add if complexity grows)
- SSE client reconnects automatically and requests backfill via `sinceSeq` on resume

**Build System**:

- Vite for fast HMR and optimized production builds
- Tailwind CSS for utility-first styling
- Path aliases (`@client/*`, `@shared/*`) for clean imports

### Code Quality Infrastructure

- **ESLint 9** with flat config system, TypeScript-aware rules, and Prettier integration
- **Husky** git hooks trigger lint-staged on pre-commit
- **lint-staged** runs ESLint and Prettier only on changed files
- **GitHub Actions** (planned) for CI/CD: lint, type-check, test, and build verification

**Design Decision**: Using ESLint 9's new flat config requires migration from legacy `.eslintrc` but provides better performance, simpler configuration merging, and future-proof setup.

## External Dependencies

### Third-Party APIs

**Polygon.io**:

- WebSocket for real-time level-1 trades and quotes
- REST API for historical bar backfill
- Rate limits: WebSocket unlimited on paid plans; REST varies by tier
- Failover: Delayed data available on `delayed.polygon.io` for development

**OpenAI Realtime API**:

- WebSocket-based voice interface with streaming audio
- Server-side VAD for turn detection
- Function calling for coach actions (future: placing orders, querying rules)
- Cost consideration: Charged per audio minute; implement session timeouts

### Infrastructure Services

**Neon (PostgreSQL)**:

- Serverless Postgres with automatic scaling
- Connection pooling via `@neondatabase/serverless` driver
- Branch-based databases for preview deployments

**Upstash (Redis)** (optional):

- Serverless Redis for sessions and caching
- Global replication for low-latency access
- Alternative: Render Redis or self-hosted instance

### Key Libraries

**Data Processing**:

- `@polygon.io/client-js`: Official SDK for Polygon API
- `drizzle-orm`: Type-safe ORM with zero runtime overhead
- `zod`: Runtime schema validation for environment and API data

**Communication**:

- `ws`: WebSocket server implementation
- `express`: HTTP server and routing
- Native Fetch API for REST calls (Node 20+)

**Frontend**:

- `react` + `react-dom`: UI framework
- `lightweight-charts`: Financial charting library
- `tailwindcss`: Utility-first CSS framework

**Development**:

- `tsx`: Fast TypeScript execution for dev server
- `vite`: Frontend build tool
- `vitest`: Unit testing framework (Vite-native)
- `concurrently`: Run client and server dev processes simultaneously
