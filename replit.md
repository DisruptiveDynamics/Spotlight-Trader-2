# Spotlight Trader

## Overview

Spotlight Trader is a production-grade, real-time trading coach application designed for high-frequency day traders. It provides real-time market data, AI-powered voice coaching, a rule-based trading alert system, and comprehensive journaling. The application focuses on professional trader ergonomics with zero-lag, keyboard-first control, institutional-grade hotkeys, focus modes, latency monitoring, and accessibility. Its primary goal is to deliver immediate insights and coaching to improve trading performance and efficiency, with a business vision to empower traders with cutting-edge AI and real-time analytics.

## Recent Changes

**October 13, 2025** - 24/7 Real Polygon Data Pipeline: Extended Hours & REST API Fallback:

- **Extended Hours Support**: System now uses Polygon WebSocket during ALL extended trading hours (4 AM - 8 PM ET)
  - Previously: Only connected during regular hours (9:30 AM - 4 PM ET)
  - Now: Real-time ticks during pre-market (4-9:30 AM), regular (9:30 AM-4 PM), and after-hours (4-8 PM ET)
- **Overnight REST API Fallback**: Outside extended hours (8 PM - 4 AM ET), system uses Polygon REST API for historical data
  - WebSocket unavailable overnight, but REST API provides last close, historical bars
  - Mock tick generator simulates live feed for smooth UI experience
- **Separated Concerns**: Split `useMockData` (auth failure) from `useWebSocket` (extended hours availability)
  - `isUsingMockData()`: Returns true only if Polygon auth fails
  - `isUsingWebSocket()`: Returns true during extended hours when WebSocket is active
- **Smart Fallback Logic**: Priority order: WebSocket ticks → REST API bars → Mock data (auth failure only)
- **Verified Real Data**: System confirmed streaming real Polygon ticks (SPY $662.7, QQQ $601.835) during after-hours testing

**October 13, 2025** - Mock Data Pricing Fix: Eliminated Historical Data Pollution:

- **Root Cause Fix**: Voice tools were returning stale historical prices (~$431) instead of current mock prices (~$580)
- **Mock Mode Detection**: Added `isUsingMockData()` method to PolygonWebSocket for system-wide mock mode awareness
- **Historical Backfill Prevention**: Modified `getHistory()` to skip Polygon REST API when in mock mode
- **Clean Data Flow**: Mock ticks → BarBuilder → bars1m buffer now flows without historical data contamination
- **Price Accuracy**: Voice tools (`get_last_price`, `get_chart_snapshot`) now return correct current mock prices
- **Type Safety**: Fixed TypeScript strict mode error in mockTickGenerator (NodeJS.Timeout type)
- **Verified Pipeline**: Confirmed mock data flows end-to-end: ticks generate → bars build → voice tools query correct prices

**October 13, 2025** - Nexa Speed Upgrade: Micro-Tools & Smart Routing:

- **Micro-Tools for Instant Responses**: Added 3 lightning-fast tools for single metrics (<1s response time)
  - `get_last_price`: Returns current price only (~50 bytes, 300-800ms)
  - `get_last_vwap`: Returns session VWAP only (~50 bytes, 300-800ms)
  - `get_last_ema`: Returns single EMA (9/21/50/200) (~60 bytes, 300-800ms)
- **Smart Intent Routing**: Voice policy updated to route simple questions to micro-tools, complex analysis to snapshot
- **Bar Count Safety**: Capped `get_chart_snapshot` to max 100 bars (default 20, down from 500) preventing data overload
- **5-Second TTL Cache**: All tools cache results for 5s to prevent redundant fetches for repeated questions
- **Smart Timeouts**: 1.2s timeout for micro-tools, 2s for snapshots with graceful degradation
- **Performance Boost**: Simple questions now answered in <1s vs previous 5+ minutes (500-bar fetches eliminated)
- **Type Safety Fixes**: Fixed LSP errors in ToolBridge with proper TypeScript union types
- **Codebase Cleanup**: Removed obsolete voice client implementations (VoiceClient.ts, EnhancedVoiceClient.ts, EnhancedVoiceClient.v2.ts, CoachBubble.tsx) - RealtimeVoiceClient.ts is now the sole canonical implementation

