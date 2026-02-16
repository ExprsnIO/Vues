# Prefetch Worker
# Handles timeline and video segment prefetching

FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY packages/prefetch/package.json ./
COPY pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm && \
    pnpm install --prod

# Copy source files
COPY packages/prefetch/dist ./dist

# Environment variables
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

# Run the worker
CMD ["node", "dist/worker.js"]
