# Unused Dependencies Report

**Date:** October 14, 2025  
**Tool:** depcheck v1.4.7  
**Scope:** Root package.json

## Summary

- **Total unused dependencies:** 8
- **Total unused devDependencies:** 10
- **Missing dependencies:** 2 (referenced but not installed)

---

## Root Package Unused Dependencies

### `@openai/agents` (^0.1.9)

**Status:** KEEP  
**Reason:** Used by apps/client and apps/server (OpenAI Agents SDK for voice interface). False positive - workspace dependency used by sub-packages.

### `@types/compression` (^1.8.1)

**Status:** KEEP  
**Reason:** TypeScript type definitions for compression middleware used in apps/server. Type-only import may not be detected by depcheck.

### `compression` (^1.8.1)

**Status:** KEEP  
**Reason:** Used by apps/server for HTTP response compression. Workspace dependency.

### `date-fns` (^4.1.0)

**Status:** KEEP  
**Reason:** Core date manipulation library used throughout both client and server. Workspace dependency.

### `date-fns-tz` (^3.2.0)

**Status:** KEEP  
**Reason:** Timezone handling for market hours (9:30 AM - 4 PM ET). Critical for barBuilder and session detection. Workspace dependency.

### `get-tsconfig` (^4.12.0)

**Status:** REMOVE  
**Reason:** Not used in any source files. Likely leftover from initial TypeScript setup. Safe to remove after verification.

### `jsonwebtoken` (^9.0.2)

**Status:** KEEP  
**Reason:** JWT authentication for sessions, voice tokens, and tools bridge. Used in apps/server. Workspace dependency.

### `pdf-parse` (^2.2.16)

**Status:** KEEP  
**Reason:** PDF ingestion for knowledge base (Nexa 2.0). Used in apps/server knowledge processing. Workspace dependency.

---

## Root Package Unused DevDependencies

### `@testing-library/dom` (^10.4.1)

**Status:** KEEP  
**Reason:** Testing library for DOM queries. Used by apps/client tests. Workspace dev dependency.

### `@testing-library/react` (^16.3.0)

**Status:** KEEP  
**Reason:** React component testing. Used by apps/client. Workspace dev dependency.

### `@testing-library/user-event` (^14.6.1)

**Status:** KEEP  
**Reason:** User interaction simulation for tests. Used by apps/client. Workspace dev dependency.

### `@types/jsonwebtoken` (^9.0.10)

**Status:** KEEP  
**Reason:** TypeScript types for jsonwebtoken. Used by apps/server. Type-only imports may not be detected.

### `@vitest/coverage-v8` (^3.2.4)

**Status:** KEEP  
**Reason:** Code coverage reporter for Vitest. Referenced in package.json scripts and vitest.config.ts.

### `esbuild` (^0.25.10)

**Status:** KEEP  
**Reason:** Bundler used by Vite and other build tools. Transitive dependency may not be detected by depcheck.

### `husky` (^9.0.10)

**Status:** KEEP  
**Reason:** Git hooks manager. Configured in .husky/ directory with pre-commit hook.

### `kill-port` (^2.0.1)

**Status:** KEEP  
**Reason:** Port cleanup utility. Used in apps/client predev script and pnpm cleanup script.

### `lint-staged` (^15.2.0)

**Status:** KEEP  
**Reason:** Pre-commit linting. Referenced in .husky/pre-commit hook.

### `ws` (^8.18.3)

**Status:** KEEP  
**Reason:** WebSocket library. Used by apps/server for /ws/realtime and /ws/tools. Workspace dependency.

---

## Missing Dependencies (Need Installation)

### `eslint-jsonc`

**Locations:** `.eslintrc.cjs`  
**Action:** INSTALL  
**Command:** `pnpm add -D -w eslint-jsonc`  
**Reason:** ESLint parser for JSON/JSONC files. Referenced in ESLint config but not installed.

### `eslint-import-resolver-typescript`

**Locations:** `.eslintrc.cjs`  
**Action:** INSTALL  
**Command:** `pnpm add -D -w eslint-import-resolver-typescript`  
**Reason:** TypeScript module resolution for eslint-plugin-import. Referenced in ESLint config but not installed.

---

## Recommendations

### Immediate Actions

1. **Install missing dependencies:**

   ```bash
   pnpm add -D -w eslint-jsonc eslint-import-resolver-typescript
   ```

2. **Verify get-tsconfig usage:**
   ```bash
   grep -r "get-tsconfig" apps/ packages/
   ```
   If no results, safe to remove:
   ```bash
   pnpm remove -w get-tsconfig
   ```

### Explanation of False Positives

Depcheck scans the root package.json but doesn't fully understand pnpm workspaces. Many "unused" dependencies are actually used by workspace sub-packages (apps/client, apps/server, packages/\*). These are intentionally hoisted to the root for consistent versioning across the monorepo.

**Workspace Pattern:**

```json
{
  "dependencies": {
    "date-fns": "^4.1.0"  ← Root dependency
  }
}
```

Used by:

- `apps/client/src/lib/timezone.ts`
- `apps/server/src/market/barBuilder.ts`
- `packages/shared/src/utils/time.ts`

Depcheck only scans root files and doesn't traverse workspace packages by default.

---

## Monorepo Best Practices

✅ **Keep hoisted dependencies** - date-fns, @openai/agents, jsonwebtoken, ws  
✅ **Keep workspace dev tools** - husky, lint-staged, vitest, testing-library  
❌ **Remove truly unused** - get-tsconfig (after verification)  
⚠️ **Install missing** - eslint-jsonc, eslint-import-resolver-typescript

---

## Next Steps (Phase 3)

After Phase 2 (lint + config) completes:

1. Remove get-tsconfig if grep confirms unused
2. Run `pnpm install` to update lockfile
3. Re-run depcheck to verify no new issues
4. Update this report with final status
