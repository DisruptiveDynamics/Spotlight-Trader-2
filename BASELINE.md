# Spotlight Trader - Cleanup Baseline Report

**Generated**: October 16, 2025
**Purpose**: Document current state before cleanup begins

---

## Build & Test Status

### TypeScript Compilation ❌
**Status**: FAILING (10 errors)

**Critical Issues**:
1. `ChartView.tsx:164` - Wrong method name: `onMicrobar` should be `onMicro`
2. `ToolBridge.ts` (9 errors) - `exactOptionalPropertyTypes` strictness causing issues with optional `corrId` properties

**Files Affected**:
- `apps/client/src/features/chart/ChartView.tsx` (1 error)
- `apps/client/src/voice/ToolBridge.ts` (9 errors)

### ESLint ❌
**Status**: FAILING (12 errors)

**Issues by Type**:
- **Unused imports**: `useRef` (useLastSeq.ts), `App` (main.tsx)
- **Unused variables**: `toolMetrics` (LatencyHUD.tsx), `get` param (authStore.ts)
- **Empty blocks**: 6 empty catch blocks across multiple files

**Files Affected**:
- `apps/client/src/components/LatencyHUD.tsx` (1 error)
- `apps/client/src/features/chart/useLastSeq.ts` (3 errors)
- `apps/client/src/main.tsx` (3 errors)
- `apps/client/src/stores/authStore.ts` (1 error)
- `apps/client/src/sw-safety.ts` (1 error)
- `apps/client/src/voice/ToolBridge.ts` (1 error)

### Test Suite ⚠️
**Status**: MOSTLY PASSING (80 tests, 1 failure, 2 broken suites)

**Test Results**:
- ✅ Passed: 76 tests across 11 suites
- ❌ Failed: 1 test (audit middleware price detection)
- 💥 Broken: 2 test files with missing imports

**Failed Tests**:
1. `apps/server/src/voice/__tests__/auditMiddleware.test.ts` - Price pattern extraction test

**Broken Test Suites** (missing imports):
1. `apps/server/src/__tests__/barBuilder.test.ts` - Can't find `../BarBuilder`
2. `apps/server/src/backtest/golden.test.ts` - Can't find `./testData`

**Test Warnings**:
- React `act()` warnings in LatencyHUD tests (5 occurrences)

### Build ❌
**Status**: FAILING (TypeScript errors block Vite build)

---

## Code Quality Analysis

### Circular Dependencies ✅
**Status**: CLEAN (madge scan)

- Only 1 circular dependency found in `dist/` output files (not source)
- Source code has no circular imports

### Unused Code (knip scan)

**Build Artifacts** (expected):
- 460+ unused files in `dist/` directories (build output, safe to ignore)
- 35 warnings during scan

**Potentially Dead Source Files**:
```
apps/client/src/agent/coachClient.ts
apps/client/src/components/BacktestPanel.tsx
apps/client/src/components/SignalFeedback.tsx
apps/client/src/components/VWAPControls.tsx
apps/client/src/features/alerts/AlertsPanel.tsx
apps/client/src/features/auth/SignIn.tsx
apps/client/src/features/chart/ChartView.tsx (FALSE POSITIVE - actively used)
apps/client/src/features/chart/useLastSeq.ts (FALSE POSITIVE - actively used)
apps/client/src/features/coach/KnowledgeUploadModal.tsx
apps/client/src/features/coach/MemoryViewer.tsx
apps/client/src/features/coach/NexaMenu.tsx
apps/client/src/features/coach/VoiceSelector.tsx
apps/client/src/features/journal/JournalView.tsx
apps/client/src/features/memory/MemoryPanel.tsx
apps/client/src/features/rules/RulesBrowser.tsx
apps/client/src/lib/retry.ts
apps/client/src/lib/sseBatch.ts
apps/client/src/perf/fps.ts
apps/client/src/perf/scheduler.ts
apps/client/src/perf/vitals.ts
apps/client/src/services/AudioCapture.ts
apps/client/src/services/AudioManager.ts
apps/client/src/services/IdleDetector.ts
apps/client/src/services/VoiceCoach.ts
apps/client/src/voice/jitterBuffer.ts
apps/client/src/voice/VAD.ts
```

**Note**: Knip may have false positives for dynamically imported/lazy-loaded components.

### Security Audit ⚠️
**Status**: 1 moderate vulnerability

**Vulnerabilities**:
1. **esbuild** (moderate)
   - Vulnerable versions: <=0.24.2
   - Fixed in: >=0.25.0
   - Issue: Dev server allows any website to send requests
   - Path: `vite > esbuild`
   - Impact: Development only (not production)

---

## Repository Statistics

- **Total TypeScript/TSX files**: 8,951
- **Monorepo structure**: pnpm workspaces (5 packages)
  - `apps/client` (React + Vite)
  - `apps/server` (Node Express)
  - `packages/shared`
  - `packages/config`
  - 1 more package

---

## Current Architecture

```
spotlight-trader/
├── apps/
│   ├── client/          # React 18 + Vite frontend
│   │   ├── src/
│   │   │   ├── agent/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   ├── lib/
│   │   │   ├── perf/
│   │   │   ├── services/
│   │   │   ├── stores/
│   │   │   └── voice/
│   │   └── dist/        # Build output
│   └── server/          # Node + Express backend
│       ├── src/
│       │   ├── agent/
│       │   ├── backtest/
│       │   ├── coach/
│       │   ├── config/
│       │   ├── copilot/
│       │   ├── pipeline/
│       │   ├── routes/
│       │   ├── stream/
│       │   └── voice/
│       └── dist/        # Build output
└── packages/
    ├── config/
    └── shared/
```

---

## Risk Assessment

### High Risk Areas
1. **Type strictness** - `exactOptionalPropertyTypes` causing friction in ToolBridge
2. **Missing test data** - 2 test suites can't load imports
3. **Build pipeline** - TypeScript errors block production builds

### Medium Risk
1. **Unused code accumulation** - ~25 potentially dead source files
2. **Empty catch blocks** - 6 silent error swallowing
3. **esbuild vulnerability** - Dev-only, but should upgrade

### Low Risk
1. **React test warnings** - `act()` warnings don't affect functionality
2. **Build artifacts** - Normal accumulation, can clean with `git clean`

---

## Scripts Available

Current npm scripts:
```json
{
  "build": "pnpm -r build",
  "lint": "pnpm -r lint",
  "test": "vitest --run --passWithNoTests",
  "typecheck": "pnpm -r typecheck",  // Note: NOT "type-check"
  "dev:unified": "concurrently ...",
  "db:push": "drizzle-kit push",
  "db:push:force": "drizzle-kit push --force"
}
```

**Missing Recommended Scripts**:
- `lint:fix` (auto-fix lint errors)
- `format` (prettier)
- `analyze` (bundle analysis)
- `deadcode` (knip/depcheck)
- `audit:fix` (auto-fix security issues)

---

## Next Steps Priority

### P0 - Blocking (must fix to build)
1. Fix TypeScript errors in ToolBridge.ts (optional property types)
2. Fix ChartView.tsx method name typo
3. Remove unused imports blocking lint

### P1 - Important (technical debt)
4. Fix broken test imports (barBuilder, golden)
5. Handle empty catch blocks properly
6. Upgrade esbuild (via Vite upgrade)

### P2 - Cleanup (quality improvements)
7. Verify and remove dead source files
8. Add missing npm scripts
9. Wrap React test updates in `act()`

---

**Report Status**: Baseline established ✅
**Next Phase**: Quick wins - fix build-blocking issues
