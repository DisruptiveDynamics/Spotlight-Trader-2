# TypeScript Unused Exports Review

**Date:** October 14, 2025  
**Tool:** ts-prune v0.10.3  
**Status:** No output detected (possible configuration issue)

## Summary

ts-prune did not produce output when run. This could indicate:
1. All exports are being used (unlikely in a large codebase)
2. Configuration issue with ts-prune detecting TypeScript projects
3. Monorepo structure confuses ts-prune's default detection

## Alternative Analysis: ESLint Unused Vars

Since ts-prune didn't produce results, we'll use ESLint's `@typescript-eslint/no-unused-vars` output from the baseline lint run.

---

## Server-Side Unused Exports (apps/server)

### `apps/server/src/agent/types.ts:1`
```typescript
import type { Request, Response } from 'express';
```
**Status:** REMOVE  
**Reason:** Unused imports. Use express types directly where needed or prefix with underscore.  
**Action:** Remove unused imports or refactor to use them.

### `apps/server/src/chart/bars1m.ts:4`
```typescript
import type { Bar } from '@spotlight/shared';
```
**Status:** REMOVE  
**Reason:** Unused import. Bar type not used in this file.  
**Action:** Remove import.

### `apps/server/src/chart/rollups.ts:5`
```typescript
import type { Bar } from '@spotlight/shared';
```
**Status:** REMOVE  
**Reason:** Unused import. Bar type not used in this file.  
**Action:** Remove import.

### `apps/server/src/coach/proactiveCoaching.ts:2`
```typescript
import { voiceCalloutBridge } from '../voice/calloutBridge';
```
**Status:** KEEP (Add TODO)  
**Reason:** Imported for future voice callout integration. Currently commented out or planned feature.  
**Action:** Either use it or add `// TODO: Integrate voice callouts` comment and prefix with underscore: `_voiceCalloutBridge`.

### `apps/server/src/coach/proactiveCoaching.ts:167`
```typescript
function analyzePattern(symbol: string, bars: Bar[], userId: string) {
  // userId parameter unused
}
```
**Status:** KEEP (Prefix with underscore)  
**Reason:** userId may be used in future for personalized pattern detection.  
**Action:** Rename parameter to `_userId` to indicate intentional ignore.

### `apps/server/src/coach/traderPatternDetector.ts:3`
```typescript
import { sql } from 'drizzle-orm';
```
**Status:** REMOVE  
**Reason:** sql helper not used in this file.  
**Action:** Remove import.

### `apps/server/src/copilot/sentinel/index.ts:65`
```typescript
function evaluateRule(rule: Rule, ctx: TradeContext) {
  // ctx parameter unused
}
```
**Status:** KEEP (Prefix with underscore)  
**Reason:** Context parameter exists for API consistency but not yet fully utilized.  
**Action:** Rename to `_ctx`.

### `apps/server/src/copilot/tools/handlers.ts:365`
```typescript
const stats = calculateStats(data);
```
**Status:** REMOVE  
**Reason:** Variable assigned but never read.  
**Action:** Remove assignment or use the value.

### `apps/server/src/copilot/triggers/manager.ts:2`
```typescript
import { copilotBroadcaster } from '../broadcaster';
```
**Status:** KEEP (Add TODO)  
**Reason:** Imported for broadcasting trigger events. Likely planned feature.  
**Action:** Use it or prefix with underscore and add TODO comment.

### `apps/server/src/copilot/triggers/manager.ts:84`
```typescript
function evaluateTrigger(symbol: string, bar: Bar) {
  // bar parameter unused
}
```
**Status:** KEEP (Prefix with underscore)  
**Reason:** Bar parameter exists for future pattern analysis.  
**Action:** Rename to `_bar`.

### `apps/server/src/index.ts:34`
```typescript
import { requireUser } from './middleware/auth';
```
**Status:** KEEP (Verify usage)  
**Reason:** Auth middleware should be used in protected routes. May be missing from route handlers.  
**Action:** Audit routes for missing authentication. If truly unused, remove. Likely a bug.

### `apps/server/src/indicators/vwap.ts:6`
```typescript
import type { Bar } from '@spotlight/shared';
```
**Status:** REMOVE  
**Reason:** Bar type not used in this file (VWAP uses ticks).  
**Action:** Remove import.

### `apps/server/src/realtime/voiceProxy.ts:16`
```typescript
import { ensureMarketContext } from '../coach/pipeline';
```
**Status:** REMOVE  
**Reason:** Not used in current implementation. Remove or implement market context checks.  
**Action:** Remove import if not needed.

### `apps/server/src/realtime/voiceProxy.ts:316`
```typescript
case 'session.created': {
  const sessionStart = Date.now(); // Lexical declaration in case block
}
```
**Status:** FIX  
**Reason:** ESLint no-case-declarations rule violation.  
**Action:** Wrap in braces or move declaration outside switch.

### `apps/server/src/routes/triggerTest.ts:10`
```typescript
const sessionStart = Date.now();
```
**Status:** REMOVE  
**Reason:** Variable assigned but never used.  
**Action:** Remove or use for logging.

