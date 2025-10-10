# Spotlight Trader

## Overview

Spotlight Trader is a production-grade real-time trading coach application for high-frequency day traders. Built as a TypeScript monorepo, it delivers real-time market data streaming, AI-powered voice coaching, a rule-based trading alerts system, and comprehensive journaling. The application prioritizes professional trader UX ergonomics, offering zero-lag, keyboard-first control with features like institutional-grade hotkeys, focus modes, latency monitoring, and accessibility. Its core purpose is to provide real-time insights and coaching to enhance trading performance and offers significant market potential for professional trading communities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Monorepo Structure
The application uses pnpm workspaces to organize `apps/client` (React 18, Vite, Tailwind CSS), `apps/server` (Node.js 20 Express backend), `packages/shared` (TypeScript types, Zod schemas), and `packages/config`.

### Real-Time Data Pipeline
A deterministic and lossless data pipeline processes live market data with DST-safe exchange timezone handling:
- **Bar Builder**: Uses `date-fns-tz` to bucket bars in America/New_York timezone with DST-safe `floorToExchangeMinute()`, ensuring correct bar boundaries across DST transitions
- **RAF-Based Chart Rendering**: Coalesces bar and microbar updates into batched 60fps renders with `document.hidden` throttling for efficient background behavior
- **SSE Reconnect Logic**: Implements state progression (degraded_ws → replaying_gap → live) with promise queue serialization to prevent race conditions, ensuring monotonic sequence ordering during gap backfills
- **Polygon WebSocket**: Heartbeat timer resets on any inbound message (not just pong), detects stale connections after 60s silence
- **Dependencies**: date-fns 4.1.0 (upgraded from 2.30.0), date-fns-tz 3.2.0 for timezone support

### Communication Protocols
- **Server-Sent Events (SSE)**: For streaming market data (1-minute bars, microbars, trading alerts), supporting lossless resume.
- **WebSocket**: For the voice coach, proxying bidirectional audio to OpenAI's Realtime API with instant interrupt capability and short-lived HS256 JWTs.

### Data Storage Strategy
- **Neon PostgreSQL with Drizzle ORM**: Stores versioned trading rules, user customizations, signals, and journal entries. Pgvector is planned for semantic memory.
- **Redis (Upstash)**: Planned for session management, rate limiting, and distributed ring buffer persistence.
- **In-Memory Structures**: Utilized for the ring buffer and bar builder state for sub-millisecond latency.

### Security Model
Security features include Helmet.js, strict CORS allowlisting, short-lived JWTs, connection limits, and Zod for environment validation. CORS is dynamically configured for trusted origins, Replit preview environments, and rejects unauthorized requests. Cookie-based authentication with httpOnly session cookies is used, with a demo mode for Replit-specific authentication flow.

**Session Validation (October 2025):**
- Fixed "zombie login" bug where localStorage trusted stale sessions without server validation
- Created `authStorage` module for centralized localStorage with expiry tracking
- Added `/api/auth/session` endpoint that validates JWT and returns user + session expiry timestamp
- `AuthGate` always validates with server on mount, clearing storage if session invalid
- Session expiry shows amber notification prompting re-login
- Voice coach and protected features require valid server-backed session

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

**Voice Assistant v2 Optimizations (October 2025):**
- **AudioWorklet Migration**: Replaced deprecated ScriptProcessorNode with AudioWorklet for 10-20ms latency improvement and Safari stability
- **Enhanced Barge-In**: Instant audio interruption with gain ducking to zero before stopping playback, sends `response.cancel` to OpenAI
- **Audio Frame Batching**: 20-40ms frame coalescing with backpressure control, max 8-frame queue with oldest-drop when WebSocket congested (bufferedAmount > 32KB)
- **Idle Detection**: Auto-disconnect after 30min inactivity to save tokens (~$0.10-0.30/hour), monitors mouse/keyboard/touch/scroll activity
- **Safari/iOS AudioContext Unlock**: Gesture-based unlock via AudioManager for iOS compliance, lazy initialization on first user interaction
- **Tab Visibility Optimization**: Pauses VAD and amplitude monitoring when `document.hidden` to save CPU/battery on mobile
- **Services**: AudioManager, AudioCapture (AudioWorklet), VoiceCoach (barge-in/batching), IdleDetector (auto-sleep)
- **Implementation**: EnhancedVoiceClient.v2 integrates all optimizations with proper audio node cleanup and WebSocket backpressure control

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
- **Data Processing**: `@polygon.io/client-js`, `drizzle-orm`, `zod`, `date-fns@4.1.0`, `date-fns-tz@3.2.0`.
- **Communication**: `ws`, `express`.
- **Frontend**: `react`, `react-dom`, `lightweight-charts`, `tailwindcss`.
- **Journaling & Memory**: `nanoid`, `node-cron`, `pgvector` extension.

## Recent Changes (October 2025)

### Voice Assistant Port Configuration Fix (October 10, 2025)
- **Server Port Standardization**: Changed server from hardcoded port 8000 to `process.env.PORT || 8080` for consistency with Vite proxy
- **Vite Proxy Update**: Updated all Vite proxy targets (`/api`, `/stream`, `/ws`) from localhost:8000 to localhost:8080
- **Health Endpoint**: Added `/api/voice/health` endpoint for voice assistant health checks
- **URL Fix**: Fixed hardcoded `localhost:4000` URL in CoachBubble.tsx to use relative path `/api/voice/token` with proper credentials and error handling
- **Integration Status**: All voice optimizations (AudioWorklet, barge-in, backpressure, idle detection) integrated and ready for testing

### Market Data Pipeline Improvements
- **DST-Safe Bucketing**: Implemented exchange timezone-aware bar bucketing using `date-fns-tz` to handle DST transitions correctly
- **RAF Rendering**: Added RAF-based coalesced chart updates with batching for smooth 60fps performance
- **Reconnect Logic**: Enhanced SSE reconnect with proper state progression and serialized gap backfilling using promise queues
- **Heartbeat Fix**: Updated Polygon WebSocket heartbeat to reset on any inbound message for reliable connection monitoring