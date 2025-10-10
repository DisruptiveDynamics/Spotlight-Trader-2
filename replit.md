# Spotlight Trader

## Overview

Spotlight Trader is a production-grade real-time trading coach application designed for high-frequency day traders. It's built as a TypeScript monorepo and offers real-time market data streaming, AI-powered voice coaching, a rule-based trading alerts system, and comprehensive journaling capabilities. The application emphasizes professional trader UX ergonomics, providing zero-lag, keyboard-first control with features like institutional-grade hotkeys, focus modes, latency monitoring, and accessibility. Its core purpose is to provide real-time insights and coaching to enhance trading performance.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Monorepo Structure

The application uses **pnpm workspaces** to organize `apps/client` (React 18, Vite, Tailwind CSS), `apps/server` (Node.js 20 Express backend), `packages/shared` (TypeScript types, Zod schemas), and `packages/config`.

### Real-Time Data Pipeline

A **deterministic and lossless** data pipeline processes live market data. It includes a **Polygon WebSocket Client**, an **Event Bus** for type-safe distribution, a **Bar Builder** for microbars and immutable 1-minute bars, a **Ring Buffer Cache** for recent bars, and a **History Service** for intelligent backfill.

### Communication Protocols

- **Server-Sent Events (SSE)**: Used for streaming market data (`/stream/market`), including 1-minute bars, microbars, and trading alerts, supporting lossless resume.
- **WebSocket**: Employed for the voice coach (`/ws/realtime`), proxying bidirectional audio to OpenAI's Realtime API with instant interrupt capability and short-lived HS256 JWTs for security.

### Data Storage Strategy

- **Neon PostgreSQL with Drizzle ORM**: Stores versioned trading rules, user customizations, signals, and journal entries. Pgvector extension is planned for semantic memory.
- **Redis (Upstash)**: Planned for session management, rate limiting, and distributed ring buffer persistence.
- **In-Memory Structures**: Utilized for the ring buffer and bar builder state to achieve sub-millisecond latency.

### Security Model

Security features include **Helmet.js**, strict **CORS** allowlisting, short-lived **JWTs**, connection limits, and **Zod** for environment validation.

**CORS Configuration**: Dynamic origin checking allows:

- Explicitly trusted origins from `APP_ORIGIN` and `ADMIN_ORIGIN` environment variables
- Any `*.replit.dev` domain when `REPL_ID` is present (Replit preview environment)
- Proper rejection of unauthorized origins with clear error messages

**Authentication in Replit**: Cookie-based auth with httpOnly session cookies. Demo mode (`/api/auth/demo`) hydrates Zustand store directly with user data from API response to bypass Vite proxy cookie limitations while maintaining security through server-side httpOnly cookies.

### Frontend Architecture

Built with **React 18 and TypeScript**, using **Lightweight Charts** for financial charting, **Zustand** for state management, and **Tailwind CSS** for styling. **Vite** handles bundling with API proxy configuration for `/api`, `/stream`, and `/ws` routes.

#### Professional Charting System (Thinkorswim-level)

**State Management** (`chartState.ts`):

- Zustand store with localStorage persistence for favorites, active symbol/timeframe, layout, chart style, and overlays
- Supports 1x1, 2x1, 2x2 grid layouts with independent panes
- Overlay configuration: EMA periods, Bollinger Bands, VWAP (session/anchored), Volume SMA, shared crosshair

**Shared Indicators Library** (`packages/shared/src/indicators.ts`):

- Pure calculation functions: `emaBatch`, `bollingerBatch`, `vwapSessionBatch`, `vwapAnchoredBatch`, `volumeSmaBatch`
- No future leakage, documented warmup periods
- Session-aware VWAP with timezone handling via dayjs

**Toolbar Component** (TOS-style):

- Symbol input with typeahead, timeframe buttons (1m/5m/15m/1h/D)
- Studies dropdown: EMA multi-period chips, Bollinger settings, VWAP mode selector, shared crosshair toggle
- Layout controls (1x1/2x1/2x2), chart style (candles/bars/line)
- Status pill: LIVE/PAUSED/RECONNECTING

**Pane Component**:

- Lightweight-charts integration with candlestick/line/bar series
- Volume subpane: histogram with color-coded bars + SMA overlay
- Overlays: EMA lines, Bollinger Bands (mid/upper/lower), VWAP (solid/dashed), volume average
- OHLC tooltip on crosshair hover
- Right-click context menu for anchored VWAP
- Session shading utilities for premarket/after-hours (planned)

**MultiChart Grid**:

- CSS grid layout with responsive panes
- Focus ring for active pane (keyboard navigation ready)
- Independent symbol/timeframe per pane (extensible)

**Data Pipeline**:

- `fetchHistory` utility with session boundary calculations (dayjs-timezone)
- SSE market streaming with `sinceSeq` resume capability
- Microbar RAF coalescing for smooth updates
- Mock data fallback when Polygon API unavailable

### Rules Engine Architecture

This system enables strategy automation with AI explanations:

