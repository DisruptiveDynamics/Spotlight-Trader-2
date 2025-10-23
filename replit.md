# Spotlight Trader

## Overview
Spotlight Trader is a production-grade, real-time trading coach application for high-frequency day traders. It provides real-time market data, AI-powered voice coaching, a rule-based trading alert system, and comprehensive journaling. The application emphasizes professional trader ergonomics with zero-lag, keyboard-first control, institutional-grade hotkeys, focus modes, latency monitoring, and accessibility, aiming to enhance trading performance and efficiency through AI and real-time analytics. The project's ambition is to equip traders with advanced tools and a cutting-edge AI assistant.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application is a TypeScript monorepo using pnpm workspaces, comprising `apps/client` (React 18, Vite, Tailwind CSS), `apps/server` (Node.js 20 Express), and shared packages.

**Real-Time Data Pipeline**: Features a deterministic, lossless data pipeline for live market data, integrating Polygon REST API for historical data and tick-by-tick streaming down to 50ms microbars. Server-Sent Events (SSE) provide streaming market data and trading alerts with lossless resume capabilities. It supports 24/7 Polygon data with extended hours and a server-authoritative timeframe system with multi-timeframe rollups from a 1-minute buffer. Dynamic symbol subscription system with SymbolManager orchestrates Polygon WebSocket, bar builder, session VWAP, and history seeding with ref-counting and 5-minute TTL for inactive symbols.

**Phase 1 Data Correctness (Oct 2025)**: Production-grade minute-bar reconciliation system ensuring tick-based estimates are replaced with official Polygon AM aggregates when available. Dual subscription model (T.* ticks + AM.* aggregates) with idempotent dedupe via `reconciledSeqs` tracking prevents duplicate emissions. `ringBuffer.replaceOrUpsertBySeq()` ensures single bar per seq across all consumers. `bars1m.reconcile()` matches by seq (primary) with bar_end fallback for DST safety. Seq calculation strictly `floor(bar_start/60000)` for deterministic alignment across all sources. Volume drift logging alerts when tick-based vs AM differs >10%.

**Session Policy System (Oct 2025)**: Intelligent session management with auto-switching between RTH (regular trading hours 9:30 AM-4:00 PM ET) and RTH_EXT (extended hours 4:00 AM-8:00 PM ET) based on market time. User preference stored in database with three modes: "auto" (time-based switching), "rth" (RTH only), "rth_ext" (extended hours only). Data pipeline (barBuilder, history service) emits ALL bars unfiltered to preserve Phase 1 guarantees - session filtering intended for future implementation at API/SSE layer with user context. SessionPolicy service provides getCurrentSession() for auto mode and getUserSession() for preference-aware filtering. UI includes Settings panel with session policy selector under "Market" tab.

**Communication Protocols**:
- **Server-Sent Events (SSE)**: For streaming market data and trading alerts.
- **WebRTC (via OpenAI Agents SDK)**: For browser-to-OpenAI audio streaming for the voice coach, secured with ephemeral client tokens.

**Data Storage Strategy**:
- **Neon PostgreSQL with Drizzle ORM**: Stores versioned trading rules, user customizations, signals, and journal entries. Pgvector is planned for semantic memory.
- **Redis (Upstash)**: Planned for session management, rate limiting, and distributed ring buffer persistence.
- **In-Memory Structures**: Used for ring buffer and bar builder state for sub-millisecond latency.

**Security Model**: Implements a 6-digit PIN authentication system with JWT-based sessions in httpOnly cookies. A `requirePin` middleware secures all API routes, SSE streams, and WebSocket upgrade handlers. Enhanced security includes Helmet.js, strict CORS, connection limits, and Zod for environment validation.

**Frontend Architecture**: Built with React 18 and TypeScript, utilizing Lightweight Charts, Zustand for state management, and Tailwind CSS. It includes a professional charting system, a TOS-style toolbar, and a Pane component for multi-chart grids.

**Unified Dev Mode & HMR (Oct 2025)**: Production-grade development environment with Vite HMR running through a single Express server (port 5000) to eliminate page blinking and connection issues. Auto-detects Replit via `REPLIT_DOMAINS` env var and configures HMR for wss://443 with explicit public hostname. Client config (`apps/client/vite.config.ts`) extracts PUBLIC_HOST from REPLIT_DOMAINS for client-side WebSocket connections. Server config (`apps/server/src/dev/unifiedVite.ts`) passes shared Express server handle to Vite middleware, preserving unified dev mode without creating separate WebSocket listeners. Local dev defaults to HTTP mode (ws protocol, port 5000), supports explicit VITE_HTTPS=1 override for testing HTTPS locally.

**Multi-Timeframe Charting System (Oct 2025)**: Production-grade charting with lightweight-charts using direct ref-based lifecycle management. Features deterministic bar sequencing generalized for all timeframes (1m, 2m, 5m, 10m, 15m, 30m, 1h) with correct timestamp calculations, gap detection, and backfill logic. The PaneStable component provides single initialization, proper seeding from history API, volume histogram rendering, and real-time bar updates via SSE. Chart adapters (chartAdapters.ts) handle timeframe-aware millisecond→seconds conversion for lightweight-charts compatibility. Architecture choice: direct chart refs over hook abstraction for production-grade stability.

**Infinite Scrolling & Session-Aware Styling (Oct 2025)**: Professional chart UX with infinite backwards scrolling to load unlimited historical data matching TOS/TradingView standards. Visible range listener triggers automatic pagination when user scrolls within 20 bars of left edge, fetching 200 bars at a time using `before` parameter API. Maintains client-side candle/volume buffers merged via setData() for correct prepending. Session-aware volume bar styling with shared timezone detection utility (Intl.DateTimeFormat with America/New_York) provides visual distinction: full opacity (1.0) during RTH (9:30 AM-4:00 PM ET Mon-Fri), muted opacity (0.3) during extended hours. Server-side drift warnings suppressed outside RTH since sparse tick feed is expected behavior. Implementation preserves Phase 1 data correctness guarantees.

