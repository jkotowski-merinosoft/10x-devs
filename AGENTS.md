# Repository Guidelines

Scope: @context/foundation/prd.md. Further rules: @CLAUDE.md.

## Hard rules

- Do not add a test runner or `*.test.ts` / `*.spec.ts` files unless the user asks.
- Do not export `prerender = true`. Rendering is full SSR (@astro.config.mjs).
- Merge classes with `cn()` from `@/lib/utils`. Use `.astro` for static UI; React `client:load` only for interactive UI (@src/pages/auth/signin.astro). No `"use client"`.
- Add protected paths to `PROTECTED_ROUTES` in @src/middleware.ts.
- After auth, middleware, or Cloudflare adapter edits, run `npx astro check`, `npm run build`, and `npm run smoke`.

## Commands

Node: @.nvmrc.

- `npx astro check` — @.github/workflows/ci.yml.
- `npm run build` — @package.json, @README.md.
- `npm run smoke` — @scripts/smoke.mjs.

## Layout

- Auth APIs in `src/pages/api/auth/` (@src/pages/api/auth/signin.ts).
- `src/components/` UI; add with `npx shadcn@latest add <name>` (@components.json).
- `supabase/` is CLI config only; no SQL migrations are committed (@README.md).

## Style

@.editorconfig, @.prettierrc.json, @eslint.config.js.

## Verification

@.github/workflows/ci.yml.

## Commits

Follow Conventional Commits: type(scope): short description (e.g., feat(auth): add email verification, fix: handle missing config, chore(deps): update packages). English imperative subject, ≤72 characters, no trailing period. Allowed types: feat, fix, refactor, chore, docs, ci, test. Subject-only commits. Add a body only when the subject does not state why the change was made.

## Config

@README.md, @wrangler.jsonc.
