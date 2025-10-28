# Spotlight Trader

## Overview
Spotlight Trader is a production-grade, real-time trading coach application designed for high-frequency day traders. It offers real-time market data streaming, AI-powered voice coaching, a rule-based trading alerts system, and comprehensive journaling. The application prioritizes professional trader ergonomics with zero-lag, keyboard-first control, institutional-grade hotkeys, focus modes, latency monitoring, and accessibility features. Its core purpose is to deliver immediate insights and coaching to enhance trading performance and efficiency.

**Architecture:** Single-user application with no authentication. All data uses 'default-user' constant. App runs 100% on real-time Polygon.io data with no mock/demo data.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Monorepo Structure
The application utilizes a TypeScript monorepo managed with pnpm workspaces, comprising `apps/client` (React 18, Vite, Tailwind CSS), `apps/server` (Node.js 20 Express backend), `packages/shared`, and `packages/config`.

### Real-Time Data Pipeline
A deterministic, lossless data pipeline handles live market data, ensuring DST-safe exchange timezone management. It integrates direct Polygon REST API fetches for historical data, tick-by-tick streaming, and ultra-smooth 50ms microbars. Key components include a Bar Builder for accurate bar bucketing and RAF-based chart rendering for 60fps updates. Server-Sent Events (SSE) are used for streaming market data and trading alerts with lossless resume capabilities.

### Communication Protocols
- **Server-Sent Events (SSE)**: Used for streaming market data (1-minute bars, microbars, trading alerts) with lossless resume.
- **WebRTC (via OpenAI Agents SDK)**: Browser-to-OpenAI audio streaming for the voice coach using the official `@openai/agents` SDK, with automatic transport selection. Secured with ephemeral client tokens (60s expiry) and authenticated user sessions.

### Data Storage Strategy
- **Neon PostgreSQL with Drizzle ORM**: Stores versioned trading rules, user customizations, signals, and journal entries. Pgvector is planned for semantic memory.
- **Redis (Upstash)**: Planned for session management, rate limiting, and distributed ring buffer persistence.
- **In-Memory Structures**: Employed for the ring buffer and bar builder state to achieve sub-millisecond latency.

### Security Model
Security features include Helmet.js, strict CORS allowlisting, connection limits, and Zod for environment validation. **Note:** Authentication has been removed - app is single-user only with 'default-user' constant throughout the codebase.

### Frontend Architecture
Built with React 18 and TypeScript, incorporating Lightweight Charts, Zustand for state management, and Tailwind CSS. Vite handles bundling and API proxying. Features a professional charting system with a shared indicators library, a TOS-style toolbar, and a Pane component for multi-chart grids.

### Rules Engine Architecture
Facilitates strategy automation and AI explanations through a three-stage process: Expression Evaluation, Signal Generation with Risk Governance, and AI Explanation Generation using the OpenAI API.

### Journaling & Memory System
Provides structured trade tracking and automated end-of-day summaries. The Coach Memory System uses Pgvector to store and retrieve `playbook`, `glossary`, and `postmortem` memories with OpenAI embeddings.

### Continuous Learning Loop & Backtesting
An event-driven system with in-memory feature flags. Includes a database schema for user feedback and aggregated rule performance metrics. A deterministic backtest harness runs historical data against the same evaluator as live trading.

### Voice Presence Control System
A voice interface featuring modern animations, robust audio handling, and extensive personalization. Includes a core audio infrastructure, UI components like the PresenceBubble, and performance optimizations such as AudioWorklet for lower latency and enhanced barge-in capabilities.

### Trader UX Pack
Focuses on professional ergonomics:
- **Hotkey System**: Keyboard-first control and Command Palette.
- **Focus Modes**: `Trade Mode`, `Review Mode`, `Normal Mode`.
- **Signal Density Control**: Manages alert noise (`Quiet`, `Normal`, `Loud`).
- **Anchored VWAP**: Offers `Session`, `Premarket`, and `Custom` options.
- **Latency & Health HUD**: Displays real-time performance metrics.
- **Tape Peek**: Collapsible panel for real-time market metrics.
- **Accessibility**: Color vision presets and High Contrast Mode.
- **Performance Safeguards**: UI debouncing, microbar coalescing, lazy loading, and event throttling.

