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

# Run a single test file
pnpm --filter @exprsn/api test routes/auth.test.ts

# Database (API package)
pnpm db:push                          # Push schema to DB
pnpm --filter @exprsn/api db:seed     # Seed database
pnpm --filter @exprsn/api db:studio   # Open Drizzle Studio
pnpm --filter @exprsn/api seed:community  # Seed community data
pnpm --filter @exprsn/api seed:admin      # Seed admin user

# Infrastructure
pnpm docker:up                        # Start Postgres, Redis, OpenSearch, MinIO
pnpm docker:down                      # Stop all containers

# Linting/Formatting
pnpm lint                             # Lint all packages
pnpm format                           # Prettier format
pnpm typecheck                        # TypeScript check

# Workers
pnpm --filter @exprsn/video-service dev   # Video transcoding worker
pnpm --filter @exprsn/feed-generator dev  # Feed generation worker
pnpm --filter @exprsn/prefetch worker     # Timeline prefetch worker
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
| `packages/render-worker` | FFmpeg, BullMQ | Render pipeline worker |
| `Exprsn/` | SwiftUI | Native iOS app |

### API Endpoint Patterns

- XRPC-style: `/xrpc/io.exprsn.{domain}.{method}` (e.g., `/xrpc/io.exprsn.actor.getProfile`)
- Routes organized by domain in `packages/api/src/routes/`
- Business logic in `packages/api/src/services/`
- Auth middleware: `authMiddleware` (required) or `optionalAuthMiddleware`

### API Route Domains

Routes are organized by functional domain in `packages/api/src/routes/`:
- `auth.ts` - Account creation, sessions, authentication
- `actor.ts` - User profiles, handles
- `feed.ts` - Video feeds, timeline
- `graph.ts` - Social graph (follows, followers)
- `social.ts` - Likes, reposts, comments
- `chat.ts` - Real-time messaging
- `admin.ts` - Admin dashboard APIs
- `studio.ts` - Video editor, effects, rendering
- `live.ts` - Live streaming
- `payments.ts` - Subscriptions, transactions

### Services Layer

Core services in `packages/api/src/services/`:
- `storage/` - Multi-provider storage (AWS S3, Azure Blob, MinIO, local)
- `payments/` - Payment gateway factory (Stripe, PayPal, Authorize.net)
- `moderation/` - AI moderation, workflow engine
- `federation/` - Service auth, content sync, federated search
- `identity/` - DID resolution, handle verification
- `notifications/` - Email, webhooks
- `studio/` - Editor, effects, publishing, rendering

### Database

- Primary: PostgreSQL via Drizzle ORM
- Fallback: SQLite if PostgreSQL unavailable
- Schema: `packages/api/src/db/schema.ts`
- Migrations: `packages/api/drizzle/`

### Key Infrastructure

- Redis: Caching, BullMQ job queues, WebSocket support
- MinIO/S3: Object storage for media
- OpenSearch: Search functionality
- Socket.IO: Real-time chat, editor collaboration, render progress
- Mailhog: Email testing (localhost:8025)

### WebSocket Namespaces

Initialized in `packages/api/src/index.ts`:
- `/chat` - Real-time messaging
- `/editor-collab` - Collaborative video editing (Yjs)
- `/xrpc/com.atproto.sync.subscribeRepos` - Federation firehose (when relay enabled)

## Code Conventions

- ES modules throughout (`type: "module"`, `.js` extensions in imports)
- Workspace imports: `@exprsn/api`, `@exprsn/shared`, etc.
- Path aliases: Web/mobile use `@/*` for `src/*`
- Prettier: 100 char width, single quotes, 2-space indent

## Testing

API tests use Vitest with helpers in `packages/api/tests/helpers.ts`:
- `createTestApp()` - Creates test Hono app instance with error handling
- `testRequest(app, method, path, options)` - Simulates HTTP requests
- `createMockUser()` - Creates mock user data
- `createMockVideo()` - Creates mock video data
- `authHeader(token)` - Creates Authorization header
- Database mocking via `vi.mock('../../src/db/index.js', ...)`

Test files are in `packages/api/tests/routes/` mirroring the route structure.

## Environment

API env file at `packages/api/.env` (copy from `.env.example`). Key variables:
- `PORT=3002` - API port
- `DATABASE_URL` - PostgreSQL connection
- `REDIS_URL` - Redis connection
- `S3_*` / `DO_SPACES_*` - Object storage config
- `RELAY_ENABLED` - Enable federation relay
- `OAUTH_PRIVATE_KEY` - OAuth signing key

## Docker Services

`docker-compose.yml` provides:
- `postgres` (5432) - PostgreSQL database
- `redis` (6379) - Redis cache/queues
- `opensearch` (9200) - Search engine
- `opensearch-dashboards` (5601) - Search UI
- `minio` (9000/9001) - S3-compatible storage
- `render-worker` - FFmpeg render workers (scalable)
- `prefetch-worker` - Timeline prefetch
- `mailhog` (1025/8025) - Email testing

## Native iOS App

The `Exprsn/` directory contains a SwiftUI iOS app:
- Configuration: `Exprsn/Configuration/Environment.swift`
- Network: `Exprsn/Core/Network/` (APIClient, APIEndpoints)
- Auth: `Exprsn/Core/Auth/` (AuthManager, KeychainService)
- Features: `Exprsn/Features/` (Feed, Profile, Settings, etc.)

Open `Exprsn/Exprsn.xcodeproj` in Xcode to run.
