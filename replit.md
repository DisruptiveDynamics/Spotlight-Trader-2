# Spotlight Trader

## Overview

Spotlight Trader is a production-grade real-time trading coach application built as a TypeScript monorepo. It integrates market data streaming, AI-powered voice coaching, a rule-based trading alerts system, journaling capabilities, and professional trader UX ergonomics. The system processes live market data from Polygon.io, delivers real-time charts and alerts via Server-Sent Events, and provides an interactive voice coach powered by OpenAI's Realtime API through WebSocket connections. With institutional-grade hotkeys, focus modes, latency monitoring, and accessibility features, it provides zero-lag, keyboard-first control for high-frequency day traders.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Monorepo Structure

The application is organized using **pnpm workspaces** into `apps/client` (React 18, Vite, Tailwind CSS), `apps/server` (Node.js 20 Express backend for APIs, WebSockets, SSE), `packages/shared` (TypeScript types, Zod schemas), and `packages/config` (ESLint, Prettier, TypeScript configs). This structure promotes code sharing and separation of concerns.

### Real-Time Data Pipeline

The market data pipeline is **deterministic and lossless**. It involves:

1.  **Polygon WebSocket Client**: Persistent connection to Polygon.io for level-1 data.
2.  **Event Bus**: Type-safe event distribution for data flow.
3.  **Bar Builder**: Consumes ticks to produce 250ms microbars and immutable 1-minute bars with strict monotonic sequencing.
4.  **Ring Buffer Cache**: Stores the last 5,000 finalized bars per symbol in memory for fast access.
5.  **History Service**: Provides intelligent backfill using the ring buffer and Polygon REST API.
    A key design decision is that the bar builder never mutates finalized bars, ensuring deterministic replay.

### Communication Protocols

- **Server-Sent Events (SSE)** for market data (`/stream/market`): Streams 1-minute bars, microbars, and trading alerts. Supports lossless resume via `sinceSeq`. Chosen for its efficiency in unidirectional streaming.
- **WebSocket** for voice coach (`/ws/realtime`): Proxies bidirectional audio to OpenAI Realtime API. Features instant interrupt capability and requires short-lived HS256 JWTs for security with strict origin validation.

### Data Storage Strategy

- **Neon PostgreSQL with Drizzle ORM**: Used for versioned trading rules, user customizations, signals with explanations, and journal entries. Pgvector extension is planned for semantic memory.
- **Redis (Upstash)**: Planned for session management, rate limiting, and potentially distributed ring buffer persistence.
- **In-Memory Structures**: Ring buffer for hot market data and bar builder state for sub-millisecond latency.

### Security Model

Security features include **Helmet.js** for HTTP security headers, strict **CORS** origin allowlisting, short-lived **JWTs** for WebSocket authentication, connection limits, and **Zod** for environment validation.

### Frontend Architecture

Built with **React 18 and TypeScript**, using **Lightweight Charts** for financial charting, **Tailwind CSS** for styling, and React hooks for state management. **Vite** is used for bundling, and the SSE client handles automatic reconnection and backfill.

### Code Quality Infrastructure

Utilizes **ESLint 9** with flat config, **Prettier**, **Husky** git hooks for pre-commit linting, and **lint-staged**. **GitHub Actions** are planned for CI/CD.

### Rules Engine Architecture

Enables strategy automation with AI explanations:

1.  **Expression Evaluation**: User-defined rules (e.g., "close > ema20") are validated against whitelists (functions, variables) and compiled using math.js. Evaluates against new 1-minute bars, emitting `rule:evaluated` events with confidence scores.
2.  **Signal Generation with Risk Governance**: `RiskGovernor` filters evaluated rules based on duplicate throttling, concurrent signal limits, and risk budget enforcement. Approved signals are persisted and emit `signal:new` events.
3.  **AI Explanation Generation**: `Coach Advisor` generates natural language explanations for new signals via OpenAI API (gpt-4o-mini), storing them with token usage tracking.
4.  **Real-Time Client Updates**: SSE stream emits alert events, displayed in the `AlertsPanel`. The `RulesBrowser` allows dry-run backtesting on recent bars. Strict whitelisting prevents arbitrary code execution, and caching optimizes performance.

## External Dependencies

### Third-Party APIs

- **Polygon.io**: WebSocket for real-time market data (trades, quotes) and REST API for historical bar backfill.
- **OpenAI Realtime API**: WebSocket-based voice interface with streaming audio and server-side VAD.

### Infrastructure Services

- **Neon (PostgreSQL)**: Serverless Postgres for database needs.
- **Upstash (Redis)**: Optional serverless Redis for caching and sessions.

### Key Libraries

