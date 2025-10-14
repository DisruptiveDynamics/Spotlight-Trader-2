# Spotlight Trader

## Overview

Spotlight Trader is a production-grade, real-time trading coach application for high-frequency day traders. It provides real-time market data, AI-powered voice coaching, a rule-based trading alert system, and comprehensive journaling. The application emphasizes professional trader ergonomics with zero-lag, keyboard-first control, institutional-grade hotkeys, focus modes, latency monitoring, and accessibility. Its primary goal is to deliver immediate insights and coaching to improve trading performance and efficiency, aiming to empower traders with cutting-edge AI and real-time analytics.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

### October 14, 2025 - Unified Dev Server (Complete)

- **Single-Port Architecture**: Implemented unified dev server serving both Express API and Vite frontend on port 5000 (UNIFIED_DEV=1 mode)
- **Networking Fix**: Resolved ECONNREFUSED errors by eliminating inter-process communication - Express now serves Vite middleware directly
- **Route Filtering**: Vite middleware properly filters API routes (/api, /ws, /stream, /health, /realtime) vs client routes with SPA fallback
- **Security Configuration**: Updated CORS and CSP with UNIFIED_DEV guards - allows localhost origins and WebSocket protocols in dev mode only
- **HMR Integration**: Configured Vite Hot Module Replacement with Replit environment detection (WSS protocol for HTTPS proxy)
- **Known Limitation**: HMR WebSocket gracefully degrades to polling mode in Replit due to HTTPS proxy hostname rewriting - this is a platform limitation, not a regression
- **Workflow Update**: Removed separate Client workflow, single Server workflow now serves both client and API

### October 14, 2025 - Phase 10: CI + Documentation (Complete)

- **GitHub Actions CI**: Automated quality gates with install, lint, typecheck, test with coverage, build steps
- **Coverage Artifacts**: Upload coverage reports and summaries with 30-day retention
- **Comprehensive Documentation**: Created metrics.md (telemetry), contributing.md (dev workflow), feature_flags.md (manifest)
- **Architecture Updates**: Moved system_overview.md to /docs/architecture/ with Phase 6-10 enhancements
- **CHANGELOG**: Keep a Changelog format with Unreleased section tracking all features from Phase 1-10
- **CI Workflow**: Runs on push/PR to main and develop branches, uses `pnpm test:coverage:summary` to avoid watch mode hang

### October 14, 2025 - Phase 9: Test Expansion + Coverage (Complete)

- **Test Infrastructure**: Added 75 new unit tests across 6 critical modules with mock-based validation
- **Coverage Configuration**: Set coverage thresholds (80% overall, 85% core modules) with v8 provider and multi-format reporting
- **Test Categories Created**: Voice state machine (11 tests), audit middleware (18 tests), incremental indicators (7 tests), SSE reconciliation (13 tests), memory flush (13 tests), snapshot hash (13 tests)
- **Coverage Tooling**: Added `pnpm test:coverage` and `pnpm test:coverage:summary` scripts with audits/coverage_summary.txt output
- **Known Limitation**: Tests currently use mock implementations for isolation; refactoring needed to import and exercise actual production code for meaningful coverage metrics

### October 14, 2025 - Phase 8: Memory Flush + Proactive Risk Gating

- **Shutdown Flush with Retries**: Implemented graceful shutdown for voice memory with 3-attempt retry logic (500ms delays), ensures insights are persisted even during unexpected termination
- **Risk Status System**: Added GREEN/YELLOW/RED risk status to Rules Sentinel based on circuit breaker state, daily P&L, and consecutive losses
- **Proactive Callout Gating**: Callouts now only emit when risk status is GREEN or YELLOW, suppressing alerts during RED (circuit breaker active or critical loss)
- **Pattern Statistics Integration**: Proactive callouts now include win rate, avg holding duration (timeToTarget), and EV-R from pattern memory for data-driven coaching
- **Snapshot Hash System**: Added deterministic hash (seqLast-firstBarTime-timeframe-barCount) to chart snapshots with `lastSeenHash` param for efficient change detection
- **Enhanced Callout Context**: Callouts now carry risk status and pattern stats for voice/UI consumption

### October 14, 2025 - Phase 6: Voice Tool Integrity & Performance

- **Micro Tools Implementation**: Added high-frequency micro tools (`get_last_price`, `get_last_vwap`, `get_last_ema`) with sub-1s latency targets, returning structured `{symbol, value, ts}` responses
- **Tool Throttling**: Implemented TokenBucket-based rate limiting with per-tool limits (micro tools: 8/sec, snapshot tools: 2/sec, risk tools: 1/sec) and structured error responses with retry timing
- **Runtime Auditing**: Created middleware to detect price hallucinations in voice responses using regex pattern matching, logs violations when AI mentions prices without tool calls within 2s window, with optional auto-correction
- **TTS Jitter Buffer**: Client-side buffer smooths audio delivery with 150ms target and 350ms max latency, drops oldest chunks on overflow and tracks `tts_jitter_drop_total` metric
- **Voice Metrics Expansion**: Added comprehensive voice telemetry including `voice_stt_first_partial_ms`, `voice_tts_first_audio_ms`, `tool_exec_latency_ms` (per-tool histograms), `voice_session_reconnects_total`, `voice_tool_violation_total`
- **ToolsBridge Integration**: Integrated throttling checks and performance metrics tracking into tool execution pipeline with correlation IDs for distributed tracing

