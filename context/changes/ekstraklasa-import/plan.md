# Import terminarza Ekstraklasy (apifootball.com) Implementation Plan

## Overview

Jednorazowy, ale powtarzalny import meczów Ekstraklasy sezonu 2026/27 z apifootball.com do `public.matches`,
żeby aplikacja od pierwszego dnia miała prawdziwe mecze do typowania i historię rozegranych kolejek.
Plan płatny API jest ważny do ok. 2026-10-20; po tym terminie import nie musi działać, dane zostają w bazie.
Ta zmiana jest świadomym wyjątkiem od pozycji Parked „Pobieranie meczów i wyników z zewnątrz” (roadmapa,
PRD §Non-Goals): dane startowe, nie stała synchronizacja.

## Current State Analysis

- `public.matches` ma `side_a`, `side_b`, `starts_at`, `created_by`, `created_at`
  (`supabase/migrations/20261001000000_profiles_and_matches.sql:61-71`). Nie ma kolumn na wynik ani na
  identyfikator zewnętrzny, więc upsert bez duplikatów jest dziś niemożliwy.
- `created_by` jest już nullable z `on delete set null`
  (`supabase/migrations/20261004000000_harden_profiles_and_matches.sql:5-11`). Notatka w `change.md`, że jest
  wymagane, jest nieaktualna. Service role omija RLS, więc import może zapisać `created_by = null`.
- Typy (`supabase/migrations/20261004120000_tips_and_display_names.sql:93-105`) używają `score_a`/`score_b smallint`
  z zakresem 0–99; kolumny wyniku meczu mają mieć te same nazwy i zakres, bo użyje ich S-04.
- Typowanie zależy wyłącznie od `starts_at > now()` (`match_is_open`, tamże `:131-144`), więc poprawny czas UTC
  jest krytyczny.
- Aplikacja czyta mecze przez jawną listę kolumn (`src/lib/services/matches.ts:13,33,53`), więc nowe kolumny
  nie zmieniają jej zachowania.
- Wzorzec skryptu bez zależności, wołającego REST Supabase z service role i nie wypisującego kluczy:
  `scripts/smoke.mjs:65-85`. Klucze lokalnego stosu: `scripts/local-supabase.mjs` (odmawia URL innego niż lokalny),
  wrapper: `scripts/smoke-local.mjs`.
- API (szczegóły w `api-reference.md`): `get_events&league_id=259&from=2026-07-01&to=2027-06-30` zwraca 306 meczów
  w jednej odpowiedzi; `timezone=UTC` działa, ale odpowiedź bywa cache'owana, więc potrzebny losowy parametr.
- Brak pozycji o tym Change ID w `context/foundation/roadmap.md`; roadmapy nie zmieniamy.

## Desired End State

- Migracja dodaje do `public.matches`: `score_a`, `score_b` (smallint, nullable, 0–99, oba ustawione albo oba `null`)
  oraz `external_source`, `external_id` (text, nullable, oba ustawione albo oba `null`) z unikalnym indeksem na parze.
- `npm run import:ekstraklasa` (domyślnie dry-run, zapis z `--apply`) i `npm run import:ekstraklasa:local`
  importują mecze o statusie `Not Started` i `Finished`, z polskimi nazwami drużyn, `starts_at` w UTC i wynikiem
  dla `Finished`. Ponowne uruchomienie nie tworzy duplikatów, a nadpisuje drużyny, termin i wynik danymi z API.
- Na prod `/matches` pokazuje mecze Ekstraklasy z godzinami zgodnymi z oficjalnym terminarzem, a na przyszłe
  mecze da się typować.

Weryfikacja: `npx supabase db reset`, `npm run smoke:local`, dwukrotny import lokalny z identycznymi liczbami,
porównanie kilku meczów z oficjalnym terminarzem na prod.

### Key Discoveries:

- Upsert PostgREST (`on_conflict=external_source,external_id`) wymaga zwykłego (nie częściowego) indeksu
  unikalnego; ręcznie dodane mecze z `null`/`null` nie kolidują, bo null-e w Postgres są różne.
- `created_by` nullable (`20261004000000_harden_profiles_and_matches.sql:5-6`); RLS insert dla `authenticated`
  i tak wymaga `created_by = auth.uid()`, więc organizator w aplikacji nie wstawi meczu bez autora.
- Zakresy wyniku jak w `tips` (`20261004120000_tips_and_display_names.sql:103-104`).
- `.env` wskazuje dev-projekt w chmurze (memory/README): skrypt nie może brać z niego `SUPABASE_URL`.

## What We're NOT Doing