**Eastern Time Display (Oct 2025)**: Chart timestamps display in ET (America/New_York) instead of UTC for trader-friendly time display. Implemented via `timeFormatET.ts` using date-fns-tz with DST support. Provides `formatTickET()` for chart x-axis labels (12-hour format with AM/PM) and `formatTooltipET()` for crosshair/tooltip timestamps. Wired through lightweight-charts `localization.timeFormatter` and `timeScale.tickMarkFormatter` for consistent ET display across all chart interactions.

**Chart Listener Cleanup (Oct 2025)**: Production-grade memory management for SSE and chart event listeners. Added `off*` unsubscribe methods (offBar, offStatus, offMicro, etc.) to marketStream.ts for proper listener cleanup. PaneStable uses stable handler references with proper cleanup in useEffect return. Infinite scroll listener uses correct `subscribeVisibleLogicalRangeChange` with stable handler and unsubscribe cleanup, 300ms debounce prevents excessive API calls.

**Initial Bar Count & Polygon Singleton (Oct 2025)**: Increased symbol subscription seedLimit from 200 to 500 bars for richer initial chart views showing full trading day (9:30 AM - 8:00 PM ET = 630 minutes). Server now seeds 280-320 bars on startup (3-4x improvement from previous 86 bars). Added Polygon WebSocket singleton enforcement: connect() method now properly closes existing connections before creating new ones, preventing "Maximum websocket connections exceeded" errors during development restarts. Singleton pattern with exponential backoff (1s-60s with jitter) ensures only one WebSocket connection exists at any time. Initial history API fetch increased from 300 to 500 bars for fuller chart coverage.

**Immutable OHLCV Data Integrity (Oct 2025)**: Production-grade multi-layered defense against mutable bar object corruption preventing empty `ohlcv:{}` resync loops. BarBuilder creates frozen immutableOHLCV objects before emission, eliminating shared references to mutable state that could be corrupted by subsequent ticks. RingBuffer validates and creates immutable snapshots via `createImmutableSnapshot()` with `Object.freeze()`, ensuring stored bars cannot be mutated post-storage. SSE endpoint adds `hasCompleteOHLCV()` type guard filtering invalid bars during backfill/seed operations before transmission to clients. Three-layer validation (BarBuilder emission → RingBuffer storage → SSE transmission) ensures deterministic, immutable bar data across all consumers with comprehensive error logging for observability.

**Rules Engine Architecture**: Enables strategy automation and AI explanations through expression evaluation, signal generation with risk governance, and AI explanation generation via the OpenAI API.

**Journaling & Memory System**: Offers structured trade tracking and automated end-of-day summaries. The Coach Memory System employs Pgvector for storing and retrieving `playbook`, `glossary`, `postmortem`, and `knowledge` memories using OpenAI embeddings. A knowledge upload pipeline supports ingesting YouTube videos, PDFs, and text notes with semantic chunking.

**Continuous Learning Loop & Backtesting**: An event-driven system with in-memory feature flags and a database schema for user feedback. A deterministic backtest harness evaluates historical data.

**Voice Presence Control System**: A voice interface with core audio infrastructure, UI components, performance optimizations, a Voice Tools Registry (7 tools), function call routing, callout streaming, and tool-powered responses. The coach ("Nexa", she/her) maintains a persistent, warm identity.

**Trader UX Pack**: Focuses on professional ergonomics including a Hotkey System, Focus Modes (`Trade Mode`, `Review Mode`, `Normal Mode`), Signal Density Control, Anchored VWAP, Latency & Health HUD, Tape Peek, Accessibility features, and Performance Safeguards.

**Realtime Copilot System**: An intelligent trading assistant providing real-time pattern recognition, proactive alerts, and trade assistance. It operates on a deterministic event-driven architecture with SSE streaming for sub-200ms latency. Key components include a Telemetry Bus, a 10-tool Tool Registry, Copilot Broadcaster, Rules Sentinel for risk governance, and Pattern Memory. It features an event-driven Trigger System and UI for `CalloutsOverlay`.

**AI Intelligence & Proactive Coaching**: The AI coach has unrestricted tool usage, memory integration, trader behavior analysis, and proactive market monitoring. Coach Policy enhancements ensure real-time data access, mandatory tool calls, and ultra-brief responses. A Voice Memory Bridge captures insights, and a Trader Pattern Detector analyzes journal history. The Proactive Coaching Engine monitors market alerts, feeding into tool-powered voice responses, using the `gpt-realtime` model.

## External Dependencies

### Third-Party APIs
- **Polygon.io**: WebSocket for real-time market data and REST API for historical data.
- **OpenAI Realtime API**: WebRTC-based voice interface for the AI coach.

### Infrastructure Services
- **Neon (PostgreSQL)**: Serverless PostgreSQL database.
- **Upstash (Redis)**: Optional serverless Redis for caching and sessions.

### Key Libraries
- **Data Processing**: `@polygon.io/client-js`, `drizzle-orm`, `zod`, `date-fns-tz`.
- **Communication**: `@openai/agents`, `ws`, `express`.
- **Frontend**: `react`, `react-dom`, `lightweight-charts`, `tailwindcss`.
- **Journaling & Memory**: `nanoid`, `node-cron`, `pgvector`.
- **Knowledge Processing**: `@xenova/transformers`, `pdf-parse`, `multer`, `youtube-transcript`.