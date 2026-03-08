# Exprsn API Service Dockerfile
# Multi-stage build for production optimization

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-alpine AS deps

RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies
RUN pnpm install --frozen-lockfile --filter @exprsn/api... --filter @exprsn/shared

# ============================================
# Stage 2: Builder
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy source
COPY packages/shared ./packages/shared
COPY packages/api ./packages/api
COPY tsconfig.json ./

# Install pnpm for build
RUN corepack enable && corepack prepare pnpm@latest --activate

# Build shared package first
WORKDIR /app/packages/shared
RUN pnpm build

# Build API
WORKDIR /app/packages/api
RUN pnpm build

# ============================================
# Stage 3: Production
# ============================================
FROM node:20-alpine AS runner

# Security: Run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 exprsn

WORKDIR /app

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy built files
COPY --from=builder --chown=exprsn:nodejs /app/packages/api/dist ./dist
COPY --from=builder --chown=exprsn:nodejs /app/packages/api/package.json ./
COPY --from=builder --chown=exprsn:nodejs /app/packages/shared/dist ./node_modules/@exprsn/shared/dist
COPY --from=builder --chown=exprsn:nodejs /app/packages/shared/package.json ./node_modules/@exprsn/shared/

# Install production dependencies only
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY --from=deps /app/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

# Switch to non-root user
USER exprsn

# Expose port
EXPOSE 3000

# Start command
CMD ["node", "dist/index.js"]