- **Data Processing**: `@polygon.io/client-js`, `drizzle-orm`, `zod`.
- **Communication**: `ws` (WebSocket server), `express` (HTTP server), native Fetch API.
- **Frontend**: `react`, `react-dom`, `lightweight-charts`, `tailwindcss`.
- **Development**: `tsx`, `vite`, `vitest`, `concurrently`.
- **Journaling & Memory**: `nanoid` (ID generation), `node-cron` (EOD scheduler), pgvector extension for semantic similarity.

## Journaling & Memory System

### Journaling Architecture

The journaling system provides structured trade tracking and end-of-day summaries:

1.  **Journal Entries** (`journals/model.ts`, `journals/service.ts`):
    - Stores daily markdown entries with optional structured Trade objects
    - Trade structure includes: symbol, side (long/short), entry/exit prices, scales, P&L, regime (trend/range/news/illiquid), and tape metrics (volume Z-score, spread bp, uptick delta)
    - Full CRUD operations: create, read, update, delete
    - Links journals to signals for context

2.  **End-of-Day Scheduler** (`journals/eod.ts`):
    - Runs automatically at 15:59:30 America/New_York via node-cron
    - Aggregates signals fired during the day
    - Generates markdown summary with:
      - Total signals fired count
      - Top 3 signals by expectancy (confidence × win rate)
      - Drift notes (e.g., low signal volume warnings)
      - Keep/Stop/Try bullets for strategy refinement
    - Creates journal_links for each signal

3.  **API Endpoints** (`routes/journals.ts`):
    - `POST /api/journals` - Create journal entry (text or tradeJson)
    - `GET /api/journals` - List journals (with optional date filter)
    - `GET /api/journals/:id` - Get specific journal
    - `PUT /api/journals/:id` - Update journal
    - `DELETE /api/journals/:id` - Delete journal and links
    - `POST /api/journals/eod/preview` - Preview EOD summary without persisting

### Coach Memory System (Pgvector)

The memory system enables the coach to learn and recall across sessions:

1.  **Memory Storage** (`memory/store.ts`, `memory/embed.ts`):
    - Three memory kinds: `playbook` (strategies), `glossary` (terminology), `postmortem` (lesson learned)
    - Each memory includes: text, tags, createdAt, and 1536-dimensional embedding
    - OpenAI embeddings API (`text-embedding-3-small`) with 2k character truncation
    - Stored in `coach_memories` table with pgvector HNSW index for fast similarity search

2.  **Decay-Aware Retrieval**:
    - `retrieveTopK(userId, query, k=4, decayHalfLifeDays=10, diversityPenalty=0.1)`
    - Computes cosine similarity between query embedding and stored memories
    - Applies time decay: `score = cosineSimilarity × exp(-age/halfLife)`
    - Diversity filtering: Skips memories with Jaccard tag overlap >0.8 to avoid redundancy
    - Returns top-K memories with relevance scores

3.  **Session Context Integration** (`coach/sessionContext.ts`):
    - `buildSessionContext(userId)` loads coach profile (tone, decisiveness, jargon) from `coach_profiles`
    - Retrieves top 4 relevant memories using query "what should I keep in mind today?"
    - Constructs compact context block (<1200 tokens) with profile + memory previews
    - `getInitialSessionUpdate(userId)` merges context into OpenAI Realtime API `session.update`
    - Wired into `voiceProxy.ts` so coach has personalized memory on every connection

4.  **API Endpoints** (`routes/memory.ts`):
    - `POST /api/memory` - Save memory with kind, text, tags (auto-generates embedding)
    - `GET /api/memory` - List memories (filter by kind, tag, limit)
    - `GET /api/memory/search?q=<query>&k=<num>` - Semantic search with decay/diversity

### Client Components

1.  **JournalView** (`features/journal/JournalView.tsx`):
    - Daily list sidebar grouped by date
    - Markdown/JSON preview pane
    - "Journal it" modal for quick note or structured Trade entry
    - "Preview EOD" button to view EOD summary before it runs

2.  **MemoryPanel** (`features/memory/MemoryPanel.tsx`):
    - Add memory item: kind selector + textarea + tags input
    - List recent memories with kind badges (playbook/glossary/postmortem)
    - Semantic search with relevance scores
    - Filter by kind (all/playbook/glossary/postmortem)

### Design Decisions

- **Deterministic EOD Schedule**: Fixed 15:59:30 NY time ensures consistent end-of-day processing
- **Vector Similarity with Decay**: Recent memories weighted higher, preventing stale advice
- **Diversity Penalty**: Jaccard filtering (>0.8 overlap) avoids redundant similar memories
- **Token Budget**: Session context limited to 1200 tokens to preserve coach responsiveness
- **Strict Validation**: Zod schemas on all API endpoints prevent malformed data
- **Cascade Deletes**: Deleting journal removes journal_links automatically for data integrity

## Trader UX Pack

Professional ergonomics for high-frequency day traders with zero-lag interactions and minimal cognitive load.

### Hotkey System

**HotkeyManager** (`services/HotkeyManager.ts`) provides keyboard-first control:

