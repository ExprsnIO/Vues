# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Exprsn is a short-form video platform monorepo (pnpm + Turbo) with web, mobile, API, AT Protocol federation, and media processing services.

## Common Commands

```bash
# Development
pnpm dev                              # Run all packages in dev mode
pnpm --filter @exprsn/api dev         # API only (runs on port 3002)
pnpm --filter @exprsn/web dev         # Web only (set NEXT_PUBLIC_API_URL=http://localhost:3002)

# Building
pnpm build                            # Build all packages
pnpm --filter @exprsn/api build       # Build API only

# Testing
pnpm test                             # Run all tests
pnpm --filter @exprsn/api test        # API tests (Vitest)
pnpm --filter @exprsn/api test:watch  # Watch mode

# Database (API package)
pnpm db:push                          # Push schema to DB
pnpm --filter @exprsn/api db:seed     # Seed database
pnpm --filter @exprsn/api db:studio   # Open Drizzle Studio

# Infrastructure
pnpm docker:up                        # Start Postgres, Redis, OpenSearch, MinIO
pnpm docker:down                      # Stop all containers

# Linting/Formatting
pnpm lint                             # Lint all packages
pnpm format                           # Prettier format
pnpm typecheck                        # TypeScript check
```

## Architecture

### Packages

| Package | Tech | Purpose |
|---------|------|---------|
| `packages/api` | Hono, Drizzle, PostgreSQL | Main API server, auth, social graph, feeds, chat, admin |
| `packages/web` | Next.js 16, React 19 | Web client |
| `packages/mobile` | Expo, React Native | Mobile client |
| `packages/shared` | TypeScript | Shared types, config, utilities |
| `packages/pds` | AT Protocol | PDS components (identity, repo, sync) |
| `packages/relay` | Socket.IO | Firehose/sequencer for federation |
| `packages/lexicons` | XRPC schemas | AT Protocol lexicon definitions |
| `packages/feed-generator` | BullMQ | Trending feeds, Jetstream consumer |
| `packages/video-service` | FFmpeg, BullMQ | Video transcoding worker |
| `packages/prefetch` | BullMQ | Timeline prefetch worker |
| `Exprsn/` | SwiftUI | Native iOS app |

### API Endpoint Patterns

- XRPC-style: `/xrpc/io.exprsn.{domain}.{method}` (e.g., `/xrpc/io.exprsn.actor.getProfile`)
- Routes organized by domain in `packages/api/src/routes/`
- Business logic in `packages/api/src/services/`
- Auth middleware: `authMiddleware` (required) or `optionalAuthMiddleware`

### Database

- Primary: PostgreSQL via Drizzle ORM
- Fallback: SQLite if PostgreSQL unavailable
- Schema: `packages/api/src/db/schema.ts`
- Migrations: `packages/api/drizzle/`

### Key Infrastructure

- Redis: Caching, BullMQ job queues, WebSocket support
- MinIO/S3: Object storage for media
- OpenSearch: Search functionality
- Socket.IO: Real-time chat and collaboration

## Code Conventions

- ES modules throughout (`type: "module"`, `.js` extensions in imports)
- Workspace imports: `@exprsn/api`, `@exprsn/shared`, etc.
- Path aliases: Web/mobile use `@/*` for `src/*`
- Prettier: 100 char width, single quotes, 2-space indent

## Testing

API tests use Vitest with helpers in `packages/api/tests/helpers.ts`:
- `createTestApp()` - Creates test Hono app instance
- `testRequest()` - Simulates HTTP requests
- Database mocking via `vi.mock()`

## Environment

API env file at `packages/api/.env` (copy from `.env.example`). Key variables:
- `PORT=3002` - API port
- `DATABASE_URL` - PostgreSQL connection
- `REDIS_URL` - Redis connection
- `S3_*` - Object storage config
