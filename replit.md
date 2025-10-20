# Spotlight Trader

## Overview
Spotlight Trader is a production-grade, real-time trading coach application for high-frequency day traders. It provides real-time market data, AI-powered voice coaching, a rule-based trading alert system, and comprehensive journaling. The application emphasizes professional trader ergonomics with zero-lag, keyboard-first control, institutional-grade hotkeys, focus modes, latency monitoring, and accessibility, aiming to enhance trading performance and efficiency through AI and real-time analytics. The project's ambition is to equip traders with advanced tools and a cutting-edge AI assistant.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application is a TypeScript monorepo using pnpm workspaces, comprising `apps/client` (React 18, Vite, Tailwind CSS), `apps/server` (Node.js 20 Express), and shared packages.

**Real-Time Data Pipeline**: Features a deterministic, lossless data pipeline for live market data, integrating Polygon REST API for historical data and tick-by-tick streaming down to 50ms microbars. Server-Sent Events (SSE) provide streaming market data and trading alerts with lossless resume capabilities. It supports 24/7 Polygon data with extended hours and a server-authoritative timeframe system with multi-timeframe rollups from a 1-minute buffer. Dynamic symbol subscription system with SymbolManager orchestrates Polygon WebSocket, bar builder, session VWAP, and history seeding with ref-counting and 5-minute TTL for inactive symbols.

**Communication Protocols**:
- **Server-Sent Events (SSE)**: For streaming market data and trading alerts.
- **WebRTC (via OpenAI Agents SDK)**: For browser-to-OpenAI audio streaming for the voice coach, secured with ephemeral client tokens.

**Data Storage Strategy**:
- **Neon PostgreSQL with Drizzle ORM**: Stores versioned trading rules, user customizations, signals, and journal entries. Pgvector is planned for semantic memory.
- **Redis (Upstash)**: Planned for session management, rate limiting, and distributed ring buffer persistence.
- **In-Memory Structures**: Used for ring buffer and bar builder state for sub-millisecond latency.

**Security Model**: Implements a 6-digit PIN authentication system with JWT-based sessions in httpOnly cookies. A `requirePin` middleware secures all API routes, SSE streams, and WebSocket upgrade handlers. Enhanced security includes Helmet.js, strict CORS, connection limits, and Zod for environment validation.

**Frontend Architecture**: Built with React 18 and TypeScript, utilizing Lightweight Charts, Zustand for state management, and Tailwind CSS. It includes a professional charting system, a TOS-style toolbar, and a Pane component for multi-chart grids.

**Multi-Timeframe Charting System (Oct 2025)**: Production-grade charting with lightweight-charts using direct ref-based lifecycle management. Features deterministic bar sequencing generalized for all timeframes (1m, 2m, 5m, 10m, 15m, 30m, 1h) with correct timestamp calculations, gap detection, and backfill logic. The PaneStable component provides single initialization, proper seeding from history API, volume histogram rendering, and real-time bar updates via SSE. Chart adapters (chartAdapters.ts) handle timeframe-aware millisecond→seconds conversion for lightweight-charts compatibility. Architecture choice: direct chart refs over hook abstraction for production-grade stability.

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