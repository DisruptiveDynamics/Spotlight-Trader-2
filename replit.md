# Spotlight Trader

## Overview
Spotlight Trader is a production-grade, real-time trading coach application designed for high-frequency day traders. It offers real-time market data streaming, AI-powered voice coaching, a rule-based trading alerts system, and comprehensive journaling. The application prioritizes professional trader ergonomics with zero-lag, keyboard-first control, institutional-grade hotkeys, focus modes, latency monitoring, and accessibility features. Its core purpose is to deliver immediate insights and coaching to enhance trading performance and efficiency.

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
Security features include Helmet.js, strict CORS allowlisting, short-lived JWTs, connection limits, Zod for environment validation, and cookie-based authentication with httpOnly session cookies. A demo mode is available for Replit.

### Frontend Architecture
Built with React 18 and TypeScript, incorporating Lightweight Charts, Zustand for state management, and Tailwind CSS. Vite handles bundling and API proxying. Features a professional charting system with a shared indicators library, a TOS-style toolbar, and a Pane component for multi-chart grids.

### Rules Engine Architecture
Facilitates strategy automation and AI explanations through a three-stage process: Expression Evaluation, Signal Generation with Risk Governance, and AI Explanation Generation using the OpenAI API.

### Journaling & Memory System
Provides structured trade tracking and automated end-of-day summaries. The Coach Memory System uses Pgvector to store and retrieve `playbook`, `glossary`, and `postmortem` memories with OpenAI embeddings.

### Continuous Learning Loop & Backtesting
An event-driven system with in-memory feature flags. Includes a database schema for user feedback and aggregated rule performance metrics. A deterministic backtest harness runs historical data against the same evaluator as live trading.

### Voice Presence Control System (Phase 3 Complete)
A voice interface featuring modern animations, robust audio handling, and extensive personalization. Includes a core audio infrastructure, UI components like the PresenceBubble, and performance optimizations such as AudioWorklet for lower latency and enhanced barge-in capabilities.

**Phase 3 - Voice Integration with Copilot:**
- **Voice Tools Registry**: 7 tools registered in OpenAI Realtime API format (get_chart_snapshot, propose_entry_exit, get_recommended_risk_box, get_pattern_summary, evaluate_rules, log_journal_event, generate_trade_plan)
- **Function Call Routing**: VoiceProxy intercepts response.function_call_arguments.done events and routes to copilot tool handlers with userId context
- **Callout Streaming**: VoiceCalloutBridge connects CopilotBroadcaster to voice sessions - triggers inject alerts as conversation items for real-time coaching
- **Tool-Powered Responses**: Voice assistant can query chart data, validate rules, calculate trade plans, and log decisions during conversation
- **Coach Policy**: Updated with tool usage instructions and alert handling guidelines (sub-15-second responses)

**Integration Flow:**
Trigger fires → CopilotBroadcaster → VoiceCalloutBridge → Voice session receives [ALERT] → OpenAI calls tools for analysis → Voice speaks coaching response

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

**Status**: Phase 1, 2 & 3 complete. Trigger system operational with sub-200ms latency. Voice integration fully wired with tool calling and callout streaming.

### AI Intelligence & Proactive Coaching (Phase 4 Complete)
Enhanced the AI coach with unrestricted tool usage, memory integration, trader behavior analysis, and proactive market monitoring for maximum intelligence and helpfulness.

**Coach Policy Enhancements:**
- **Unrestricted Tool Usage**: Removed all restrictions - coach freely calls multiple tools per response for comprehensive market awareness
- **Proactive Instructions**: Explicit guidelines for using tools proactively, checking data before responding, auto-journaling decisions
- **Pattern Formation Focus**: Detect setups FORMING (not just formed) for early warnings
- **Trader Mistake Tracking**: Pre-warn about behavioral patterns before they become problems
- **Platform Positioning**: Coach is ALONGSIDE trading platform (no execution features)

**Voice Memory Bridge** (`apps/server/src/coach/voiceMemoryBridge.ts`):
- Auto-captures insights from voice conversations to pgvector memory store
- Three capture types: setup learnings (A-grade), trader patterns (behavioral), mistakes (lessons)
- 30-second buffer with automatic flush for efficient batch writes
- Graceful shutdown handling ensures no data loss
- Semantic retrieval via OpenAI embeddings for contextual coaching

**Trader Pattern Detector** (`apps/server/src/coach/traderPatternDetector.ts`):
- Analyzes 7-day journal history with 2+ occurrence threshold
- Detects 5 behavioral patterns:
  - **Late Entry**: Entries after ideal setup window
  - **Chasing**: Pursuing breakouts after momentum shift
  - **FOMO**: Fear-driven entries without confirmation
  - **Oversizing**: Position size beyond risk parameters
  - **Revenge Trading**: Back-to-back trades within 30min after losses
- Severity scoring (low/medium/high) with specific recommendations
- Auto-saves patterns to memory for persistent learning

**Proactive Coaching Engine** (`apps/server/src/coach/proactiveCoaching.ts`):
- Event-driven market monitoring via telemetry bus
- Real-time alert detection:
  - **Volume Surge**: >150% of average (potential breakout forming)
  - **Volume Divergence**: Price rising but volume declining (weakness signal)
  - **Tape Slowdown**: Volume <70% average AND range <50% ATR (wait for expansion)
  - **Regime Shift**: Trend/volatility state changes (adjust strategy)
  - **Pattern Formation**: VWAP approach, EMA pullback (early setup detection)
- 60-second cooldown per alert type prevents spam
- Direct integration with copilotBroadcaster → VoiceCalloutBridge → Voice sessions

**Intelligence Flow:**
```
Market Ticks → Telemetry Bus → Proactive Coaching Engine → Alerts
                             ↓
Journal Events → Trader Pattern Detector → Warnings → Voice Memory
                             ↓
Voice Tool Calls → Memory Bridge → Pgvector (semantic retrieval)
                             ↓
CopilotBroadcaster → VoiceCalloutBridge → Voice speaks coaching
```

**Key Features:**
- Zero restrictions on AI tool usage for maximum intelligence
- Automatic memory capture from voice interactions
- Behavioral pattern detection with actionable recommendations
- Proactive market alerts delivered through voice interface
- Sub-200ms latency maintained throughout intelligence pipeline

**Status**: Phase 4 complete. AI coach operates with maximum intelligence, proactive awareness, and continuous learning from trader behavior.

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