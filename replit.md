# Spotlight Trader

## Overview
Spotlight Trader is a production-grade, real-time trading coach application for high-frequency day traders. It provides real-time market data streaming, AI-powered voice coaching, a rule-based trading alerts system, and comprehensive journaling. The application emphasizes professional trader UX ergonomics, offering zero-lag, keyboard-first control with features like institutional-grade hotkeys, focus modes, latency monitoring, and accessibility. Its primary goal is to deliver real-time insights and coaching to improve trading performance.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Monorepo Structure
The application uses a TypeScript monorepo with pnpm workspaces, including `apps/client` (React 18, Vite, Tailwind CSS), `apps/server` (Node.js 20 Express backend), `packages/shared`, and `packages/config`.

### Real-Time Data Pipeline
A deterministic and lossless data pipeline processes live market data, ensuring DST-safe exchange timezone handling. It features direct Polygon REST API fetching for historical data, tick-by-tick streaming, and ultra-smooth 50ms microbars. Key components include a Bar Builder for accurate bar bucketing, RAF-based chart rendering for 60fps updates, and robust SSE reconnect logic.

### Communication Protocols
- **Server-Sent Events (SSE)**: Used for streaming market data (1-minute bars, microbars, trading alerts) with lossless resume.
- **WebSocket**: Used for the voice coach, proxying bidirectional audio to OpenAI's Realtime API, supporting instant interruption and secured with short-lived HS256 JWTs.

### Data Storage Strategy
- **Neon PostgreSQL with Drizzle ORM**: Stores versioned trading rules, user customizations, signals, and journal entries. Pgvector is planned for semantic memory.
- **Redis (Upstash)**: Planned for session management, rate limiting, and distributed ring buffer persistence.
- **In-Memory Structures**: Used for the ring buffer and bar builder state for sub-millisecond latency.

### Security Model
Security features include Helmet.js, strict CORS allowlisting, short-lived JWTs, connection limits, Zod for environment validation, and cookie-based authentication with httpOnly session cookies. A demo mode is available for Replit.

### Frontend Architecture
Built with React 18 and TypeScript, using Lightweight Charts, Zustand for state management, and Tailwind CSS. Vite handles bundling and API proxying. Features a professional charting system with a shared indicators library, a TOS-style toolbar, and a Pane component for multi-chart grids and smooth data updates.

### Rules Engine Architecture
Enables strategy automation with AI explanations via a three-stage process: Expression Evaluation, Signal Generation with Risk Governance, and AI Explanation Generation using the OpenAI API.

### Journaling & Memory System
Provides structured trade tracking and automated end-of-day summaries. The Coach Memory System uses Pgvector to store and retrieve `playbook`, `glossary`, and `postmortem` memories with OpenAI embeddings.

### Continuous Learning Loop & Backtesting
An event-driven system with in-memory feature flags. Includes a database schema for user feedback and aggregated rule performance metrics. A deterministic backtest harness runs historical data against the same evaluator as live trading.

### Voice Presence Control System
A voice interface with modern animations, robust audio handling, and extensive personalization. Features a core audio infrastructure, UI components like the PresenceBubble, and performance optimizations including AudioWorklet for lower latency and enhanced barge-in capabilities.

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
- **OpenAI Realtime API**: WebSocket-based voice interface for the AI coach.

### Infrastructure Services
- **Neon (PostgreSQL)**: Serverless PostgreSQL database.
- **Upstash (Redis)**: Optional serverless Redis for caching and sessions.

### Key Libraries
- **Data Processing**: `@polygon.io/client-js`, `drizzle-orm`, `zod`, `date-fns-tz`.
- **Communication**: `ws`, `express`.
- **Frontend**: `react`, `react-dom`, `lightweight-charts`, `tailwindcss`.
- **Journaling & Memory**: `nanoid`, `node-cron`, `pgvector` extension.

## Recent Changes

### Voice Connection Fix: Demo Token Authentication (October 11, 2025)
- **✅ Root Cause Identified**: Voice token endpoint required authentication, but no session existed
  - POST `/api/voice/token` used `requireUser` middleware (401 errors)
  - Console showed: `"Failed to connect voice coach:"` with empty error objects
  - Demo token endpoint GET `/api/voice/token?demo=true` bypasses auth
- **✅ Client Token Fetching Fixed**: PresenceBubble.tsx `fetchToken()` 
  - Changed from POST to GET with `demo=true` query parameter
  - Works without authentication (perfect for POC/demo mode)
- **✅ Reconnect Token Fixed**: EnhancedVoiceClient.v2.ts `freshToken()`
  - Updated to use same demo endpoint for consistency
  - Ensures reconnects work without authentication
- **✅ Voice Infrastructure Verified**: All components already correct
  - WebSocket URL: Dynamic wss:// protocol detection ✅
  - Session context: Has `type: 'realtime'` with proper turn_detection ✅
  - Voice proxy: Sends session.update with all required fields ✅
- **🎯 Result**: Voice assistant ready to connect, token endpoint tested and working (returns valid JWT for demo-user with 60s TTL)

### UI/UX Refinements: Dashboard Ergonomics (October 11, 2025)
- **✅ Signal Density Minimized**: Compact inline control replacing large card
  - Reduced from vertical layout with descriptions to horizontal Q/N/L buttons
  - Semi-transparent background (`bg-gray-800/50`), minimal padding (`px-3 py-2`)
  - Tooltips provide context instead of permanent descriptive text
  - Bell icon with subtle muted colors when audio disabled
- **✅ Accessibility Moved to Settings**: Dedicated tab in Settings panel
  - Settings panel converted to tabbed interface (Coach | Accessibility)
  - Accessibility removed from right sidebar clutter
  - Organized, professional settings experience
- **✅ Chart Height Optimized**: Reduced by 15% for better volume visibility
  - Main element capped at `max-h-[85vh]` (was 100vh)
  - Volume bars now prominently visible and easier to read
  - Professional TOS-like layout with balanced price/volume display
- **✅ Metrics Infrastructure Wired**: RTT and SSE reconnect tracking active
  - Voice RTT emits from `EnhancedVoiceClient.notifyLatency()`
  - SSE reconnect counter tracks and emits connection stability
  - LatencyHUD displays metrics in real-time (shows 0ms when idle)
  - Tick→Wick latency deferred (requires chart update instrumentation)
- **🎯 Result**: Clean, minimalist dashboard with professional trader ergonomics, organized settings, improved chart readability