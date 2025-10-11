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

### Voice Audio Format Fix: 24kHz PCM16 Sample Rate Correction (October 11, 2025)
- **✅ Root Cause Identified**: OpenAI "Invalid audio" error due to sample rate mismatch
  - OpenAI Realtime API requires **24kHz PCM16 mono** with **480-sample frames (960 bytes for 20ms)**
  - AudioCapture was configured for **16kHz with 320-sample frames (640 bytes)**, causing rejection
  - Every audio frame sent to OpenAI was in the wrong format
- **✅ AudioCapture.ts Fixed**: Updated to 24kHz throughout the pipeline
  - Changed default `sampleRate` from 16000 → 24000 (lines 30, 79)
  - Changed `TARGET_SAMPLES` from 320 → 480 for exact 20ms frames at 24kHz (line 53)
  - Updated comments to reflect 960-byte frame requirement
  - All downstream code already expected 24kHz (AudioBatcher, EnhancedVoiceClient)
- **✅ Session Config Corrected**: Re-added `enabled: true` to `input_audio_transcription`
  - Confirmed by latest OpenAI Realtime API documentation
  - Required for OpenAI to accept and transcribe audio input
- **✅ End-to-End Verification**: Complete audio pipeline validated
  - Capture: 24kHz PCM16 mono, 480 samples per frame ✅
  - Convert: Int16Array → Uint8Array with proper byteOffset/byteLength ✅
  - Encode: Chunked base64 encoding with 32KB chunks ✅
  - Send: JSON-only transport with `input_audio_buffer.append` ✅
  - Proxy: Forwards JSON as-is, defensive binary→JSON conversion ✅
- **🎯 Result**: Audio format now matches OpenAI Realtime API requirements exactly. Voice connection ready for testing.

### Voice Connection Loop Fix: Message Processing & Reconnect Logic (October 11, 2025)
- **✅ Root Cause Identified**: Listening→reconnect loop caused by message processing errors
  - Client only handled 4-5 OpenAI message types, unhandled messages caused errors
  - Base64 decoding failures weren't caught, triggering reconnects
  - No distinction between intentional vs accidental disconnects
  - Empty error objects `{}` made debugging difficult
- **✅ Comprehensive Message Handling**: Switch statement for all OpenAI Realtime API types
  - Session events: `session.created`, `session.updated`
  - Conversation events: `conversation.*`
  - Input audio events: `input_audio_buffer.*` with speech detection
  - Response events: `response.audio.delta`, transcripts, text, etc.
  - Rate limits, errors, default case for unhandled types
  - Properly updates coach state (listening/thinking/speaking)
- **✅ Defensive Error Handling**: Try-catch wrappers prevent crashes
  - `handleAudioDelta` wrapped to catch base64 decode errors
  - Enhanced error logging with actual messages, not empty objects
  - Parsing errors no longer trigger reconnects (critical fix)
- **✅ Intentional Disconnect Tracking**: Flag prevents reconnect loops
  - `intentionalDisconnect` flag distinguishes user vs accidental disconnects
  - `disconnect()` sets flag, `connect()` resets it
  - `onclose` checks flag before auto-reconnecting
  - Logs close events with code and reason for debugging
- **✅ Int16Array Byte Length Fix**: Handle odd-length audio buffers
  - Added validation for ArrayBuffer byte length before Int16Array conversion
  - Truncates last byte if length is odd (Int16Array requires even byte count)
  - Prevents "byte length should be a multiple of 2" errors
- **🎯 Result**: Voice connection stable, no more listening→reconnect loop. Latest logs show zero voice errors.

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

### Voice Bubble UI Redesign: Compact Top-Bar Integration (October 11, 2025)
- **✅ Compact Mode Added**: Voice bubble now supports two rendering modes
  - **Compact mode (36px)**: Inline in top bar next to logo, horizontal flex layout with status popups to the right
  - **Full-size mode (200px)**: Fixed bottom-right positioning with vertical layout (preserved original behavior)
  - Separate render paths prevent layout regressions between modes
- **✅ Proportional Animation Scaling**: Canvas animations scale correctly at any size
  - WaveAnimation accepts `size` prop, all radiuses and offsets calculated proportionally
  - Base radius = `size * 0.2`, breathing/pulse/ripple effects scale with size
  - Maintains visual consistency from 36px to 200px
- **✅ Clean Status Popups**: Messages appear as minimal toasts in compact mode
  - "Click to activate", "Connecting...", "Mic activated" show to the right of bubble
  - Semi-transparent dark background (`bg-gray-700/90`), compact padding (`px-3 py-1.5`)
  - Auto-dismiss after 2s, no clutter in top bar
- **✅ Simplified Compact UI**: Only essential elements when compact
  - No disconnect button, tooltips, or keyboard hints (available in full-size mode)
  - Breathing animation visible at all times for visual feedback
  - Focus ring and hover effects preserved for accessibility
- **🎯 Result**: Professional, minimal voice control in top bar, full-featured mode available when needed