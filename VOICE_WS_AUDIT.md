# VOICE WEBSOCKET AUDIT

## Implementation Overview

**Location:** `apps/client/src/lib/voiceWS.ts`  
**Purpose:** Robust WebSocket wrapper for binary audio streaming with heartbeat and backpressure management

## Binary Handling Analysis

### binaryType Configuration

**Code:** Line 11
```typescript
ws.binaryType = "arraybuffer";
```

**Status:** ✅ CORRECT
- ArrayBuffer provides direct binary access without parsing overhead
- More efficient than "blob" for audio streaming
- Supported by all modern browsers including Safari

### Message Type Routing

**Code:** Lines 31-50
```typescript
ws.onmessage = (ev) => {
  // String messages (control/metadata)
  if (typeof ev.data === "string") {
    try {
      const msg = JSON.parse(ev.data);
      if (msg?.type === "pong") lastPongAt = Date.now();
      handlers.onControl?.(msg);
    } catch {
      console.warn("VoiceWS: control parse error");
    }
    return;
  }

  // ArrayBuffer messages (audio chunks)
  if (ev.data instanceof ArrayBuffer) {
    handlers.onAudioChunk?.(ev.data);
    return;
  }

  // Blob fallback (convert to ArrayBuffer)
  const reader = new FileReader();
  reader.onload = () => handlers.onAudioChunk?.(reader.result as ArrayBuffer);
  reader.readAsArrayBuffer(ev.data as Blob);
};
```

**Analysis:**
- ✅ Type-safe branching (string vs ArrayBuffer vs Blob)
- ✅ No JSON.parse() attempted on binary data (prevents parse errors)
- ✅ Graceful Blob→ArrayBuffer fallback via FileReader
- ⚠️ FileReader is asynchronous - may add ~1-5ms latency per Blob message
- ⚠️ No error handling on FileReader.onload (could silently fail)

**Potential Issues:**
1. If server sends mixed format (sometimes ArrayBuffer, sometimes Blob), latency will vary
2. No logging to detect Blob vs ArrayBuffer usage frequency

**Recommendation:**
```typescript
// Add Blob detection logging
if (!(ev.data instanceof ArrayBuffer)) {
  console.debug("VoiceWS: Received Blob (slower path), size:", ev.data.size);
}
```

## Heartbeat Implementation

### Ping/Pong Cycle

**Code:** Lines 13-28
```typescript
let pingTimer: number | undefined;
let lastPongAt = Date.now();

ws.onopen = () => {
  handlers.onOpen?.();
  pingTimer = window.setInterval(() => {
    try {
      ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
      if (Date.now() - lastPongAt > 15000) {
        console.warn("VoiceWS: no pong, closing to reconnect");
        ws.close();
      }
    } catch (e) {
      console.error("VoiceWS ping error", e);
    }
  }, 5000);
};

ws.onmessage = (ev) => {
  if (typeof ev.data === "string") {
    const msg = JSON.parse(ev.data);
    if (msg?.type === "pong") lastPongAt = Date.now();
    // ...
  }
};
```

**Analysis:**
- ✅ 5-second ping interval (reasonable for voice streaming)
- ✅ 15-second pong timeout (3× ping interval)
- ✅ Automatic close() on timeout to trigger reconnection
- ⚠️ **Aggressive timeout:** 15s may be too short for high-latency mobile networks
- ⚠️ Ping sent as JSON string (not WebSocket ping frame)
- ⚠️ No drift compensation (timer may accumulate jitter)

