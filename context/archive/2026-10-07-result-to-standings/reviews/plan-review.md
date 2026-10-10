<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Wynik, punkty i klasyfikacja (S-04)

- **Plan**: context/changes/result-to-standings/plan.md
- **Mode**: Deep
- **Date**: 2026-10-07
- **Verdict**: REVISE → SOUND po triage (F1 zaakceptowane ryzyko)
- **Findings**: 1 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL |
| Plan Completeness | PASS |

## Grounding
12/12 paths ✓, 8/8 symbols ✓ (match_is_open, is_organizer, tips_set_updated_at, scoresSchema, matchIdSchema, matchRow, PROTECTED_ROUTES, league_settings), brief↔plan ✓, Progress↔Phases ✓, 1 line reference ✗ (columns.tsx)

Zweryfikowane bez zastrzeżeń: payload upsertu `saveTip` (`match_id, user_id, score_a, score_b`) mieści się w planowanych grantach kolumnowych `tips`; kolejność smoke (typ pracownika 2:0 po kroku „list shows only own tip after kick-off”, `scripts/smoke.mjs:441`) nie psuje istniejących kroków; ranking pracownik < organizator zgadza się przed i po poprawce na 1:0; `tips_set_updated_at` zawężony do `UPDATE OF score_a, score_b` spełnia kryterium 1.4.

## Findings

### F1 — Column grant on matches restricts nothing

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Current State Analysis (pkt 2); Phase 1 — polityka `matches_update_result_organizer`
- **Detail**: Plan twierdzi, że `matches` nie ma uprawnienia UPDATE, a `grant update (score_a, score_b)` ograniczy politykę do kolumn wyniku. W lokalnej bazie `authenticated` ma już tabelowe UPDATE (oraz DELETE, TRUNCATE itd.) na `matches` z domyślnych grantów Supabase; migracje odebrały je tylko `anon` (`20261004000000_harden_profiles_and_matches.sql:14`). Grant kolumnowy nic nie dodaje do tabelowego. Po migracji organizator może przez `PATCH /rest/v1/matches` na rozpoczętym meczu zmienić `starts_at`, `side_a/b` czy `external_id`; przesunięcie `starts_at` w przyszłość ponownie otwiera typowanie.
- **Fix**: W fazie 1 `revoke update on public.matches from authenticated` przed grantem kolumnowym; poprawić pkt 2 Current State; krok smoke: PATCH `starts_at` przez organizatora zwraca 401/403.
- **Decision**: ACCEPTED — edycja meczów (drużyny, data, nowe pole miejsca spotkania) przez organizatora jest planowana w kolejnej zmianie (S-05); organizator ma móc poprawiać pomyłki. Do rozstrzygnięcia w S-05: co z wynikiem i punktami, gdy `starts_at` rozpoczętego meczu zostanie przesunięty w przyszłość (typowanie znów otwarte).

### F2 — Wrong line reference to columns.tsx

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Current State Analysis (pkt 7)
- **Detail**: Plan cytował `columns.tsx:354-450`, a plik ma 128 linii.
- **Fix**: Odwołanie `src/components/matches/columns.tsx:8-128`.
- **Decision**: FIXED

### F3 — Smoke step 1: section contradiction

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 — Kroki smoke
- **Detail**: Wstęp umieszczał wszystkie kroki w sekcji organizatora (service role wymagany), a krok 1 jest anonimowy.
- **Fix**: Krok 1 opisany jako anonimowy (bez service role, obok anonimowych kroków `/matches/1` i `POST /api/tips`), kroki 2–13 w sekcji organizatora.
- **Decision**: FIXED