- Wyświetlanie wyniku w `/matches` i na stronie meczu, formularz wyniku, punkty i klasyfikacja (S-04, FR-014).
- Kolumna kolejki (`match_round`), herby, stadiony.
- Stała synchronizacja, cron, endpoint w aplikacji, klucz API w sekretach Workera.
- Usuwanie meczów: mecz zaimportowany wcześniej, który zniknął z API albo ma inny status, zostaje bez zmian;
  skrypt tylko ostrzega (usunięcie skasowałoby kaskadowo typy).
- Import meczów z pustym statusem i ze statusami innymi niż `Not Started` / `Finished` (np. `Postponed`,
  `Cancelled`, `Half Time`, minuta meczu): pomijane z ostrzeżeniem.
- Import na dev-projekt w chmurze (`mwmugmjikpltdaijjkoa`); tylko lokalny stos i prod.
- Ograniczanie uprawnień kolumnowych dla `authenticated` do nowych kolumn (organizator i tak może pisać mecze).
- Zmiany w `src/types.ts` i w serwisach: nic w aplikacji nie czyta nowych kolumn.
- Zmiana widoku `/matches`: tabela sortuje rosnąco po `starts_at` bez paginacji (`listMatches`, `MatchesTable`),
  więc po imporcie ok. 80 rozegranych meczów stoi przed najbliższą kolejką. To znana konsekwencja; kandydat
  na osobną zmianę (domyślny widok od dziś albo przewinięcie do najbliższego meczu).
- Nowe testy automatyczne (AGENTS.md: brak test runnera).

## Implementation Approach

Najpierw schemat (migracja, sprawdzona `db reset` + smoke), potem samodzielny skrypt na wzór `smoke.mjs`:
pobranie → walidacja całej odpowiedzi → przekształcenie → raport → (z `--apply`) jeden zbiorczy upsert.
Na końcu wdrożenie migracji i importu na prod z ręcznym porównaniem godzin z oficjalnym terminarzem.

## Critical Implementation Details

- **Źródła zmiennych środowiskowych.** `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` skrypt bierze wyłącznie
  z `process.env` (powłoka); nie wczytuje `.env`, bo tam jest URL dev-projektu. Wyjątek: `APIFOOTBALL_KEY` może
  być doczytany z gitignorowanego `.env`, gdy nie ma go w powłoce (czytany tylko ten jeden klucz). Ani klucz API,
  ani pełny URL zapytania (klucz jest w query), ani klucze Supabase nigdy nie trafiają na wyjście.
- **Strefa czasowa i cache.** Zapytanie zawsze z `timezone=UTC` i losowym parametrem (np. `_=<Date.now()>`);
  `starts_at = <match_date>T<match_time>:00Z` bez przeliczeń. Format daty i czasu walidowany regexem; mecz
  z niepoprawnym formatem pomijany z ostrzeżeniem.
- **Wszystko albo nic przed zapisem.** Jeśli odpowiedź nie jest niepustą tablicą, skrypt kończy się kodem ≠ 0
  bez zapisu. Upsert idzie jednym żądaniem (ok. 300 wierszy), wszystkie obiekty mają te same klucze (wymóg
  zbiorczego insertu PostgREST), w tym jawne `created_by: null` i `score_a/score_b: null` dla meczów bez wyniku.

## Phase 1: Migracja schematu

### Overview

Kolumny wyniku (wspólne z przyszłym S-04) i identyfikatora zewnętrznego z unikalnym indeksem, bez zmian
w zachowaniu aplikacji.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261006000000_match_scores_and_external_ids.sql`

**Intent**: Dodać miejsce na wynik meczu (użyje go S-04) i na identyfikator meczu u dostawcy, żeby import był
idempotentny. Komentarz w pliku tłumaczy, że wynik jest wspólny z S-04, a `external_*` służy importowi.

**Contract**: `alter table public.matches add column if not exists`:
`score_a smallint null`, `score_b smallint null`, `external_source text null`, `external_id text null`.
Ograniczenia (nazwane jak w istniejących migracjach): `matches_score_a_range` / `matches_score_b_range`
(`between 0 and 99`), `matches_score_pair` (`(score_a is null) = (score_b is null)`),
`matches_external_pair` (`(external_source is null) = (external_id is null)`).
Unikalny, niepartycjonowany indeks `matches_external_source_id_key on public.matches (external_source, external_id)`.
Bez zmian w politykach RLS i grantach.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` stosuje wszystkie migracje bez błędów
- `npm run lint` przechodzi
- `npx astro check` przechodzi
- `npm run smoke:local` (przy `npm run dev:local` w tle) kończy się bez `FAIL`

#### Manual Verification:

- W lokalnej bazie wstawienie wiersza z samym `score_a` albo samym `external_id` jest odrzucane przez constraint

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Skrypt importu

### Overview

Samodzielny skrypt Node bez zależności, uruchamiany ręcznie: dry-run domyślnie, zapis z `--apply`, wariant lokalny.

### Changes Required:

#### 1. Skrypt importu

**File**: `scripts/import-ekstraklasa.mjs`

**Intent**: Pobrać sezon Ekstraklasy 2026/27 z apifootball.com i zapisać go upsertem w `public.matches`
zgodnie z decyzjami z `change.md` i tego planu; wypisać raport, na podstawie którego człowiek decyduje
o `--apply`.

**Contract**:
- Wejście: `APIFOOTBALL_KEY` (powłoka, a w razie braku tylko ten klucz z `.env`), `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` (tylko powłoka; brak → komunikat i kod 1). Flaga `--apply`; bez niej nic nie jest zapisywane.
- Cel zapisu: nagłówek raportu podaje host `SUPABASE_URL` (nie jest sekretem), żeby było widać, do której bazy
  idzie import. URL zawierający ref dev-projektu `mwmugmjikpltdaijjkoa` → komunikat i kod 1 przed jakimkolwiek
  odczytem.
- Stałe: `league_id=259`, `from=2026-07-01`, `to=2027-06-30`, `external_source = 'apifootball'`.
- Zapytanie: `GET https://apiv3.apifootball.com/?action=get_events&league_id=259&from=…&to=…&timezone=UTC&_=<timestamp>&APIkey=…`.
  Odpowiedź musi być niepustą tablicą, inaczej kod 1 bez zapisu (błąd: tylko status HTTP i krótki opis, bez URL).
- Filtr statusu: tylko `Not Started` i `Finished`; pozostałe (w tym `""`) pomijane, liczone per status.
- Mapowanie wiersza: `side_a`/`side_b` ← nazwy po mapie polskiej pisowni (stała `TEAM_NAMES` w skrypcie;
  nazwa spoza mapy zostaje bez zmian + ostrzeżenie, raz na nazwę); `starts_at` ← `<match_date>T<match_time>:00Z`;
  `score_a`/`score_b` ← liczby dla `Finished` (pusty lub nienumeryczny wynik → oba `null` + ostrzeżenie),
  `null` dla `Not Started`; `external_id` ← `match_id`; `created_by` ← `null`.
- Pomijane z ostrzeżeniem: niepoprawny format daty/czasu, te same drużyny po mapowaniu (porównanie jak
  w `matches_sides_differ`: `lower(btrim(…))`), nazwa dłuższa niż 100 znaków, powtórzony `match_id` w odpowiedzi
  (zostaje pierwszy; duplikat w jednym zbiorczym upsercie wywróciłby całe żądanie).
- Przed zapisem (także w dry-run) odczyt istniejących wierszy `external_source=eq.apifootball`
  (`external_id, side_a, side_b, starts_at, score_a, score_b`), żeby policzyć nowe / aktualizowane / bez zmian
  (`starts_at` porównywany jako czas, `Date#getTime()`, bo PostgREST zwraca `+00:00`, a skrypt buduje `Z`) i wykryć mecze
  nieaktualne: zaimportowane wcześniej, a w tej odpowiedzi nieobecne lub pominięte. Te tylko wypisuje
  (id, drużyny, status w API albo „brak w API”), nie zmienia ich.
- Zapis (`--apply`): `POST /rest/v1/matches?on_conflict=external_source,external_id` z
  `Prefer: resolution=merge-duplicates,return=minimal`; nadpisuje wszystkie kolumny z payloadu (`side_a`, `side_b`,
  `starts_at`, `score_a`, `score_b`, `created_by`, `external_*`), co dla zaimportowanych wierszy daje te same wartości.
  Żądanie jest atomowe (jedna transakcja). Odpowiedź inna niż 2xx: status i komunikat PostgREST skrócony do
  120 znaków (jak `smoke.mjs`), bez kluczy, kod 1.
- Raport: liczba meczów w API, per status, do importu (nowe / zmienione / bez zmian), z wynikiem, pominięte
  z powodem, ostrzeżenia o nazwach, nieaktualne; liczba meczów bez `external_source` (dodanych ręcznie; import ich
  nie dotyka, więc mogą zdublować zaimportowane); trzy przykładowe wiersze z `starts_at`; `DRY RUN` albo `APPLIED`.
- Mapę nazw implementujący buduje z odpowiedzi API (distinct `match_hometeam_name`/`match_awayteam_name`),
  z polską pisownią oficjalnych nazw klubów.