**Potential Issues:**
1. On slow 3G/4G, 15s timeout may cause false disconnects
2. JSON ping/pong requires server-side handler (can't use native WS ping/pong)
3. Timer cleanup on `ws.onclose` works, but re-entry not guarded

**Recommendations:**
- Increase timeout to 30s for mobile compatibility
- Consider native WebSocket ping frames if server supports
- Add configurable timeout as parameter

### Heartbeat Flow

1. Client sends: `{"type":"ping","ts":1697201400000}`
2. Server responds: `{"type":"pong","ts":1697201400000}`
3. Client updates `lastPongAt` on receipt
4. If no pong for 15s → close connection

**Server Requirements:**
- Must echo pong messages for each ping
- Must handle JSON control messages separate from binary audio

## Backpressure Management

### Buffer Check

**Code:** Lines 59-71
```typescript
function send(data: ArrayBuffer | string) {
  const maxBuffered = 256 * 1024; // 256 KB
  if (ws.bufferedAmount > maxBuffered) {
    setTimeout(() => send(data), 50);
    return;
  }
  try {
    if (typeof data === "string") ws.send(data);
    else ws.send(data);
  } catch (e) {
    console.error("VoiceWS send failed", e);
  }
}
```

**Analysis:**
- ✅ Checks `bufferedAmount` before sending
- ✅ 256KB threshold (reasonable for audio streaming)
- ✅ 50ms retry delay if buffer full
- ⚠️ Recursive setTimeout could stack up if buffer never drains
- ⚠️ No maximum retry limit (potential infinite loop)
- ⚠️ No logging of backpressure events

**Potential Issues:**
1. If network stalls permanently, retry queue grows unbounded
2. No metric/log to detect backpressure in production
3. 50ms delay may accumulate (e.g., 10 retries = 500ms lag)

**Recommendations:**
```typescript
function send(data: ArrayBuffer | string, retryCount = 0) {
  const maxBuffered = 256 * 1024;
  const maxRetries = 20; // 20 × 50ms = 1 second max wait
  
  if (ws.bufferedAmount > maxBuffered) {
    if (retryCount >= maxRetries) {
      console.error("VoiceWS: backpressure timeout, closing");
      ws.close();
      return;
    }
    console.warn("VoiceWS: backpressure, buffered:", ws.bufferedAmount);
    setTimeout(() => send(data, retryCount + 1), 50);
    return;
  }
  // ... rest of send logic
}
```

## Reconnection Strategy

### Current Behavior

**Code:** Lines 54-56
```typescript
ws.onclose = (ev) => {
  if (pingTimer) clearInterval(pingTimer);
  handlers.onClose?.(ev);
};
```

**Analysis:**
- ✅ Cleans up ping timer to prevent memory leak
- ✅ Fires onClose handler to notify caller
- ❌ **No automatic reconnection logic**
- ❌ **No exponential backoff**
- ❌ **Manual refresh required** after network interruption

**Gap Identified:**
The wrapper provides no automatic reconnect capability. Caller must:
1. Detect `onClose` event
2. Manually call `createVoiceWS()` again
3. Implement backoff logic externally

**Example Missing Code:**
```typescript
// NOT IMPLEMENTED (recommendation)
let reconnectAttempts = 0;
const maxReconnects = 10;

ws.onclose = (ev) => {
  if (pingTimer) clearInterval(pingTimer);
  handlers.onClose?.(ev);
  
  if (reconnectAttempts < maxReconnects) {
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    console.log(`VoiceWS: reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1})`);
    setTimeout(() => {
      reconnectAttempts++;
      // Re-create WebSocket with same config
    }, delay);
  } else {
    console.error("VoiceWS: max reconnects reached, giving up");
  }
};
```

## Observable Events

### onOpen
- Fires immediately when WebSocket connection established
- Good place to send initial auth/config messages

### onControl (custom)
- Fires for all string messages after JSON parsing
- Handles: ping/pong, metadata, control commands
- Gracefully ignores parse errors

### onAudioChunk (custom)
- Fires for all binary messages (ArrayBuffer or converted Blob)
- Direct passthrough to audio processing pipeline

### onError
- Fires on WebSocket error events
- Limited detail (browser security restrictions)

### onClose
- Fires on connection close (normal or error)
- Includes CloseEvent with code/reason
- Cleanup entry point

## Runtime Testing Checklist

### Binary Message Flow
- [ ] Connect to voice WebSocket endpoint
- [ ] Send audio chunk (binary)
- [ ] Verify onAudioChunk fires with ArrayBuffer
- [ ] Verify no JSON parse errors in console
- [ ] Check if Blob conversion path is hit (rare)

### Heartbeat Verification
- [ ] Monitor ping messages sent every 5s
- [ ] Verify pong responses received
- [ ] Simulate network delay > 15s
- [ ] Confirm auto-disconnect on timeout
- [ ] Check pingTimer cleanup on close

### Backpressure Simulation
- [ ] Send large audio chunks rapidly
- [ ] Monitor `ws.bufferedAmount` value
- [ ] Verify retry behavior when > 256KB
- [ ] Check for backpressure warnings in console
- [ ] Ensure no infinite retry loops

### Reconnection Behavior
- [ ] Force disconnect (server shutdown)
- [ ] Verify onClose handler fires
- [ ] Check if manual reconnect required
- [ ] Test reconnect timing/backoff (external)

## Comparison to Previous Implementation

**Old Code (EnhancedVoiceClient.v2.ts):**
- Had Blob→base64 conversion issues
- JSON parse errors on binary messages
- No proper heartbeat mechanism

**Current Code (voiceWS.ts):**
- ✅ Proper binary type handling
- ✅ Heartbeat with timeout detection
- ✅ Backpressure management
- ⚠️ Still missing auto-reconnect

## Grading

| Feature | Grade | Notes |
|---------|-------|-------|
| binaryType config | 10/10 | Perfect - uses arraybuffer |
| Message routing | 9/10 | Type-safe, but Blob path could log |
| Heartbeat | 8/10 | Works, but timeout may be aggressive |
| Backpressure | 7/10 | Basic check, but no retry limit |
| Reconnection | 3/10 | Not implemented - manual only |
| Error handling | 7/10 | Catches errors, but limited logging |

**Overall: 7.3/10**

## Recommendations (Prioritized)

1. **Add Automatic Reconnection** (high priority)
   - Exponential backoff (1s, 2s, 4s, 8s, ...)
   - Max 10 attempts before giving up
   - Reset attempt counter on successful connection

2. **Increase Pong Timeout** (medium priority)
   - Change from 15s to 30s for mobile compatibility
   - Make configurable via constructor

3. **Add Backpressure Limits** (medium priority)
   - Max 20 retries (1 second total wait)
   - Close connection if backpressure persists

4. **Improve Logging** (low priority)
   - Log Blob vs ArrayBuffer usage frequency
   - Log backpressure events with buffer size
   - Log reconnection attempts

5. **Add Metrics** (low priority)
   - Track: messages sent/received, reconnects, backpressure events
   - Expose via /api/voice/metrics endpoint