**Core Hotkeys:**
- `T` - Push-to-talk (hold on mobile, toggle on desktop)
- `Space` - Pause/resume live stream (freeze chart)
- `A` - Set alert at cursor price
- `J` - New journal note (opens modal)
- `G+V` - Toggle VWAP anchors (sequence)
- `1/2/3` - Switch timeframes (1m/5m/15m)
- `Cmd/Ctrl+K` - Command palette

**Command Palette** (`components/CommandPalette.tsx`):
- Fuzzy command search
- Categories: Analysis, Navigation, View, Indicators
- Commands: "Explain this bar", "Jump to last signal", "Toggle focus mode"
- Hotkey cheat-sheet in footer

### Focus Modes

**FocusManager** (`services/FocusManager.ts`) reduces distraction:

1. **Trade Mode**: 
   - Hides Rules, Journal, Memory panels
   - Enlarges Chart + Coach to full width
   - Dims non-price UI to 30% opacity
   - Persisted in localStorage

2. **Review Mode**:
   - Pins Journal + Signals timeline
   - Freezes live stream
   - Hides Coach panel
   - Enables bar-by-bar stepper (planned)

3. **Normal Mode**: Default, all panels visible

Toggle via Command Palette or custom events (`command:focus-trade`, `command:focus-review`).

### Signal Density Control

**SignalDensityControl** (`components/SignalDensityControl.tsx`) gates alert noise:

- **Quiet Mode**: Min confidence 75%, regime+tape required, max 1 signal ("Top opportunity only")
- **Normal Mode**: Min confidence 60%, regime required, max 3 signals
- **Loud Mode**: Min confidence 50%, no filters, max 5 signals

Audio alerts respect `prefers-reduced-motion`. Settings persisted in localStorage.

### Anchored VWAP

**VWAPControls** (`components/VWAPControls.tsx`):

- **Session VWAP**: Anchored to market open (9:30 ET)
- **Premarket VWAP**: Anchored to 4:00 AM ET
- **Custom VWAP**: User-defined datetime picker

Visual chip on chart shows active anchor & price offset. Evaluator supports `vwap_session()` and anchored variants.

### Latency & Health HUD

**LatencyHUD** (`components/LatencyHUD.tsx`) displays real-time performance:

**Metrics:**
- **RTT** (voice): Round-trip time to OpenAI Realtime API
- **Tick→Wick P95**: 95th percentile latency from market tick to chart paint
- **SSE Reconnects**: Count of SSE stream reconnections
- **Market Status**: LIVE / HALTED / PREMARKET / CLOSED

**Color Thresholds:**
- Green: < 120ms (optimal)
- Amber: 120-180ms (degraded)
- Red: > 180ms (poor)

Tooltips provide optimization tips (e.g., "Close browser tabs" for high tick latency).

### Tape Peek

**TapePeek** (`components/TapePeek.tsx`) - collapsible right panel:

- **Volume Z-Score** (2min): Mini-bar chart, color-coded (green >2σ, red <-2σ)
- **Uptick–Downtick Delta**: Sparkline of buying pressure
- **Spread (bp)**: Badge with Tight/Normal/Wide classification

Lightweight, render-cheap (no Level 2 DOM). Lazy-loaded on first open.

### Accessibility

**AccessibilityControls** (`components/AccessibilityControls.tsx`):

**Color Vision Presets:**
- Normal (Green/Red)
- Protanopia (Blue/Yellow)
- Deuteranopia (Blue/Orange)
- Tritanopia (Cyan/Pink)

**High Contrast Mode**: 15-20% border/text contrast boost

**Reduced Motion**: Auto-detects system preference, disables animations

CSS variables (`--color-up`, `--color-down`, `--color-neutral`) enable palette swaps. `.high-contrast` class increases text shadows and border opacity.

### Performance Safeguards

- **UI Debouncing**: Alerts panel updates at max 10Hz
- **Microbar Coalescing**: `requestAnimationFrame` batching, locked to 60 FPS
- **Lazy Loading**: Tape Peek and Journal editors load on demand
- **Event Throttling**: Hotkey sequences timeout after 1s

### Testing

- **HotkeyManager**: Keymaps, command dispatch, sequence handling (G+V), input exclusion
- **FocusManager**: Panel visibility, opacity, stream freeze events, localStorage persistence
- **LatencyHUD**: Color thresholds (green/amber/red), metric updates, tooltips

Run: `pnpm test`

### Design Decisions

- **Keyboard-First**: All actions accessible via hotkeys for zero-latency control
- **Event-Driven**: Custom events decouple components (e.g., `hotkey:toggle-vwap`)
- **Persistent State**: Focus mode, density, VWAP anchors saved in localStorage
- **WCAG AA Contrast**: High contrast mode + color vision presets ensure accessibility
- **Institutional Ergonomics**: Tape metrics, latency HUD, multi-timeframe sync for pro traders
