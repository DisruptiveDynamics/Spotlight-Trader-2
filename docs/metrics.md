# Metrics & Telemetry

This document describes the telemetry and performance metrics collected by Spotlight Trader.

## Overview

Spotlight Trader implements comprehensive observability through:

- **Performance Metrics** - Latency tracking across critical paths
- **Voice Metrics** - Audio pipeline telemetry (STT, TTS, tool execution)
- **Tool Execution Metrics** - Per-tool latency and throttling stats
- **SSE Metrics** - Connection tracking and event delivery monitoring
- **Risk Metrics** - Circuit breaker state and risk status tracking

All metrics are exposed via the `@shared/perf/metrics` module and can be consumed by monitoring systems.

## Voice Metrics

### Audio Pipeline Latency

| Metric | Type | Description | Target |
|--------|------|-------------|--------|
| `voice_stt_first_partial_ms` | Histogram | Time to first STT partial result | <500ms |
| `voice_tts_first_audio_ms` | Histogram | Time to first TTS audio chunk | <800ms |
| `voice_end_to_end_latency_ms` | Histogram | Total user speech → audio response | <2000ms |
| `tts_jitter_drop_total` | Counter | Audio chunks dropped due to buffer overflow | 0 |

### Connection Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `voice_session_reconnects_total` | Counter | Voice session reconnection count |
| `voice_session_duration_ms` | Histogram | Voice session duration |
| `voice_session_active` | Gauge | Currently active voice sessions |

### Tool Execution Metrics

| Metric | Type | Description | Target |
|--------|------|-------------|--------|
| `tool_exec_latency_ms{tool=*}` | Histogram | Per-tool execution latency | Varies by tool |
| `tool_throttle_hit_total{tool=*}` | Counter | Rate limit hits per tool | Minimize |
| `voice_tool_violation_total` | Counter | Price hallucination violations detected | 0 |

**Tool-specific latency targets:**

- Micro tools (`get_last_price`, `get_last_vwap`, `get_last_ema`): <1000ms
- Snapshot tools (`get_chart_snapshot`, `get_market_regime`): <2000ms
- Risk tools (`get_active_rules`, `get_recent_signals`): <500ms

### Audit Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `voice_hallucination_detected_total` | Counter | Price hallucinations detected by audit middleware |
| `voice_hallucination_corrected_total` | Counter | Auto-corrected hallucinations (if enabled) |
| `voice_audit_false_positive_total` | Counter | False positive detections (manually logged) |

## SSE Metrics

### Connection Tracking

| Metric | Type | Description |
|--------|------|-------------|
| `sse_connections_active` | Gauge | Currently active SSE connections |
| `sse_connections_total` | Counter | Total SSE connections established |
| `sse_disconnections_total{reason=*}` | Counter | Disconnections by reason (client, timeout, error) |
| `sse_reconnects_total` | Counter | Client reconnections with lastEventId |

### Event Delivery

| Metric | Type | Description | Target |
|--------|------|-------------|--------|
| `sse_event_sent_total{event=*}` | Counter | Events sent by type (bar, microbar, tick) | N/A |
| `sse_event_latency_ms{event=*}` | Histogram | Event emission latency | <50ms |
| `sse_backpressure_drop_total` | Counter | Events dropped due to backpressure | 0 |
| `sse_gap_fill_total` | Counter | Gap fills triggered by sinceSeq | Minimize |

## Market Data Metrics

### Data Pipeline

| Metric | Type | Description | Target |
|--------|------|-------------|--------|
| `polygon_tick_ingestion_ms` | Histogram | Tick ingestion latency | <10ms |
| `bar_builder_latency_ms` | Histogram | Tick → bar finalization latency | <50ms |
| `microbar_emission_interval_ms` | Histogram | Microbar emission interval | 50ms ±5ms |
| `bar_rollup_latency_ms{timeframe=*}` | Histogram | Multi-timeframe rollup latency | <20ms |

### Source Tracking

| Metric | Type | Description |
|--------|------|-------------|
| `polygon_websocket_connected` | Gauge | Polygon WebSocket connection status (0/1) |
| `polygon_fallback_triggered_total{reason=*}` | Counter | REST API fallback triggers |
| `polygon_rest_request_latency_ms` | Histogram | REST API request latency |

## Risk & Trading Metrics

### Circuit Breaker

| Metric | Type | Description |
|--------|------|-------------|
| `risk_circuit_breaker_state{status=*}` | Gauge | Current risk status (GREEN=0, YELLOW=1, RED=2) |
| `risk_circuit_breaker_trips_total` | Counter | Circuit breaker trips |
| `risk_daily_pnl_usd` | Gauge | Current daily P&L |
| `risk_consecutive_losses` | Gauge | Current consecutive loss streak |

### Signal Generation

| Metric | Type | Description |
|--------|------|-------------|
| `signal_generated_total{direction=*}` | Counter | Signals generated (LONG/SHORT) |
| `signal_suppressed_total{reason=*}` | Counter | Signals suppressed by risk governance |
| `rule_evaluation_latency_ms` | Histogram | Rule evaluation latency |