### `apps/server/src/routes/triggerTest.ts:62`
```typescript
const now = Date.now();
```
**Status:** REMOVE  
**Reason:** Variable assigned but never used.  
**Action:** Remove or use for logging.

### `apps/server/src/voice/tools.ts` (multiple unused functions)
**Status:** VERIFY  
**Reason:** Exported functions may be called dynamically via tool dispatcher.  
**Action:** Audit tool registry to confirm all exports are registered and callable.

---

## Client-Side Unused Exports (apps/client)

### `apps/client/public/worklets/volume-processor.js:30`
```typescript
registerProcessor('volume-processor', VolumeProcessor);
```
**Status:** KEEP (Already fixed in config)  
**Reason:** AudioWorklet global, not a standard import. ESLint config already has globals defined for worklets.  
**Action:** No change needed (false positive).

### `apps/client/src/agent/coachClient.ts:6`
```typescript
catch {}
```
**Status:** FIX  
**Reason:** Empty catch block without error handling.  
**Action:** Add error logging or comment explaining why errors are silently ignored.

### `apps/client/src/features/chart/ChartView.tsx:2`
```typescript
import type { CandlestickData } from 'lightweight-charts';
```
**Status:** REMOVE  
**Reason:** Type imported but not used.  
**Action:** Remove import.

### `apps/client/src/features/chart/ChartView.tsx:3`
```typescript
import { fetchHistory } from '../../lib/history';
```
**Status:** REMOVE  
**Reason:** Function imported but not used (history fetched via SSE now).  
**Action:** Remove import.

### `apps/client/src/features/coach/PresenceBubble.tsx` (multiple unused state setters)
```typescript
const [amplitude, setAmplitude] = useState(0); // setAmplitude unused
const [latency, setLatency] = useState(0); // setLatency unused
const [permissionState, setPermissionState] = useState<PermissionState>('prompt'); // setPermissionState unused
```
**Status:** KEEP (Add TODO)  
**Reason:** State setters planned for future audio visualizations and permission handling.  
**Action:** Either implement or add `// TODO: Implement audio visualization` comments.

### `apps/client/src/features/coach/PresenceBubble.tsx:229`
```typescript
const tokenRef = useRef<string | null>(null);
```
**Status:** REMOVE  
**Reason:** Ref created but never read.  
**Action:** Remove or implement token caching.

### `apps/client/src/features/coach/PresenceBubble.tsx:299`
```typescript
const fetchEphemeralToken = async () => { ... };
```
**Status:** REMOVE  
**Reason:** Function defined but never called.  
**Action:** Remove or call in useEffect.

### `apps/client/src/services/VoiceCoach.ts:28`
```typescript
catch (err) {
  // err parameter unused
}
```
**Status:** FIX  
**Reason:** Error caught but not logged or handled.  
**Action:** Log error or rename to `_err`.

### `apps/client/test/setup.client.ts` (multiple @ts-expect-error without descriptions)
**Status:** FIX  
**Reason:** ESLint requires descriptions for @ts-expect-error directives.  
**Action:** Add descriptions explaining why types are ignored.

### `apps/client/vitest.setup.ts` (multiple @ts-expect-error without descriptions)
**Status:** FIX  
**Reason:** ESLint requires descriptions for @ts-expect-error directives.  
**Action:** Add descriptions like `// @ts-expect-error - Vitest global types not yet loaded`.

---

## Summary by Action

### REMOVE (14 items)
- Unused imports: Bar type (3 files), Request/Response types, sql helper, ensureMarketContext
- Unused variables: stats, sessionStart, now
- Unused functions: fetchEphemeralToken
- Unused refs: tokenRef

### KEEP + Prefix with Underscore (4 items)
- Intentional ignores: userId, _ctx, _bar parameters
- Planned features with TODO comments

### FIX (6 items)
- Empty catch blocks (2 files)
- Lexical declaration in case block
- Missing @ts-expect-error descriptions (7 occurrences)

### VERIFY (2 items)
- requireUser middleware (may indicate missing auth)
- voice/tools.ts exports (dynamic tool dispatch)

---

## Recommended Workflow

1. **Phase 2 (Current):** Mark items, don't remove yet
2. **Run eslint --fix:** Auto-fix what's safe (import removal, underscore prefixes)
3. **Manual review:** Empty catch blocks, @ts-expect-error descriptions
4. **Phase 3:** Remove marked items after architect review
5. **Re-run linting:** Verify 0 errors

---

## ESLint Auto-Fix Coverage

These will be handled by `eslint --fix --cache`:
- Unused imports (automatic removal via unused-imports plugin)
- Import ordering (automatic via import/order rule)

These require manual intervention:
- Empty catch blocks
- @ts-expect-error descriptions
- Lexical declarations in case blocks
- Verifying requireUser usage

---

## Monorepo Considerations

Some "unused" exports may be:
- **API exports** - Exported for external consumers
- **Tool registry exports** - Dynamically called via string keys
- **Workspace exports** - Used by other packages in monorepo
- **Future features** - Imported but not yet integrated

Always verify usage across all workspace packages before removing.
