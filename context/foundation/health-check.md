---
project: 10x-astro-starter
checked_at: 2026-09-28T07:50:26Z
health_status: needs-attention
context_type: brownfield
language_family: js
stack_assessment_available: true
checks_run:
  - lockfile
  - dependency_audit
  - outdated_deps
  - test_runner
  - ci_cd
  - configuration
audit_findings:
  critical: 0
  high: 0
  moderate: 0
  low: 0
test_runner_detected: false
ci_provider: GitHub Actions
recommended_fixes: 2
---

## Dependency Health

### Lockfile

```
Status: present (package-lock.json)
Package manager: npm
```

### Security Audit

```
Tool: npm audit --json
Summary: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW
Direct vs transitive: no findings to split (0 total across 804 dependencies)
```

### Outdated Dependencies

```
Packages with major version gaps: 3
```

Żaden bezpośredni pakiet nie jest spóźniony o dwie lub więcej wersje główne. Trzy pakiety mają lukę o jedną wersję główną (pole `wanted` zostaje przy obecnej linii głównej, `latest` jest wyżej):

- **@astrojs/react**: 6.0.5 → 7.0.0 (1 wersja główna)
- **typescript**: 6.0.3 → 7.0.2 (1 wersja główna)
- **lint-staged**: 16.4.0 → 17.6.0 (1 wersja główna)

Pozostałe nieaktualne pakiety (`astro`, `@astrojs/cloudflare`, `wrangler`, `eslint` i inne) są w tej samej linii głównej. Nie wymagają akcji przed pracą z agentem.

## Test Suite

```
Test runner: not detected
Tests found: 8 smoke steps in scripts/smoke.mjs (not a unit or e2e suite)
Test execution: not attempted
```

Nie ma Vitest, Jest, Playwright, Cypress ani Mocha w `package.json` ani plików `*.test.*` / `*.spec.*`.

Jest lokalny skrypt `scripts/smoke.mjs` (`npm run smoke`): osiem kroków ścieżki auth (strona główna, przekierowanie niezalogowanego `/dashboard`, rejestracja, złe hasło, dobre hasło, zalogowany dashboard, wylogowanie, ponowne przekierowanie). CI uruchamia go przeciw `astro preview` z lokalnym Supabase. To nie jest runner, który agent zna z ekosystemu JS.

Ocena stosu już to opisała i podała kompensację: reguła `## Verification` w `CLAUDE.md`. Tej sekcji w pliku nie ma. Jest tylko jednolinijkowy opis `npm run smoke` na liście poleceń.

## CI/CD

```
Provider: GitHub Actions
Configuration: .github/workflows/ci.yml
```

| Stage      | Status | Notes                                              |
|------------|--------|----------------------------------------------------|
| Lint       | ✓      | `npm run lint` (ESLint)                            |
| Test       | ✓      | job `smoke`: `npm run smoke` (nie unit runner)     |
| Build      | ✓      | `npm run build` (`astro build`, adapter Cloudflare) |
| Type check | ✓      | `npx astro check`                                  |
| Security   | ✗      | brak `npm audit`, Dependabot, CodeQL ani Snyk      |

Job `ci` robi lint, `astro check` i build. Job `smoke` stawia lokalny Supabase i odpala smoke przeciw podglądowi. Skanowania podatności w pipeline nie ma. Lokalny `npm audit` jest czysty, więc to luka procesu, nie otwarta podatność.

## Configuration

### High severity

Brak. `tsconfig.json` rozszerza `astro/tsconfigs/strict` (`strict: true`). `.gitignore` jest w katalogu projektu.

### Medium severity

Brak. Formatter: `.prettierrc.json` (Prettier, `prettier-plugin-astro`, `prettier-plugin-tailwindcss`). Linter: `eslint.config.js`.

### Low severity

- **`.editorconfig`** — bez niego edytory spoza Cursora mogą rozjechać wcięcia i końce linii względem Prettiera. Fix: dodaj plik z `indent_style = space`, `indent_size = 2`, `end_of_line = lf`.

Obecne i kompletne: `.env.example` (`SUPABASE_URL`, `SUPABASE_KEY`), `AGENTS.md` (wskazuje na `CLAUDE.md`), `CLAUDE.md`, `wrangler.jsonc`.

