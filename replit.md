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