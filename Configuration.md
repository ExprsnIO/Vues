# Exprsn Configuration

This document covers all environment variables and service configuration for Exprsn.

## Quick Start

```bash
# Development
cp .env.example .env
# Edit .env as needed, then:
pnpm docker:up
pnpm dev

# Production
cp .env.production.example .env.production
# Fill in all required values, then:
docker compose -f docker-compose.prod.yml up -d
```

## Environment Variables

### Core

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development` or `production` |
| `PORT` | `3000` | API server port |
| `HOST` | `0.0.0.0` | API server bind address |
| `APP_URL` | `http://localhost:3000` | Public URL of the application |
| `CORS_ORIGIN` | — | Comma-separated allowed origins (production) |

### Database (PostgreSQL)

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://exprsn:exprsn_dev@localhost:5432/exprsn` | PostgreSQL connection string |

The development Docker Compose creates a PostgreSQL 16 instance with user `exprsn`, password `exprsn_dev`, and database `exprsn`.

**Database commands:**
```bash
pnpm db:push          # Push schema changes (dev)
pnpm db:generate      # Generate migration files
pnpm db:migrate       # Run migrations (production)
```

### Redis

| Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |

Redis is used for caching, BullMQ job queues, session storage, and real-time presence.

### Object Storage (S3 / MinIO)

| Variable | Default | Description |
|---|---|---|
| `DO_SPACES_REGION` | `nyc3` | S3 region |
| `DO_SPACES_BUCKET` | `exprsn-uploads` | Upload bucket name |
| `DO_SPACES_KEY` | `minioadmin` | S3 access key |
| `DO_SPACES_SECRET` | `minioadmin` | S3 secret key |
| `DO_SPACES_ENDPOINT` | `http://localhost:9000` | S3 endpoint URL |
| `DO_SPACES_CDN` | `http://localhost:9000/exprsn-processed` | CDN URL for processed assets |

Development uses MinIO as a local S3-compatible store. The MinIO console is available at `http://localhost:9001` (minioadmin/minioadmin).

**Production** uses DigitalOcean Spaces:
```env
DO_SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
DO_SPACES_CDN=https://cdn.exprsn.io
```

### Security

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | — | Secret for signing JWTs (required in production) |
| `ENCRYPTION_KEY` | — | 32-byte hex key for field-level encryption |
| `OAUTH_CLIENT_ID` | — | AT Protocol OAuth client ID |
| `OAUTH_PRIVATE_KEY` | — | RSA private key (PEM) for OAuth signing |

### AT Protocol / Federation

| Variable | Default | Description |
|---|---|---|
| `SERVICE_DID` | `did:web:localhost%3A3000` | Service DID for this instance |
| `PDS_ENABLED` | `true` | Enable the Personal Data Server |
| `PDS_DOMAIN` | `localhost:3000` | PDS hostname |
| `PDS_DID_METHOD` | `did:plc` | DID method for user identities |
| `PDS_DATA_PATH` | `./data` | Local storage path for PDS data |
| `PDS_ENDPOINT` | `http://localhost:3000/xrpc` | Public XRPC endpoint |
| `RELAY_ENABLED` | `false` | Enable the AT Protocol relay/firehose |
| `RELAY_SOCKETIO` | `true` | Enable Socket.IO relay transport |
| `RELAY_WEBSOCKET` | `true` | Enable native WebSocket relay transport |
| `RELAY_JETSTREAM` | `true` | Enable Jetstream relay transport |
| `RELAY_MAX_WS_SUBSCRIBERS` | `1000` | Max WebSocket subscribers |
| `RELAY_MAX_JETSTREAM_SUBSCRIBERS` | `5000` | Max Jetstream subscribers |
| `RELAY_VERIFY_SIGNATURES` | `false` | Verify commit signatures on relay |
| `FEDERATION_CONSUMER_ENABLED` | `false` | Subscribe to remote relay firehoses |
| `FEDERATION_REQUIRE_AUTH` | `true` | Require auth on federation push endpoints |
| `PLC_URL` | `https://plc.directory` | PLC directory for DID resolution |
| `JETSTREAM_URL` | `wss://jetstream2.us-east.bsky.network/subscribe` | Bluesky Jetstream endpoint |

### Blob Storage

| Variable | Default | Description |
|---|---|---|
| `BLOB_STORAGE_TYPE` | `local` | `local` or `s3` |
| `BLOB_STORAGE_PATH` | `./data/blobs` | Path for local blob storage |

### Video Processing (FFmpeg)

| Variable | Default | Description |
|---|---|---|
| `FFMPEG_SERVICE_TYPE` | `local` | `local` or `docker` |
| `FFMPEG_PATH` | `/usr/local/bin/ffmpeg` | Path to FFmpeg binary |
| `FFPROBE_PATH` | `/usr/local/bin/ffprobe` | Path to FFprobe binary |
| `VIDEO_PRESETS` | `360p,480p,720p,1080p` | Comma-separated transcode presets |
| `GENERATE_ANIMATED_PREVIEW` | `true` | Generate animated GIF previews |
| `WORKER_CONCURRENCY` | `2` | Concurrent render jobs per worker |
| `GPU_ENABLED` | `false` | Enable GPU-accelerated encoding |
| `RENDER_WORKER_REPLICAS` | `2` | Number of render worker containers (production) |

