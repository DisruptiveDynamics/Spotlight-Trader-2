# Changelog

All notable changes to Spotlight Trader will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **CI/CD Pipeline**: GitHub Actions workflow with automated quality gates (lint, typecheck, test, build)
- **Coverage Artifacts**: Automated upload of coverage reports and summaries with 30-day retention
- **Documentation**: Comprehensive docs for metrics (`/docs/metrics.md`), contributing (`/docs/contributing.md`), and feature flags (`/docs/feature_flags.md`)
- **Architecture Docs**: Updated system overview with Phase 6-10 enhancements (`/docs/architecture/system_overview.md`)
- **Test Infrastructure**: 75 new unit tests across 6 critical modules (voice, audit, indicators, SSE, memory, snapshot)
- **Coverage Configuration**: Vitest with v8 provider, 80% overall threshold, 85% for core modules
- **Memory Flush System**: 3-attempt retry logic with 500ms delays for graceful shutdown
- **Risk Status System**: GREEN/YELLOW/RED risk states based on circuit breaker, daily P&L, consecutive losses
- **Proactive Callout Gating**: Suppress trading alerts during RED risk status
- **Pattern Statistics Integration**: Win rate, avg holding duration, EV-R in proactive callouts
- **Snapshot Hash System**: Deterministic chart change detection (seqLast-firstBarTime-timeframe-barCount)
- **Micro Tools**: Sub-1s latency tools for last price, VWAP, EMA with structured responses
- **Tool Throttling**: TokenBucket-based rate limiting with per-tool limits (8/sec micro, 2/sec snapshot, 1/sec risk)
- **Runtime Auditing**: Price hallucination detection via regex pattern matching with 2s tool call window
- **TTS Jitter Buffer**: Client-side audio smoothing with 150ms target, 350ms max latency
- **Voice Metrics**: Comprehensive telemetry for STT/TTS latency, tool execution, session tracking

### Changed

- **Coverage Scripts**: Added `pnpm test:coverage` and `pnpm test:coverage:summary` for automated reporting
- **CI Workflow**: Enhanced with coverage testing and artifact upload steps
- **System Overview**: Moved to `/docs/architecture/` and updated with recent enhancements
- **Feature Flags**: Expanded manifest with new flags (enableBacktest, governorTight, chartMaxFps, etc.)

### Fixed

- **Coverage Tooling**: Fixed syntax error in coverage summary generation script
- **Test Stability**: Removed non-deterministic Math.random() from indicator tests

## [0.9.0] - 2025-10-14

### Added - Phase 8: Memory Flush + Risk Gating

- **Shutdown Flush**: Graceful voice memory persistence on SIGTERM/SIGINT/beforeExit
- **Risk Governor**: Circuit breaker integration with GREEN/YELLOW/RED status
- **Callout Gating**: Proactive alerts suppressed during critical risk conditions
- **Enhanced Context**: Pattern statistics (win rate, timeToTarget, EV-R) in callouts
- **Snapshot Hashing**: Efficient chart change detection for bandwidth optimization

### Added - Phase 7: AI Intelligence & Proactive Coaching

- **Unrestricted Tool Usage**: Coach can call tools without limitations for real-time data
- **Memory Integration**: Voice responses leverage playbook, glossary, postmortem memories
- **Trader Behavior Analysis**: Detect FOMO, late entries, overtrading patterns
- **Proactive Monitoring**: Market alert detection feeding tool-powered voice responses
- **Coach Policy Enhancement**: Mandatory tool calls for prices, ultra-brief responses

### Added - Phase 6: Voice Tool Integrity & Performance

- **High-Frequency Micro Tools**: `get_last_price`, `get_last_vwap`, `get_last_ema` with sub-1s targets
- **TokenBucket Throttling**: Per-tool rate limits with retry timing in error responses
- **Hallucination Auditing**: Runtime detection of AI price mentions without tool calls
- **Audio Optimization**: TTS jitter buffer for smooth delivery with overflow protection
- **Performance Metrics**: Tool latency histograms, throttle tracking, session telemetry

### Added - Phase 5: Continuous Learning & Backtesting

- **Feedback Loop**: User signal ratings captured for strategy improvement
- **Deterministic Backtest**: Historical replay against live evaluator for validation
- **Event-Driven Architecture**: In-memory feature flags with database persistence
- **Golden Test Harness**: Regression testing with historical data fixtures

### Added - Phase 4: Journaling & Memory System

- **Structured Trade Journal**: Pre-trade, in-trade, post-trade entries with metadata
- **EOD Summaries**: Automated daily summaries via node-cron scheduler
- **Pgvector Memory**: Semantic search for playbook, glossary, postmortem, knowledge
- **OpenAI Embeddings**: text-embedding-3-small for memory retrieval
- **Nexa 2.0 Knowledge Upload**: YouTube, PDF, text ingestion with semantic chunking

### Added - Phase 3: Rules Engine & Signal Generation

- **Expression Evaluation**: Safe math evaluation with market data context
- **Signal Generator**: Automated trading signals with risk governance
- **AI Explanations**: OpenAI-powered signal rationale generation
- **Database Persistence**: Versioned rules and signals storage
- **Risk Governor**: Circuit breaker pattern for trade safety

### Added - Phase 2: Real-Time Voice Coach

- **OpenAI Realtime API**: WebRTC-based voice interface with gpt-realtime model
- **Voice Proxy**: `/ws/realtime` WebSocket endpoint with ephemeral tokens
- **Tools Bridge**: `/ws/tools` WebSocket for AI tool execution
- **7-Tool Registry**: Market data, chart snapshots, journal, rules, signals access
- **Persistent Identity**: Nexa coach with warm personality and trader empathy
- **Presence UI**: Modern voice bubble with animations and audio visualization

### Added - Phase 1: Real-Time Charts & Market Data

- **Polygon Integration**: WebSocket for tick-by-tick streaming, REST for historical data
- **Deterministic Data Pipeline**: Lossless tick → 1m bar → multi-timeframe rollups
- **50ms Microbars**: TradingView/TOS-level chart smoothness
- **Server-Sent Events**: `/stream/market` with sequence numbers and gap-filling
- **Lightweight Charts**: Professional charting with EMA, Bollinger Bands, VWAP indicators
- **Trader UX Pack**: Hotkeys, focus modes, latency HUD, accessibility features
- **DST-Safe Timezones**: Exchange-aware timestamp handling with date-fns-tz

## [0.1.0] - 2025-10-09

### Added

- **Initial Release**: Monorepo structure with React 18 client and Express server
- **Authentication**: Magic link + demo login with JWT sessions
- **Database**: Neon PostgreSQL with Drizzle ORM
- **TypeScript**: Strict mode with shared types package
- **Build System**: Vite for client, tsx for server, pnpm workspaces
- **Linting**: ESLint + Prettier with import ordering
- **Testing**: Vitest test framework setup

[Unreleased]: https://github.com/yourusername/spotlight-trader/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/yourusername/spotlight-trader/compare/v0.1.0...v0.9.0
[0.1.0]: https://github.com/yourusername/spotlight-trader/releases/tag/v0.1.0
