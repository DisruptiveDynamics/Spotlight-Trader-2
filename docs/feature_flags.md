# Feature Flags

This document describes all feature flags in Spotlight Trader, their purpose, and how to use them.

## Overview

Feature flags enable gradual rollout of new features, A/B testing, and runtime configuration without code deployments. Flags are stored in the database and synchronized to clients automatically.

## Flag Management

### Server-Side

Flags are managed via `apps/server/src/flags.ts`:

```typescript
import { isEnabled, ifFlag } from "@/flags";

// Check flag status
if (isEnabled("proactiveCoach")) {
  // Execute feature code
}

// Execute with fallback
const result = ifFlag(
  "enableBacktest",
  () => runBacktest(),
  () => ({ error: "Backtest disabled" })
);
```

### Client-Side

Flags are accessed via hooks in `apps/client/src/state/flags.ts`:

```typescript
import { useFlag } from "@/state/flags";

function MyComponent() {
  const backtestEnabled = useFlag("enableBacktest");
  
  return backtestEnabled ? <BacktestUI /> : null;
}
```

Flags sync automatically every 30 seconds via polling.

## Flag Manifest

### Core System Flags

#### `voiceViaProxy`
- **Type**: Boolean
- **Default**: `true`
- **Description**: Routes voice assistant through server proxy instead of direct OpenAI connection
- **Purpose**: Enables server-side tool enforcement and numeric validation
- **Status**: Production (stable)

#### `timeframeServerSource`
- **Type**: Boolean
- **Default**: `true`
- **Description**: Server is authoritative for timeframe state
- **Purpose**: Client requests timeframe changes via API instead of local state management
- **Status**: Production (stable)

#### `timeframeRollups`
- **Type**: Boolean
- **Default**: `true`
- **Description**: Build higher timeframes (2m, 5m, 10m, 15m, 30m, 1h) by rolling up 1m bars
- **Purpose**: Ensures single source of truth: ticks → 1m → roll-ups
- **Status**: Production (stable)

#### `marketAudit`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Optional audit logging to validate bar/tape/VWAP consistency
- **Purpose**: Debugging market data pipeline - logs only, no functional impact
- **Status**: Development (disabled in production)

### Feature Toggles

#### `enableRiskGovernorV2`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Enable Risk Governor V2 with enhanced circuit breaker logic
- **Purpose**: Gradual rollout of improved risk management system
- **Status**: Beta (testing)
- **Dependencies**: None

#### `enableExplainV2`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Enable Explain V2 with enhanced AI signal explanations
- **Purpose**: Improved coaching quality with better context
- **Status**: Beta (testing)
- **Dependencies**: OpenAI API

#### `enableTapePeek`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Enable Tape Peek feature (time & sales overlay)
- **Purpose**: Provide Level 2 market depth visualization
- **Status**: Alpha (development)
- **Dependencies**: Polygon tick data

#### `enableLearningLoop`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Enable automated learning loop for strategy improvement
- **Purpose**: Capture user feedback on signals for continuous improvement
- **Status**: Alpha (development)
- **Dependencies**: `journals` table

#### `enableBacktest`
- **Type**: Boolean
- **Default**: `true`
- **Description**: Enable backtesting feature
- **Purpose**: Allow historical strategy validation
- **Status**: Production (stable)
- **Dependencies**: Historical bar data

#### `enableGoldenTests`
- **Type**: Boolean
- **Default**: `true`
- **Description**: Enable golden test suite for regression testing
- **Purpose**: Validate deterministic replay of historical data
- **Status**: Production (stable)
- **Dependencies**: Test fixtures

### Performance Flags

#### `governorTight`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Enable tight risk governance (stricter limits)
- **Purpose**: Conservative risk management for volatile markets
- **Status**: Production (user-configurable)
- **Impact**: May suppress valid signals in high-volatility conditions

#### `chartMaxFps`
- **Type**: Number
- **Default**: `60`
- **Description**: Maximum FPS for chart rendering
- **Purpose**: Performance optimization - reduce to 30 for low-end devices
- **Status**: Production (stable)
- **Valid Range**: 15-60
- **Impact**: Lower values reduce CPU/GPU usage but may feel less smooth

## API Endpoints

### Get Flags

```http
GET /api/flags
```

**Response:**
```json
{
  "enableBacktest": true,
  "enableTapePeek": false,
  "chartMaxFps": 60,
  ...
}
```

### Update Flags (Admin Only)

```http
POST /api/flags
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "enableTapePeek": true,
  "chartMaxFps": 30
}
```

**Response:**
```json
{
  "success": true,
  "flags": {
    "enableBacktest": true,
    "enableTapePeek": true,
    "chartMaxFps": 30,
    ...
  }
}
```

## Flag Lifecycle

### Development

1. **Define flag** in `packages/shared/src/flags.ts`:
   ```typescript
   export const flags = {
     myNewFeature: false,
   } as const;
   ```

