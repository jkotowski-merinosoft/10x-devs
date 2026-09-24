---
project: 10x-astro-starter
assessed_at: 2026-09-24T15:47:24+02:00
agent_readiness: ready-with-compensation
context_type: brownfield
stack_components:
  language: TypeScript
  framework: Astro 7.3 (React 19 islands, Tailwind 4, Supabase auth)
  build_tool: Astro CLI (Vite, @astrojs/cloudflare)
  test_runner: null
  package_manager: npm
  ci_provider: GitHub Actions
  deployment_target: Cloudflare Workers
gates_passed: 7
gates_failed: 2
---

## Stack Components

Produkt (Liga typera) jest nowy. Ta ocena dotyczy kodu, który już leży w repozytorium: startera Astro, na którym projekt wystartował. Stos nie jest do wymiany.

**Język.** TypeScript (`typescript` ^6.0.3). `tsconfig.json` rozszerza `astro/tsconfigs/strict`. Sprawdzenie typów w CI robi `npx astro check` (`.github/workflows/ci.yml`).

**Framework.** Astro ^7.3.2, `output: "server"` w `astro.config.mjs`. Wyspy React 19 (`@astrojs/react`), Tailwind 4 (`@tailwindcss/vite`), auth Supabase (`@supabase/ssr`, `@supabase/supabase-js`). Trasy plikowe: `src/pages/` (strony) i `src/pages/api/auth/` (endpointy). Konwencje są spisane w `CLAUDE.md`.

**Narzędzie budowania.** Astro CLI (`astro dev` / `astro build`). Adapter `@astrojs/cloudflare` ^14.3.1. Wdrożenie opisuje `wrangler.jsonc` (Workers, `nodejs_compat`).

**Testy.** Brak Vitest, Jest i Playwright. Jedyny check zachowania to bezależnościowy skrypt `scripts/smoke.mjs` (`npm run smoke`) przeciw działającemu serwerowi. CI odpala go na podglądzie produkcyjnym z lokalnym Supabase.

**Menedżer pakietów.** npm (`package-lock.json`).

**CI.** GitHub Actions, joby `ci` (lint, `astro check`, build) i `smoke`.

**Wdrożenie.** Cloudflare Workers przez Wrangler.

**Pliki instrukcji.** `CLAUDE.md` (architektura, auth, konwencje), `AGENTS.md` (wskazuje na `CLAUDE.md`), `.cursor/rules/10x-course.mdc`.

## Quality Gate Assessment

| Component  | Typed | Convention | Training Data | Documented | Verdict |
|------------|-------|------------|---------------|------------|---------|
| Language   | ✓     | —          | —             | —          | pass    |
| Framework  | —     | ✓          | ✓             | ✓          | pass    |
| Build tool | —     | ✓          | ✓             | ✓          | pass    |
| Test runner| —     | —          | ✗             | ✗          | fail    |

Legend: ✓ = pass, ✗ = fail, ~ = partial, — = not applicable

### Gate Details

**Typowanie — zaliczone.** `tsconfig.json` ma `"extends": "astro/tsconfigs/strict"`. CI uruchamia `npx astro check`. API waliduje wejście przez zod (konwencja w `CLAUDE.md`).

**Konwencje frameworka — zaliczone.** Astro narzuca trasy plikowe i tryb renderowania. Widać to w `src/pages/**` i w `output: "server"` w `astro.config.mjs`. `CLAUDE.md` doprecyzowuje alias `@/*`, podział Astro vs React, `cn()` z `@/lib/utils`, shadcn w `src/components/ui/`, middleware i trasy chronione.

**Znajomość w danych treningowych (framework) — zaliczona.** Astro i React są częstym wyborem w ekosystemie JavaScript. To nie jest niszowy fork.

**Dokumentacja frameworka — zaliczona.** Astro ma aktualne, wersjonowane docs (https://docs.astro.build). React, Tailwind, Supabase i Cloudflare Workers też mają oficjalne docs dopasowane do wersji z `package.json`.

**Narzędzie budowania — zaliczone na wszystkich trzech kryteriach.** `package.json` scripts (`dev`, `build`, `preview`) i adapter w `astro.config.mjs` są konwencją Astro. Vite i Wrangler są powszechne w JS i mają oficjalne docs.

**Runner testów — niezaliczony (dane treningowe i dokumentacja).** W `package.json` nie ma Vitest, Jest ani Playwright. Agent nie ma znanego runnera, na którym może się oprzeć. `scripts/smoke.mjs` jest lokalnym skryptem: komentarz na górze pliku i job `smoke` w `.github/workflows/ci.yml` opisują, jak go uruchomić, ale to nie jest udokumentowany framework testowy.

## Gaps & Compensation

### Brak standardowego runnera testów

**Co nie przeszło.** Nie ma runnera, który agent zna z ekosystemu JS. Jest tylko `scripts/smoke.mjs`.

**Dlaczego to ma znaczenie.** Agent będzie dopisywał `*.test.ts` pod Vitest albo Playwright, albo pominie weryfikację. Starter weryfikuje auth inaczej: lint, `astro check`, build i smoke przeciw żywemu serwerowi.

**Kompensacja.** Wklej do `CLAUDE.md` (plik, na który wskazuje `AGENTS.md`) regułę poniżej. Nie wymieniaj stosu i nie dodawaj runnera, dopóki sam o to nie poprosisz.

### Recommended Instruction File Additions

```markdown
## Verification

This repo has no unit or e2e runner (no Vitest, Jest, or Playwright). Do not add a test framework or `*.test.ts` / `*.spec.ts` files unless the user asks.

Prove a change with the checks already in the repo:

- `npm run lint` — ESLint, type-checked rules
- `npx astro check` — Astro/TypeScript check (same command as CI)
- `npm run build` — SSR build via `@astrojs/cloudflare`
- `npm run smoke` — `scripts/smoke.mjs` against a running server. `BASE_URL` defaults to `http://localhost:4321`.

`scripts/smoke.mjs` is dependency-free. It checks, in order: `/` returns 200; anonymous `/dashboard` redirects to `/auth/signin`; `POST /api/auth/signup` redirects to `/auth/confirm-email`; wrong password on `POST /api/auth/signin` redirects to `/auth/signin?error=`; correct password redirects to `/`; signed-in `/dashboard` returns 200; `POST /api/auth/signout` redirects to `/`; `/dashboard` redirects again after signout.

CI (`.github/workflows/ci.yml`) runs lint, `astro check`, build, and this smoke test against `astro preview` with local Supabase. When you change auth, `src/middleware.ts`, or the Cloudflare adapter, run that same loop. Do not treat a green lint as a substitute for `npm run smoke`.
```

## Summary

Starter jest gotowy do pracy z agentem po jednej kompensacji. TypeScript w trybie strict, Astro z trasami plikowymi, spisane konwencje w `CLAUDE.md`, CI i wdrożenie na Cloudflare Workers spełniają kryteria. Jedyna luka: brak znanego runnera testów. Smoke test już jest — agent ma go używać, a nie wymyślać nowego frameworka.

Następny krok: `/10x-health-check`.
