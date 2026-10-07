# Wynik, punkty i klasyfikacja (S-04) — Plan Brief

> Full plan: `context/changes/result-to-standings/plan.md`

## What & Why

Organizator wpisuje wynik rozpoczętego meczu, a baza sama liczy i zapisuje punkty przy każdym typie (PRD US-01, FR-009, FR-010, FR-014, FR-015, FR-020). Użytkownik widzi wynik, swoje punkty i klasyfikację ligi. To gwiazda przewodnia M-1: dowód, że arkusz nie jest już potrzebny do policzenia kolejki, a punktacja jest poprawna (guardrail PRD).

## Starting Point

Mecze mają kolumny wyniku (dodane przez import Ekstraklasy, który wypełnia je rozegranym meczom), typy mają RLS „tylko przed startem”, a liga ma jedną parę stawek (domyślnie 3 / 1), zmienialną w każdej chwili na `/league`. Brakuje uprawnienia do zmiany wyniku, kolumny punktów, widoku wyniku i punktów oraz klasyfikacji.

## Desired End State

Organizator na stronie meczu albo w dialogu na liście zapisuje, poprawia albo usuwa wynik meczu, który już się rozpoczął. Lista `/matches` ma kolumny „Wynik” i „Pkt”, a strona meczu pokazuje wynik i punkty przy każdym typie. `/league` pokazuje pod stawkami klasyfikację wszystkich, którzy typowali. Zmiana wyniku albo stawek od razu zmienia punkty i ranking.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Gdzie liczyć punkty | W bazie: trigger i jedna funkcja `tip_points`, wynik zapisany w `tips.points` | Wynik zmienia też import (service role), więc tylko baza gwarantuje, że punkty zawsze idą za wynikiem. |
| Zmiana stawek | Przelicza wszystkie rozliczone typy | Jedna reguła dla całej ligi (FR-008), klasyfikacja zawsze zgodna z punktacją na `/league`. |
| Korekta wyniku | Jeden formularz: „Zapisz wynik” i osobny „Usuń wynik” | Ścisła walidacja zapisu zostaje, a usunięcie wymaga jawnego kliknięcia; łatwiejsze niż „puste pola = usuń”. |
| Kiedy wolno wpisać wynik | Od `starts_at` (`not match_is_open`), w RLS i w endpoincie | Ta sama granica co zamknięcie typowania; aplikacja nie zna końca meczu. |
| Skład klasyfikacji | Każdy z co najmniej jednym typem | Uczestnik widzi siebie od pierwszego typu, a konta bez gry nie zaśmiecają tabeli. |
| Remisy | Punkty → liczba dokładnych → wspólne miejsce (1, 1, 3) | „Kto wcześniej typował” karałoby poprawianie typu i dawało się obejść. |
| Miejsce klasyfikacji | `/league` pod stawkami | Reguła i jej skutek w jednym miejscu, bez nowej trasy. |
| Lista meczów | Kolumny „Wynik” i „Pkt” | Typ, wynik i punkty w jednym wierszu. |
| Gdzie wpisać wynik | Strona meczu (SSR) i dialog na liście (JSON) | Szybkie wpisywanie kilku wyników jednego dnia. |
| Ochrona `points` | Granty kolumnowe na `tips` i trigger nadpisujący `points` | Grant tabelowy `update` pozwoliłby pracownikowi wpisać sobie punkty przez REST. |
| Klasyfikacja w SQL | Funkcja `league_standings()` (`security definer`) z `rank()` | RLS ukrywa cudze typy przed startem, a skład obejmuje każdego z typem. |

## Scope

**In scope:**
- Migracja: `tips.points`, `tip_points`, triggery przeliczenia, polityka i grant wyniku, granty kolumnowe `tips`, `league_standings()`, backfill.
- `POST /api/results` (zapis i usunięcie, JSON i redirect) oraz formularz na `/matches/[id]`.
- Kolumny „Wynik” i „Pkt”, `ResultDialog` oraz klasyfikacja na `/league`.
- Smoke (13 nowych kroków) oraz `CLAUDE.md` i README.

**Out of scope:**
- Ochrona ręcznego wyniku przed ponownym importem.
- Zamrażanie punktów i blokada stawek.
- Trzecie kryterium remisu i okno potwierdzenia usunięcia.
- Edycja meczu (S-05), powiadomienia, historia i statystyki.

## Architecture / Approach

Reguła punktacji istnieje tylko w SQL. Trigger na `tips` liczy `points` przy każdym zapisie typu. Zmiana `matches.score_a/b` albo stawek woła jedną funkcję `security definer`, która przelicza typy meczu albo wszystkie. Aplikacja tylko czyta `points` i `league_standings()`. `POST /api/results` zapisuje wynik tokenem organizatora (RLS), a w trybie JSON zwraca mecz i własny typ z już policzonymi punktami, więc dialog aktualizuje wiersz bez liczenia w kliencie.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Baza — punkty i klasyfikacja | Niezmiennik `points`, uprawnienia wyniku, `league_standings()` | Granty kolumnowe psują upsert typu z S-02 |
| 2. Wpisanie wyniku i strona meczu | `/api/results` i formularz SSR, wynik i punkty przy typach | Kolejność kontroli i komunikaty endpointu |
| 3. Lista i klasyfikacja | Kolumny Wynik i Pkt, `ResultDialog`, tabela na `/league` | Szerokość tabeli na telefonie |
| 4. Smoke i dokumentacja | 13 kroków S-04 w smoke, opis w `CLAUDE.md` i README | Kolejność kroków względem istniejących (typ pracownika na rozpoczętym meczu, zmiana stawek) |

**Prerequisites:** S-02 i S-03 zarchiwizowane (są). Docker z lokalnym Supabase do `db reset` i `smoke:local`.
**Estimated effort:** ~3–4 sesje w 4 fazach. Najcięższe są migracja (faza 1) i smoke (faza 4).

## Open Risks & Assumptions

- Ponowny import Ekstraklasy nadpisze ręcznie wpisany wynik. Punkty pójdą za nim, a ochrona jest poza zakresem.
- Zmiana stawek w trakcie sezonu przetasuje historię i ranking. To świadoma decyzja, ale warto ją opisać na `/league` i w README.
- `league_standings()` ujawnia, kto typował mecz przed jego startem (nie co). Uznane za akceptowalne.
- Migracja musi trafić na produkcję (`db push`) przed `wrangler deploy`.

## Success Criteria (Summary)

- Po wpisaniu wyniku każdy typ ma poprawne punkty (dokładny, rezultat albo 0), widoczne na liście, na stronie meczu i w klasyfikacji.
- Poprawka i usunięcie wyniku oraz zmiana stawek od razu przeliczają punkty i ranking. Pracownik nie zmieni wyniku ani punktów, także przez REST.
- `npm run smoke:local` przechodzi bez FAIL i SKIP.
