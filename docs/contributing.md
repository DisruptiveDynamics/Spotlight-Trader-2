# Contributing to Spotlight Trader

Welcome! This guide will help you get started with development on Spotlight Trader.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing Guidelines](#testing-guidelines)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Architecture Principles](#architecture-principles)

## Getting Started

### Prerequisites

- **Node.js 20+** - Use `nvm` or `fnm` to manage versions
- **pnpm 8+** - Package manager (install via `npm i -g pnpm`)
- **PostgreSQL** - Neon serverless (DATABASE_URL required)
- **Polygon.io API Key** - For market data
- **OpenAI API Key** - For AI coach features

### Environment Setup

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd spotlight-trader
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

4. Initialize database:
   ```bash
   pnpm db:push
   ```

5. Start development servers:
   ```bash
   pnpm dev
   ```

### Monorepo Structure

```
spotlight-trader/
├── apps/
│   ├── client/          # React frontend (Vite, Tailwind)
│   └── server/          # Express backend (Node.js 20)
├── packages/
│   ├── shared/          # Shared types, utils, indicators
│   └── config/          # Shared configuration
├── docs/                # Documentation
├── scripts/             # Build and utility scripts
└── .github/workflows/   # CI/CD workflows
```

## Development Workflow

### Running Locally

**Start all services:**
```bash
pnpm dev
```

This runs:
- Client dev server on `http://localhost:5000`
- Backend server on `http://localhost:8080`

**Run individual workspaces:**
```bash
pnpm --filter @spotlight/client dev
pnpm --filter @spotlight/server dev
```

### Database Migrations

**Important:** Never write manual SQL migrations. Use Drizzle's push command:

1. Modify schema in `packages/shared/src/schema.ts`
2. Run:
   ```bash
   pnpm db:push
   ```

If you encounter data-loss warnings:
```bash
pnpm db:push --force
```

### Common Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev servers (client + server) |
| `pnpm build` | Build all workspaces |
| `pnpm test` | Run tests in watch mode |
| `pnpm test:ci` | Run tests once (CI mode) |
| `pnpm test:coverage` | Run tests with coverage report |
| `pnpm lint` | Lint all code |
| `pnpm lint:fix` | Auto-fix linting issues |
| `pnpm check` | TypeScript type checking |
| `pnpm db:push` | Sync database schema |
| `pnpm db:studio` | Open Drizzle Studio (DB GUI) |
| `pnpm cleanup` | Kill processes on ports 5000, 8080 |

## Code Standards

### TypeScript

- **Strict mode enabled** - No implicit `any`, proper null checks
- **Prefer explicit types** - Avoid type inference for public APIs
- **Use Zod for validation** - Runtime type safety for API boundaries

Example:
```typescript
import { z } from "zod";

const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
});

type User = z.infer<typeof UserSchema>;
```

### Naming Conventions

- **Files**: kebab-case (`bar-builder.ts`, `voice-proxy.ts`)
- **Components**: PascalCase (`ChartView.tsx`, `PresenceBubble.tsx`)
- **Functions**: camelCase (`buildBar`, `emitEvent`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRIES`, `DEFAULT_TIMEOUT`)
- **Types/Interfaces**: PascalCase (`BarData`, `VoiceSession`)

### Code Organization

**Server-side:**
- Place feature code in `apps/server/src/<feature>/`
- Shared utilities go in `packages/shared/src/`
- Export types from `@shared/types`

**Client-side:**
- Components in `apps/client/src/components/`
- Hooks in `apps/client/src/hooks/`
- Stores (Zustand) in `apps/client/src/stores/`

### Imports

Use path aliases:
```typescript
// Good
import { BarData } from "@shared/types";
import { ChartView } from "@/components/ChartView";

// Avoid
import { BarData } from "../../packages/shared/src/types";
```

## Testing Guidelines

### Test Structure

We use **Vitest** for unit and integration testing.

**Test file naming:**
- Unit tests: `<filename>.test.ts`
- Integration tests: `<filename>.integration.test.ts`
- Place tests in `__tests__/` directory or alongside source files

### Writing Tests

**Example unit test:**
```typescript
import { describe, it, expect } from "vitest";
import { buildBar } from "./bar-builder";

describe("BarBuilder", () => {
  it("should aggregate ticks into 1m bar", () => {
    const ticks = [
      { price: 100, size: 10, ts: 1000 },
      { price: 101, size: 20, ts: 1500 },
    ];
    
    const bar = buildBar(ticks, 60000);
    
    expect(bar.ohlcv.o).toBe(100);
    expect(bar.ohlcv.h).toBe(101);
  });
});
```

### Coverage Requirements

- **Overall coverage**: 80% lines, 80% statements
- **Core modules**: 85% coverage (streaming, indicators, voice)
- **Critical paths**: 100% coverage (bar builder, SSE, risk governor)

Run coverage:
```bash
pnpm test:coverage
```

View HTML report:
```bash
open coverage/index.html
```

### Test Best Practices

1. **Use deterministic fixtures** - No `Math.random()` in tests
2. **Isolate dependencies** - Mock external services (Polygon, OpenAI)
3. **Test edge cases** - Null, empty, overflow, underflow
4. **Fast tests** - Unit tests should run in <100ms each
5. **Clear assertions** - One logical assertion per test

## Commit Conventions

We follow **Conventional Commits** with phase-based prefixes.

### Format

```
[phase-<N>] <type>: <description>

<optional body>

<optional footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring (no behavior change)
- `perf`: Performance improvement
- `test`: Adding or updating tests
- `docs`: Documentation changes
- `chore`: Build process, tooling, dependencies

### Examples

```
[phase-10] feat: add CI workflow with coverage upload

Added GitHub Actions workflow for automated quality gates:
- Install, lint, typecheck, test with coverage
- Upload coverage artifacts with 30-day retention
- Build verification step

[phase-9] test: add voice state machine tests

Implemented 11 tests covering connection lifecycle,
tool execution flow, and error recovery.
```

### Phase Guidelines

Current phases:
- **Phase 1-5**: Foundation (charts, data pipeline, rules engine)
- **Phase 6**: Voice tools integrity & performance
- **Phase 7**: AI intelligence & proactive coaching
- **Phase 8**: Memory flush & risk gating
- **Phase 9**: Test expansion & coverage
- **Phase 10**: CI & documentation

## Pull Request Process

### Before Opening a PR

1. **Run quality checks:**
   ```bash
   pnpm lint
   pnpm check
   pnpm test:ci
   ```

2. **Update documentation:**
   - Add to CHANGELOG.md (Unreleased section)
   - Update relevant docs in `/docs`
   - Add JSDoc comments for public APIs

3. **Ensure coverage:**
   ```bash
   pnpm test:coverage
   ```

### PR Template

```markdown
## Description

Brief description of changes.

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Checklist

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests pass locally
- [ ] CHANGELOG.md updated
```

### Review Process

1. **Automated checks** - CI must pass (lint, test, build)
2. **Code review** - At least one approval required
3. **Testing** - Reviewer tests changes locally
4. **Merge** - Squash and merge to main

## Architecture Principles

### Performance First

- **Sub-millisecond latency** - Optimize critical paths (tick → bar → chart)
- **Zero-lag UI** - Use RAF batching, virtualization, memoization
- **Deterministic behavior** - Predictable timing, no jitter

### Data Integrity

- **Server-authoritative** - All data flows from server ring buffer
- **Lossless streaming** - SSE with sequence numbers and gap-filling
- **Deterministic calculations** - Exact indicator results, reproducible backtests

### Professional UX

- **Keyboard-first** - Hotkeys for all actions
- **Accessibility** - ARIA labels, screen reader support
- **Focus modes** - Trade/Review/Normal modes for context switching

### Scalability

- **Stateless design** - Horizontal scaling via Redis (future)
- **Connection limits** - Rate limiting, circuit breakers
- **Efficient data structures** - Ring buffers, sparse arrays

### Security

- **Zero trust** - Validate all inputs with Zod
- **Short-lived tokens** - 60s TTL for voice, configurable for sessions
- **httpOnly cookies** - No client-side token access
- **CORS strict allowlist** - Explicit origin validation

## Feature Development Checklist

When adding a new feature:

- [ ] Design document (if complex)
- [ ] Schema changes (via Drizzle)
- [ ] Server-side implementation
- [ ] Client-side implementation
- [ ] Unit tests (80%+ coverage)
- [ ] Integration tests
- [ ] API documentation
- [ ] User-facing documentation
- [ ] Feature flag (if experimental)
- [ ] Metrics/observability
- [ ] Performance testing
- [ ] Security review
- [ ] Accessibility audit

## Getting Help

- **Documentation**: `/docs` directory
- **Issues**: GitHub Issues for bugs/features
- **Discussions**: GitHub Discussions for Q&A
- **Code examples**: Existing implementations in codebase

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
