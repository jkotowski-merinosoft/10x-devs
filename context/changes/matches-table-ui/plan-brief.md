# Interaktywna tabela meczów — Plan Brief

> Full plan: `context/changes/matches-table-ui/plan.md`

## What & Why

Lista `/matches` staje się interaktywną tabelą z wyszukiwaniem, sortowaniem po dacie, modalem „Dodaj mecz” i modalem typowania. Zapisy aktualizują tabelę bez przeładowania strony. Zmiana jest spoza roadmapy i przy okazji ustala bazowy zestaw komponentów (motyw, Dialog, formularze, `DataTable`, toasty, klient JSON), na którym powstaną kolejne strony: stawki S-03, wynik i klasyfikacja S-04.

## Starting Point

`/matches` to statyczna lista `<ul>` w `.astro` z formularzem dodawania meczu stale nad listą. Typuje się na osobnej stronie `/matches/[id]`. Endpointy `/api/matches` i `/api/tips` odpowiadają wyłącznie przekierowaniem. Z shadcn/ui jest tylko `Button`, a tokeny shadcn nie pasują do ciemnego stylu „cosmic”.

## Desired End State

Organizator klika „Dodaj mecz”, wypełnia modal, a nowy mecz od razu pojawia się w tabeli, podświetlony i we właściwym miejscu. Każdy użytkownik klika „brak typu” albo swój typ, wpisuje wynik w modalu i widzi go w wierszu. Przy rozpoczętym meczu modal jest tylko do odczytu. Wyszukiwanie ignoruje wielkość liter i polskie znaki, sortowanie przełącza ↑/↓, a widok przetrwa odświeżenie dzięki `?q=&sort=`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Biblioteka tabeli | TanStack Table + shadcn `Table`, generyczny `DataTable` | Standard ekosystemu shadcn, ten sam komponent posłuży klasyfikacji S-04 |
| Motyw | `class="dark"` + tokeny `.dark` przestrojone pod cosmic | Każdy kolejny `shadcn add` od razu pasuje wizualnie, bez nadpisywania klas |
| Zapis bez przeładowania | Negocjacja `Accept: application/json` w tych samych endpointach | Jedna walidacja zod, a przekierowania (smoke, wejście bez JS) zostają |
| Formularze | react-hook-form + zodResolver + shadcn Field, schematy w `src/lib/schemas/` | Ta sama walidacja i komunikaty na kliencie i serwerze |
| Feedback | Toast (Sonner) przy sukcesie, błąd w modalu z zachowaniem danych | Wspólny mechanizm powiadomień dla kolejnych stron |
| Klik w typ przy rozpoczętym meczu | Modal tylko do odczytu + link do `/matches/[id]` | Spójna interakcja, a RLS i tak blokuje zapis |
| Wyszukiwanie i sortowanie | Nazwy obu stron bez wielkości liter i polskich znaków; data ↑/↓ (domyślnie ↑), po stronie klienta | Natychmiastowe przy skali ligi firmowej |
| Nowy mecz przy aktywnym filtrze | Czyszczenie frazy, podświetlenie i przewinięcie do wiersza | Organizator zawsze widzi efekt swojej akcji |
| Stan widoku | `?q=&sort=` w URL, HTML z serwera już przefiltrowany | Odświeżenie i link zachowują widok bez mignięcia |
| Mobile | Ukryte kolumny Data i Status + poziomy scroll kontenera | Jedna struktura DOM, wzorzec dla przyszłych tabel |
| Strona `/matches/[id]` | Bez zmian | Zero ryzyka regresji, dalej pokryta smoke |
| Weryfikacja | Smoke: tylko dostosowanie markerów (`<tr`, `data-tip`, `data-testid="add-match"`) | Zgodnie z wyborem; ścieżka JSON sprawdzana ręcznie |

## Scope

**In scope:**
- tokeny motywu i komponenty shadcn table, dialog, input, label, field, sonner;
- `DataTable`, `useUrlTableState`, `normalizeForSearch`, `postForm`;
- wspólne schematy zod;
- tryb JSON w `/api/matches` i `/api/tips`;
- `MatchesTable`, `AddMatchDialog`, `TipDialog`;
- markery smoke i opis w `CLAUDE.md`.

**Out of scope:**
- nowe kroki smoke dla JSON, Playwright i test runner;
- przebudowa `/matches/[id]` i formularzy auth;
- filtry statusu, zakres dat, paginacja;
- edycja i usuwanie meczów, realtime, Astro Actions;
- zmiany w bazie i RLS.

## Architecture / Approach

`matches.astro` ładuje mecze i własne typy (jak dziś), czyta `q`/`sort` z URL i renderuje wyspę `<MatchesTable client:load now={Date.now()}>`. Wyspa trzyma mecze i typy w stanie React, a filtr i sortowanie w `useUrlTableState` (`replaceState`). Renderuje generyczny `DataTable` oraz oba modale. Modale walidują dane wspólnymi schematami zod i wysyłają surowe wartości przez `postForm` z `Accept: application/json`. Endpoint ponownie waliduje, zapisuje, zwraca zapisany wiersz, a wyspa aktualizuje stan i pokazuje toast z globalnego `Toaster` w Layout.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Fundament UI i wspólne schematy | Motyw, komponenty shadcn, `DataTable`, `postForm`, Toaster, schematy w `src/lib/schemas/` | Zmiana tokenów `.dark` zmienia wygląd istniejących stron |
| 2. Kontrakt JSON w API | Odpowiedzi JSON (201/200, 400/401/403/404/409/500) obok przekierowań; serwisy zwracają wiersz | Rozjazd ścieżek JSON i przekierowań w handlerze |
| 3. Tabela z wyszukiwaniem i sortowaniem | Wyspa `MatchesTable`, stan w URL, mobile, markery smoke `<tr`/`data-tip` | Błędy hydracji (czas, formatowanie dat) |
| 4. Modale dodawania i typowania | `AddMatchDialog`, `TipDialog`, aktualizacja bez przeładowania, toasty, marker `add-match` | Wysyłka wartości po transformacji zod zamiast surowych; toast między wyspami |

**Prerequisites:** lokalny Supabase (Docker), `npm run dev:local` i `npm run smoke:local` działają na `master`.
**Estimated effort:** ~3–4 sesje w 4 fazach.

## Open Risks & Assumptions

- `formatWarsaw` może się różnić formatowaniem między ICU Workers a przeglądarką, co daje ostrzeżenie hydracji. Do sprawdzenia w fazie 3.
- `toast()` z wyspy tabeli wymaga wspólnej instancji `sonner` z `Toaster` w Layout. Jeśli nie zadziała, `Toaster` trafia do wyspy.
- Zakładamy, że `npx shadcn add field` jest dostępny w rejestrze; w przeciwnym razie trzeba użyć `form`.
- Ścieżka JSON nie ma automatycznych testów, więc regresje wyjdą dopiero przy ręcznej weryfikacji.

## Success Criteria (Summary)

- Organizator dodaje mecz i pracownik typuje mecz bez przeładowania strony, a tabela od razu pokazuje wynik akcji.
- Wyszukiwanie i sortowanie po dacie działają, a widok przetrwa odświeżenie.
- Smoke jest zielony po każdej fazie, a istniejące strony wyglądają jak wcześniej.
