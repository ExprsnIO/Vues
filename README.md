# Exprsn

A decentralized short-form video platform built on the [AT Protocol](https://atproto.com/). Express yourself with short-form videos in a federated, user-owned social network.

## Features

- **Short-Form Video** - Create, upload, and share short-form videos with a built-in editor
- **AT Protocol Federation** - Decentralized identity via `did:web` and `did:plc`, interoperable with the ATmosphere
- **Live Streaming** - Real-time broadcast with chat and watch parties
- **Creator Fund** - Built-in monetization with Stripe, PayPal, and Authorize.net
- **AI-Powered Feeds** - Personalized content discovery using Anthropic and OpenAI
- **Multi-Platform** - Web (Next.js), iOS, and Android (Expo/React Native)
- **Real-Time** - WebSocket and Socket.IO powered chat, notifications, and presence
- **Moderation** - Comprehensive moderation tools and admin dashboard
- **Challenges** - Creator challenges with community participation
- **Full-Text Search** - OpenSearch-powered content and user discovery

## Architecture

Exprsn is a **pnpm monorepo** managed with [Turborepo](https://turbo.build/):

| Package | Description |
|---|---|
| `packages/api` | Hono REST API, WebSocket server, background workers |
| `packages/web` | Next.js 16 frontend with Tailwind CSS |
| `packages/mobile` | Expo / React Native app with NativeWind |
| `packages/shared` | Shared types, utilities, and configuration |
| `packages/lexicons` | AT Protocol lexicon definitions |
| `packages/pds` | Personal Data Server (AT Protocol) |
| `packages/relay` | Federation relay for AT Protocol firehose |
| `packages/prefetch` | Content prefetching service |
| `packages/video-service` | Video transcoding service |
| `packages/render-worker` | FFmpeg rendering worker |
| `packages/feed-generator` | AI-powered feed generation |
| `packages/setup` | Interactive setup CLI |

## Tech Stack

**Backend:** Node.js, Hono, PostgreSQL, Drizzle ORM, Redis, BullMQ, FFmpeg
**Frontend:** Next.js 16, React 19, Tailwind CSS, Zustand, TanStack Query
**Mobile:** Expo 52, React Native, NativeWind
**Infrastructure:** Docker, Kubernetes, Nginx, Prometheus, Grafana, Loki
**Storage:** DigitalOcean Spaces (S3-compatible), MinIO (local dev)

## Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** 9.15.0
- **Docker** and Docker Compose
- **FFmpeg** (for local video processing)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/your-org/exprsn.git
cd exprsn

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Start infrastructure (PostgreSQL, Redis, MinIO, Mailhog)
pnpm docker:up

# Push database schema
pnpm db:push

# Run interactive setup
pnpm setup

# Start all services in development mode
pnpm dev
```

The API runs on `http://localhost:3000`, the web app on `http://localhost:3001`, and the mobile app via Expo Go.

## Development Commands

```bash
pnpm dev              # Start all services (32 concurrent processes)
pnpm build            # Build all packages
pnpm test             # Run test suites
pnpm typecheck        # TypeScript type checking
pnpm format           # Format code with Prettier
pnpm clean            # Remove build artifacts and node_modules

# Database
pnpm db:generate      # Generate Drizzle migrations
pnpm db:migrate       # Run database migrations
pnpm db:push          # Push schema changes directly

# Docker
pnpm docker:up        # Start core services (Postgres, Redis, MinIO, Mailhog)
pnpm docker:up:all    # Start all services including workers
pnpm docker:down      # Stop all containers

# Utilities
pnpm admin            # Admin CLI tool
pnpm setup            # Interactive setup wizard
pnpm lexicon:gen      # Generate AT Protocol lexicon types
```

## Docker Services

| Service | Port | Purpose |
|---|---|---|
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | Caching and job queues |
| MinIO | 9000 / 9001 | S3-compatible object storage (dev) |
| OpenSearch | 9200 | Full-text search (optional) |
| Mailhog | 1025 / 8025 | Email testing (SMTP / Web UI) |
| RabbitMQ | 5672 / 15672 | Message queue (optional) |

## Production Deployment

See [Configuration.md](Configuration.md) for full environment variable reference.

```bash
# Using Docker Compose
cp .env.production.example .env.production
# Edit .env.production with your values
docker compose -f docker-compose.prod.yml up -d

# Using the deployment script
./scripts/deploy.sh

# Using Kubernetes
kubectl apply -k k8s/
```

The production stack includes monitoring with Prometheus, Grafana dashboards, Loki log aggregation, and AlertManager.

## Documentation

- [Configuration.md](Configuration.md) - Environment variables and service configuration
- [CONTRIBUTING.md](CONTRIBUTING.md) - How to contribute
- [STYLEGUIDE.md](STYLEGUIDE.md) - Code style and conventions
- [Markdowns/](Markdowns/) - Architecture docs, API reference, and implementation guides

## License

This project is licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE) for details.
