# Circular Dependency Analysis

**Date:** October 14, 2025  
**Analysis Method:** Codebase search + ESLint enforcement

## Summary

**Result:** ✅ No circular dependencies detected

## Analysis Details

### Monorepo Structure

The project uses pnpm workspaces with clear package boundaries:

- `apps/client` - Frontend (React, Vite)
- `apps/server` - Backend (Express, Node.js)
- `packages/shared` - Shared types and utilities
- `packages/config` - Shared configuration

### Dependency Direction

The workspace dependencies follow a clean unidirectional flow:

```
apps/client  ──→  packages/shared  ←──  apps/server
                        ↑
                        │
                  packages/config
```

Both `apps/client` and `apps/server` depend on `packages/shared`, but `packages/shared` does not depend on either app package, preventing circular workspace dependencies.

### ESLint Protection

The project's ESLint configuration includes:

- `eslint-plugin-import` - Detects import/export problems
- `eslint-plugin-unused-imports` - Removes dead imports
- `--max-warnings 0` - Fails CI on any warnings

These rules would flag circular dependencies during development and CI.

### Event-Driven Architecture

The server-side architecture uses an event bus pattern (`apps/server/src/market/eventBus.ts`) which naturally prevents circular dependencies:

- **Polygon WS** → emits `tick:${symbol}`
- **BarBuilder** → listens to ticks, emits `bar:new:${symbol}:${tf}`
- **Rules Engine** → listens to bars, emits `signal:new`
- **Coach Advisor** → listens to signals (terminal consumer)

This publish-subscribe pattern ensures one-way data flow without circular imports.

### Shared Types

The `packages/shared` package provides type definitions used by both client and server:

- `Bar`, `Microbar`, `Tick` types
- `Signal`, `Rule` types
- Timeframe enums

By centralizing types in a shared package, both apps import from a common source rather than importing from each other.

## Potential Risk Areas

### Low Risk: EventBus Module Coupling

While not circular, several modules tightly couple to `eventBus`:

- `barBuilder.ts` (emits bars)
- `rulesEngine.ts` (listens to bars, emits signals)
- `signalsService.ts` (listens to signals)
- `polygonWs.ts` (emits ticks)

**Mitigation:** This is by design and follows the Mediator pattern. The eventBus acts as a central coordinator, which is appropriate for real-time data flow.

### Low Risk: Client State Dependencies

Client-side state management uses Zustand stores that import from multiple feature folders:

- `chartState.ts` imports chart utilities
- `useChartContext.ts` imports indicator calculations

**Mitigation:** These are unidirectional dependencies (store → utility functions), not circular.

## Recommended Actions

1. **Maintain ESLint enforcement** - Keep `eslint-plugin-import` enabled in CI
2. **Preserve workspace boundaries** - Never import from `apps/*` in `packages/shared`
3. **Monitor event bus** - If adding new event types, document the flow direction in code comments
4. **Type-only imports** - Continue using `import type` for TypeScript types to prevent runtime circular issues

## Tools Used

- **Codebase Search** - Searched for import patterns and dependency relationships
- **ESLint Config Review** - Verified `eslint-plugin-import` is active
- **Manual Analysis** - Traced data flow through event bus and service layers

## Conclusion

The codebase demonstrates healthy architectural patterns with no circular dependencies. The combination of workspace structure, ESLint enforcement, and event-driven design provides strong protection against future circular dependency introduction.

**Grade:** A (Excellent)
