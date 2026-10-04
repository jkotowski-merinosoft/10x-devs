# Mecz na wspólnej liście (S-01) — Plan Brief

> Full plan: `context/changes/add-match-to-shared-list/plan.md`

## What & Why

Organizator dodaje mecz (dwie strony: drużyny albo zawodnicy, data i godzina rozpoczęcia), a organizator i pracownik widzą go na jednej liście (roadmap S-01; PRD US-01, FR-001, FR-011). Bez meczu na wspólnej liście nie ma typu ani punktów, więc ten slice otwiera ścieżkę do north star (S-04).

## Starting Point

Działa tylko logowanie e-mailem i hasłem (`src/middleware.ts` rozróżnia zalogowanego od anonima). Nie ma tabel aplikacji, ról ani migracji, a `AGENTS.md`, `CLAUDE.md` i `README.md` mówią wprost, że migracji się nie commituje.

## Desired End State

Pierwsza migracja zakłada `profiles` (rola, domyślnie `employee`) i `matches` z RLS: czytają wszyscy zalogowani, zapisuje tylko organizator. Strona `/matches` pokazuje wszystkie mecze rosnąco po starcie w czasie Europe/Warsaw, a organizator ma nad listą formularz. Smoke w CI sprawdza, że pracownik nie doda meczu, a mecz dodany przez organizatora widzi pracownik.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Persystencja | Commitowane migracje w `supabase/migrations/` (zmiana reguły repo) | Mecz musi gdzieś leżeć, a CI `supabase start` stosuje migracje sam. | Plan |
| Model ról | Tabela `profiles(user_id, role)` + trigger przy rejestracji | Zmiana roli działa od razu i jest miejscem na przyszłe dane użytkownika. | Plan |
| Nadanie organizatora | Ręczny `UPDATE` SQL (opisany w README), brak polityki update | Brak UI administracyjnego i brak ścieżki do samodzielnego awansu. | Plan |
| Egzekwowanie roli | RLS `is_organizer()` na insert + wczesna odmowa w endpoincie | Pracownik nie doda meczu nawet bezpośrednio przez REST Supabase. | Plan |
| Kształt meczu | Dwie strony tekstem (`side_a`, `side_b`), 1–100 znaków, różne | Wynik i typ w S-02/S-04 mają do czego się przypiąć. | Plan |
| Strefa czasowa | Stała Europe/Warsaw; w bazie `timestamptz` | Wszyscy widzą tę samą godzinę, choć Worker działa w UTC. | Plan |
| Data w przeszłości | Dozwolona | Da się dopisać mecz post factum i testować S-04 bez czekania. | Plan |
| Lista | Wszystkie mecze, `starts_at` rosnąco, remis według kolejności dodania | Jedna przewidywalna kolejność; S-04 potrzebuje rozegranych meczów na tej samej liście. | Plan |
| Miejsce | Nowa chroniona strona `/matches`, formularz tylko dla organizatora | Czysta trasa pod typ i wynik w kolejnych slice'ach. | Plan |
| Weryfikacja | Smoke z kluczem service role (admin API + REST), `SKIP` bez klucza | Cały outcome S-01 sprawdzany w CI na każdym PR. | Plan |

## Scope

**In scope:**
- Migracja: `profiles`, trigger, backfill, `is_organizer()`, `matches`, RLS
- Rola w `Astro.locals`, typy w `src/types.ts`
- `POST /api/matches` (zod), `src/lib/time.ts`, `src/lib/services/matches.ts`
- Strona `/matches`, link w `Topbar`, `PROTECTED_ROUTES`
- Rozszerzony smoke i CI; aktualizacja `AGENTS.md`, `CLAUDE.md`, `README.md`

**Out of scope:**
- Edycja i usuwanie meczu (S-05), typy, wyniki i punkty (S-02 … S-04)
- UI ról, katalog drużyn, strefa przeglądarki, sekcje i paginacja listy
- Test runner, generowane typy bazy, zmiany `/dashboard`

## Architecture / Approach

Formularz HTML na `/matches` → `POST /api/matches`: sprawdzenie roli z `locals`, zod, konwersja Warszawa → UTC. Następnie `createMatch()` przez klienta Supabase z tokenem użytkownika, gdzie RLS wymusza `is_organizer()`. Na koniec redirect na `/matches` (albo `?error=`). Middleware po `getUser()` doczytuje `profiles.role`. Lista: `listMatches()` → `formatWarsaw()`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schemat i role | Migracja, RLS, rola w `locals`, nowe reguły repo | Błąd w RLS/triggerze blokuje rejestrację (sprawdza istniejący smoke) |
| 2. Dodawanie i lista | Endpoint, strona `/matches`, helper czasu | Zła konwersja strefy przy zmianie czasu |
| 3. Smoke i CI | Automatyczny dowód outcome'u S-01 w CI | Nazwy kluczy w `supabase status -o env` przy `version: latest` |

**Prerequisites:** Docker i lokalne Supabase (`npx supabase start`); brak zależności od innych slice'ów.
**Estimated effort:** ~2–3 sesje w 3 fazach.

## Open Risks & Assumptions

- CI używa Supabase CLI `latest`. Jeśli `status -o env` przestanie wypisywać `SERVICE_ROLE_KEY`, kroki organizatora dadzą `SKIP` zamiast `PASS` (kryterium 3.5 to wychwyci).
- Zakładamy, że Workers mają pełne dane stref w `Intl` (Europe/Warsaw); kontrolne przypadki CEST i CET w fazie 2 to potwierdzają.
- Projekt w chmurze wymaga ręcznego `npx supabase db push`; CI nie deployuje.

## Success Criteria (Summary)

- Organizator dodaje mecz i widzi go na `/matches` z poprawną godziną warszawską.
- Pracownik widzi ten sam mecz na tej samej liście i nie może dodać meczu (ani przez UI, ani przez REST).
- `npm run smoke` w CI przechodzi z krokami organizatora jako `PASS`.
