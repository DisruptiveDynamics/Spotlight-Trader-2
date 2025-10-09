# Spotlight Trader

A production-grade TypeScript monorepo for real-time trading coach with voice AI, market data streaming, and rule-based alerts.

## Tech Stack

- **Monorepo**: pnpm workspaces
- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS
- **Backend**: Node 20 + Express + WebSocket + SSE
- **Database**: Neon PostgreSQL + Drizzle ORM
- **Data**: Polygon.io (market data) + OpenAI (voice coach)
- **Code Quality**: ESLint 9 (flat config) + Prettier + Husky

## Architecture

```
spotlight-trader/
├── apps/
│   ├── client/          # Vite + React frontend
│   └── server/          # Express + WS + SSE backend
├── packages/
│   ├── shared/          # Shared types, Zod schemas
│   └── config/          # ESLint, Prettier, tsconfig base
├── .github/workflows/   # CI/CD pipelines
└── package.json         # Root workspace config
```

## Quick Start

### Prerequisites

- Node.js 20+ (use `.nvmrc`)
- pnpm 8+
- PostgreSQL database (Neon recommended)
- API keys: OpenAI, Polygon.io

### Installation

```bash
# Install pnpm
npm install -g pnpm

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env
# Edit .env with your API keys
```

### Environment Variables

Required in `.env`:

```bash
NODE_ENV=development
APP_ORIGIN=http://localhost:5000
ADMIN_ORIGIN=http://localhost:5000
OPENAI_API_KEY=your_openai_api_key
POLYGON_API_KEY=your_polygon_api_key
DATABASE_URL=your_neon_postgres_url
REDIS_URL=your_redis_url (optional)
LOG_LEVEL=info
SESSION_SECRET=min_32_char_secret
```

### Development

```bash
# Run both client and server
pnpm dev

# Run client only
pnpm --filter @spotlight/client dev

# Run server only
pnpm --filter @spotlight/server dev
```

### Database

```bash
# Generate migrations
pnpm --filter @spotlight/server db:generate

# Push schema to database
pnpm --filter @spotlight/server db:push

# Open Drizzle Studio
pnpm --filter @spotlight/server db:studio
```

### Code Quality

```bash
# Type checking
pnpm check

# Linting
pnpm lint
pnpm lint:fix

# Formatting
pnpm fmt
pnpm fmt:check
```

### Testing

```bash
pnpm test
```

### Build

```bash
# Build all packages
pnpm build
```

## Features

### MVP

- ✅ TypeScript strict mode with path aliases
- ✅ Monorepo with pnpm workspaces
- ✅ Environment validation (Zod)
- ✅ Security (CORS + Helmet)
- ✅ Database schema (Drizzle + PostgreSQL)
- 🚧 SSE market data streaming (Polygon)
- 🚧 WebSocket voice proxy (OpenAI Realtime)
- 🚧 Rules engine with versioning
- 🚧 Signal generation with confidence
- 🚧 React dashboard (Chart, Coach, Rules, Journal)

### Roadmap

- [ ] pgvector memory system
- [ ] Redis session management
- [ ] Regime/tape gates
- [ ] Advanced charting
- [ ] User authentication
- [ ] Advanced alerting

## CI/CD

GitHub Actions runs on every push:

1. Install dependencies (`pnpm install`)
2. Type check (`pnpm check`)
3. Lint (`pnpm lint`)
4. Test (`pnpm test`)
5. Build (`pnpm build`)

## Commit Convention

This project uses Husky + lint-staged for pre-commit hooks:

- Automatic linting and formatting
- Type checking before commit
- Conventional commits encouraged

## License

MIT
