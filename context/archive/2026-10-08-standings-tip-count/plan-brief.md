# Liczba rozliczonych typów w klasyfikacji — Plan Brief

> Full plan: `context/changes/standings-tip-count/plan.md`

## What & Why

Na `/league` dochodzi ostatnia kolumna „Typy”: w ilu meczach z wynikiem osoba typowała. Same punkty nie mówią, czy ktoś typował 5 czy 20 meczów, a ta liczba daje im kontekst.

## Starting Point

`league_standings()` (migracja `20261007120000`) zwraca miejsce, punkty i liczbę dokładnych wyników. `/league` pokazuje je w tabeli z atrybutami `data-*`, które czyta smoke. Zmiana S-04 `result-to-standings` ma jeszcze otwartą fazę 4 (smoke i dokumentacja).

## Desired End State

Każdy wiersz klasyfikacji ma w ostatniej kolumnie liczbę typów na mecze z wynikiem (`data-settled`). Typy na mecze bez wyniku się nie liczą. Ranking się nie zmienia. Smoke sprawdza: pracownik z typem przyszłym i rozliczonym ma 1, po usunięciu wyniku 0.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Co liczyć | Tylko typy na mecze z wynikiem | Tłumaczy punkty i nie ujawnia, ile otwartych meczów ktoś obstawił. |
| Wpływ na ranking | Tylko informacyjnie | Reguła ligi (punkty → dokładne → wspólne miejsce) zostaje bez zmian. |
| Gdzie | Nowa zmiana po fazie 4 S-04 | Nie rozszerza prawie skończonej S-04, a smoke `/league` powstaje tam. |
| Zmiana funkcji SQL | Nowa migracja `drop` + `create` + `grant` | `create or replace` nie zmieni kolumn wyniku, a starej migracji nie ruszamy. |

## Scope

**In scope:** migracja `league_standings()` z `settled_count`; `StandingsRow` i `listStandings`; kolumna „Typy” i zdanie opisu na `/league`; asercje `data-settled` w smoke; opis w `CLAUDE.md`.

**Out of scope:** liczba wszystkich typów, skuteczność (%) i średnie, zmiana reguły remisu, edycja starej migracji.

## Architecture / Approach

Licznik powstaje w tej samej agregacji co punkty (`count(*) filter` po wyniku meczu). Przechodzi przez RPC → serwis → szablon Astro tą samą ścieżką co `exact_count`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Baza i widok | Kolumna „Typy” na `/league` z poprawną liczbą | Zapomniany `grant` po `drop function` blokuje klasyfikację |
| 2. Smoke i dokumentacja | Asercje `data-settled` (1 / 0) i opis w `CLAUDE.md` | Zależy od kroków `/league` z fazy 4 S-04 |

**Prerequisites:** zamknięta faza 4 `result-to-standings` (smoke ma krok `/league` z kontami smoke).
**Estimated effort:** ~1 krótka sesja, 2 fazy, ok. 5–6 plików i 30–50 linii.

## Open Risks & Assumptions

- Kolejność wdrożenia: `db push` przed `wrangler deploy`. W odwrotnej kolejności kolumna pokaże `NaN`.
- Piąta kolumna na wąskim ekranie: zakładamy, że krótki nagłówek „Typy” mieści się bez poziomego przewijania (ręczne sprawdzenie 1.7).

## Success Criteria (Summary)

- Użytkownik widzi przy każdej osobie, w ilu meczach z wynikiem typowała.
- Kolejność klasyfikacji się nie zmienia.
- Smoke łapie licznik, który liczy typy na mecze bez wyniku.