### Realtime Copilot System
An intelligent trading assistant that provides real-time pattern recognition, proactive alerts, and trade assistance. Built on a deterministic event-driven architecture with SSE streaming for sub-200ms latency.

**Core Components:**
- **Telemetry Bus**: EventEmitter bridge streaming market deltas from BarBuilder to copilot tools
- **Tool Registry**: 10 tool contracts with strict TypeScript types (chart snapshot, market stream, callouts, entry/exit proposals, rules evaluation, journal events, session summary, pattern stats, risk box, trade plan)
- **Tool Handlers**: Server-side implementations delegating to Pattern Memory, Rules Sentinel, and database
- **Copilot Broadcaster**: SSE event bus pushing real-time callouts from tool handlers to CalloutsOverlay UI
- **Rules Sentinel**: Risk governance with position limits, quality gates, circuit breakers (2-loss cooldown, daily-loss hard stop)
- **Pattern Memory**: Cached lookup service querying aggregated pattern stats (win rate, EV-R, MAE/MFE, false break rates, volume/range z-scores)
- **Trigger Engine**: BaseTrigger foundation with state machine (idle→primed→fired→cooldown) and hysteresis logic

**Database Schema Extensions:**
- `pattern_stats`: Symbol/timeframe/setup performance metrics with 1-hour cache TTL
- `callouts`: Copilot proposals with quality grade, urgency, rules validation
- `journal_events`: Enhanced journaling for entry/exit/decision/note events

**UI Components:**
- `CalloutsOverlay`: SSE-connected overlay displaying real-time copilot alerts with urgency color-coding and dismiss actions
- Integrated into App.tsx with lazy loading and Suspense boundaries

**API Routes:**
- `/api/copilot/*`: Tool handler endpoints for all 10 tools
- `/api/copilot/callouts/stream`: SSE endpoint with heartbeat for real-time callout delivery
- `/api/copilot/test/trigger-callout`: Test endpoint demonstrating tool→broadcaster→UI flow

**Trigger System (Phase 2 Complete):**
- **BaseTrigger**: State machine with idle→primed→fired→cooldown transitions and hysteresis (2-bar confirmation)
- **TriggerManager**: Event-driven processor listening to telemetry bus bar:new events with proper lifecycle management
- **Production Triggers**:
  - VWAP Reclaim/Reject: 2 consecutive closes above/below with volume confirmation (1.2x)
  - ORB Breakout: Opening range (first 2 bars) with 2x volume surge filter
  - EMA Pullback: 9/20 EMA uptrend with pullback to 9 EMA and shrinking volume (0.8x)
- **Deduplication**: 60-second callout cache prevents duplicate alerts
- **Configuration**: Externalized trigger parameters in `triggers/config.ts` for live tuning
- **Test Infrastructure**: `/api/triggers/test/*` endpoints for validation

**UI Enhancements:**
- **CalloutsOverlay**: SSE auto-reconnect, backpressure (10-callout cap, drops oldest "watch" first), Accept/Reject/Snooze actions
- **Auto-journaling**: Accept logs decision entry, Reject logs reasoning for learning loop
- **Symbol Snoozing**: 30-second per-symbol filtering with auto-expiry

**Performance Monitoring:**
- p50/p95 latency tracking with 60-second logging intervals
- Warns on >200ms latency, targets <150ms tick→callout pipeline
- Tool contracts frozen at v1.0.0 for API stability

**Status**: Phase 1 & 2 complete. Trigger system operational with sub-200ms latency. Ready for voice integration and advanced pattern mining.

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
- **Journaling & Memory**: `nanoid`, `node-cron`, `pgvector` extension.