#### 2. Wariant lokalny

**File**: `scripts/import-ekstraklasa-local.mjs`

**Intent**: Uruchomić import na lokalnym stosie bez ręcznego kopiowania kluczy, jak `smoke-local.mjs`.

**Contract**: bierze `API_URL` i `SERVICE_ROLE_KEY` z `localSupabaseEnv()`, uruchamia `import-ekstraklasa.mjs`
z przekazanymi argumentami (np. `--apply`) i env `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` nadpisanymi
lokalnymi wartościami; odmowa nielokalnego URL dziedziczona z `local-supabase.mjs`.

#### 3. Skrypty npm i dokumentacja

**File**: `package.json`, `.env.example`, `README.md`, `CLAUDE.md`

**Intent**: Udostępnić polecenia i opisać bezpieczne użycie.

**Contract**:
- `package.json`: `"import:ekstraklasa": "node scripts/import-ekstraklasa.mjs"`,
  `"import:ekstraklasa:local": "node scripts/import-ekstraklasa-local.mjs"`.
- `.env.example`: `APIFOOTBALL_KEY=###`.
- `README.md`: nowa sekcja „Import Ekstraklasy” (cel i wyjątek od Non-Goals, dry-run vs `--apply`, wariant lokalny,
  uruchomienie na prod z kluczami ustawionymi w powłoce PowerShell `$env:…`, skąd wziąć service role key prod,
  że klucz service role nigdy nie trafia do `.env` / `.dev.vars` / Workera, ważność planu API do ok. 2026-10-20)
  oraz dwa wpisy w „Available Scripts”.
- `CLAUDE.md` „Commands”: jedna linia o `npm run import:ekstraklasa[:local]` z odesłaniem do README.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi
- `npm run import:ekstraklasa:local` (dry-run) kończy się kodem 0, wypisuje `DRY RUN` i nie zmienia liczby wierszy w `public.matches`
- `npm run import:ekstraklasa:local -- --apply` zapisuje mecze: liczba wierszy z `external_source = 'apifootball'` równa liczbie „do importu” z raportu
- Drugie `npm run import:ekstraklasa:local -- --apply` raportuje 0 nowych i 0 zmienionych i nie zmienia liczby wierszy
- Wyjście skryptu nie zawiera wartości `APIFOOTBALL_KEY` ani service role key
- `npm run smoke:local` po imporcie kończy się bez `FAIL`

#### Manual Verification:

- Raport nie zawiera ostrzeżeń o nazwach drużyn spoza mapy
- `/matches` w `npm run dev:local` pokazuje polskie nazwy drużyn i godziny zgodne z oficjalnym terminarzem Ekstraklasy (w tym jeden mecz po 2026-10-25)
- Pracownik może wpisać typ na zaimportowany przyszły mecz; rozegrany mecz ma w bazie wynik zgodny z oficjalnym

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Wdrożenie na prod

### Overview

Migracja i import na projekcie produkcyjnym (`sbnzobwqtibbwgguvntb`) przed wygaśnięciem planu API.

### Changes Required:

#### 1. Migracja na prod i import

**File**: brak zmian w kodzie (operacja)

**Intent**: Zasilić produkcję prawdziwym terminarzem.

**Contract**: kolejność z memory projektu: `supabase link` na prod → `supabase db push` → ponowne `link` na dev.
Następnie w powłoce `$env:SUPABASE_URL` / `$env:SUPABASE_SERVICE_ROLE_KEY` produkcji (tylko na czas sesji),
`npm run import:ekstraklasa` (dry-run), przegląd raportu. Jeśli raport pokazuje mecze bez `external_source`,
przegląd ich na prod (`select id, side_a, side_b, starts_at from public.matches where external_source is null`)
i decyzja człowieka: usunąć (kasuje kaskadowo ich typy) albo zostawić jako duplikaty. Potem
`npm run import:ekstraklasa -- --apply`.
Deploy Workera nie jest potrzebny (brak zmian w aplikacji). Opcjonalnie ponowny import przed ok. 2026-10-20,
żeby złapać mecze, którym ustalono termin.

### Success Criteria:

#### Manual Verification:

- `supabase db push` na prod stosuje migrację bez błędów, a `link` wraca na dev-projekt
- Dry-run na prod raportuje oczekiwane liczby (ok. 296 meczów, 0 ostrzeżeń o nazwach)
- Mecze bez `external_source` na prod przejrzane przed `--apply`, decyzja o duplikatach podjęta
- Po `--apply` `/matches` na https://10x-astro-starter.liga-typera.workers.dev pokazuje mecze Ekstraklasy
- Trzy mecze (najbliższy, jeden po 2026-10-25, jeden po 2027-03-28) mają godziny zgodne z oficjalnym terminarzem