**October 13, 2025** - Server-Authoritative Timeframe System with Multi-Timeframe Rollups:

- **1m Authoritative Buffer**: Single source of truth for all bar data, continuously fed regardless of user's selected timeframe
- **Deterministic Roll-ups**: Real-time aggregation from 1m→2/5/10/15/30/60m with UTC-aligned bucket boundaries (TradingView/TOS standard)
- **Server-Side Timeframe Switching**: POST /api/chart/timeframe endpoint with atomic transitions, optimistic UI updates
- **Unified VWAP Calculator**: Session tick-level VWAP using same data stream as Tape for consistency across charts/voice/UI
- **Voice AI Multi-Timeframe Support**: get_chart_snapshot tool now queries bars1m buffer with timeframe parameter
- **SSE Streaming Fix**: Dynamic listener lifecycle ensures ringBuffer receives ONLY active timeframe bars (no mixed data)
- **Dual Listener Architecture**: Permanent listener for bars1m buffer + dynamic listener for SSE streaming per user timeframe
- **Optional Market Audit Tap**: Passive validation system (disabled by default via flag) for debugging bar/tape/vwap consistency
- **Critical Fix**: 1m barBuilder subscription never removed, ensuring continuous data flow to all downstream systems

**October 12, 2025** - Nexa 2.0: Persistent Memory & Knowledge Upload System:

- **Nexa Identity**: Voice coach now has persistent identity ("Nexa", she/her pronouns, warm personality) stored in coach_profiles table
- **Knowledge Upload Pipeline**: Users can teach Nexa via YouTube videos, PDFs, and text notes with semantic chunking and OpenAI embeddings
- **API Endpoints**: `/api/nexa/upload/*` (YouTube/PDF/text), `/api/nexa/uploads` (history), `/api/nexa/preferences` (GET/PUT/PATCH)
- **Memory Retrieval**: Session context now includes top-5 knowledge chunks from user uploads, token-budgeted to ~400 tokens
- **Preferences Sync**: Database-backed user preferences (favoriteSymbols, focusMode, signalDensity, signalAudio, colorVision, highContrast, notifications)
- **Smart Isolation**: Knowledge memories excluded from playbook/glossary/postmortem retrieval to prevent pollution
- **Deep Merge Logic**: PATCH endpoint properly merges nested preference objects without data loss

**Earlier (October 12, 2025)** - Fixed voice assistant data access and upgraded model:

- Wired `get_chart_snapshot` tool to ring buffer for real-time market data
- Voice assistant now has access to: bars, VWAP, EMAs (9/21), session stats, volatility, regime detection
- All 7 voice tools properly connected to live data sources
- Fixed BarBuilder for monotonic sequence numbers and complete first bar initialization
- **Upgraded from deprecated `gpt-4o-realtime-preview-2024-12-17` to `gpt-realtime` (GA)** - 30% better function calling, more reliable tool usage
- Strengthened system prompt to force mandatory tool calls for market questions

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Monorepo Structure

The application uses a TypeScript monorepo with pnpm workspaces, including `apps/client` (React 18, Vite, Tailwind CSS), `apps/server` (Node.js 20 Express), `packages/shared`, and `packages/config`.

### Real-Time Data Pipeline

A deterministic, lossless data pipeline handles live market data, ensuring DST-safe exchange timezone management. It integrates Polygon REST API for historical data, tick-by-tick streaming, and 50ms microbars. Server-Sent Events (SSE) are used for streaming market data and trading alerts with lossless resume capabilities.

### Communication Protocols

- **Server-Sent Events (SSE)**: Used for streaming market data (1-minute bars, microbars, trading alerts) with lossless resume.
- **WebRTC (via OpenAI Agents SDK)**: Handles browser-to-OpenAI audio streaming for the voice coach, secured with ephemeral client tokens and authenticated user sessions.

### Data Storage Strategy

- **Neon PostgreSQL with Drizzle ORM**: Stores versioned trading rules, user customizations, signals, and journal entries. Pgvector is planned for semantic memory.
- **Redis (Upstash)**: Planned for session management, rate limiting, and distributed ring buffer persistence.
- **In-Memory Structures**: Used for ring buffer and bar builder state to achieve sub-millisecond latency.

### Security Model