2. **Add default** in `apps/client/src/state/flags.ts`:
   ```typescript
   const defaults: Flags = {
     myNewFeature: false,
   };
   ```

3. **Use in code**:
   ```typescript
   // Server
   if (isEnabled("myNewFeature")) {
     // Feature code
   }
   
   // Client
   const enabled = useFlag("myNewFeature");
   ```

### Testing

Enable flags during testing:

```typescript
// apps/server/src/__tests__/myfeature.test.ts
import { updateFlags } from "@/flags";

beforeEach(async () => {
  await updateFlags({ myNewFeature: true });
});
```

### Production Rollout

1. **Alpha** - Enable for internal users only
2. **Beta** - Enable for 10% of users (A/B testing)
3. **GA** - Enable for all users
4. **Cleanup** - Remove flag, make feature permanent

### Deprecation

1. Set flag to `true` for all users (full rollout)
2. Wait 1 release cycle
3. Remove flag checks from code
4. Remove flag from schema
5. Clean up database

## Best Practices

### Flag Naming

- Use clear, descriptive names: `enableTapePeek`, not `feature1`
- Prefix with action: `enable`, `disable`, `use`, `show`
- Suffix version: `V2`, `V3` for iterations

### Flag Scope

- **Feature flags** - Toggle entire features (`enableBacktest`)
- **Performance flags** - Tune performance (`chartMaxFps`)
- **Behavior flags** - Change behavior (`governorTight`)
- **Debug flags** - Enable debugging (`marketAudit`)

### Flag Dependencies

Document dependencies in this manifest:

```markdown
#### `enableAdvancedCharts`
- **Dependencies**: `enableBacktest`, `chartMaxFps >= 30`
```

Check dependencies in code:

```typescript
if (isEnabled("enableAdvancedCharts")) {
  if (!isEnabled("enableBacktest")) {
    throw new Error("enableAdvancedCharts requires enableBacktest");
  }
}
```

### Flag Cleanup

**Remove flags when:**
- Feature is stable and fully rolled out
- Flag has been `true` for 2+ releases
- No A/B testing or gradual rollout needed

**Keep flags when:**
- Feature is experimental
- Performance tuning required
- User-configurable preference

## Monitoring

### Flag Usage Metrics

Track flag checks via telemetry:

```typescript
perfMetrics.increment("flag_check_total", 1, {
  flag: "enableTapePeek",
  value: isEnabled("enableTapePeek").toString(),
});
```

### Flag Changes

Log all flag updates:

```typescript
console.log("[Flags] Updated:", {
  flag: "enableTapePeek",
  oldValue: false,
  newValue: true,
  updatedBy: userId,
});
```

## Troubleshooting

### Flags Not Syncing

**Client-side:**
1. Check flag sync is running: `startFlagSync()` called in `App.tsx`
2. Verify polling interval (default 30s)
3. Check network requests to `/api/flags`

**Server-side:**
1. Verify flags loaded from database: `loadFlags()` in `wiring/index.ts`
2. Check database connection
3. Verify flag exists in database

### Flag Mismatch

**Server vs Client:**
- Server flags are authoritative
- Client syncs every 30s
- Force sync: `syncFlags()` in client code

**Database vs Code:**
- Update flag in database via API
- OR update default in code and redeploy

### Performance Impact

**High flag check frequency:**
- Cache flag values in component state
- Use `useMemo` for expensive flag checks
- Avoid checking flags in tight loops

Example:
```typescript
// Bad - checks flag on every render
function MyComponent() {
  if (useFlag("myFeature")) {
    return <Feature />;
  }
}

// Good - memoize flag value
function MyComponent() {
  const enabled = useFlag("myFeature");
  return enabled ? <Feature /> : null;
}
```

## Migration Guide

### From Hardcoded to Flag

**Before:**
```typescript
const ENABLE_BACKTEST = true; // Hardcoded
```

**After:**
```typescript
import { isEnabled } from "@/flags";

if (isEnabled("enableBacktest")) {
  // ...
}
```

### From Environment Variable to Flag

**Before:**
```typescript
const ENABLE_FEATURE = process.env.ENABLE_FEATURE === "true";
```

**After:**
```typescript
// 1. Add flag to schema
// 2. Set default from env var (one-time migration)
const defaultFlags = {
  enableFeature: process.env.ENABLE_FEATURE === "true",
};

// 3. Use flag API
if (isEnabled("enableFeature")) {
  // ...
}
```

## Security Considerations

- **Admin-only updates** - Flag changes require admin role
- **No sensitive data** - Never store secrets in flags
- **Audit logging** - Log all flag changes for compliance
- **Rate limiting** - Limit flag update frequency (prevent DoS)

## References

- **Implementation**: `apps/server/src/flags.ts`, `apps/client/src/state/flags.ts`
- **API Routes**: `apps/server/src/routes/flags.ts`
- **Database Schema**: `packages/shared/src/schema.ts` (`featureFlags` table)
- **Metrics**: See `/docs/metrics.md` for flag-related metrics
