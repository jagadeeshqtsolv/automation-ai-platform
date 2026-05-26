# AutomationAI

AI-powered test automation platform. Converts requirements into runnable TypeScript test code — **Playwright** for web, **Mobilewright** for mobile — with a web UI, browser recorder, page-object library, and cloud device farm integrations (BrowserStack, LambdaTest, SauceLabs).

---

## Table of contents

- [Docker quick start](#docker-quick-start) ← production / team deployment
- [Local development](#local-development) ← day-to-day dev
- [Repo layout](#repo-layout)
- [Environment variables](#environment-variables)
- [Database](#database)
- [PostgreSQL setup](#postgresql-setup) ← switch from SQLite to PostgreSQL
- [Security notes](#security-notes)

---

## Docker quick start

The fastest way to run AutomationAI in production or for team evaluation.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- A **GitHub Personal Access Token** with `read:packages` scope  
  → [Generate one here](https://github.com/settings/tokens)

### 1. Clone the repo

```bash
git clone https://github.com/jagadeeshqtsolv/automation-ai-platform.git
cd automation-ai-platform
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` and fill in the two required values:

```env
# Min 32 characters — generate with: openssl rand -hex 32
SESSION_SECRET=your-random-secret-here

# GitHub PAT with read:packages scope — needed to install @jagadeeshqtsolv/core
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

### 3. Build and start

```bash
docker compose up --build
```

First build takes ~3–5 minutes (installs deps, compiles Next.js).  
Subsequent starts are fast — the image is cached.

### 4. Create the first admin account

In a second terminal, while the container is running:

```bash
docker compose exec web npm run db:create-admin -- \
  --email admin@example.com \
  --password 'YourSecurePass!'
```

### 5. Open the app

```
http://localhost:3000
```

Log in with the admin credentials you just created, then:

1. Create an **Organisation**
2. Send an **invite** to your team members
3. Create a **Project** (Web or Mobile)
4. Go to **Setup → AI** and add your OpenAI or Claude API key
5. Start generating tests from requirements

---

### Docker commands reference

```bash
# Start (detached)
docker compose up -d --build

# View logs
docker compose logs -f web

# Stop
docker compose down

# Stop and delete all data (DB + framework files)
docker compose down -v

# Restart after a code change
docker compose up -d --build

# Open a shell inside the running container
docker compose exec web sh

# Run a database command
docker compose exec web node_modules/.bin/prisma studio --schema apps/web/prisma/schema.prisma
```

### Persistent data

All runtime data lives on the `app-data` Docker volume mounted at `/data` inside the container:

| Path in container | Contents |
|-------------------|---------|
| `/data/production.db` | SQLite database |
| `/data/frameworks/web/<projectId>/` | Per-project Playwright workspaces |
| `/data/frameworks/mobile/<projectId>/` | Per-project Mobilewright workspaces |

To back up, copy the volume contents or use `docker cp`.

---

## Local development

### Prerequisites

- Node.js 20+
- npm 10+
- A GitHub PAT with `read:packages` scope (for `@jagadeeshqtsolv/core`)

### Option A — automated setup

```bash
./fresh-setup.sh
```

This handles everything: GitHub Packages auth, `npm install`, `prisma db push`, and an optional admin account creation. Flags:

```bash
./fresh-setup.sh --create-admin   # prompt for admin email + password after setup
./fresh-setup.sh --dev            # start dev server immediately after setup
./fresh-setup.sh --wipe-db        # delete dev.db and recreate schema
./fresh-setup.sh --reset-data     # wipe db + delete all framework files (destructive)
./fresh-setup.sh --skip-build     # skip next build (faster when you just need db:push)
```

### Option B — manual setup

```bash
# 1. Authenticate with GitHub Packages
npm login --registry=https://npm.pkg.github.com --scope=@jagadeeshqtsolv

# 2. Install dependencies
npm install

# 3. Configure environment
cp apps/web/.env.example apps/web/.env
# Edit apps/web/.env — set SESSION_SECRET

# 4. Apply database schema
npm run db:push

# 5. Create admin account
npm run db:create-admin -- --email admin@example.com --password 'YourPass!'

# 6. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Dev commands

```bash
npm run dev          # start Next.js dev server (hot reload)
npm run build        # production build
npm run lint         # ESLint
npm run db:push      # apply schema changes to dev.db
npm run db:studio    # open Prisma Studio (DB browser)
npm run db:reset     # drop and recreate dev.db
```

---

## Repo layout

```
automation-ai-platform/
├── apps/
│   └── web/                    # Next.js app (UI + API)
│       ├── src/
│       │   ├── app/            # Next.js App Router pages + API routes
│       │   └── lib/            # business logic, AI generation, framework scaffold
│       ├── prisma/
│       │   └── schema.prisma   # SQLite schema (User, Project, TestPlan, …)
│       └── package.json
├── examples/
│   └── runner/                 # Mobilewright example test runner
├── frameworks/
│   ├── _shared-web/            # @jagadeeshqtsolv/web-support stub (npm package)
│   ├── web/<projectId>/        # generated at runtime — Playwright workspace per project
│   └── mobile/<projectId>/     # generated at runtime — Mobilewright workspace per project
├── docs/
│   └── ARCHITECTURE.md         # system architecture + flow diagrams
├── Dockerfile
├── docker-compose.yml
├── docker-entrypoint.sh        # runs prisma db push then starts server
├── fresh-setup.sh              # automated local setup script
├── dev.sh                      # start dev server (after fresh-setup)
└── package.json                # npm workspaces root
```

> **Note:** `packages/core` (shared schemas and Playwright helpers) lives in the  
> [automation-ai-core](https://github.com/jagadeeshqtsolv/automation-ai-core) repo  
> and is installed as `@jagadeeshqtsolv/core` from GitHub Packages.

---

## Environment variables

### For Docker (root `.env`, read by docker-compose)

| Variable | Required | Description |
|----------|----------|-------------|
| `SESSION_SECRET` | ✅ | Min 32 chars. Signs session tokens and encrypts stored secrets (API keys, git tokens). Generate: `openssl rand -hex 32` |
| `GITHUB_TOKEN` | ✅ | GitHub PAT with `read:packages` — used at build time to install `@jagadeeshqtsolv/core` |
| `PORT` | optional | Host port to expose (default: `3000`) |

### For local dev (`apps/web/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | SQLite path, e.g. `file:./dev.db` |
| `SESSION_SECRET` | ✅ | Same as above (min 32 chars) |
| `FRAMEWORKS_ROOT` | optional | Absolute path for framework files (default: `<repo>/frameworks`) |
| `WEB_CORE_ROOT` | optional | Absolute path to `packages/core/web` (default: auto-detected) |

> **AI keys** (OpenAI, Claude) are configured per-project inside the app under  
> **Project → Setup → AI**. No server-level key is needed.

---

## Database

- **Engine:** SQLite via [Prisma](https://www.prisma.io/)
- **Schema:** [`apps/web/prisma/schema.prisma`](apps/web/prisma/schema.prisma)
- **Dev file:** `apps/web/dev.db` (gitignored)
- **Production file:** `/data/production.db` (on Docker volume)

Schema changes: edit `schema.prisma`, then run `npm run db:push` (dev) or restart the container (Docker — `prisma db push` runs automatically in `docker-entrypoint.sh`).

---

## PostgreSQL setup

SQLite is the default and works well for single-server deployments. Switch to **PostgreSQL** when you need multiple app instances, managed cloud databases (Supabase, Neon, Railway, AWS RDS), or better concurrent write performance.

> The schema has **no SQLite-specific types or queries** — switching is a one-line provider change plus a new `DATABASE_URL`.

---

### Option A — Docker Compose with PostgreSQL (recommended)

Adds a `postgres` service alongside the app so everything runs in one `docker compose up`.

**1. Update your `.env`**

Add a strong Postgres password:

```env
SESSION_SECRET=your-random-32-char-secret
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
POSTGRES_PASSWORD=change-me-strong-password
```

**2. Replace `docker-compose.yml`** with the PostgreSQL variant:

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: automationai
      POSTGRES_USER: automationai
      POSTGRES_PASSWORD: "${POSTGRES_PASSWORD}"
    volumes:
      - pg-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U automationai"]
      interval: 10s
      timeout: 5s
      retries: 5

  web:
    build:
      context: .
      dockerfile: Dockerfile
      secrets:
        - github_token
    ports:
      - "${PORT:-3000}:3000"
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: "postgresql://automationai:${POSTGRES_PASSWORD}@db:5432/automationai"
      FRAMEWORKS_ROOT: "/data/frameworks"
      WEB_CORE_ROOT: "/app/packages/core/web"
      SESSION_SECRET: "${SESSION_SECRET}"
    volumes:
      - app-data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/auth/me"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

volumes:
  pg-data:
  app-data:

secrets:
  github_token:
    environment: GITHUB_TOKEN
```

**3. Update `apps/web/prisma/schema.prisma`** — change the datasource block:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**4. Build and start**

```bash
docker compose up --build
```

On first start the app container waits for Postgres to be healthy, then `prisma db push` creates all tables automatically.

**5. Create admin**

```bash
docker compose exec web npm run db:create-admin -- \
  --email admin@example.com \
  --password 'YourSecurePass!'
```

---

### Option B — External PostgreSQL (Supabase, Neon, Railway, AWS RDS, etc.)

Use this when you already have a managed PostgreSQL instance.

**1. Get your connection string**

| Provider | Where to find it |
|----------|-----------------|
| [Supabase](https://supabase.com) | Project → Settings → Database → Connection string (use **Session mode** URI) |
| [Neon](https://neon.tech) | Dashboard → Connection details → Connection string |
| [Railway](https://railway.app) | Project → PostgreSQL service → Variables → `DATABASE_URL` |
| [AWS RDS](https://aws.amazon.com/rds/) | RDS console → DB instance → Connectivity → Endpoint |

The connection string format:
```
postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

**2. Update `apps/web/prisma/schema.prisma`**

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**3a. Docker — add to `.env`**

```env
DATABASE_URL=postgresql://user:password@your-host:5432/automationai?sslmode=require
SESSION_SECRET=your-random-32-char-secret
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

Update `docker-compose.yml` — replace the `DATABASE_URL` line:

```yaml
environment:
  DATABASE_URL: "${DATABASE_URL}"
  FRAMEWORKS_ROOT: "/data/frameworks"
  WEB_CORE_ROOT: "/app/packages/core/web"
  SESSION_SECRET: "${SESSION_SECRET}"
```

Then start normally:

```bash
docker compose up --build
```

**3b. Local dev — set in `apps/web/.env`**

```env
DATABASE_URL=postgresql://user:password@your-host:5432/automationai?sslmode=require
SESSION_SECRET=your-random-32-char-secret
```

Apply the schema:

```bash
npm run db:push
```

---

### Production migrations (PostgreSQL)

`prisma db push` (used by `docker-entrypoint.sh`) is fine for getting started, but for production it is better to use **versioned migrations** so schema changes are tracked and applied safely.

**Generate a migration from schema changes:**

```bash
cd apps/web
npx prisma migrate dev --name describe-your-change
```

This creates a timestamped SQL file under `apps/web/prisma/migrations/` — commit it to git.

**Apply migrations in production (instead of `db push`):**

Update `docker-entrypoint.sh`:

```sh
#!/bin/sh
set -e

echo "Running database migrations..."
node_modules/.bin/prisma migrate deploy --schema=apps/web/prisma/schema.prisma

echo "Starting server..."
exec node apps/web/server.js
```

`migrate deploy` applies only new migration files — safe to run on every container start.

---

### SQLite vs PostgreSQL comparison

| | SQLite (default) | PostgreSQL |
|-|-----------------|------------|
| **Setup** | Zero — file on disk | Requires DB server or managed service |
| **Best for** | Single server, small teams, self-hosted | Multi-instance, cloud, large teams |
| **Concurrent writes** | Limited (file locking) | Excellent |
| **Managed options** | — | Supabase (free tier), Neon (free tier), Railway, AWS RDS |
| **Schema changes** | `prisma db push` | `prisma migrate deploy` (recommended) |
| **Data volume mount** | `/data/production.db` | Managed by DB server |

---

## Security notes

- **Session tokens** — HMAC-SHA256 signed, 14-day expiry, `HttpOnly` + `Secure` cookies in production
- **Stored secrets** — API keys and git tokens are encrypted at rest with AES-256-GCM, keyed from `SESSION_SECRET`
- **Input validation** — all API request bodies validated with Zod before use
- **AI output** — LLM responses are parsed and schema-checked before being written to disk or DB
- **Path traversal protection** — framework file paths are validated against an allowlist before any read/write
- **Non-root Docker** — container runs as `nextjs` user (uid 1001), not root
