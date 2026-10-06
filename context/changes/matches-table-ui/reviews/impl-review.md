<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Interaktywna tabela meczów

- **Plan**: context/changes/matches-table-ui/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-05
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Automated checks (2026-10-05): `npx astro check` (0 errors), `npm run lint`, `npm run build` and `npm run smoke:local` (all 38 steps PASS) passed.

## Findings

### F1 — „Dodaj mecz” i banner tipsError znikają przy loadError

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/pages/matches.astro:42-57, src/components/matches/MatchesTable.tsx:80-90
- **Detail**: On master, the organizer's inline form (`matches.astro:44-72`) and the `tipsError` banner rendered outside the `{loadError ? …}` branch. They were visible even when the match list failed to load. Phase 4 moved the button and the banner into `MatchesTable`, which renders only when there is no `loadError`. When the list read fails, the organizer cannot add a match and the tips error is hidden. The plan did not foresee this: Phase 3 says "loadError banners and the inline form stay", and Phase 4 removes the form without covering the error case. Smoke does not cover this path.
- **Fix A ⭐ Recommended**: Always render `MatchesTable` and give it a `loadError: string | null` prop. With an error, the island shows the alert in place of the search and table, and keeps the organizer bar with `AddMatchDialog` and the `tipsError` banner. In `handleCreated`, when `loadError` is set, call `location.reload()` instead of updating local state, because the list is incomplete.
  - Strength: Restores master behaviour and keeps one place for the organizer UI.
  - Tradeoff: More props and a conditional branch in the island; `matches` must be `[]` on error.
  - Confidence: HIGH — the change is local to two files.
  - Blind spot: Whether an insert succeeds when the SELECT failed depends on the cause (e.g. RLS/network); not verified.
- **Fix B**: Accept the change and record it in the plan as an addendum (a list read error = no adding).
  - Strength: Zero code; adding a match "blind" is of little value when the database does not respond.
  - Tradeoff: Regression versus master; the `tipsError` banner is also lost in this state.
  - Confidence: MED — depends on how often `loadError` comes from a transient error.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — MatchesTable always renders with a `loadError` prop; the alert replaces the table, the organizer bar and the tipsError banner stay; handleCreated reloads the page while loadError is set

### F2 — TipDialog nie oddaje fokusu na przycisk typu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/components/matches/TipDialog.tsx:41-43, src/components/matches/columns.tsx:105-115
- **Detail**: `TipDialog` is controlled (`open={isOpen}`) and has no `DialogTrigger`. Radix (`@radix-ui/react-dialog`, `onCloseAutoFocus`) calls `preventDefault()` and focuses only `context.triggerRef`, which is null here, so after Esc or a save the focus falls to `<body>`. The manual criterion 4.14 ("fokus wraca na wyzwalacz") is checked, but it holds only for `AddMatchDialog`, so the check may be false.
- **Fix**: In `MatchesTable`, remember the clicked button (`event.currentTarget`) in `onTipClick` and focus it in `DialogContent onCloseAutoFocus` (with `preventDefault`).
- **Decision**: FIXED — `onTipClick(matchId, trigger)` stores the button in MatchesTable state; TipDialog passes `onCloseAutoFocus` to DialogContent, which focuses it (preventDefault). Criterion 4.14 re-checked manually in the browser by the user (2026-10-05): focus returns to the tip button

### F3 — postForm zgłasza każdą odpowiedź nie-JSON jako „Sesja wygasła”

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/api-client.ts:23-32
- **Detail**: A 500 HTML page (unhandled worker exception, Cloudflare error page) and a `res.json()` parse failure both map to "Sesja wygasła. Zaloguj się ponownie.". The user is sent to sign in again when the server actually failed. The plan specified this mapping, so this is a flaw in the plan, not drift.
- **Fix**: Return `SESSION_EXPIRED` only for `res.redirected` (or a `res.url` pointing to `/auth/signin`). Map other non-JSON responses and parse failures to `` `Błąd serwera (${res.status})` ``.
- **Decision**: FIXED — `SESSION_EXPIRED` only for `res.redirected`; non-JSON responses, parse failures and !ok return `Błąd serwera (status)`

### F4 — Nieaktualne `now`: rozpoczęte mecze wyglądają na otwarte

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/matches/MatchesTable.tsx (prop `now`), src/components/matches/TipDialog.tsx:38
- **Detail**: `now` is fixed at server render time. In a tab left open past kick-off, the row still says "otwarte" and the modal shows the form. Only the save returns 409. Data is safe (server and RLS decide), and the plan accepted this (Critical Implementation Details), but the UI misleads.
- **Fix**: Keep the server `now` for the first render, hold it in state and refresh it with `Date.now()` in `onTipClick` (an event handler is safe for hydration).
- **Decision**: FIXED — `clock` state in MatchesTable (server `now` at the start), refreshed with `Date.now()` in `handleTipClick` (useCallback; the React Compiler flags `Date.now` inside the useMemo factory); the columns and TipDialog use `clock`

### F5 — Martwa gałąź 401 JSON w /api/tips

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/tips.ts:23-27
- **Detail**: `/api/tips` is in `PROTECTED_ROUTES` (`src/middleware.ts`). An anonymous request gets a 302 before the handler runs, so `401 { error }` never executes. The client handles this through `res.redirected`. The plan required this branch.
- **Fix**: Leave it as defense-in-depth, with a comment that the middleware intercepts this case first.
- **Decision**: FIXED — added a comment marking the branch as defense in depth (the middleware intercepts it earlier)

### F6 — Toaster hydruje React na każdej stronie

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/layouts/Layout.astro
- **Detail**: `<Toaster client:idle />` in the global Layout loads React and sonner on static and auth pages too. Today only `/matches` uses toasts. This was the plan's decision ("globalny punkt").
- **Fix**: Leave it (future pages S-03/S-04 will need it), or move the `Toaster` into `MatchesTable` until a second page uses it.
- **Decision**: SKIPPED

### F7 — Drobne odchylenia od kontraktów planu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/matches/TipDialog.tsx:31-37, src/components/matches/MatchesTable.tsx:86-108, src/components/ui/separator.tsx
- **Detail**: Three small differences from the plan, all harmless:
  - `TipDialog` takes an extra `now` prop, which follows from the "no Date.now() in render" rule.
  - The "Dodaj mecz" button sits on its own row above the search instead of in one bar with it.
  - `separator.tsx` was added outside the plan, because `field.tsx` requires it.
  - With `desc`, ties come out by `id` descending (TanStack reverses the whole order). This is consistent, though the plan does not say which way ties should go.
- **Fix**: Add a short addendum to the plan, with no code changes.
- **Decision**: FIXED — added the section "Addendum (impl review 2026-10-05)" to plan.md, covering the drifts and the contract changes from F1–F4