1.  **Expression Evaluation**: Validates and compiles user-defined rules, evaluating them against 1-minute bars to emit `rule:evaluated` events.
2.  **Signal Generation with Risk Governance**: `RiskGovernor` filters evaluated rules based on throttling, concurrent signal limits, and risk budget, persisting approved signals as `signal:new` events.
3.  **AI Explanation Generation**: `Coach Advisor` generates natural language explanations for new signals using OpenAI API (gpt-4o-mini).
4.  **Real-Time Client Updates**: Alerts are streamed via SSE to the `AlertsPanel`, and the `RulesBrowser` allows dry-run backtesting.

### Journaling & Memory System

- **Journaling Architecture**: Provides structured trade tracking and automated end-of-day summaries with markdown entries, trade objects, and links to signals.
- **Coach Memory System (Pgvector)**: Stores and retrieves `playbook`, `glossary`, and `postmortem` memories with OpenAI embeddings, featuring decay-aware retrieval and diversity filtering. This system integrates a personalized context into the OpenAI Realtime API.

### Continuous Learning Loop & Backtesting

**Feature Flags System** (`apps/server/src/flags.ts`):

- In-memory feature flags for safe rollouts: `enableBacktest`, `enableLearning`, `enableCoachMemory`
- GET `/api/flags` endpoint for client feature discovery
- Helper functions: `isEnabled()`, `getFlags()` for server-side checks

**Feedback Schema** (Database):

- `feedback` table: Stores user feedback on signals (good/bad/missed/late) with optional notes
- `rule_metrics_daily` table: Aggregates daily rule performance (fired, actionable, good, bad counts)
- Supports continuous improvement of rule quality based on trader feedback

**Learning Loop Service** (`apps/server/src/learning/loop.ts`):

- Event-driven system listening to `rule:evaluated` and `signal:approved` events
- Daily metrics computation: expectancy score = (good - bad) / actionable
- Exponential decay for historical feedback (0.95 decay factor)
- Scoring algorithm: baseScore _ (1 + expectancy _ 0.5) for rule quality ranking

**Deterministic Backtest Harness** (`apps/server/src/backtest/engine.ts`):

- POST `/api/backtest/run` - Run deterministic backtests with historical data
- GET `/api/backtest/presets` - Common strategy presets
- Uses SAME evaluator as live trading for consistency
- Custom `BacktestValidationError` for proper 400/500 error mapping
- Chronological bar replay sorted by `bar_start` for deterministic results
- Metrics: avgHoldBars, triggersPerDay, regimeBreakdown (by hour)
- Currently supports 1m timeframe only

**Golden Test Corpus** (`apps/server/src/backtest/golden.test.ts`):

- Fixtures with sample bars, rules, and expected triggers
- Per-rule trigger validation (seq, price)
- Metrics validation for deterministic behavior
- Vitest with vi.spyOn for clean test isolation
- Edge cases: empty bars, zero triggers, reproducibility tests

**Client Feedback UI**:

- `SignalFeedback.tsx` - Component for rating signals (good/bad/missed/late) with optional notes
- `BacktestPanel.tsx` - UI for running backtests with date range, symbol, and rule selection
- Displays trigger count, hold duration, triggers/day, and regime breakdown

### Trader UX Pack

Focuses on professional ergonomics with zero-lag interactions:

- **Hotkey System**: Provides keyboard-first control with core hotkeys and a `Command Palette` for fuzzy search and command execution.
- **Focus Modes**: `Trade Mode`, `Review Mode`, and `Normal Mode` reduce distraction by adjusting panel visibility and live stream behavior.
- **Signal Density Control**: Allows users to manage alert noise with `Quiet`, `Normal`, and `Loud` modes based on confidence and filtering.
- **Anchored VWAP**: Offers `Session`, `Premarket`, and `Custom` VWAP options.
- **Latency & Health HUD**: Displays real-time performance metrics like RTT, Tick→Wick P95, and SSE reconnects, with color-coded thresholds.
- **Tape Peek**: A collapsible panel displaying real-time market metrics such as Volume Z-Score, Uptick–Downtick Delta, and Spread.
- **Accessibility**: Includes color vision presets (Protanopia, Deuteranopia, Tritanopia) and a High Contrast Mode.
- **Performance Safeguards**: Implements UI debouncing, microbar coalescing, lazy loading, and event throttling.

## External Dependencies

### Third-Party APIs

- **Polygon.io**: WebSocket for real-time market data and REST API for historical data.
- **OpenAI Realtime API**: WebSocket-based voice interface for the AI coach.

### Infrastructure Services

- **Neon (PostgreSQL)**: Serverless PostgreSQL database.
- **Upstash (Redis)**: Optional serverless Redis for caching and sessions.

### Key Libraries

- **Data Processing**: `@polygon.io/client-js`, `drizzle-orm`, `zod`.
- **Communication**: `ws` (WebSocket server), `express` (HTTP server).
- **Frontend**: `react`, `react-dom`, `lightweight-charts`, `tailwindcss`.
- **Development**: `tsx`, `vite`, `vitest`, `concurrently`.
- **Journaling & Memory**: `nanoid`, `node-cron`, `pgvector` extension.
