# AutomationAI

No-code style pipeline: **requirements → structured test plan → runnable TypeScript** (Playwright for web, Mobilewright for mobile), with a web UI and room to plug in cloud device farms (BrowserStack, LambdaTest, etc.).

## Monorepo layout

- `apps/web` — Next.js UI + API (`/api/*`)
- `packages/shared` — Zod schemas shared by API and UI types
- `frameworks/` — per-project test frameworks on disk (see `frameworks/README.md`)

## Quick start

1. **Node 20+**

2. **Environment**

   ```bash
   cp apps/web/.env.example apps/web/.env
   ```

   Set `SESSION_SECRET` in `apps/web/.env`. OpenAI keys are configured per project in the app (Setup), not in `.env`.

3. **Install & database**

   ```bash
   npm install
   npm run db:push
   ```

4. **Dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Mobilewright

Product site: [https://mobilewright.dev/](https://mobilewright.dev/)

Mobile projects use Mobilewright; web projects use Playwright. Generated specs live under each project's framework folder.

## Security notes

- API keys for OpenAI are stored per project in the database (encrypted).
- User content is validated with Zod before use; generation output is parsed as JSON and schema-checked before persistence.
