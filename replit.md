# Spotlight Trader

## Overview
Spotlight Trader is a production-grade, real-time trading coach application designed for high-frequency day traders. It offers real-time market data streaming, AI-powered voice coaching, a rule-based trading alerts system, and comprehensive journaling. The application emphasizes professional trader UX ergonomics, providing zero-lag, keyboard-first control with features like institutional-grade hotkeys, focus modes, latency monitoring, and accessibility. Its primary goal is to deliver real-time insights and coaching to improve trading performance, holding significant market potential for professional trading communities.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Monorepo Structure
The application is organized as a TypeScript monorepo using pnpm workspaces, including `apps/client` (React 18, Vite, Tailwind CSS), `apps/server` (Node.js 20 Express backend), `packages/shared` (TypeScript types, Zod schemas), and `packages/config`.

### Real-Time Data Pipeline
A deterministic and lossless data pipeline processes live market data, ensuring DST-safe exchange timezone handling. Key components include a Bar Builder using `date-fns-tz` for accurate bar bucketing, RAF-based chart rendering for 60fps updates, and robust SSE reconnect logic with promise queue serialization for monotonic sequence ordering. The Polygon WebSocket connection incorporates a heartbeat timer for reliable connection monitoring.

### Communication Protocols
- **Server-Sent Events (SSE)**: Utilized for streaming market data (1-minute bars, microbars, trading alerts) with lossless resume capabilities.
- **WebSocket**: Employed for the voice coach, proxying bidirectional audio to OpenAI's Realtime API, supporting instant interruption and secured with short-lived HS256 JWTs.

### Data Storage Strategy
- **Neon PostgreSQL with Drizzle ORM**: Stores versioned trading rules, user customizations, signals, and journal entries. Pgvector is planned for semantic memory.
- **Redis (Upstash)**: Planned for session management, rate limiting, and distributed ring buffer persistence.
- **In-Memory Structures**: Used for the ring buffer and bar builder state to achieve sub-millisecond latency.

### Security Model
Security features include Helmet.js, strict CORS allowlisting, short-lived JWTs, connection limits, and Zod for environment validation. Dynamic CORS configuration supports trusted origins and Replit preview environments. Cookie-based authentication with httpOnly session cookies is used, alongside a demo mode for Replit-specific authentication. Session validation is server-backed, clearing stale client-side sessions and prompting re-login upon expiry.

### Frontend Architecture
Built with React 18 and TypeScript, using Lightweight Charts, Zustand for state management, and Tailwind CSS. Vite handles bundling and API proxying. A professional charting system features a Zustand store for state management, a shared indicators library, a TOS-style toolbar, and a Pane component integrating Lightweight-charts with various overlays, supporting multi-chart grids and smooth data updates.

### Rules Engine Architecture
This engine enables strategy automation with AI explanations through a three-stage process:
1.  **Expression Evaluation**: Validates and compiles user-defined rules against 1-minute bars to emit `rule:evaluated` events.
2.  **Signal Generation with Risk Governance**: Filters evaluated rules based on throttling, concurrent signal limits, and risk budget, persisting approved signals as `signal:new` events.
3.  **AI Explanation Generation**: Generates natural language explanations for new signals using the OpenAI API.
Real-time client updates are streamed via SSE to the AlertsPanel, and a RulesBrowser allows dry-run backtesting.

### Journaling & Memory System
Provides structured trade tracking and automated end-of-day summaries. The Coach Memory System uses Pgvector to store and retrieve `playbook`, `glossary`, and `postmortem` memories with OpenAI embeddings, featuring decay-aware retrieval and diversity filtering.

### Continuous Learning Loop & Backtesting
An event-driven system with in-memory feature flags for safe rollouts. It includes a database schema for user feedback and aggregated rule performance metrics. A learning loop service computes expectancy scores with exponential decay. A deterministic backtest harness runs historical data against the same evaluator as live trading, providing metrics and validating against a golden test corpus. The client UI supports signal rating and backtest execution.

### Voice Presence Control System
A voice interface featuring modern animations, robust audio handling, and extensive personalization. It includes a core audio infrastructure with persistent AudioContext/MediaStream, AnalyserNode for amplitude tracking, and secure VoiceTokenManager. UI components like the PresenceBubble, latency badges, and a VoiceFallback provide a rich user experience. Personalization settings (voice selection, tone, jargon, decisiveness) are managed client-side and synchronized with server-side `coachProfiles`. Interaction models include click-to-activate and toggle mic. Performance is optimized with stable rAF loops and reduced motion support, with specific compatibility fixes for iOS/iPadOS. Recent optimizations include AudioWorklet migration for lower latency, enhanced barge-in capabilities, audio frame batching with backpressure control, and idle detection for token savings.

### Trader UX Pack
Focuses on professional ergonomics with zero-lag interactions:
- **Hotkey System**: Keyboard-first control with core hotkeys and a Command Palette.
- **Focus Modes**: `Trade Mode`, `Review Mode`, and `Normal Mode` to minimize distraction.
- **Signal Density Control**: Manages alert noise with `Quiet`, `Normal`, and `Loud` modes.
- **Anchored VWAP**: Offers `Session`, `Premarket`, and `Custom` options.
- **Latency & Health HUD**: Displays real-time performance metrics (RTT, Tick→Wick P95, SSE reconnects).
- **Tape Peek**: Collapsible panel for real-time market metrics.
- **Accessibility**: Color vision presets and High Contrast Mode.
- **Performance Safeguards**: UI debouncing, microbar coalescing, lazy loading, and event throttling.

## External Dependencies

### Third-Party APIs
- **Polygon.io**: WebSocket for real-time market data and REST API for historical data.
- **OpenAI Realtime API**: WebSocket-based voice interface for the AI coach.

### Infrastructure Services
- **Neon (PostgreSQL)**: Serverless PostgreSQL database.
- **Upstash (Redis)**: Optional serverless Redis for caching and sessions.

### Key Libraries
- **Data Processing**: `@polygon.io/client-js`, `drizzle-orm`, `zod`, `date-fns@4.1.0`, `date-fns-tz@3.2.0`.
- **Communication**: `ws`, `express`.
- **Frontend**: `react`, `react-dom`, `lightweight-charts`, `tailwindcss`.
- **Journaling & Memory**: `nanoid`, `node-cron`, `pgvector` extension.