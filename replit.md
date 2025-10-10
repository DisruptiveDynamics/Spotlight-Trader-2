# Spotlight Trader

## Overview

Spotlight Trader is a production-grade real-time trading coach application for high-frequency day traders. Built as a TypeScript monorepo, it delivers real-time market data streaming, AI-powered voice coaching, a rule-based trading alerts system, and comprehensive journaling. The application prioritizes professional trader UX ergonomics, offering zero-lag, keyboard-first control with features like institutional-grade hotkeys, focus modes, latency monitoring, and accessibility. Its core purpose is to provide real-time insights and coaching to enhance trading performance and offers significant market potential for professional trading communities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Monorepo Structure
The application uses pnpm workspaces to organize `apps/client` (React 18, Vite, Tailwind CSS), `apps/server` (Node.js 20 Express backend), `packages/shared` (TypeScript types, Zod schemas), and `packages/config`.

### Real-Time Data Pipeline
A deterministic and lossless data pipeline processes live market data, including a Polygon WebSocket Client, an Event Bus, a Bar Builder for microbars and immutable 1-minute bars, a Ring Buffer Cache, and a History Service for intelligent backfill.

### Communication Protocols
- **Server-Sent Events (SSE)**: For streaming market data (1-minute bars, microbars, trading alerts), supporting lossless resume.
- **WebSocket**: For the voice coach, proxying bidirectional audio to OpenAI's Realtime API with instant interrupt capability and short-lived HS256 JWTs.

### Data Storage Strategy
- **Neon PostgreSQL with Drizzle ORM**: Stores versioned trading rules, user customizations, signals, and journal entries. Pgvector is planned for semantic memory.
- **Redis (Upstash)**: Planned for session management, rate limiting, and distributed ring buffer persistence.
- **In-Memory Structures**: Utilized for the ring buffer and bar builder state for sub-millisecond latency.

### Security Model
Security features include Helmet.js, strict CORS allowlisting, short-lived JWTs, connection limits, and Zod for environment validation. CORS is dynamically configured for trusted origins, Replit preview environments, and rejects unauthorized requests. Cookie-based authentication with httpOnly session cookies is used, with a demo mode for Replit-specific authentication flow.

### Frontend Architecture
Built with React 18 and TypeScript, using Lightweight Charts, Zustand for state management, and Tailwind CSS. Vite handles bundling and API proxying.

#### Professional Charting System
Features a Thinkorswim-level charting system with a Zustand store for state management (favorites, symbol, timeframe, layout, overlays), a shared indicators library, a TOS-style toolbar, and a Pane component integrating Lightweight-charts with various overlays and interactions. It supports multi-chart grids and ensures smooth data updates via SSE and microbar coalescing.

### Rules Engine Architecture
Enables strategy automation with AI explanations:
1.  **Expression Evaluation**: Validates and compiles user-defined rules, evaluating them against 1-minute bars to emit `rule:evaluated` events.
2.  **Signal Generation with Risk Governance**: Filters evaluated rules based on throttling, concurrent signal limits, and risk budget, persisting approved signals as `signal:new` events.
3.  **AI Explanation Generation**: Generates natural language explanations for new signals using OpenAI API (gpt-4o-mini).
4.  **Real-Time Client Updates**: Streams alerts via SSE to the AlertsPanel, and the RulesBrowser allows dry-run backtesting.

### Journaling & Memory System
Provides structured trade tracking and automated end-of-day summaries. The Coach Memory System (Pgvector) stores and retrieves `playbook`, `glossary`, and `postmortem` memories with OpenAI embeddings, featuring decay-aware retrieval and diversity filtering for personalized context.

### Continuous Learning Loop & Backtesting
- **Feature Flags System**: In-memory flags for safe rollouts (`enableBacktest`, `enableLearning`, `enableCoachMemory`).
- **Feedback & Metrics**: Database schema for user feedback on signals and daily aggregated rule performance metrics (`rule_metrics_daily`).
- **Learning Loop Service**: Event-driven system computing expectancy scores for rules with exponential decay for historical feedback.
- **Deterministic Backtest Harness**: Runs backtests with historical data using the same evaluator as live trading, providing metrics like avgHoldBars, triggersPerDay, and regimeBreakdown. Includes a golden test corpus for validation.
- **Client Feedback UI**: Components for rating signals and running backtests with UI for results.

### Voice Presence Control System
A voice interface with modern animations, robust audio handling, and complete personalization:
- **Core Audio Infrastructure**: Persistent AudioContext/MediaStream, Mute via `track.enabled`, AnalyserNode for amplitude tracking, accurate latency measurement, VoiceTokenManager for secure JWT.
- **Modern UI Components**: PresenceBubble with canvas-based wave animations, latency badges, thinking overlay, keyboard shortcuts, and ARIA labels. VoiceFallback provides a text input UI for mic permission denials.
- **Personalization System**: Client-side Zustand store with localStorage persistence for voice selection, tone presets, jargon density, and decisiveness. Server-side `coachProfiles` table stores settings, applied to OpenAI Realtime API.
- **Interaction Model**: Click-to-activate, toggle mic, and disconnect options.
- **Performance & Accessibility**: Stable rAF loops, reduced motion support, efficient canvas rendering, graceful degradation.
- **iOS/iPadOS Compatibility**: Lazy AudioContext initialization, smart permission flow, network resilience with exponential backoff, mobile UX optimizations, and clean lifecycle management.

### Trader UX Pack
Focuses on professional ergonomics with zero-lag interactions:
- **Hotkey System**: Keyboard-first control with core hotkeys and a Command Palette.
- **Focus Modes**: `Trade Mode`, `Review Mode`, and `Normal Mode` to reduce distraction.
- **Signal Density Control**: Manages alert noise with `Quiet`, `Normal`, and `Loud` modes.
- **Anchored VWAP**: Offers `Session`, `Premarket`, and `Custom` options.
- **Latency & Health HUD**: Displays real-time performance metrics (RTT, Tick→Wick P95, SSE reconnects).
- **Tape Peek**: Collapsible panel for real-time market metrics (Volume Z-Score, Uptick–Downtick Delta, Spread).
- **Accessibility**: Color vision presets (Protanopia, Deuteranopia, Tritanopia) and High Contrast Mode.
- **Performance Safeguards**: UI debouncing, microbar coalescing, lazy loading, and event throttling.

## External Dependencies

### Third-Party APIs
- **Polygon.io**: WebSocket for real-time market data and REST API for historical data.
- **OpenAI Realtime API**: WebSocket-based voice interface for the AI coach.

### Infrastructure Services
- **Neon (PostgreSQL)**: Serverless PostgreSQL database.
- **Upstash (Redis)**: Optional serverless Redis for caching and sessions.

### Key Libraries
- **Data Processing**: `@polygon.io/client-js`, `drizzle-orm`, `zod`.
- **Communication**: `ws`, `express`.
- **Frontend**: `react`, `react-dom`, `lightweight-charts`, `tailwindcss`.
- **Journaling & Memory**: `nanoid`, `node-cron`, `pgvector` extension.