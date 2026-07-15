# =============================================================================
# Job Sheet QA Auditor - Production Dockerfile
# Multi-stage build for Azure Container Apps deployment
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json pnpm-lock.yaml ./

# Copy patches directory (required by pnpm for patched dependencies)
COPY patches/ ./patches/

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Feature flags available to the Vite client build (inlined at compile time).
# Server-side env vars still gate actual data access per-environment.
ARG VITE_FEATURE_OVERTURN_METRICS=false
ENV VITE_FEATURE_OVERTURN_METRICS=${VITE_FEATURE_OVERTURN_METRICS}

# Build the application
RUN pnpm build

# Prune dev dependencies after build
RUN pnpm prune --prod

# -----------------------------------------------------------------------------
# Stage 2: Runner (Production)
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runner

# Security: Run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

WORKDIR /app

# Copy only production artifacts
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist
COPY --from=builder --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:nodejs /app/package.json ./package.json
COPY --from=builder --chown=appuser:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=appuser:nodejs /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=appuser:nodejs /app/data ./data
COPY --from=builder --chown=appuser:nodejs /app/scripts/ensure-failed-jobs-table.mjs ./scripts/ensure-failed-jobs-table.mjs
COPY --from=builder --chown=appuser:nodejs /app/scripts/ensure-audit-findings-resolution.mjs ./scripts/ensure-audit-findings-resolution.mjs
COPY --from=builder --chown=appuser:nodejs /app/scripts/ensure-waiver-revocation.mjs ./scripts/ensure-waiver-revocation.mjs
COPY --from=builder --chown=appuser:nodejs /app/scripts/ensure-secondary-tables.mjs ./scripts/ensure-secondary-tables.mjs
COPY --from=builder --chown=appuser:nodejs /app/scripts/ensure-process-idempotency.mjs ./scripts/ensure-process-idempotency.mjs
COPY --from=builder --chown=appuser:nodejs /app/scripts/ensure-template-memory.mjs ./scripts/ensure-template-memory.mjs

# Migrate-on-start entrypoint (runs drizzle-kit migrate when DATABASE_URL is set)
COPY scripts/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh && chown appuser:nodejs /app/docker-entrypoint.sh

# Create uploads directory with correct ownership (for local storage provider)
RUN mkdir -p ./uploads && chown appuser:nodejs ./uploads

# Build-time metadata (injected by CI)
ARG GIT_SHA=unknown
ARG PLATFORM_VERSION=unknown
ARG BUILD_TIME=unknown

ENV GIT_SHA=${GIT_SHA}
ENV PLATFORM_VERSION=${PLATFORM_VERSION}
ENV BUILD_TIME=${BUILD_TIME}
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check for container orchestrator
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/healthz || exit 1

# Switch to non-root user
USER appuser

# Run migrations (if DATABASE_URL set), then start the server
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]

