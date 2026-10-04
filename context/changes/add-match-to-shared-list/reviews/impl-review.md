<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Mecz na wspólnej liście (S-01)

- **Plan**: context/changes/add-match-to-shared-list/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-03
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Success criteria evidence: `npm run lint` passes (0 errors, 2 `no-console` warnings), `npx astro check` reports 0 errors, and `npm run smoke` passes against the local dev server (organizer steps SKIP because there are no keys). CI run 37150308556 is green, and its smoke log shows PASS for every organizer step, including the RLS step (403), with no JWT in the log. Two checks could not run locally. `npm run build` failed with EPERM on `dist/client`, because the running dev server locks the directory; CI's build passes. `npx supabase db reset` needs Docker, which is not available here; CI applies the migration.

## Findings

### F1 — `matches.created_by` FK without on-delete blocks deleting organizer accounts

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261001000000_profiles_and_matches.sql:66
- **Detail**: `created_by uuid not null default auth.uid() references auth.users (id)` defaults to NO ACTION. Once an organizer has added a match, deleting that account (admin API or dashboard) fails with "Database error deleting user". `profiles` in the same migration uses `on delete cascade`. The plan contract did not specify an on-delete action. The migration is already merged, so a fix needs a new migration.
- **Fix A ⭐ Recommended**: New migration: make `created_by` nullable and change the FK to `on delete set null`.
  - Strength: Matches are shared data (the list everyone sees, and later the tips/results in S-02…S-04), so they should survive when an author leaves. The RLS insert check still requires `created_by = auth.uid()` at insert time.
  - Tradeoff: Loses who created the match after the account is deleted. Requires a second migration.
  - Confidence: HIGH — standard pattern; insert-time RLS check is unaffected.
  - Blind spot: Have not checked whether later slices plan to rely on `created_by` being non-null.
- **Fix B**: Keep NO ACTION, but make it explicit (`on delete restrict`) and document an offboarding procedure in the README.
  - Strength: No schema semantics change; authorship is always known.
  - Tradeoff: Offboarding an organizer requires manual reassignment, which is friction for a company tool.
  - Confidence: MED — workable only while there are few organizers.
  - Blind spot: Smoke organizer accounts on a cloud instance could then never be deleted (see F3).
- **Decision**: FIXED (Fix A) — supabase/migrations/20261004000000_harden_profiles_and_matches.sql (not applied locally: no Docker)

### F2 — `listMatches` hides DB errors as "Brak meczów"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/matches.ts:16-19, src/pages/matches.astro:60-61
- **Detail**: On error, `listMatches` logs it and returns `[]`, so the page shows "Brak meczów" ("no matches"). Users cannot tell an outage or RLS failure from an empty list. The smoke `notContains` check on the employee page would also still pass during an outage.
- **Fix**: Return `{ data, error }` (same shape as `createMatch`) and render an alert on `/matches` when it errors.
- **Decision**: FIXED — listMatches returns `{ data, error }`; /matches shows "Nie udało się wczytać meczów"

### F3 — Smoke creates organizer accounts with a committed password and never cleans them up

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:11-12, 119-166
- **Detail**: The organizer steps create a confirmed `smoke-organizer-<ts>@example.com` account with the password `Smoke-Test-Passw0rd!`, which is in the repo, and add a "Smoke A/B" match. CI throws the stack away, so this is fine there. The README says smoke can run against a cloud instance, though. With a cloud service role key, each run leaves an organizer-privileged account with a publicly known password, plus junk matches on the list every employee sees.
- **Fix**: Generate a random password per run (`crypto.randomUUID()`), and state in the README/CLAUDE.md that organizer steps are for local stacks only.
  - Strength: Removes the elevated-account risk with a two-line change and no new cleanup logic, which would also be blocked by F1.
  - Tradeoff: Junk matches still accumulate if someone runs it against cloud anyway.
  - Confidence: HIGH — nothing in the script needs the password to be stable across runs.
  - Blind spot: Have not checked whether anyone already ran it against a cloud project (leftover accounts).
