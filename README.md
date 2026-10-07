# 10x Astro Starter

![](./public/template.png)

A modern, opinionated starter template for building fast, accessible web applications.

## Tech Stack

- [Astro](https://astro.build/) v7 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v6 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/przeprogramowani/10x-astro-starter.git
cd 10x-astro-starter
```

2. Install dependencies:

```bash
npm install
```

3. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

4. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

5. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier
- `npm run smoke` - Smoke test the auth flow against a running server (`BASE_URL`, defaults to `http://localhost:4321`)
- `npm run import:ekstraklasa` - Import the Ekstraklasa 2026/27 season from apifootball.com (dry run; `-- --apply` writes), see [Ekstraklasa import](#ekstraklasa-import)
- `npm run import:ekstraklasa:local` - The same import against the local Supabase stack

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints
│ ├── components/ # UI components (Astro & React)
│ └── assets/ # Static assets
├── public/ # Public assets
├── wrangler.jsonc # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Initialize the local Supabase project (creates a `supabase/` config folder):

```bash
npx supabase init
```

3. Start the local stack (downloads Docker images on first run):

```bash
npx supabase start
```

4. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

5. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

The database schema (`public.profiles` with user roles and `public.matches`) is defined by the SQL migrations in `supabase/migrations/`. `npx supabase start` applies them to the local stack; run `npx supabase db reset` to re-apply them after pulling new migrations.

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

Apply the migrations to the cloud project with:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

### Roles

Every account gets a `public.profiles` row with the `employee` role. Only organizers can add matches. There is no in-app way to change a role — grant the organizer role with SQL (Supabase SQL editor or `psql`):

```sql
update public.profiles set role = 'organizer' where user_id = (select id from auth.users where email = '<email>');
```

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

### Auth routes

| Route                 | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                             |
| `/auth/signup`        | Email/password sign-up form                                             |
| `/auth/confirm-email` | Post-signup "check your inbox" page                                     |
| `/dashboard`          | Example protected page (redirects to `/auth/signin` if unauthenticated) |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

1. Build the project:

```bash
npm run build
```

2. Deploy with Wrangler:

```bash
npx wrangler deploy
```

Set `SUPABASE_URL` and `SUPABASE_KEY` as secrets in your Cloudflare dashboard or via `npx wrangler secret put`.

## Smoke test

`scripts/smoke.mjs` is a dependency-free Node script that walks the whole auth flow (sign-up, sign-in, protected page, sign-out) over HTTP. Run it against the dev server or the production preview after dependency upgrades:

```bash
npm run dev            # or: npm run build && npm run preview
BASE_URL=http://localhost:4321 npm run smoke
```

It needs a reachable Supabase instance (local or cloud) with email confirmation disabled. It also checks `/matches` and `POST /api/matches` for anonymous users and for an employee (list visible, no add form, adding rejected).

The organizer steps (admin creates an organizer account, the organizer adds a match, the employee sees it, and RLS rejects a direct insert by the employee) need extra shell variables. They are used only by the script — never put the service role key in `.env` or `.dev.vars`:

| Variable                    | Description                                                       |
| --------------------------- | ----------------------------------------------------------------- |
| `SUPABASE_URL`              | Supabase API URL (`API_URL` from `npx supabase status -o env`)    |
| `SUPABASE_KEY`              | anon key (`ANON_KEY`)                                             |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key (`SERVICE_ROLE_KEY`)                             |
| `SMOKE_REQUIRE_ADMIN`       | `1` turns missing keys into `FAIL` instead of `SKIP` (CI uses it) |

```bash
eval "$(npx supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
SUPABASE_URL="$API_URL" SUPABASE_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" npm run smoke
```

Without these variables the organizer steps print `SKIP` and the smoke still exits with code 0.

Against the local Supabase stack, two scripts do this without touching `.env` / `.dev.vars` (which keep pointing at your cloud development project):

```bash
npm run dev:local     # starts the stack if needed; the app uses its URL and anon key (also written to .dev.vars.local)
npm run smoke:local   # smoke with the stack's keys and SMOKE_REQUIRE_ADMIN=1; refuses a non-local Supabase URL
```

Stop any plain `npm run dev` first, so the smoke talks to a server on the same database.

With the service role key, the last step deletes the smoke match and both smoke accounts. Every run uses a new random password. Run the organizer steps only against a local Supabase or a separate development project, never against production.

> **Note:** this script exists primarily to guard the development of the starter itself — it is a fast sanity check that dependency upgrades did not break the build, the Cloudflare adapter or the Supabase auth flow. It is **not** a substitute for a real test suite. Once you build your own product on top of this starter, add proper tests (unit, integration, end-to-end) suited to your application.

## Ekstraklasa import

`scripts/import-ekstraklasa.mjs` loads the real Ekstraklasa 2026/27 fixtures from [apifootball.com](https://apifootball.com/) into `public.matches`, so the app starts with real matches to tip and the season's played rounds. It is a deliberate one-off exception to the PRD Non-Goal "fetching matches and results from outside": starter data, run by hand, not a sync. The paid API plan is valid until about 2026-10-20; after that the import is not expected to work, and the imported data stays in the database.

- Imports only matches with status `Not Started` and `Finished` (with the final score); other statuses are skipped and counted. Team names are mapped to Polish spelling (`TEAM_NAMES` in the script); an unknown name is kept as is with a warning.
- Upserts by `external_source = 'apifootball'` + `external_id`, so re-running it never duplicates a match and updates teams, kick-off time and score. It never deletes: matches imported earlier that are now missing or skipped are only listed as stale. Matches added by hand are not touched (the report counts them, as they may duplicate imported ones).
- Dry run by default: fetches, compares with the database and prints a report ending in `DRY RUN`. Only `--apply` writes, in one atomic request, and prints `APPLIED`. The report header shows the target Supabase host and whether it is the local stack, the cloud development project or (any other host) probably production.
- Before writing, `--apply` shows the target host again and asks `[y/N]`; anything but `y` / `tak` aborts with nothing written. `--yes` skips the question (required without a terminal).

Keys: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `APIFOOTBALL_KEY` are each taken from the first source that has them, as with dotenv: the shell, then `.env.import.dev` / `.env.import.prod` (only with `--env dev` / `--env prod`; a missing file is an error), then `.env.import`. `APIFOOTBALL_KEY` alone may also come from its single line of `.env` (see `.env.example`). The report header names the source of each key. The `.env.import*` files are gitignored and read only by this script; the service role key never goes into `.env`, `.dev.vars` or the Worker's secrets. The script never prints keys or the API URL.

Local stack (URL and service role key taken from `npx supabase status -o env`; refuses a non-local URL):

```bash
npm run import:ekstraklasa:local             # dry run
npm run import:ekstraklasa:local -- --apply  # write
```

Production, from PowerShell, with the keys set for the current session only. The service role key is in the Supabase dashboard of the production project → Project Settings → API Keys (`service_role`), the URL under Project Settings → Data API:

```powershell
$env:SUPABASE_URL = "https://<prod-project-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<prod service_role key>"
npm run import:ekstraklasa              # dry run, review the report
npm run import:ekstraklasa -- --apply   # write
Remove-Item Env:SUPABASE_URL, Env:SUPABASE_SERVICE_ROLE_KEY
```

Or keep the keys in a file in the project root (`.env.import`, or one file per database selected with `--env`). A variable left in the shell overrides the file, so check the `keys:` line of the report:

```bash
# .env.import.prod
SUPABASE_URL=https://<prod-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<prod service_role key>
```

```powershell
npm run import:ekstraklasa -- --env prod             # dry run
npm run import:ekstraklasa -- --env prod --apply     # write
```

Apply the migrations to production before the first import. To remove imported data: `delete from public.matches where external_source = 'apifootball'` (cascades to tips on those matches).

## CI

GitHub Actions runs two jobs on every push and PR to `master`:

- **ci** — lint, `astro check` and build. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets for the build step.
- **smoke** — starts a local Supabase via the Supabase CLI, builds, serves the production preview on the Cloudflare runtime and runs `npm run smoke` against it, including the organizer steps (with the local stack's service role key passed only to the smoke step). No secrets required.

## License

MIT