## Copilot Metrics

### Pattern Detection

| Metric | Type | Description |
|--------|------|-------------|
| `copilot_pattern_detected_total{pattern=*}` | Counter | Patterns detected by type |
| `copilot_callout_sent_total{urgency=*}` | Counter | Callouts sent (action/watch) |
| `copilot_callout_gated_total{reason=*}` | Counter | Callouts gated by risk status |

### Memory System

| Metric | Type | Description |
|--------|------|-------------|
| `memory_insight_buffer_size` | Gauge | Buffered insights awaiting flush |
| `memory_flush_attempts_total` | Counter | Memory flush attempts |
| `memory_flush_failures_total` | Counter | Memory flush failures |
| `memory_flush_retries_total` | Counter | Memory flush retries |

## Performance Targets

### Critical Path Latencies

| Path | Target | P95 | P99 |
|------|--------|-----|-----|
| Tick → Bar Emission | <50ms | 45ms | 60ms |
| Bar → Chart Update | <100ms | 80ms | 120ms |
| Tool Execution (micro) | <1000ms | 800ms | 1200ms |
| Voice STT First Partial | <500ms | 400ms | 600ms |
| Voice TTS First Audio | <800ms | 650ms | 900ms |
| SSE Event Delivery | <50ms | 40ms | 70ms |

### Availability Targets

| Component | Target | Measurement |
|-----------|--------|-------------|
| SSE Connection Uptime | 99.9% | Connection seconds / total seconds |
| Voice Session Success Rate | 95% | Successful sessions / total sessions |
| Tool Execution Success Rate | 99% | Successful execs / total execs |
| Polygon WebSocket Uptime | 99% | Connected seconds / total seconds |

## Metrics Collection

### Client-Side

Metrics are collected via:

- **Performance API** - Browser navigation and resource timing
- **Custom Timing Hooks** - React component render timing
- **SSE Ping/Pong** - Round-trip latency monitoring

Client metrics are sent to the server via `/api/metrics/client` endpoint (if enabled).

### Server-Side

Metrics are collected via:

- **Performance Hooks** - High-resolution timing for critical paths
- **Event Listeners** - Telemetry bus subscriptions
- **Middleware** - HTTP request/response timing

### Export Formats

Metrics can be exported in:

- **Prometheus** - `/metrics` endpoint (if enabled)
- **JSON** - Structured JSON logs via Pino
- **CloudWatch** - AWS CloudWatch metrics (if configured)

## Alerting Thresholds

### Critical Alerts

| Alert | Condition | Action |
|-------|-----------|--------|
| Voice Latency Degradation | P95 voice_tts_first_audio_ms > 1500ms for 5min | Page on-call |
| SSE Connection Failures | sse_disconnections_total{reason="error"} > 10/min | Investigate |
| Circuit Breaker Trip | risk_circuit_breaker_state = 2 | Notify trader |
| Memory Flush Failures | memory_flush_failures_total > 3 | Alert ops team |

### Warning Alerts

| Alert | Condition | Action |
|-------|-----------|--------|
| Tool Throttling | tool_throttle_hit_total > 50/min | Review rate limits |
| Polygon Fallback | polygon_fallback_triggered_total > 5/hour | Check WebSocket |
| Gap Fills | sse_gap_fill_total > 20/hour | Investigate stability |

## Custom Metrics

To add custom metrics:

```typescript
import { perfMetrics } from "@shared/perf/metrics";

// Counter
perfMetrics.increment("my_custom_counter", 1, { label: "value" });

// Histogram (latency)
perfMetrics.recordLatency("my_custom_latency_ms", durationMs, { operation: "fetch" });

// Gauge (current value)
perfMetrics.gauge("my_custom_gauge", currentValue);
```

## Debugging with Metrics

### High Voice Latency

1. Check `voice_stt_first_partial_ms` - STT degradation?
2. Check `tool_exec_latency_ms{tool=*}` - Tool execution slow?
3. Check `voice_tts_first_audio_ms` - TTS degradation?
4. Check `tts_jitter_drop_total` - Buffer overflow?

### SSE Disconnections

1. Check `sse_disconnections_total{reason=*}` - Reason distribution
2. Check `sse_backpressure_drop_total` - Backpressure issues?
3. Check `sse_gap_fill_total` - Frequent reconnections?
4. Check client network conditions

### Missing Market Data

1. Check `polygon_websocket_connected` - Connected?
2. Check `polygon_fallback_triggered_total{reason=*}` - Why fallback?
3. Check `bar_builder_latency_ms` - Bar builder slow?
4. Check `sse_event_sent_total{event="bar"}` - Events being sent?

## Historical Data

Metrics are retained for:

- **Live Monitoring**: Last 24 hours (1-minute granularity)
- **Short-Term Analysis**: Last 7 days (5-minute granularity)
- **Long-Term Trends**: Last 90 days (1-hour granularity)

For long-term storage, export to external systems (Prometheus, CloudWatch, DataDog).