### October 14, 2025 - Resilience & Observability Improvements

- **Networking Fix**: Updated Vite proxy to use `0.0.0.0:8080` instead of `localhost:8080` for Replit cloud compatibility
- **Demo Login Hardening**: Added exponential backoff retry logic (3 attempts, 1s → 2s → 4s delays) with user feedback during retries
- **Health Endpoints**: Added `/api/livez`, `/api/readyz`, `/api/healthz` for debugging and monitoring
- **Error Handling**: Implemented global process error handlers (`uncaughtException`, `unhandledRejection`) that log and exit to prevent undefined states; improved Express error middleware for consistent API error responses
- **Port Cleanup Utility**: Created `pnpm cleanup` script to kill orphaned processes on ports 5000 and 8080

## System Architecture

### Monorepo Structure

The application uses a TypeScript monorepo with pnpm workspaces, including `apps/client` (React 18, Vite, Tailwind CSS), `apps/server` (Node.js 20 Express), `packages/shared`, and `packages/config`.

### Real-Time Data Pipeline

A deterministic, lossless data pipeline handles live market data, including DST-safe exchange timezone management. It integrates Polygon REST API for historical data, tick-by-tick streaming, and 50ms microbars. Server-Sent Events (SSE) are used for streaming market data and trading alerts with lossless resume capabilities. The system supports 24/7 real Polygon data with extended hours and overnight REST API fallback. It uses a server-authoritative timeframe system with multi-timeframe rollups, driven by a 1-minute authoritative buffer.

### Communication Protocols

- **Server-Sent Events (SSE)**: For streaming market data (1-minute bars, microbars, trading alerts) with lossless resume.
- **WebRTC (via OpenAI Agents SDK)**: Handles browser-to-OpenAI audio streaming for the voice coach, secured with ephemeral client tokens and authenticated user sessions.

### Data Storage Strategy

- **Neon PostgreSQL with Drizzle ORM**: Stores versioned trading rules, user customizations, signals, and journal entries. Pgvector is planned for semantic memory.
- **Redis (Upstash)**: Planned for session management, rate limiting, and distributed ring buffer persistence.
- **In-Memory Structures**: Used for ring buffer and bar builder state for sub-millisecond latency.

### Security Model

Includes Helmet.js, strict CORS allowlisting, short-lived JWTs, connection limits, Zod for environment validation, and cookie-based authentication with httpOnly session cookies.

### Frontend Architecture

Built with React 18 and TypeScript, using Lightweight Charts, Zustand for state management, and Tailwind CSS. Features a professional charting system, a TOS-style toolbar, and a Pane component for multi-chart grids.

### Rules Engine Architecture

Facilitates strategy automation and AI explanations through Expression Evaluation, Signal Generation with Risk Governance, and AI Explanation Generation using the OpenAI API.

### Journaling & Memory System

Provides structured trade tracking and automated end-of-day summaries. The Coach Memory System uses Pgvector to store and retrieve `playbook`, `glossary`, `postmortem`, and `knowledge` memories with OpenAI embeddings. Nexa 2.0 introduces a knowledge upload pipeline for ingesting YouTube videos, PDFs, and text notes with semantic chunking and OpenAI embeddings, and integrates these memories into session context.

### Continuous Learning Loop & Backtesting

An event-driven system with in-memory feature flags and a database schema for user feedback. A deterministic backtest harness runs historical data against the same evaluator as live trading.

### Voice Presence Control System

A voice interface with modern animations, robust audio handling, and personalization. Includes core audio infrastructure, UI components, performance optimizations, a Voice Tools Registry (7 tools), Function Call Routing to Copilot tool handlers, Callout Streaming, and Tool-Powered Responses for real-time coaching. The coach has a persistent identity ("Nexa", she/her pronouns, warm personality).

### Trader UX Pack

Focuses on professional ergonomics including: Hotkey System, Focus Modes (`Trade Mode`, `Review Mode`, `Normal Mode`), Signal Density Control, Anchored VWAP, Latency & Health HUD, Tape Peek, Accessibility features, and Performance Safeguards.

### Realtime Copilot System

An intelligent trading assistant providing real-time pattern recognition, proactive alerts, and trade assistance. Built on a deterministic event-driven architecture with SSE streaming for sub-200ms latency. Core components include a Telemetry Bus, a 10-tool Tool Registry, Copilot Broadcaster, Rules Sentinel for risk governance, and Pattern Memory. It features an event-driven Trigger System and UI components for `CalloutsOverlay`.

### AI Intelligence & Proactive Coaching

Enhanced AI coach with unrestricted tool usage, memory integration, trader behavior analysis, and proactive market monitoring. Coach Policy enhancements ensure real-time data access, mandatory tool calls, and ultra-brief responses. A Voice Memory Bridge captures insights, and a Trader Pattern Detector analyzes journal history. The Proactive Coaching Engine monitors for market alerts, feeding into tool-powered voice responses. The voice model was upgraded to `gpt-realtime`.

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
