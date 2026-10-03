# Rules for AI

This file provides guidance to AI Agent when working with code in this repository. Hard rules: @AGENTS.md. Do not restate them here.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run preview` — preview production build
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)
- `npm run smoke` — dependency-free auth-flow smoke test (`scripts/smoke.mjs`) against a running server, `BASE_URL` env (default `http://localhost:4321`). Run after dependency upgrades; CI runs it against the production preview with a local Supabase. Organizer steps need `SUPABASE_URL`, `SUPABASE_KEY` (anon) and `SUPABASE_SERVICE_ROLE_KEY` in the shell (locally: `npx supabase status -o env`); without them they `SKIP`, unless `SMOKE_REQUIRE_ADMIN=1` (CI) makes them `FAIL`. The service role key is for the script only, never `.env` / `.dev.vars`.

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Architecture

**Astro 7 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Deployed to Cloudflare Workers.

### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages are server-rendered by default.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared in astro.config.mjs `env.schema`).
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Protected paths: @AGENTS.md.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Protected page example: `src/pages/dashboard.astro`

### Key conventions

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).
- **API routes**: use uppercase `GET`, `POST` exports; validate input with zod.
- **Supabase**: App schema lives in `supabase/migrations/`; user roles are in `public.profiles` (@README.md).
- **React**: extract hooks to `src/components/hooks/`.
- **Services/helpers** go in `src/lib/` (or `src/lib/services/` for extracted business logic).
- **Shared types** (entities, DTOs) go in `src/types.ts`.

### Environment

- Node.js v22.14.0 (see `.nvmrc`)
- Env vars: `SUPABASE_URL`, `SUPABASE_KEY` (copy `.env.example` to `.env` for Node, or `.dev.vars` for Cloudflare local dev)
- Local Supabase: `npx supabase start` (requires Docker)
- Cloudflare local dev: secrets go in `.dev.vars` (gitignored)
- Deploy: `npx wrangler deploy` (requires Cloudflare account + `wrangler` auth)

## CI

GitHub Actions workflow (`.github/workflows/ci.yml`) runs lint + build on every push and PR to master. Requires `SUPABASE_URL` and `SUPABASE_KEY` repository secrets for the build step.

## Verification

Checks: @AGENTS.md. A green `npm run lint` does not replace `npm run smoke`.

`scripts/smoke.mjs` checks, in order: `/` returns 200; anonymous `/dashboard` redirects to `/auth/signin`; `POST /api/auth/signup` redirects to `/auth/confirm-email`; wrong password on `POST /api/auth/signin` redirects to `/auth/signin?error=`; correct password redirects to `/`; signed-in `/dashboard` returns 200; `POST /api/auth/signout` redirects to `/`; `/dashboard` redirects again after signout; anonymous `/matches` and `POST /api/matches` redirect to `/auth/signin`; the employee signs in again, gets 200 on `/matches` without the add form, and `POST /api/matches` redirects to `/matches?error=` without saving the match. Organizer steps (service role key required): the Supabase admin API creates a confirmed account and `PATCH /rest/v1/profiles` sets `role = organizer`; the organizer signs in, `/matches` shows the form, `POST /api/matches` redirects to `/matches`; the employee's `/matches` lists the new match; a direct `POST /rest/v1/matches` with the employee's token returns 401/403 (RLS).
