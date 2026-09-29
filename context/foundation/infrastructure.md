---
project: Liga typera
researched_at: 2026-09-29
recommended_platform: Cloudflare Workers
runner_up: Render
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 7.3
  runtime: Cloudflare Workers (workerd, nodejs_compat)
---

## Recommendation

**Deploy on Cloudflare Workers.**

The app is request/response only, aimed at one company, and already built for this runtime: Astro ^7.3.2, `@astrojs/cloudflare` ^14.3.1, Wrangler ^4.131.1, and `wrangler.jsonc` with `main` set to `@astrojs/cloudflare/entrypoints/server`. At the expected 10k–100k requests a month the Workers Free plan is $0 (100,000 requests/day; static assets unlimited and unbilled). If a signed-in Astro page exceeds the free plan’s 10 ms CPU cap, Workers Paid is a $5/month minimum and includes 10 million requests. That is the cheapest path that does not require swapping the adapter. Supabase stays external, which matches the choice to allow outside data services. A single region did not justify a container host.

Sources checked 2026-09-29: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) (page updated 2026-07-07), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/) (page updated 2026-07-15), [Cloudflare MCP servers](https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/), [Astro Cloudflare deploy guide](https://docs.astro.build/en/guides/deploy/cloudflare/), [@astrojs/cloudflare](https://docs.astro.build/en/guides/integrations-guide/cloudflare/).

## Platform Comparison

Scores are Pass / Partial / Fail against the five platform criteria. Cost is weighted first: the cheapest viable option wins over a smoother toolchain. No platform was dropped for lacking long-lived processes. Every candidate can run TypeScript; Astro 7 SSR on anything other than Cloudflare means replacing `@astrojs/cloudflare`.

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / integration |
|---|---|---|---|---|---|
| Cloudflare Workers | Pass | Pass | Pass | Pass | Pass |
| Vercel | Pass | Pass | Pass | Pass | Partial |
| Netlify | Pass | Pass | Partial | Pass | Pass |
| Fly.io | Pass | Pass | Pass | Partial | Pass |
| Railway | Partial | Pass | Pass | Partial | Pass |
| Render | Partial | Pass | Pass | Pass | Pass |

**Cloudflare Workers.** `wrangler deploy`, `wrangler rollback`, and `wrangler tail` cover the agent loop. Workers are managed and serverless. Docs publish `llms.txt` and a Markdown view. The deploy API is GA. Official remote MCP servers (API, docs, Workers observability, Workers Builds) are GA and speak MCP 2026-07-28. Free plan: 100,000 requests/day, 10 ms CPU per invocation, 50 subrequests, 3-day log retention. Paid plan: $5/month minimum, 10 million requests included, default CPU limit 30 seconds (max 5 minutes), no egress fee. WebSockets exist and are GA; this app does not need them.

**Vercel.** CLI, Fluid compute, and Markdown docs all pass. The official MCP server is in public beta (docs label: “Vercel MCP (Beta)”, checked 2026-09-29). Hobby is $0 with 1 million function invocations and 4 CPU-hours, and it is restricted to non-commercial personal use. A company league built by a paid employee can fall under that rule and force Pro at $20/month. Deploying this repo means replacing the Cloudflare adapter.

**Netlify.** CLI and the official `@netlify/mcp` package pass. Docs are public; a first-class `llms.txt` was not confirmed, so documentation is Partial. The Astro adapter is maintained. Free is 300 credits per month with a hard stop: the site pauses until the next cycle. A production deploy costs 15 credits, so a few weeks of shipping can exhaust the allowance before request volume does. Personal is $9/month for 1,000 credits. Web requests are 2 credits per 10,000, which is cheap at this scale; the deploy meter is the trap.

**Fly.io.** `flyctl` and `fly mcp server` pass, and Machines are a managed runtime. Rollback is not a dedicated command: redeploy a previous image with `fly deploy --image`, and Fly does not promise to keep unused images. There is no free tier. A new account gets 2 VM-hours or 7 days, whichever ends first. From 2026-10-01, `shared-cpu-1x` with 256 MB is about $2.19/month if the machine stays on, plus $2/month if a dedicated IPv4 is required. That buys an always-on container this app does not need, plus a Dockerfile and an adapter swap.

**Railway.** Managed, documented, and the MCP server is now `railway mcp` inside the CLI (CLI 5.44.0 or later). The standalone `@railway/mcp-server` npm package is deprecated and archived. Arbitrary rollback is dashboard-only; the CLI can `railway redeploy` and `railway restart`. The Free plan includes $1 of usage per month and caps a service at 1 vCPU / 0.5 GB. Memory is about $10 per GB-month, so an always-on service does not stay inside $1. Hobby is $5/month and includes $5 of usage.

**Render.** Git deploys, deploy hooks, and the REST API are stable. The hosted MCP server at `https://mcp.render.com/mcp` is official. Some service edits are still dashboard-only: the MCP `update_web_service` tool returns a dashboard link instead of applying the change, so CLI-first is Partial. Docs include Markdown (for example the pricing page). A Free web service is $0, spins down after 15 minutes without traffic, and takes about a minute to wake. Each workspace gets 750 Free instance hours per calendar month; past that, free services suspend until next month. Free Postgres expires 30 days after creation (not required here, because Supabase stays external). An always-on Starter instance is $7/month. Workspace plans changed on 2026-04-23; Hobby workspace fee is $0 plus compute.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Highest criteria score and the only $0 option that is already wired into this repo. Workers Paid at $5/month is the fallback if the free CPU cap rejects Astro SSR, and it is still cheaper than Vercel Pro ($20) or Render’s always-on Starter ($7). Supabase remains the database and auth service. Global placement is included and does not add a line item for a single-country league.

#### 2. Render

The other genuine $0 host. It wins on cost only if the Cloudflare adapter is abandoned and a one-minute cold start after idle is acceptable. The gap is that swap, the spin-down, and a thinner CLI than Wrangler.

#### 3. Vercel

Best Astro developer experience after Cloudflare, and Hobby’s request allowance covers this league. The gap is the non-commercial Hobby rule: if it applies, the real price is $20/month, which loses to both Workers Paid and Render’s free tier. The MCP server is still public beta.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. Workers Free allows 10 ms of CPU time per invocation, not 10 ms of wall clock. Waiting on Supabase does not count; rendering and crypto do. An Astro SSR page that calls `getUser` and renders the match list can exceed 10 ms and return error 1102. `astro dev` on a warm laptop will not show it.
2. The runtime is `workerd`, not Node. `nodejs_compat` is already set in `wrangler.jsonc` (compatibility date `2026-05-08`). Packages that need unsupported Node APIs fail only after deploy.
3. The free plan allows 50 subrequests per invocation. Several Supabase calls on one page can hit that. Workers Paid raises the default to 10,000 (raised again in February 2026, from a previous 1,000 cap).
4. `wrangler rollback` restores Worker code among the last 100 versions only. It does not undo a Supabase migration. It is refused if the target version binds a KV namespace, R2 bucket, or queue that has been deleted, or if a Durable Object migration sits between the two versions.
5. The `workers.dev` hostname is public. A company league on that URL, or on a Workers Builds preview URL, is readable by anyone with the link unless Cloudflare Access is placed in front.

### Pre-Mortem — How This Could Fail

The starter already targeted Workers, and the free plan looked like zero dollars, so the league shipped there without a production read of the CPU line. The first real page — session lookup, match list, score write — spent more than 10 ms of CPU. Production returned error 1102 while `astro dev` on the same machine stayed fast, because time spent waiting on Supabase is not CPU and a warm laptop hid the cap. The published limit of 100,000 requests a day was never the constraint. During a company demo the preview URL was still open, and a key meant to stay server-only had been stored where a client-visible env value could read it. Six months later the app was up only after an unplanned move to the $5 Workers Paid plan, a secret rotation, and a weekend replacing one dependency that `nodejs_compat` did not actually provide. The mistaken assumption was that the starter’s deploy target was already a finished production decision.

### Unknown Unknowns

- On Astro 7 with `@astrojs/cloudflare` 14, `npm run dev` and `npm run preview` already run `workerd` through the Cloudflare Vite plugin. A separate `wrangler dev` process is the pre-Astro-6 loop and can disagree with the server you are editing. Wrangler is pinned at ^4.131.1; do not install a global copy.
- `wrangler.jsonc` points `main` at `@astrojs/cloudflare/entrypoints/server`. That is the Astro 6+ entry. The old `dist/_worker.js/index.js` path is wrong for this version. `compatibility_date` is `2026-05-08`; changing it can change runtime behavior with no application diff.
- Production does not read `.env`. `SUPABASE_URL` and `SUPABASE_KEY` are `astro:env` server secrets. Local Cloudflare dev reads `.dev.vars` (gitignored). Production values are Workers secrets.
- The adapter’s default session support provisions a KV namespace named `SESSION` on deploy, and the default `imageService` of `cloudflare-binding` (since adapter 14.2.0) provisions an Images binding. This app authenticates with Supabase cookies, not Astro sessions. A first deploy can create both resources anyway.
- `wrangler deploy` publishes the Worker. It does not create a pull-request preview. Previews come from Workers Builds (the current Astro Cloudflare guide documents this without a beta label; Astro 5 docs called Workers Builds beta) or from a second Worker name. `wrangler deploy --temporary` exists on Wrangler 4.102+ (this repo has 4.131.1) and is only for an unauthenticated agent; it errors if OAuth or `CLOUDFLARE_API_TOKEN` is already present, and the claim URL lasts 60 minutes.

## Operational Story

- **Preview deploys**: Connect the Git repository in the Cloudflare dashboard under Workers Builds (build `npx astro build` or `npm run build`, deploy `npx wrangler deploy`) so a branch gets its own preview URL. Those URLs are public. Put Cloudflare Access in front of them before a company demo. A fork pull request should not be assumed to receive a preview. `npx wrangler deploy` from a laptop publishes the live Worker named `10x-astro-starter`.
- **Secrets**: Production secrets live on the Worker, written with `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`. `npx wrangler secret list` shows names only. Local values live in `.dev.vars`, not in git. GitHub Actions secrets are a third store, used by the `ci` job to build; they are not the Worker’s runtime secrets. Rotation is a new `secret put` of the same name. Use the Supabase anon key, as the README specifies, not the service role key.
- **Rollback**: `npx wrangler rollback` with no version id restores the version uploaded before the latest one and starts serving it immediately. `npx wrangler rollback <VERSION_ID> --message ""` skips the interactive prompt. Only the last 100 versions qualify. Worker code rolls back; Supabase data and schema do not. Typical time-to-revert is a single command, seconds, not a rebuild.
- **Approval**: A person approves the first production deploy, any later `wrangler deploy` to the production Worker, secret rotation, and an upgrade from Workers Free to Workers Paid. An agent may run read-only commands unattended: `npx wrangler tail`, `npx wrangler deployments list`, `npx wrangler secret list`, and the observability MCP. An agent does not delete Supabase projects, drop tables, or remove Worker bindings.
- **Logs**: `npx wrangler tail` streams live invocation logs (`--format json` for machines). `observability.enabled` is already true in `wrangler.jsonc`. Workers Logs keeps 200,000 events/day for 3 days on Free and 20 million events/month for 7 days on Paid. The observability MCP is `https://observability.mcp.cloudflare.com/mcp` (OAuth). Each request log is capped at 256 KB.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Signed-in Astro SSR exceeds 10 ms CPU and returns error 1102 on Workers Free | Devil's advocate | H | H | Deploy once and load a signed-in page while running `npx wrangler tail`. If CPU time is near 10 ms, move the account to Workers Paid ($5/month) before the league starts. |
| A dependency works in Node and fails under `workerd` despite `nodejs_compat` | Devil's advocate | M | H | Stay on `npm run dev` / `npm run preview`, which already use `workerd`. Run `npm run smoke` against `astro preview` after adding a server dependency. |
| One page makes more than 50 subrequests and the free plan rejects it | Devil's advocate | M | M | Keep each request to a small number of Supabase calls. Move to Workers Paid if a page needs more than 50. |
| `wrangler rollback` restores code and leaves a bad Supabase migration in place | Devil's advocate | M | H | Treat schema changes as forward-only. Do not expect Worker rollback to revert rows or SQL. |
| Public `workers.dev` or preview URL exposes the company league | Devil's advocate | M | M | Do not share the preview link. Add Cloudflare Access before any demo outside the developer’s machine. |
| Free-plan request quota is treated as the only limit, so the CPU cap is discovered on match day | Pre-mortem | H | H | Read the CPU row on the Workers pricing page and hit one authenticated route in production during the first deploy, not during the first match. |
| A server secret is stored where client code can read it, or the service role key is used as `SUPABASE_KEY` | Pre-mortem | M | H | Keep both variables as `astro:env` secrets (`access: "secret"`). Store the anon key only. Rotate with `wrangler secret put` if a value was ever committed or logged. |
| First deploy provisions a `SESSION` KV namespace and an Images binding the app does not use | Unknown unknowns | M | L | This app uses Supabase cookies. Before the first production deploy, set `session: false` in the Astro config if Astro sessions are unused, and set `imageService: "passthrough"` if Cloudflare image resizing is unused. |
| Production deploy succeeds and auth fails because `.env` was never copied into Worker secrets | Unknown unknowns | H | H | After `wrangler login`, run `wrangler secret put` for `SUPABASE_URL` and `SUPABASE_KEY`. Confirm `.dev.vars` exists only for local `astro dev`. |
| `compatibility_date` is bumped and runtime behavior changes without an application diff | Unknown unknowns | L | M | Leave `2026-05-08` in place unless a Cloudflare feature requires a newer date, then rerun build, preview, and smoke. |

## Getting Started

These commands match this repo: Astro ^7.3.2, `@astrojs/cloudflare` ^14.3.1, Wrangler ^4.131.1. The adapter, `wrangler.jsonc`, and the `workerd` dev server are already in place. Do not run `astro add cloudflare`, do not install a global Wrangler, and do not point `main` back at `dist/_worker.js/index.js`.

1. Local runtime is already Cloudflare. Copy env files and start the dev server (this runs `workerd`, not a Node stand-in):

   ```bash
   cp .env.example .env
   cp .env.example .dev.vars
   npm run dev
   ```

   Put the Supabase URL and anon key in both files. `.dev.vars` is what the Workers dev runtime reads.

2. Log Wrangler into the Cloudflare account that will own the Worker:

   ```bash
   npx wrangler login
   ```

3. Build, then publish. `npm run build` must run before deploy so `dist/` exists for the assets binding:

   ```bash
   npm run build
   npx wrangler deploy
   ```

4. Set the two server secrets on the deployed Worker (production does not read `.env`):

   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_KEY
   ```

5. Watch the first authenticated request. If the log shows error 1102 or CPU time at the 10 ms ceiling, upgrade that account to Workers Paid before inviting the company. Tail logs with `npx wrangler tail`. Roll back the last upload with `npx wrangler rollback --message ""`.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
