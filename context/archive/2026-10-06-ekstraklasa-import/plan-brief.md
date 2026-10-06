# Import terminarza Ekstraklasy — Plan Brief

> Full plan: `context/changes/ekstraklasa-import/plan.md`
> Notatki i decyzje wejściowe: `context/changes/ekstraklasa-import/change.md`, opis API: `api-reference.md`

## What & Why

Ręcznie importujemy mecze Ekstraklasy 2026/27 z apifootball.com do `public.matches`, a import można powtórzyć.
Dzięki temu aplikacja od pierwszego dnia ma prawdziwe mecze do typowania i historię rozegranych kolejek.
To świadomy, jednorazowy wyjątek od pozycji Parked „Pobieranie meczów i wyników z zewnątrz”, a nie stała
synchronizacja. Płatny plan API jest ważny do ok. 2026-10-20.

## Starting Point

Mecze wpisuje dziś organizator. `public.matches` nie ma kolumn na wynik ani na identyfikator zewnętrzny.
`created_by` jest już nullable, a skrypt `smoke.mjs` pokazuje wzorzec wołania REST z service role bez zależności.

## Desired End State

Na prod `/matches` pokazuje terminarz Ekstraklasy z polskimi nazwami drużyn i godzinami zgodnymi z oficjalnymi.
Na przyszłe mecze da się typować. Rozegrane mecze mają w bazie wynik, który pokaże dopiero S-04. Ponowny import
nie tworzy duplikatów.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Źródło | apifootball.com, liga 259, 2026-07-01…2027-06-30 | Jedyne sprawdzone źródło z bieżącym sezonem | change.md |
| Strefa czasowa | `timezone=UTC` + losowy parametr przeciw cache, `starts_at = data T czas Z` | Bez przeliczeń czasu letniego; cache psuł testy | change.md |
| Statusy | Tylko `Not Started` i `Finished`; reszta (w tym pusty) pomijana z ostrzeżeniem | Przełożony lub trwający mecz nie wejdzie z nieaktualną datą | Plan |
| Wynik | `score_a`/`score_b` smallint 0–99 nullable, tylko dla `Finished` | Te same kolumny użyje S-04 | change.md |
| Idempotencja | `external_source` + `external_id`, unikalny indeks, upsert | Ponowny import łapie nowe terminy | change.md |
| Ponowny import | Nadpisuje drużyny, termin i wynik danymi z API | Przed S-04/S-05 nie ma ręcznych zmian do ochrony | Plan |
| Mecze nieaktualne | Tylko ostrzeżenie, bez usuwania | Usunięcie skasowałoby kaskadowo typy | Plan |
| Nazwy drużyn | Mapa na polską pisownię w skrypcie; brak w mapie → ostrzeżenie | Widzowie znają polskie nazwy | change.md |
| Autor | `created_by = null` | Pochodzenie mówi `external_source`; brak zależności od konta | Plan |
| Bazy i zapis | Lokalna (`:local`), potem prod; domyślnie dry-run, zapis z `--apply` | Prod dostaje dane sprawdzone lokalnie; pomyłka nic nie zapisze | Plan |
| Widok wyniku | Nie teraz; robi to S-04 | Nie dublujemy FR-014 | Plan |

## Scope

**In scope:**

- Migracja: kolumny wyniku i `external_*` z unikalnym indeksem
- `scripts/import-ekstraklasa.mjs` + wariant `-local`, skrypty npm, `.env.example`, README, CLAUDE.md
- Import na lokalnym stosie i na prod

**Out of scope:**

- Wyświetlanie wyniku, formularz wyniku, punkty i klasyfikacja (S-04)
- Kolejka, herby, stadiony; stała synchronizacja, endpoint, klucz w Workerze
- Usuwanie meczów, import na dev-projekt w chmurze, zmiany w `src/`

## Architecture / Approach

Skrypt Node bez zależności, uruchamiany ręcznie. Wykonuje jedno zapytanie `get_events`, waliduje całą odpowiedź
(niepusta tablica, inaczej koniec bez zapisu) i filtruje statusy. Mapuje nazwy i czas UTC, a potem porównuje dane
z wierszami już zaimportowanymi i wypisuje raport. Z flagą `--apply` zapisuje wszystko jednym upsertem
`on_conflict=external_source,external_id`. Klucze Supabase skrypt bierze tylko z powłoki (`.env` wskazuje
dev-projekt), a `APIFOOTBALL_KEY` może wziąć z `.env`. Żaden klucz ani URL zapytania nie trafia na wyjście.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Migracja schematu | Kolumny wyniku i `external_*`, `db reset` + smoke zielone | Indeks częściowy zamiast zwykłego zepsułby `on_conflict` |
| 2. Skrypt importu | Dry-run/`--apply`, wariant lokalny, dokumentacja; drugi import bez nowych wierszy | Zła strefa lub cache API → złe `starts_at` i błędna blokada typowania |
| 3. Wdrożenie na prod | `db push` + import na prod, porównanie godzin z oficjalnym terminarzem | Pomyłka w kluczach/URL przy ręcznym uruchomieniu na prod |

**Prerequisites:** aktywny plan apifootball.com (do ok. 2026-10-20), `APIFOOTBALL_KEY`, Docker z lokalnym Supabase,
service role key prod (tylko w powłoce).
**Estimated effort:** ~1–2 sesje w 3 fazach.

## Open Risks & Assumptions

- Zakładamy, że `timezone=UTC` z losowym parametrem zawsze omija cache dostawcy. Sprawdzamy to porównaniem
  z oficjalnym terminarzem po obu zmianach czasu.
- Po wygaśnięciu planu terminy przełożonych meczów trzeba poprawiać ręcznie (SQL), dopóki nie ma S-05.
- Zaimportowane rozegrane mecze nie mają typów, więc po S-04 nikomu nie dadzą punktów. Są tylko historią.

## Success Criteria (Summary)

- Pracownik na prod widzi prawdziwe mecze Ekstraklasy z poprawnymi godzinami i typuje najbliższą kolejkę.
- Ponowny import nie tworzy duplikatów i przenosi zmiany terminów z API.
- Rozegrane mecze mają w bazie wynik gotowy dla S-04.
