# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Exprsn** is a decentralized short-form video platform built on the AT Protocol. It's a pnpm monorepo with TypeScript throughout.

## Development Commands

```bash
# Install dependencies
pnpm install

# Start all services in development (API, web, workers)
pnpm dev

# Build all packages
pnpm build

# Type checking
pnpm typecheck

# Run tests
pnpm test

# Linting and formatting
pnpm lint
pnpm format

# Database operations (runs against @exprsn/api)
pnpm db:generate    # Generate migration from schema changes
pnpm db:push        # Push schema to database
pnpm db:migrate     # Run migrations
pnpm db:studio      # Open Drizzle Studio

# Docker infrastructure
pnpm docker:up      # Start PostgreSQL, Redis, MinIO, OpenSearch
pnpm docker:down    # Stop all containers

# Lexicon type generation
pnpm lexicon:gen
```

### Package-specific commands

```bash
# Run single package in dev mode
pnpm --filter @exprsn/api dev
pnpm --filter @exprsn/web dev

# Run tests for single package
pnpm --filter @exprsn/api test
pnpm --filter @exprsn/api test:watch
pnpm --filter @exprsn/api test:coverage

# Seed scripts
pnpm --filter @exprsn/api db:seed
pnpm --filter @exprsn/api seed:admin
pnpm --filter @exprsn/api seed:community
```

## Package Architecture

```
packages/
├── api/           # Hono REST/XRPC API server (port 3000)
├── web/           # Next.js 16 frontend (port 3001)
├── shared/        # Shared types, utils, config
├── pds/           # AT Protocol Personal Data Server
├── relay/         # Firehose relay for federation
├── feed-generator/# Custom feed algorithms
├── render-worker/ # FFmpeg video processing worker
├── prefetch/      # Content prefetching service
├── lexicons/      # AT Protocol schema definitions
├── mobile/        # React Native/Expo app
└── video-service/ # Video processing utilities
```

### Dependency flow
`shared` → `pds` → `relay` → `api` → `web`

## API Structure (`packages/api`)

### Route organization
- `/xrpc/io.exprsn.*` - Main XRPC endpoints (video, feed, comments, social)
- `/oauth/*` - OAuth2 authentication
- `/sso/*` - OIDC, SAML, social login
- `/.well-known/*` - Federation discovery
- `/plc/*` - PLC directory for DIDs
- `/admin/*` - Admin dashboard APIs

### WebSocket namespaces (Socket.IO)
- `/chat` - Direct messaging
- `/editor-collab` - Collaborative editing (Yjs)
- `/render-progress` - Video render status
- `/watch-party` - Synchronized playback
- `/admin` - Admin notifications

### Key services (`src/services/`)
- `studio/RenderService.ts` - Video rendering with FFmpeg/BullMQ
- `feed/` - Personalized feed algorithms
- `moderation/` - Reports, sanctions, appeals
- `organization/` - Org types, hierarchy, PLC publishing
- `payments/` - Stripe, PayPal, Authorize.net
- `sso/` - Authentication providers

### Database (Drizzle ORM with PostgreSQL)

Schema in `src/db/schema.ts`. Key tables:
- `users` - Cached profiles from PDS
- `videos` - Video posts with moderation status
- `organizations` - Org metadata and hierarchy
- `moderation_reports`, `moderation_sanctions` - Content moderation

Database connection falls back: DATABASE_URL → localhost PostgreSQL → SQLite

## Web Frontend (`packages/web`)

Next.js 16 with React 19, TailwindCSS, Zustand for state.

Key directories:
- `src/app/` - App router pages
- `src/components/` - React components
- `src/stores/` - Zustand stores
- `src/lib/api.ts` - API client

## Key Patterns

### Authentication
- OAuth via `@atproto/oauth-client-node`
- Admin roles: `super_admin`, `admin`, `moderator`, `support`
- Middleware: `authMiddleware`, `optionalAuthMiddleware`, `adminAuthMiddleware`

### Route handlers (Hono)
```typescript
router.get('/endpoint', optionalAuthMiddleware, async (c) => {
  const userDid = c.get('did');
  return c.json({ data });
});
```

### Database queries
```typescript
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';

const videos = await db.select()
  .from(schema.videos)
  .where(eq(schema.videos.authorDid, userDid));
```

## Video Processing Pipeline

1. Video uploaded to S3/MinIO
2. Render job queued in Redis (BullMQ queue: `render-jobs`)
3. Render worker processes with FFmpeg (generates HLS + thumbnails)
4. Webhook notifies API of completion

## Environment Setup

Copy `.env.example` to `.env`. Key variables:
- `DATABASE_URL` - PostgreSQL connection
- `REDIS_URL` - Redis for queues and caching
- `DO_SPACES_*` - S3/MinIO for video storage
- `PDS_ENABLED` - Enable AT Protocol PDS
- `RELAY_ENABLED` - Enable federation relay

## Docker Services

`docker-compose up -d` starts:
- `postgres` (5432) - Main database
- `redis` (6379) - Cache and queues
- `minio` (9000, 9001) - S3-compatible storage
- `opensearch` (9200) - Full-text search (optional)
- `render-worker` - FFmpeg video processing
- `mailhog` (8025) - Email testing UI
