# Spotlight Trader

## Overview
Spotlight Trader is a production-grade, real-time trading coach application designed for high-frequency day traders. It provides real-time market data, AI-powered voice coaching, a rule-based trading alert system, and comprehensive journaling. The application focuses on professional trader ergonomics with zero-lag, keyboard-first control, institutional-grade hotkeys, focus modes, latency monitoring, and accessibility. Its primary goal is to deliver immediate insights and coaching to improve trading performance and efficiency, with a business vision to empower traders with cutting-edge AI and real-time analytics.

## Recent Changes
**October 12, 2025** - Fixed voice assistant data access:
- Wired `get_chart_snapshot` tool to ring buffer for real-time market data
- Voice assistant now has access to: bars, VWAP, EMAs (9/21), session stats, volatility, regime detection
- All 7 voice tools properly connected to live data sources
- Fixed BarBuilder for monotonic sequence numbers and complete first bar initialization

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
Provides structured trade tracking and automated end-of-day summaries. The Coach Memory System uses Pgvector to store and retrieve `playbook`, `glossary`, and `postmortem` memories with OpenAI embeddings.

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