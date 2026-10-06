<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Stawki punktacji ligi (S-03)

- **Plan**: context/changes/set-league-point-stakes/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-07
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Success criteria re-run on 2026-10-07: `npx supabase db reset` OK; seed row `3|1`; CHECK `league_settings_stakes_range` rejects 3/3, `league_settings_single_row` rejects `id = false`, PK rejects a second `true`; RLS on, two policies (SELECT, UPDATE), `anon` has no grants; `npx astro check` 0 errors; `npm run lint` clean; `npm run build` OK; `npm run smoke:local` all steps passed, stakes `3|1` before and after; CI green on 7b5af88 and 0702929.

## Findings

### F1 — Smoke leaves changed stakes if the remember step fails

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:475 (with :260, :523)
- **Detail**: `savedStakes` is set only when the service-role read in "admin remembers league stakes…" succeeds. Because `run()` now continues after failed steps, "organizer saves stakes" still writes 5/2 when `savedStakes` is null, and cleanup then reports "no remembered stakes to restore" and leaves 5/2 in the shared database. The plan's critical detail says stakes are always written back.
- **Fix**: In "organizer saves stakes", fail without POSTing when `savedStakes` is null, so the smoke never changes stakes it can't restore.
- **Decision**: FIXED (Fix now — save step fails without POST when savedStakes is null)

### F2 — Employee POST without admin keys uses valid stakes

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:246
- **Detail**: "save stakes rejected for employee" POSTs 9/4, a payload the schema accepts, in the base steps that also run under plain `npm run smoke` against the cloud dev DB with no service role and so no restore. Only a double regression (endpoint role check and RLS) would change data, but if it did, nothing would restore it.
- **Fix**: POST 1/1 instead and assert the location contains the encoded "Tylko organizator" message, so the role check is still proven while the payload can never be saved.
- **Decision**: FIXED (Fix now — employee POSTs 1/1 and smoke asserts the organizer-only message; CLAUDE.md updated)

### F3 — Smoke and migration extras not recorded in the plan

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/smoke.mjs:260, :475, :565; supabase/migrations/20261007000000_league_settings.sql:13, :47
- **Detail**: Beyond the plan: the 6/2 fallback when stakes are already 5/2, comparing the service-role read with the employee's `/league` (`seenStakes`), the global try/catch in `run()` (affects every step), `revoke all … from anon, authenticated` (plan said only `anon`), and the named `league_settings_single_row` check. All are sound tightenings and CLAUDE.md documents the smoke ones; only plan.md is silent.
- **Fix**: Add a short "Deviations" note to plan.md listing these.
- **Decision**: FIXED (Fix now — Deviations section added to plan.md)

### F4 — Stale comment and unused export in the stakes schema

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/schemas/league.ts:3, :5
- **Detail**: The header says the schema is "Shared by the stakes endpoint and the client form", but `/league` is a plain HTML form that never imports it. `POINTS_MESSAGE` is exported but used only inside the file.
- **Fix**: Reword the comment to the endpoint only and drop `export` from `POINTS_MESSAGE`.
- **Decision**: FIXED (Fix now — comment names the endpoint, POINTS_MESSAGE no longer exported)

### F5 — Scoring hint sentence duplicated

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/matches/TipDialog.tsx:159; src/pages/matches/[id].astro:119
- **Detail**: The hint and its fallback are copied word for word in the React dialog and the Astro page; the smoke checks only the page copy, so the dialog can drift unnoticed. S-04 will likely touch this wording.
- **Fix**: Extract `stakesHint(stakes: LeagueStakes | null)` into `src/lib/` and use it in both places.
- **Decision**: FIXED (Fix now — stakesHint() in src/lib/stakes.ts used by TipDialog and matches/[id].astro)

### F6 — exact_points input allows 0

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/league.astro:65
- **Detail**: The input has `min="0"`, but the schema and CHECK need exact ≥ 1. The server rejects 0 with a readable banner (manual check 2.7), so this is only missed early browser feedback. The plan specified `min="0"` for both fields.
- **Fix**: Set `min="1"` on `exact_points`.
- **Decision**: FIXED (Fix now — exact_points input min="1")
