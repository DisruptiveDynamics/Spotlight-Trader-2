# Spotlight Trader

## Overview

Spotlight Trader is a production-grade real-time trading coach application built as a TypeScript monorepo. It integrates market data streaming, AI-powered voice coaching, a rule-based trading alerts system, and journaling capabilities. The system processes live market data from Polygon.io, delivers real-time charts and alerts via Server-Sent Events, and provides an interactive voice coach powered by OpenAI's Realtime API through WebSocket connections. Its purpose is to provide real-time, intelligent trading assistance.

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
