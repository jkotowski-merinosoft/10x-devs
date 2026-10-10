<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Wynik, punkty i klasyfikacja (S-04)

- **Plan**: context/changes/result-to-standings/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-10
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Success Criteria notes: `npm run lint`, `npx astro check` and `npm run build` pass, re-run on 2026-10-10. `npx supabase db reset` (1.1, 4.1) and `npm run smoke:local` (4.4) were not re-run during this review: the reset wipes local data, and smoke needs `dev:local`. Both carry SHA 7df9d55 from implementation. Plan adherence: every planned change MATCHes the plan as amended by its `## Deviations`. The extras are harmless hardening: trigger `WHEN` clauses, recompute only for changed rows, and a revoke of the table-wide update on `matches`.

## Findings

### F1 — Standings leak hidden tips before kick-off

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261008000000_results_any_time.sql:7-12, supabase/migrations/20261007120000_points_and_standings.sql:158-182
- **Detail**: Since 20261008 the `matches_update_result_organizer` policy checks only `is_organizer()`. An organizer can therefore `PATCH /rest/v1/matches` with a result on a match that has not started; the same happens through the UI when `RESULTS_BEFORE_KICKOFF` is on. The triggers then score every tip on that match. `league_standings()` (security definer) adds up points and `exact_count` with no kick-off filter. The comment above it, "those have no points yet", is no longer true. The organizer is also a player: they can enter a trial result, read the change in each person's points and exact count on `/league`, clear the result, and repeat. That reveals other people's tips before kick-off, while the organizer can still tip that match themselves. The rule "other people's tips are hidden until kick-off" (S-02) is broken by the side channel.
- **Fix A ⭐ Recommended**: In `league_standings()`, count `points` and `exact_count` only for started matches: `sum(coalesce(t.points,0)) filter (where m.starts_at <= now())` and `count(*) filter (where … and m.starts_at <= now())`. Membership ("everyone with a tip") stays as is. Also update the comment.
  - Strength: A single `create or replace function` migration. It closes the channel at the only place that exposes other people's aggregates; tips RLS already hides other people's tips and their `points` before kick-off. It keeps the Deviation (`RESULTS_BEFORE_KICKOFF`, policy based on the role only).
  - Tradeoff: With the switch on, a result entered before kick-off does not show in the standings until kick-off, which is a small surprise in tests. The standings stop being a plain sum of `tips.points`.
  - Confidence: HIGH. Smoke step 10 uses the started match (2020), so it is unaffected.
  - Blind spot: Not checked: whether any other view (for example the organizer's match page) shows aggregates of other people's points before kick-off.
- **Fix B**: Put `and not public.match_is_open(id)` back into the RLS policy and drop `RESULTS_BEFORE_KICKOFF`. Test with past-dated matches.
  - Strength: The database enforces the time rule again, as in the original plan ("Wymusza to RLS").
  - Tradeoff: It reverses a Deviation the user approved, and the testing switch is lost. The README, `canEnterResult()` and the smoke hint need changes.
  - Confidence: MED. It depends on whether the switch is still needed.
  - Blind spot: Not checked how heavily the switch is used in manual tests.
- **Decision**: SKIPPED

### F2 — Stale comments after the any-time migration

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/matches.ts:65
- **Detail**: The comment says "RLS lets only an organizer update, and only after kick-off". After 20261008, RLS checks only the role; the kick-off rule lives in `canEnterResult()` (`src/lib/results.ts`). The `league_standings` comment in the migration is stale too (see F1); that file is history, and fixing it belongs to F1's migration.
- **Fix**: Change the comment to "RLS lets only an organizer update; the kick-off rule is canEnterResult() in the endpoint".
- **Decision**: FIXED (comment at matches.ts:65 points to canEnterResult())

### F3 — Focus may not return to the result button after the dialog closes

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/matches/MatchesTable.tsx (handleResultClick, onCloseAutoFocus), src/components/matches/columns.tsx
- **Detail**: `handleResultClick` calls `setClock(Date.now())`, so `columns` from `useMemo` are rebuilt with new `cell` functions. `flexRender` treats a function as a component, so a new identity remounts the cell. The saved `resultTrigger` then points at a detached button, `focus()` does nothing, and focus falls back to `<body>`. `TipDialog` has the same pattern. This contradicts manual check 3.4, which is ticked, so it needs checking in the browser.
- **Fix**: On close, look the button up again by match id (for example `document.querySelector('[data-match-id="X"] [aria-haspopup="dialog"]')`) instead of keeping a reference to the element.
  - Strength: A narrow change that does not touch the memo structure. It fixes both dialogs.
  - Tradeoff: Lookup by selector instead of a ref; a little less "React-like".
  - Confidence: MED. The remount mechanism is confirmed in the TanStack code, but not observed in the browser.
  - Blind spot: Whether the user's 3.4 check covered the keyboard (Tab/Enter) path.
- **Decision**: SKIPPED

### F4 — Result saved but the dialog shows an error

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/results.ts:76-78
- **Detail**: When `setMatchResult` succeeds and `getOwnTip` then fails, the endpoint returns 500. `ResultDialog` shows the error and leaves the row unchanged, although the result is saved.
- **Fix**: Log `tipError` and return `{ match: saved, tip: null }` with status 200.
- **Decision**: FIXED (results.ts: a failed getOwnTip after the save returns { match, tip: null } with 200)

### F5 — A slow save can close a dialog opened afterwards

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/matches/ResultDialog.tsx:59-66 (same pattern as TipDialog)
- **Detail**: If the user closes the dialog while a request is still running and opens another match, the first request's `onSaved` closes the new dialog and flashes the old row. This is an edge case.
- **Fix**: In `onSaved` / `handleResultSaved`, ignore a response whose `match.id` is not the currently selected match.
- **Decision**: SKIPPED

### F6 — Concurrency and scale of rescoring

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261007120000_points_and_standings.sql:47-61, 79-109
- **Detail**: Suppose a tip is inserted while an uncommitted stakes or result update is running. The tip's trigger reads the old stakes or result, and the recompute does not see the tip, so the tip keeps stale `points`. The window is milliseconds, and since F1's deviation it also applies to results before kick-off. A stakes change rescores every tip in a single statement, holding row locks until commit; that is fine at the scale of one company.
- **Fix**: Accept the risk and add a sentence to the migration's header comment, or have `tips_set_points` read `league_settings`/`matches` with `for share`.
- **Decision**: SKIPPED

### F7 — Smoke: no guard against a remote database, and cleanup can stop partway

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:7-12, 780
- **Detail**: "Never point organizer steps at production" is only a comment. `smoke.mjs` does not check `SUPABASE_URL`, unlike `smoke-local.mjs`. This was already true before the change, but the stakes change now rescores every tip in the database for the duration of the run. In cleanup, a failed match delete makes the step return early, so the smoke accounts stay behind.
- **Fix**: Refuse organizer steps for a non-local `SUPABASE_URL` unless `SMOKE_ALLOW_REMOTE=1` is set (CI uses a local stack), and collect cleanup errors instead of returning early.
- **Decision**: FIXED (smoke.mjs: SMOKE_ALLOW_REMOTE guard for organizer steps, cleanup collects delete errors; documented in README and CLAUDE.md)
