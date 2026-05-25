FROM node:20-alpine AS base

# ── Stage 1: install all dependencies ────────────────────────────────────────
FROM base AS deps
WORKDIR /app

# GitHub Packages auth — needed to install @jagadeeshqtsolv/core
# Pass via: docker build --build-arg GITHUB_TOKEN=<pat>
# or set GITHUB_TOKEN in your .env and use docker-compose (see docker-compose.yml)
ARG GITHUB_TOKEN
RUN if [ -n "$GITHUB_TOKEN" ]; then \
      echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" >> /root/.npmrc; \
    fi

COPY .npmrc ./
COPY package*.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/core/package.json ./packages/core/

RUN npm ci

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client before building
RUN npx --prefix apps/web prisma generate

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build --workspace=@automation-ai/web

# ── Stage 3: production runner ────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# OpenSSL — required by Prisma's Rust query engine on Alpine
RUN apk add --no-cache openssl

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# /data is the Docker volume mount point for SQLite DB + framework files.
# Create it here (as root, before USER switch) so nextjs user can write to it
# on first start — Docker named volumes mount as root by default.
RUN mkdir -p /data && chown nextjs:nodejs /data

# Standalone Next.js output — includes only what's needed to run
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

# Prisma schema + engine binaries — needed for db push at startup
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/prisma ./apps/web/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# web-support source files — read at runtime when scaffolding new web projects
# (web-scaffold.ts calls readWebCoreFile("utils/data-utils.ts") on project creation)
COPY --from=builder --chown=nextjs:nodejs /app/packages/core/web /app/packages/core/web
ENV WEB_CORE_ROOT=/app/packages/core/web

# Entrypoint runs db push then starts the app
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
