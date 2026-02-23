# FFmpeg Render Worker
# Multi-stage build with FFmpeg 6.0 and Node.js 20

FROM jrottenberg/ffmpeg:6.0-ubuntu AS ffmpeg

FROM node:20-slim AS production

# Copy ffmpeg binaries from ffmpeg image
COPY --from=ffmpeg /usr/local /usr/local

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files from monorepo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/render-worker/package.json ./packages/render-worker/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built source files
COPY packages/render-worker/dist ./packages/render-worker/dist
COPY packages/shared/dist ./packages/shared/dist

# Environment variables
ENV NODE_ENV=production
ENV FFMPEG_PATH=/usr/local/bin/ffmpeg
ENV FFPROBE_PATH=/usr/local/bin/ffprobe
ENV WORKER_CONCURRENCY=2
ENV HEALTH_PORT=3100
ENV GRACEFUL_SHUTDOWN_TIMEOUT=30000
ENV GPU_ENABLED=false

# Create directories for renders
RUN mkdir -p /data/renders /tmp/renders && chmod 777 /data/renders /tmp/renders

# Health check
HEALTHCHECK --interval=15s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3100/health || exit 1

# Expose health check port
EXPOSE 3100

# Run the worker
WORKDIR /app/packages/render-worker
CMD ["node", "dist/worker.js"]
