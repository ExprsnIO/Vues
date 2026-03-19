# Prefetch Worker
# Handles timeline and video segment prefetching

FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files from monorepo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/prefetch/package.json ./packages/prefetch/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built source files
COPY packages/prefetch/dist ./packages/prefetch/dist
COPY packages/shared/dist ./packages/shared/dist

# Environment variables
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

# Run the worker
WORKDIR /app/packages/prefetch
CMD ["node", "dist/worker.js"]
