# Rules for AI

This file provides guidance to AI Agent when working with code in this repository. Hard rules: @AGENTS.md. Do not restate them here.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run dev:local` — dev server on the local Supabase stack (`scripts/dev-local.mjs`). Starts the stack if needed, passes its URL and anon key as process env (they beat `.env` in `astro:env`) and writes them to `.dev.vars.local` (gitignored, read by wrangler with `CLOUDFLARE_ENV=local`). `.env` / `.dev.vars` keep pointing at the cloud dev project. One dev server at a time: stop a plain `npm run dev` first (`npx astro dev stop`). Run by an agent, `astro dev` goes to the background with a 30 s start limit; after switching between `dev` and `dev:local` Vite re-optimizes dependencies and may exceed it, so run it again.
- `npm run preview` — preview production build
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)
- `npm run smoke` — dependency-free auth-flow smoke test (`scripts/smoke.mjs`) against a running server, `BASE_URL` env (default `http://localhost:4321`). Run after dependency upgrades; CI runs it against the production preview with a local Supabase. Organizer steps need `SUPABASE_URL`, `SUPABASE_KEY` (anon) and `SUPABASE_SERVICE_ROLE_KEY` in the shell (locally: `npx supabase status -o env`); without them they `SKIP`, unless `SMOKE_REQUIRE_ADMIN=1` (CI) makes them `FAIL`. The service role key is for the script only, never `.env` / `.dev.vars`.
- `npm run smoke:local` — `npm run smoke` with the local stack's keys and `SMOKE_REQUIRE_ADMIN=1` (`scripts/smoke-local.mjs`); refuses a non-local Supabase URL. Run it against `npm run dev:local`: against a server on another database the organizer steps fail.
- `npm run import:ekstraklasa[:local]` — Ekstraklasa 2026/27 import from apifootball.com (`scripts/import-ekstraklasa.mjs`), dry run unless `-- --apply`; `:local` uses the local stack's keys. Keys, prod use and safety: README "Ekstraklasa import".

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

`scripts/smoke.mjs` checks, in order: `/` returns 200; anonymous `/dashboard` redirects to `/auth/signin`; `POST /api/auth/signup` redirects to `/auth/confirm-email`; wrong password on `POST /api/auth/signin` redirects to `/auth/signin?error=`; correct password redirects to `/`; signed-in `/dashboard` returns 200; `POST /api/auth/signout` redirects to `/`; `/dashboard` redirects again after signout; anonymous `/matches` and `POST /api/matches` redirect to `/auth/signin`; the employee signs in again, gets 200 on `/matches` without the `data-testid="add-match"` button, and `POST /api/matches` redirects to `/matches?error=` without saving the match; anonymous `/matches/1` and `POST /api/tips` redirect to `/auth/signin`; anonymous `/league` and `POST /api/league` redirect to `/auth/signin`; the employee's `/league` returns 200 with `data-testid="league-stakes"` and without `data-testid="stakes-form"` (its `data-exact` / `data-outcome` are noted), and its `POST /api/league` of 9 / 4 redirects to `/league?error=`. Organizer steps (service role key required): the service role reads and remembers the league stakes, which must equal the ones the employee's `/league` showed; a direct `PATCH /rest/v1/league_settings` with the employee's token changes nothing (200 with an empty array, service role still reads the remembered stakes); the Supabase admin API creates a confirmed account and `PATCH /rest/v1/profiles` sets `role = organizer`; the organizer signs in, `/matches` shows the `data-testid="add-match"` button, `POST /api/matches` redirects to `/matches`; the employee's `/matches` lists the new match; the organizer adds a match that has already started (2020); the service role reads both match ids; the employee's `POST /api/tips` of 97:3 on the future match redirects to `/matches/{id}` and its `/matches` table row (`<tr>`) has `data-tip="97:3"`; a correction to 98:4 has `data-tip="98:4"` and no `data-tip="97:3"`; a tip on the started match redirects to `/matches/{id}?error=`, and a direct `POST /rest/v1/tips` with the employee's token returns 401/403 (RLS); with the organizer's token `GET /rest/v1/tips` on the future match returns an empty array and `PATCH` of the employee's tip changes nothing (service role still reads 98:4); the organizer's future match page does not contain the employee's masked e-mail; the service role inserts the organizer's 1:0 on the started match; the employee's row for it has `data-tip=""` (no tip) without `data-tip="1:0"`, and its match page shows `smoke-organizer-…@e..e.com`; a direct `POST /rest/v1/matches` with the employee's token returns 401/403 (RLS); the organizer's `/league` shows `data-testid="stakes-form"`, `POST /api/league` of 1 / 1 redirects to `/league?error=` with the stakes unchanged, and 5 / 2 (6 / 2 if those already are the stakes) redirects to `/league`, whose `data-exact` / `data-outcome` show them, and the employee's future match page contains `Dokładny wynik: 5 pkt`; cleanup first writes the remembered stakes back through the service role (also after failed steps), then deletes both smoke matches (tips cascade) and both smoke accounts through the service role. The password is random per run; never point the organizer steps at production.