### Prefetch / Caching

| Variable | Default | Description |
|---|---|---|
| `PREFETCH_ENABLED` | `true` | Enable content prefetching |
| `HOT_CACHE_TTL` | `300000` | Hot cache TTL in ms (5 min) |
| `WARM_CACHE_TTL` | `900000` | Warm cache TTL in ms (15 min) |
| `COLD_CACHE_TTL` | `3600000` | Cold cache TTL in ms (60 min) |
| `PREFETCH_CONCURRENCY` | `50` | Max concurrent prefetch operations |
| `PREFETCH_DEFAULT_LIMIT` | `20` | Default prefetch batch size |
| `ACTIVITY_CHECK_INTERVAL` | `60000` | Interval for activity checks in ms |

### Push Notifications

**Firebase Cloud Messaging (FCM):**

| Variable | Default | Description |
|---|---|---|
| `FIREBASE_PROJECT_ID` | — | Firebase project ID |
| `FIREBASE_PRIVATE_KEY` | — | Firebase service account private key |
| `FIREBASE_CLIENT_EMAIL` | — | Firebase service account email |

**Apple Push Notification Service (APNs):**

| Variable | Default | Description |
|---|---|---|
| `APNS_KEY_ID` | — | APNs key ID |
| `APNS_TEAM_ID` | — | Apple developer team ID |
| `APNS_KEY_PATH` | — | Path to APNs `.p8` key file |
| `APNS_BUNDLE_ID` | `io.exprsn.app` | iOS app bundle identifier |

### Email

| Variable | Default | Description |
|---|---|---|
| `SMTP_HOST` | `localhost` | SMTP server hostname |
| `SMTP_PORT` | `1025` | SMTP server port |
| `SMTP_SECURE` | `false` | Use TLS for SMTP |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASSWORD` | — | SMTP password |
| `EMAIL_FROM` | `noreply@exprsn.io` | Default sender address |

Development uses Mailhog for email capture. Access the web UI at `http://localhost:8025`.

### Search (OpenSearch)

| Variable | Default | Description |
|---|---|---|
| `OPENSEARCH_URL` | — | OpenSearch endpoint (optional) |

OpenSearch is optional. When disabled, search falls back to PostgreSQL queries.

### AI / ML (Optional)

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Anthropic API key for AI features |
| `OPENAI_API_KEY` | — | OpenAI API key for feed generation |

Used by the feed generator for personalized content recommendations. Not required for core functionality.

### Payments (Optional)

| Variable | Default | Description |
|---|---|---|
| `STRIPE_*` | — | Stripe API keys and webhook secrets |
| `PAYPAL_*` | — | PayPal client credentials |
| `CREATOR_FUND_ENABLED` | `false` | Enable the creator fund |
| `CREATOR_FUND_MONTHLY_POOL` | `10000` | Monthly creator fund pool (USD) |

### Monitoring (Production)

| Variable | Default | Description |
|---|---|---|
| `METRICS_ENABLED` | `false` | Enable Prometheus metrics |
| `LOG_LEVEL` | `info` | Logging level |
| `GRAFANA_ADMIN_USER` | `admin` | Grafana admin username |
| `GRAFANA_ADMIN_PASSWORD` | — | Grafana admin password |
| `GRAFANA_ROOT_URL` | — | Public Grafana URL |

### Rate Limiting

Default rate limits:
- Anonymous: 30 requests/minute
- Authenticated: 60 requests/minute
- Admin: 120 requests/minute

Override via admin settings or environment variables.

## Docker Services

### Development (docker-compose.yml)

```bash
pnpm docker:up          # Core services: Postgres, Redis, MinIO, Mailhog
pnpm docker:up:all      # All services including workers and OpenSearch
```

| Service | Image | Ports |
|---|---|---|
| PostgreSQL | `postgres:16-alpine` | 5432 |
| Redis | `redis:7-alpine` | 6379 |
| MinIO | `minio/minio:latest` | 9000 (API), 9001 (Console) |
| OpenSearch | `opensearch:2.17.0` | 9200, 9600 |
| Mailhog | `mailhog:v1.0.1` | 1025 (SMTP), 8025 (Web) |
| RabbitMQ | `rabbitmq:3.13` | 5672, 15672 (optional profile) |
| Render Worker | custom (FFmpeg) | 3100 (health) |
| Prefetch Worker | custom | — |

### Production (docker-compose.prod.yml)

The production stack adds:
- **3 API replicas** behind Nginx reverse proxy
- **Prometheus** for metrics collection
- **Grafana** for dashboards
- **Loki** for log aggregation
- **Promtail** for log shipping
- **AlertManager** for alerts

### Kubernetes (k8s/)

Kubernetes manifests are in `k8s/` using Kustomize:

```bash
kubectl apply -k k8s/
```

Includes deployments for API, web, PostgreSQL, Redis, and render workers.

## Web App Configuration (packages/web)

The Next.js app uses these public environment variables:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | API base URL |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL |

## Mobile App Configuration (packages/mobile)

Expo configuration is in `packages/mobile/app.json`. Environment-specific settings use Expo's built-in environment handling.

## Admin CLI

The admin CLI provides tools for managing the platform:

```bash
pnpm admin              # Launch admin CLI
```

Features include user management, content moderation, encryption key management, and system diagnostics.