## Stack Assessment Cross-Reference

```
Stack assessment: context/foundation/stack-assessment.md
Agent readiness (from stack-assess): ready-with-compensation
```

| Quality Gate Gap                         | Health-Check Finding                                                                 | Status     |
|------------------------------------------|--------------------------------------------------------------------------------------|------------|
| Test runner: fail (training data, docs)  | Brak Vitest/Jest/Playwright. Smoke (8 kroków) jest w CI. Reguły Verification nie ma w `CLAUDE.md`. | Reinforced |

Pozostałe bramki z oceny stosu (typowanie, konwencje Astro, dokumentacja, narzędzie budowania) tu się potwierdzają: strict TypeScript, `astro check` w CI, ESLint, Prettier, lockfile, czysty audyt.

`context/foundation/prd.md` ma `context_type: greenfield` i nie zawiera `## Scope of Change`. Priorytet zostaje przy luce runnera, bo planowana praca (mecze, typy, punktacja) nie ma dziś żadnego testu poza ścieżką auth.

## Recommended Fixes

### Fix before agent work (Category A)

### 1. Brak runnera testów i brak kompensacji w CLAUDE.md

**Impact**: Agent nie ma znanego frameworka testów. Bez reguły w `CLAUDE.md` dopisze `*.test.ts` pod Vitest albo uzna zielony lint za weryfikację. Smoke, `astro check` i build już potrafią złapać regresję auth i adaptera Cloudflare — agent musi dostać polecenie, żeby z nich korzystał.
**Severity**: high
**Effort**: quick (< 5 min)
**Fix**:

Wklej do `CLAUDE.md` (plik, na który wskazuje `AGENTS.md`) blok z `context/foundation/stack-assessment.md`, sekcja Recommended Instruction File Additions. Nie dodawaj Vitest, Jest ani Playwright, dopóki sam o to nie poprosisz.

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

### 2. Brak .editorconfig

**Impact**: Drobna niespójność formatowania między edytorami. Prettier i tak wyrównuje pliki przy `npm run format` i w hooku lint-staged. Nie blokuje pracy z agentem.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**:

Utwórz `.editorconfig` w katalogu projektu:

```
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
```

### Addressed in upcoming lessons (Category B)

Pipeline CI, pliki instrukcji i konfiguracja wdrożenia już są. To nie są luki do założenia od zera.

### Onboarding agenta na istniejących plikach

**Lesson**: [Agent Onboarding: Agents.md, AI Rules i feedback loops (M1L4)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l4)
**What you'll do there**: Uzupełnisz `CLAUDE.md` / `AGENTS.md` treścią pod pracę z agentem. Szablon od zera byłby przedwczesny — pliki już istnieją. Brakującą regułę Verification wklej teraz (poprawka 1), resztę onboardingu zostaw lekcji.

### Infrastruktura, CI i pierwszy deploy

**Lesson**: [Sprint Zero z Agentem: infrastruktura, walking skeleton i pierwszy deploy (M1L5)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l5)
**What you'll do there**: Rozwiniesz to, co już leży w repozytorium: GitHub Actions (`.github/workflows/ci.yml`) i Cloudflare Workers (`wrangler.jsonc`). Krok skanowania bezpieczeństwa w CI (dziś go nie ma) może wejść tam, nie przed pracą z agentem. Lokalny runner nie jest warunkiem tej lekcji — smoke już pokrywa ścieżkę auth.

## Summary

Health status: needs-attention

Zależności są czyste (0 podatności), wersje są przypięte w `package-lock.json`, TypeScript jest w trybie strict, a ESLint, Prettier i GitHub Actions (lint, `astro check`, build, smoke) działają. Jedyna rzecz do zrobienia przed spokojną pracą z agentem: w `CLAUDE.md` brakuje reguły, która każe weryfikować zmiany przez lint, `astro check`, build i `npm run smoke` zamiast dokładania nowego frameworka testów. Trzy pakiety są o jedną wersję główną do tyłu; nie ruszaj ich przy okazji.

Next step: wklej regułę Verification do `CLAUDE.md`, potem przejdź do onboardingu agenta. Ścieżka greenfield i brownfield schodzą się w tym samym miejscu.
