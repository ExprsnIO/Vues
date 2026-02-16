# FFmpeg Video Processing Worker
# Based on jrottenberg/ffmpeg with Node.js for the worker process

FROM jrottenberg/ffmpeg:4.4-alpine AS ffmpeg

FROM node:20-alpine

# Copy ffmpeg binaries from ffmpeg image
COPY --from=ffmpeg /usr/local /usr/local

# Install runtime dependencies for ffmpeg
RUN apk add --no-cache \
    ca-certificates \
    libstdc++ \
    libgcc \
    libgomp \
    expat

# Set working directory
WORKDIR /app

# Copy package files
COPY packages/video-service/package.json ./
COPY pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm && \
    pnpm install --prod

# Copy source files
COPY packages/video-service/dist ./dist

# Environment variables
ENV NODE_ENV=production
ENV FFMPEG_PATH=/usr/local/bin/ffmpeg
ENV FFPROBE_PATH=/usr/local/bin/ffprobe

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

# Run the worker
CMD ["node", "dist/worker.js"]