---

## Testing Strategy

### Manual Testing Steps:

1. Lokalnie: `npx supabase db reset`, `npm run import:ekstraklasa:local` (dry-run), przegląd raportu.
2. `--apply` dwa razy; porównanie liczb i brak duplikatów (`select external_id, count(*) … group by 1 having count(*) > 1` pusty).
3. `npm run dev:local`: `/matches` — nazwy, godziny (także po zmianie czasu), typ na przyszły mecz.
4. Smoke lokalny po imporcie.
5. Prod: dry-run, `--apply`, porównanie trzech meczów z oficjalnym terminarzem.

## Performance Considerations

Jedno zapytanie do API i jedno zbiorcze żądanie upsert (~300 wierszy); bez znaczenia wydajnościowego.

## Migration Notes

Migracja jest addytywna (kolumny nullable, constraint na pustych danych przechodzi). Wycofanie danych importu:
`delete from public.matches where external_source = 'apifootball'` (kasuje kaskadowo typy na te mecze).

## References

- Notatki i decyzje: `context/changes/ekstraklasa-import/change.md`
- Opis API: `context/changes/ekstraklasa-import/api-reference.md`
- Wzorzec skryptu: `scripts/smoke.mjs:65-85`, `scripts/smoke-local.mjs`, `scripts/local-supabase.mjs`
- Schemat: `supabase/migrations/20261001000000_profiles_and_matches.sql:61-91`,
  `supabase/migrations/20261004000000_harden_profiles_and_matches.sql:5-11`,
  `supabase/migrations/20261004120000_tips_and_display_names.sql:93-144`
- Roadmapa (S-04, Parked): `context/foundation/roadmap.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migracja schematu

#### Automated

- [x] 1.1 `npx supabase db reset` stosuje wszystkie migracje bez błędów — 1b62a17
- [x] 1.2 `npm run lint` przechodzi — 1b62a17
- [x] 1.3 `npx astro check` przechodzi — 1b62a17
- [x] 1.4 `npm run smoke:local` (przy `npm run dev:local` w tle) kończy się bez `FAIL` — 1b62a17

#### Manual

- [x] 1.5 W lokalnej bazie wstawienie wiersza z samym `score_a` albo samym `external_id` jest odrzucane przez constraint — 1b62a17

### Phase 2: Skrypt importu

#### Automated

- [x] 2.1 `npm run lint` przechodzi — 20d06d4
- [x] 2.2 `npm run import:ekstraklasa:local` (dry-run) kończy się kodem 0, wypisuje `DRY RUN` i nie zmienia liczby wierszy w `public.matches` — 20d06d4
- [x] 2.3 `npm run import:ekstraklasa:local -- --apply` zapisuje mecze: liczba wierszy z `external_source = 'apifootball'` równa liczbie „do importu” z raportu — 20d06d4
- [x] 2.4 Drugie `npm run import:ekstraklasa:local -- --apply` raportuje 0 nowych i 0 zmienionych i nie zmienia liczby wierszy — 20d06d4
- [x] 2.5 Wyjście skryptu nie zawiera wartości `APIFOOTBALL_KEY` ani service role key — 20d06d4
- [x] 2.6 `npm run smoke:local` po imporcie kończy się bez `FAIL` — 20d06d4

#### Manual

- [x] 2.7 Raport nie zawiera ostrzeżeń o nazwach drużyn spoza mapy
- [x] 2.8 `/matches` w `npm run dev:local` pokazuje polskie nazwy drużyn i godziny zgodne z oficjalnym terminarzem Ekstraklasy (w tym jeden mecz po 2026-10-25)
- [x] 2.9 Pracownik może wpisać typ na zaimportowany przyszły mecz; rozegrany mecz ma w bazie wynik zgodny z oficjalnym

### Phase 3: Wdrożenie na prod

#### Manual

- [x] 3.1 `supabase db push` na prod stosuje migrację bez błędów, a `link` wraca na dev-projekt
- [x] 3.2 Dry-run na prod raportuje oczekiwane liczby (ok. 296 meczów, 0 ostrzeżeń o nazwach)
- [x] 3.3 Mecze bez `external_source` na prod przejrzane przed `--apply`, decyzja o duplikatach podjęta
- [x] 3.4 Po `--apply` `/matches` na https://10x-astro-starter.liga-typera.workers.dev pokazuje mecze Ekstraklasy
- [x] 3.5 Trzy mecze (najbliższy, jeden po 2026-10-25, jeden po 2027-03-28) mają godziny zgodne z oficjalnym terminarzem