Includes Helmet.js, strict CORS allowlisting, short-lived JWTs, connection limits, Zod for environment validation, and cookie-based authentication with httpOnly session cookies.

### Frontend Architecture

Built with React 18 and TypeScript, using Lightweight Charts, Zustand for state management, and Tailwind CSS. Features a professional charting system, a TOS-style toolbar, and a Pane component for multi-chart grids.

### Rules Engine Architecture

Facilitates strategy automation and AI explanations through Expression Evaluation, Signal Generation with Risk Governance, and AI Explanation Generation using the OpenAI API.

### Journaling & Memory System

Provides structured trade tracking and automated end-of-day summaries. The Coach Memory System uses Pgvector to store and retrieve `playbook`, `glossary`, `postmortem`, and `knowledge` memories with OpenAI embeddings.

**Knowledge Upload System** (Nexa 2.0):

- **Multi-Source Ingestion**: YouTube transcripts (via @xenova/transformers), PDFs (pdf-parse), and raw text
- **Processing Pipeline**: Source extraction → semantic chunking (500 tokens, 50 overlap) → batch embeddings → vector storage
- **Smart Retrieval**: Knowledge queries use cosine similarity search, returning top-k chunks with source metadata
- **Session Integration**: Voice sessions auto-inject relevant knowledge (token-budgeted ~400 tokens) alongside personal memories
- **Upload Tracking**: knowledgeUploads table tracks processing status, chunk count, and metadata per source

### Continuous Learning Loop & Backtesting

An event-driven system with in-memory feature flags and a database schema for user feedback. A deterministic backtest harness runs historical data against the same evaluator as live trading.

### Voice Presence Control System

A voice interface with modern animations, robust audio handling, and personalization. Includes core audio infrastructure, UI components like the PresenceBubble, and performance optimizations. It features a Voice Tools Registry (7 tools), Function Call Routing to Copilot tool handlers, Callout Streaming, and Tool-Powered Responses for real-time coaching. The Coach Policy is updated for sub-15-second responses.

### Trader UX Pack

Focuses on professional ergonomics including:

- **Hotkey System**: Keyboard-first control and Command Palette.
- **Focus Modes**: `Trade Mode`, `Review Mode`, `Normal Mode`.
- **Signal Density Control**: Manages alert noise.
- **Anchored VWAP**: Offers `Session`, `Premarket`, and `Custom` options.
- **Latency & Health HUD**: Displays real-time performance metrics.
- **Tape Peek**: Collapsible panel for market metrics.
- **Accessibility**: Color vision presets and High Contrast Mode.
- **Performance Safeguards**: UI debouncing, microbar coalescing, lazy loading, and event throttling.

### Realtime Copilot System

An intelligent trading assistant providing real-time pattern recognition, proactive alerts, and trade assistance. Built on a deterministic event-driven architecture with SSE streaming for sub-200ms latency.

- **Core Components**: Telemetry Bus, 10-tool Tool Registry with handlers, Copilot Broadcaster for SSE events, Rules Sentinel for risk governance, and Pattern Memory for cached lookup.
- **Trigger System**: Event-driven processor with BaseTrigger state machine for managing production triggers like VWAP Reclaim/Reject, ORB Breakout, and EMA Pullback.
- **UI Components**: `CalloutsOverlay` for real-time alerts with actions (Accept/Reject/Snooze) and auto-journaling.

### AI Intelligence & Proactive Coaching

Enhanced AI coach with unrestricted tool usage, memory integration, trader behavior analysis, and proactive market monitoring.

- **Coach Policy Enhancements**: Explicit real-time data access, mandatory tool calls ("verify-then-speak"), ultra-brief 1-sentence responses, debounce logic, and forbidden phrases.
- **Voice Memory Bridge**: Auto-captures insights from voice conversations to a pgvector memory store.
- **Trader Pattern Detector**: Analyzes journal history to detect behavioral patterns (e.g., Late Entry, Chasing, FOMO, Oversizing, Revenge Trading) with severity scoring.
- **Proactive Coaching Engine**: Event-driven market monitoring for alerts like Volume Surge, Volume Divergence, Tape Slowdown, Regime Shift, and Pattern Formation.
- **Intelligence Flow**: Market ticks and journal events feed into detection and coaching engines, leading to tool-powered voice responses.

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