- **Decision**: FIXED (differently: random password per run + cleanup step deleting the smoke match and both smoke accounts via admin API; README/CLAUDE.md: never against production, use local or a separate dev project). The cleanup step is not yet verified with a service role key; CI will verify it.

### F4 — Unplanned files in the feature commits

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: .claude/prompts/*.md, .gitignore:20-21, .gitattributes
- **Detail**: Commit 5d78514 (p1) also adds five course prompt notes under `.claude/prompts/` (including the 240-line `skill-explainer.md`) and `.local/` to `.gitignore`. Commit 581c3b0 adds a repo-wide `* text=auto eol=lf`. All of it is harmless and none of it is related to S-01.
- **Fix**: No code change; in future, commit tooling/course notes separately from feature phases.
- **Decision**: ACCEPTED — no code change; commit course notes separately in future

### F5 — `matches.astro` uses `class:list` instead of `cn()`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/matches.astro:39,43,47
- **Detail**: The plan says "Klasy przez `cn()` tam, gdzie są warunkowe" (use `cn()` where classes are conditional). The page uses Astro `class:list` with no conditional classes in it, so its behavior is identical.
- **Fix**: Replace `class:list` with a plain `class` (nothing conditional), or accept as is.
- **Decision**: SKIPPED

### F6 — Role lookup: silent failure and extra query on every signed-in request

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/middleware.ts:16-26, src/lib/services/matches.ts:17,31
- **Detail**: If the `profiles` query fails, the middleware silently treats an organizer as `employee`. Failing closed is correct, but nothing is logged, unlike the service layer, which uses `console.error`. Those `console.error` calls are also the 2 `no-console` lint warnings. Separately, every signed-in SSR request now queries `profiles`, even on pages that never read `role`. The plan accepted that cost.
- **Fix**: Log the middleware error with `console.error` and add `// eslint-disable-next-line no-console` (or relax the rule for `src/lib/services`) so server logging is lint-clean.
- **Decision**: FIXED — middleware logs profiles errors; no-console disabled per line on intentional server logs

### F7 — Migration grants comment overstates; `is_organizer()` executable by anon

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261001000000_profiles_and_matches.sql:44-57, 89-91
- **Detail**: The comment says the privileges are "independent of Supabase's default grants", but nothing is revoked. `anon` and `authenticated` keep the default privileges, and RLS is the only real barrier. That is safe today, because there is no anon policy and `profiles` has no write policies. `is_organizer()` is executable by PUBLIC, so anon can call it over RPC. It returns false and leaks nothing. The `handle_new_user` insert has no `on conflict do nothing`.
- **Fix**: In the next migration, `revoke all on public.profiles, public.matches from anon`, `revoke execute on function public.is_organizer() from public, anon`, and add `on conflict (user_id) do nothing` to the trigger insert.
- **Decision**: FIXED — added to supabase/migrations/20261004000000_harden_profiles_and_matches.sql (not applied locally: no Docker; CI will apply it)

### F8 — `AGENTS.md` tracked as a symlink (mode 120000)

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: AGENTS.md
- **Detail**: `git ls-files -s AGENTS.md` shows mode 120000, but the blob is the full document. Locally `core.symlinks=false` hides this. On Linux checkouts (CI, other contributors), AGENTS.md becomes a broken symlink whose "target" is the whole text. This predates the change (commit 81b1349), but this change edited the file without fixing it. CLAUDE.md `@AGENTS.md` imports would break on those checkouts.
- **Fix**: Re-add AGENTS.md as a regular file (mode 100644): `git rm --cached AGENTS.md && git add AGENTS.md` with `core.symlinks=false`, verify with `git ls-files -s`, then commit.
- **Decision**: FIXED — index mode changed to 100644 (staged, not committed)
