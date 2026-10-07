# Wynik, punkty i klasyfikacja (S-04) Implementation Plan

## Overview

Organizator wpisuje wynik meczu, który już się rozpoczął, może go poprawić albo usunąć. Robi to na stronie meczu albo w dialogu na liście `/matches`. Po każdej zmianie wyniku baza sama liczy i zapisuje punkty przy każdym typie tego meczu. Przelicza je też po zmianie stawek ligi. Użytkownik widzi wynik i swoje punkty na liście i na stronie meczu, a strona `/league` pokazuje klasyfikację: punkty, potem liczba dokładnych wyników, przy pełnym remisie wspólne miejsce. To roadmap S-04, gwiazda przewodnia M-1 (PRD US-01, FR-009, FR-010, FR-014, FR-015, FR-020).

## Current State Analysis

- Kolumny wyniku już istnieją: `matches.score_a`/`score_b` (smallint 0–99, oba albo żaden), dodane dla S-04 przez import Ekstraklasy (`supabase/migrations/20261006000000_match_scores_and_external_ids.sql:1-23`). Import (service role) wpisuje wynik rozegranym meczom i nadpisuje go przy ponownym uruchomieniu (`scripts/import-ekstraklasa.mjs:268-312`).
- Na `matches` nie ma polityki ani uprawnienia UPDATE. Są tylko `select` i `insert` (`20261001000000_profiles_and_matches.sql:72-89`).
- `tips` (`20261004120000_tips_and_display_names.sql:93-175`): PK `(match_id, user_id)`, `authenticated` ma `select, insert, update` na całej tabeli. Insert i update są dozwolone tylko przed startem meczu (`match_is_open()`), a select cudzych typów dopiero po starcie. Trigger `set_updated_at` działa na każdy update.
- Stawki: jeden wiersz `league_settings` (`exact_points`, `outcome_points`), domyślnie 3 / 1. Zmienia je organizator w każdej chwili, a baza wymusza `0 ≤ outcome < exact ≤ 99` (`20261007000000_league_settings.sql`). S-03 zostawiło S-04 decyzję o skutkach zmiany stawek dla policzonych punktów.
- Wzorzec endpointu z obsługą JSON (wyspa) i redirectu (formularz HTML, smoke) to `src/pages/api/tips.ts:7-75`. Serwisy zwracają `{ data, error }` z polskim komunikatem (`src/lib/services/*.ts`). Wynik formularza waliduje `scoresSchema` (`src/lib/schemas/tip.ts:14-21`).
- `Match` i `Tip` nie mają pól wyniku ani punktów (`src/types.ts:3-27`). `listMatches`, `getMatch` i `createMatch` wybierają tylko `id, side_a, side_b, starts_at, created_at` (`src/lib/services/matches.ts`).
- Lista `/matches` to wyspa `MatchesTable` z kolumnami Mecz, Data, Twój typ i Status (`src/components/matches/columns.tsx:8-128`), zegar serwera `now` i dialog typu (`TipDialog.tsx`). Strona meczu `/matches/[id].astro` po starcie pokazuje typy wszystkich, a przed startem formularz typu.
- `/league` pokazuje stawki i formularz organizatora (`src/pages/league.astro`). Według S-03 to miejsce na klasyfikację.
- Smoke ma mecz przyszły i mecz już rozpoczęty (2020), typ organizatora 1:0 na rozpoczętym meczu wstawiany przez service role, zapamiętane stawki, zmianę stawek na 5 / 2 (albo 6 / 2) i sprzątanie (`scripts/smoke.mjs:420-560`). Wiersz tabeli zawęża helper `matchRow()` (`scripts/smoke.mjs:106-121`).

## Desired End State

- Każdy typ ma kolumnę `points`. Jej wartość zawsze wynika z typu, wyniku meczu i bieżących stawek: `exact_points` za dokładny wynik, `outcome_points` za trafionego zwycięzcę albo remis przy innym wyniku, `0` za błędny typ, a `null`, gdy mecz nie ma wyniku. Pilnuje tego baza, bez względu na to, kto zmienił wynik (formularz, dialog, import, SQL) i kto zmienił stawki.
- Nikt poza bazą nie zapisze `points`: `authenticated` nie ma uprawnienia do tej kolumny, a trigger i tak ją nadpisuje.
- Wynik zapisuje, poprawia i usuwa tylko organizator i tylko dla meczu, który się rozpoczął (`starts_at <= now()`). Wymusza to RLS i grant kolumnowy na `score_a, score_b`. Endpoint sprawdza to samo tylko dla czytelnego komunikatu.
- `POST /api/results` (trasa chroniona) przyjmuje `match_id`, `score_a`, `score_b` oraz `action` (`save`, domyślnie, albo `clear`). Formularz dostaje redirect na `/matches/{id}`, a dialog JSON `{ match, tip }`, gdzie `tip` to typ wywołującego z punktami albo `null`.
- `/matches/[id]`:
  - wszyscy widzą wynik meczu („Wynik: 2:1” albo brak);
  - po starcie przy każdym typie widać punkty, gdy mecz ma wynik;
  - organizator po starcie ma formularz z przyciskami „Zapisz wynik” i, gdy wynik jest, „Usuń wynik”.
- `/matches`: kolumny „Wynik” (`data-result`, np. `2:1` albo puste) i „Pkt” (`data-points`, punkty własnego typu albo puste). Organizator na rozpoczętym meczu otwiera z kolumny „Wynik” dialog z tymi samymi dwoma akcjami. Po zapisie tabela aktualizuje wynik i własne punkty bez przeładowania.
- `/league`: pod punktacją jest tabela klasyfikacji (`data-testid="standings"`) z kolumnami miejsce, gracz (zamaskowany e-mail, „(Ty)” przy sobie), punkty i dokładne. Są w niej wszyscy z co najmniej jednym typem. Kolejność: punkty malejąco, dokładne malejąco, przy pełnym remisie to samo miejsce (1, 1, 3), a wiersze w remisie alfabetycznie. Pod tabelą jest jednozdaniowy opis tej reguły.
- `npm run smoke:local` dowodzi każdej reguły powyżej, a `CLAUDE.md` § Verification i README opisują nowe kroki.

### Key Discoveries:

- Typ i wynik nie mogą powstać w tym samym oknie czasowym: typ zapisuje się tylko przed startem, wynik tylko po starcie. W normalnym ruchu punkty liczy więc zmiana wyniku albo stawek. Trigger na `tips` jest potrzebny dla zapisów service role (smoke, SQL) i jako zabezpieczenie przed podaniem `points` z zewnątrz.
- Przeliczenie po zmianie wyniku musi pominąć RLS `tips` (update tylko przed startem i tylko własnych), więc działa w funkcji `security definer` wywoływanej z triggera.
- `set_updated_at` na `tips` zmieniałby `updated_at` przy każdym przeliczeniu punktów. Trzeba go zawęzić do `UPDATE OF score_a, score_b`, żeby `updated_at` dalej znaczył „ostatnia poprawka typu”.
- PostgREST upsert typu (`saveTip`, `on_conflict=match_id,user_id`) robi `INSERT … ON CONFLICT DO UPDATE SET` dla kolumn z payloadu. Granty kolumnowe muszą więc obejmować `match_id, user_id, score_a, score_b` zarówno dla insert, jak i dla update.
- Klasyfikacji nie da się złożyć zwykłym selectem z uprawnieniami użytkownika, bo RLS ukrywa cudze typy na mecze przed startem, a skład obejmuje „każdego z typem”. Potrzebna jest funkcja `security definer`, która zwraca same sumy. Ujawnia ona tylko to, że ktoś typował, nie co.
- Stawki w smoke są współdzielone i nieznane z góry, więc oczekiwane punkty wynikają ze stawek zapamiętanych na początku przebiegu, a po kroku zmiany stawek z nowych.

## What We're NOT Doing

- Ochrona ręcznie wpisanego wyniku przed ponownym importem Ekstraklasy. Import nadpisze wynik, a punkty pójdą za nim.
- Zamrażanie punktów po zmianie stawek i blokada zmiany stawek po pierwszym wyniku. Zmiana stawek przelicza wszystkie rozliczone typy.
- Wpisywanie wyniku przed rozpoczęciem meczu i jakakolwiek granica „mecz zakończony” inna niż `starts_at`.
- Trzecie kryterium remisu (np. kto wcześniej wytypował). Pełny remis to wspólne miejsce.
- Konta bez żadnego typu w klasyfikacji.
- Osobna strona klasyfikacji i nowy link w Topbarze. Klasyfikacja jest na `/league`.
- Okno potwierdzenia „Usuń wynik”. Usunięcie jest odwracalne przez ponowne wpisanie wyniku.
- Powiadomienia po wpisaniu wyniku, historia typów, statystyki i skuteczność (Parked w roadmapie).
- Edycja drużyn albo terminu meczu (S-05). Polityka UPDATE na `matches` obejmuje tu tylko kolumny wyniku.
- Test runner (AGENTS.md).

## Implementation Approach

Kolejność jak w S-01–S-03. Najpierw baza: niezmiennik punktów, uprawnienia i funkcja klasyfikacji, sprawdzone SQL-em przed jakimkolwiek UI. Potem endpoint i strona meczu jako ścieżka SSR bez JavaScriptu, następnie lista z dialogiem i klasyfikacja, na końcu smoke i dokumentacja. Reguła punktacji istnieje w jednym miejscu (SQL). Aplikacja nigdy nie liczy punktów, tylko je czyta. Zapis wyniku idzie klientem Supabase z tokenem użytkownika, więc RLS obowiązuje także na ścieżce aplikacji.

## Critical Implementation Details

**Granty `tips` a istniejący upsert.** Zamiana grantów tabelowych na kolumnowe może po cichu zepsuć zapis typu (S-02), jeśli zabraknie któregoś z kolumn payloadu upsertu. Po migracji trzeba sprawdzić zapis i poprawkę typu w UI oraz przejść istniejące kroki smoke z typami.

**Kolejność w smoke.** Krok „list shows only own tip after kick-off” oczekuje, że pracownik nie ma typu na rozpoczętym meczu. Typ pracownika na ten mecz service role wstawia dopiero po nim. Kroki punktów przed zmianą stawek liczą się ze stawek zapamiętanych, a po niej z nowych. Sprzątanie się nie zmienia, bo usunięcie meczów kasuje typy kaskadowo, a stawki wracają do zapamiętanych.

## Phase 1: Baza — punkty i klasyfikacja

### Overview

Migracja wprowadza kolumnę punktów i jej niezmiennik, uprawnienie organizatora do wyniku, zawężone granty `tips` i funkcję klasyfikacji. Faza kończy się sprawdzeniem SQL-em na lokalnym stacku.

### Changes Required:

#### 1. Migracja punktów i klasyfikacji

**File**: `supabase/migrations/20261007120000_points_and_standings.sql`

**Intent**: Punkty są zapisywane przy typie (FR-010) i zawsze zgodne z wynikiem i stawkami, kto by ich nie zmienił. Organizator może zmienić tylko wynik, i tylko po starcie meczu. Użytkownik nie może wpisać sobie punktów. Komentarz na górze pliku opisuje niezmiennik i decyzję „zmiana stawek przelicza wszystko”.

**Contract**:
- `public.tips.points smallint null`.
- `public.tip_points(tip_a, tip_b, result_a, result_b, exact_points, outcome_points) returns smallint`, `immutable`:
  - `null`, gdy wynik jest `null`;
  - `exact_points`, gdy typ równa się wynikowi;
  - `outcome_points`, gdy `sign(tip_a - tip_b) = sign(result_a - result_b)`;
  - w pozostałych przypadkach `0`.

  Jedyne miejsce reguły punktacji. Bez execute dla `public, anon, authenticated`.
- Trigger `BEFORE INSERT OR UPDATE` na `tips` ustawia `new.points` z wyniku meczu i bieżących stawek (funkcja `security definer`, `set search_path = ''`), nadpisując każdą podaną wartość.
- Trigger `AFTER UPDATE OF score_a, score_b` na `matches` przelicza `points` wszystkich typów meczu, także na `null` po usunięciu wyniku. Trigger `AFTER UPDATE OF exact_points, outcome_points` na `league_settings` przelicza wszystkie typy meczów z wynikiem. Obie ścieżki to jedna funkcja `security definer` (np. `recompute_points(match_id bigint)`, gdzie `null` oznacza wszystkie), bez execute dla klientów.
- `tips_set_updated_at` odtworzony jako `BEFORE UPDATE OF score_a, score_b`.
- Polityka `matches_update_result_organizer`: `for update to authenticated using (public.is_organizer() and not public.match_is_open(id)) with check (to samo)`; `grant update (score_a, score_b) on public.matches to authenticated`.
- `revoke insert, update on public.tips from authenticated`, potem `grant insert (match_id, user_id, score_a, score_b), update (match_id, user_id, score_a, score_b) on public.tips to authenticated`. `select` zostaje.
- `public.league_standings() returns table (rank bigint, user_id uuid, display_name text, points bigint, exact_count bigint)`, `stable security definer set search_path = ''`:
  - skład: każdy `user_id` z co najmniej jednym typem;
  - `points` to suma `coalesce(points, 0)`;
  - `exact_count` to liczba typów równych wynikowi meczu;
  - `rank() over (order by points desc, exact_count desc)`;
  - kolejność wierszy: rank, potem `display_name` (null na końcu), potem `user_id`.

  Execute tylko dla `authenticated`.
- Backfill na końcu migracji: jednorazowe przeliczenie wszystkich typów, bo zaimportowane mecze mogą już mieć wynik.

### Success Criteria:

#### Automated Verification:

- Migracje stosują się od zera: `npx supabase db reset`
- `npx astro check` i `npm run lint` przechodzą (bez zmian w TS ta faza nie może ich zepsuć)

#### Manual Verification:

- SQL na lokalnym stacku: typ 2:1, wynik meczu 2:1 → `points = exact_points`; wynik 3:0 → `outcome_points`; 0:1 → `0`; usunięcie wyniku → `null`
- Zmiana stawek przez `update league_settings` przelicza `points` rozliczonych typów, a `tips.updated_at` się nie zmienia
- `league_standings()` dla dwóch graczy z równymi punktami i różną liczbą dokładnych daje rank 1 i 2, a przy pełnym remisie 1 i 1

**Implementation Note**: Po automatycznych sprawdzeniach zatrzymaj się na ręczne potwierdzenie SQL-em przed fazą 2.

---

## Phase 2: Wpisanie wyniku i strona meczu

### Overview

Typy, serwisy, endpoint wyniku i ścieżka SSR na stronie meczu: organizator zapisuje, poprawia i usuwa wynik, wszyscy widzą wynik i punkty przy typach.

### Changes Required:

#### 1. Typy

**File**: `src/types.ts`

**Intent**: Mecz niesie swój wynik, a typ swoje punkty, żeby widoki je pokazały.

**Contract**: `Match` dostaje `score_a: number | null; score_b: number | null`, a `Tip` dostaje `points: number | null` (dziedziczy `MatchTip`). Nowe `MatchResultInput { score_a: number; score_b: number }` oraz `StandingsRow { rank; user_id; display_name: string | null; points; exact_count }`.

#### 2. Serwisy

**File**: `src/lib/services/matches.ts`, `src/lib/services/tips.ts`

**Intent**: Odczyty zwracają wynik i punkty, a nowy zapis wyniku przechodzi przez RLS z tokenem organizatora.

**Contract**:
- Selecty `listMatches`, `getMatch` i `createMatch` dostają `score_a, score_b`.
- Nowa funkcja `setMatchResult(supabase, id, result: MatchResultInput | null)` robi `update … .eq("id", id).select(...).single<Match>()`. Zero wierszy z RLS daje błąd i komunikat „Nie udało się zapisać wyniku”.
- `listOwnTips`, `listMatchTips` i `saveTip` wybierają też `points`.
- Nowa funkcja `getOwnTip(supabase, userId, matchId)` zwraca `{ data: Tip | null, error }`.

#### 3. Endpoint wyniku

**File**: `src/pages/api/results.ts`

**Intent**: Jedno wejście dla formularza na stronie meczu i dialogu na liście, ze sprawdzeniami w tej samej kolejności co `/api/tips`.

**Contract**: `POST`, pola `match_id`, `score_a`, `score_b`, `action` (`clear` usuwa wynik, inna wartość albo brak zapisuje). Kolejność kontroli:

| Kontrola | Status | Komunikat i cel błędu |
| --- | --- | --- |
| brak klienta Supabase | 500 | `/matches?error=` |
| `locals.role !== "organizer"` | 403 | „Tylko organizator może wpisywać wyniki”, na `/matches/{id}` przy poprawnym `match_id`, inaczej `/matches` |
| `matchIdSchema` | 400 | `/matches?error=` |
| `getMatch` zwraca błąd albo brak meczu | 500 / 404 | `/matches?error=` przy braku meczu |
| mecz jeszcze się nie rozpoczął | 409 | „Wynik można wpisać dopiero po rozpoczęciu meczu”, na `/matches/{id}` |
| `scoresSchema` (tylko przy zapisie) | 400 | `/matches/{id}?error=` |

Po kontrolach endpoint woła `setMatchResult`. Sukces: redirect na `/matches/{id}` albo JSON `{ match, tip }`, gdzie `tip` pochodzi z `getOwnTip` po zapisie, z punktami policzonymi już przez trigger.

#### 4. Ochrona trasy

**File**: `src/middleware.ts`

**Intent**: Anonim nie dociera do endpointu.

**Contract**: `"/api/results"` w `PROTECTED_ROUTES`.

#### 5. Strona meczu

**File**: `src/pages/matches/[id].astro`

**Intent**: Wynik i punkty widoczne przy meczu (FR-014, FR-015) oraz formularz organizatora z poprawką i usunięciem.

**Contract**:
- Pod datą: `Wynik: {a}:{b}` z `data-testid="match-result"` i `data-result`, pusty, gdy brak wyniku.
- Na liście typów po starcie przy każdym typie widać `{points} pkt`, gdy mecz ma wynik.
- Organizator przy `!isOpen` dostaje `<form method="POST" action="/api/results">` (`data-testid="result-form"`) z polami wypełnionymi bieżącym wynikiem, przyciskiem „Zapisz wynik” i, gdy wynik jest, `<button name="action" value="clear" formnovalidate>Usuń wynik</button>`.
- Banner `?error=` już istnieje.

### Success Criteria:

#### Automated Verification:

- `npx astro check` przechodzi
- `npm run lint` przechodzi
- `npm run build` przechodzi

#### Manual Verification:

- Organizator na rozpoczętym meczu zapisuje 2:1 i widzi wynik oraz punkty przy typach; poprawka na 1:1 zmienia punkty; „Usuń wynik” usuwa wynik i punkty
- Pracownik na tej stronie widzi wynik i punkty, ale nie widzi formularza; ręczny POST pracownika wraca z komunikatem organizatora
- Organizator na meczu przed startem nie widzi formularza wyniku; ręczny POST wraca z komunikatem o rozpoczęciu
- Zapis i poprawka typu na przyszłym meczu dalej działają (granty kolumnowe nie zepsuły upsertu)

**Implementation Note**: Po automatycznych sprawdzeniach zatrzymaj się na ręczne potwierdzenie przed fazą 3.

---

## Phase 3: Lista i klasyfikacja

### Overview

Wynik i punkty w tabeli `/matches`, dialog wyniku dla organizatora i klasyfikacja na `/league`.

### Changes Required:

#### 1. Kolumny tabeli

**File**: `src/components/matches/columns.tsx`

**Intent**: Typ, wynik i punkty obok siebie w jednym wierszu. Organizator wpisuje wynik prosto z listy.

**Contract**:
- `MatchColumnsOptions` dostaje `isOrganizer` i `onResultClick(matchId, trigger)`.
- Kolumna „Wynik” (zawsze widoczna):
  - element z `data-result="{a}:{b}"` albo `data-result=""`;
  - organizator na rozpoczętym meczu widzi przycisk-link (tekst wyniku albo „wpisz wynik”, `aria-haspopup="dialog"`);
  - pozostali widzą tekst albo „—”.
- Kolumna „Pkt” (tylko przy `showTips`): element z `data-points="{points}"` albo `data-points=""`.
- Mobilny układ zgodny z istniejącymi kolumnami (`meta.className`). Kolumna Data jest już ukryta na wąskim ekranie, więc Wynik i Pkt zostają widoczne.

#### 2. Dialog wyniku

**File**: `src/components/matches/ResultDialog.tsx`

**Intent**: Ta sama operacja co formularz na stronie meczu, bez przeładowania. Wzorowany na `TipDialog`.

**Contract**:
- Props: `match: Match | null`, `isOpen`, `onOpenChange`, `onSaved(match: Match, tip: Tip | null)`, `onCloseAutoFocus`.
- react-hook-form z `scoresSchema`.
- „Zapisz wynik” wysyła `postForm("/api/results", { match_id, score_a, score_b })`.
- „Usuń wynik” jest widoczny, gdy mecz ma wynik, i wysyła `{ match_id, action: "clear" }` bez walidacji pól.
- Błąd serwera trafia do `ServerError`. Sukces zamyka dialog i pokazuje toast („Zapisano wynik 2:1” albo „Usunięto wynik”).

#### 3. Spięcie w tabeli

**File**: `src/components/matches/MatchesTable.tsx`

**Intent**: Po zapisie wyniku wiersz pokazuje nowy wynik i punkty bez przeładowania.

**Contract**:
- Stan wybranego meczu i triggera dla dialogu wyniku, wzorem dialogu typu (fokus wraca na przycisk).
- `onSaved` podmienia mecz w `matchList`, a gdy `tip !== null`, także wpis w `tipByMatch`.
- Kliknięcie odświeża `clock`, tak jak przy typie.

#### 4. Serwis klasyfikacji

**File**: `src/lib/services/league.ts`

**Intent**: Odczyt klasyfikacji w jednym miejscu.

**Contract**: `listStandings(supabase)` woła `rpc("league_standings")` i zwraca `{ data: StandingsRow[], error }` (komunikat „Nie udało się wczytać klasyfikacji”). Liczby z `bigint` muszą trafić do `StandingsRow` jako `number`.

#### 5. Klasyfikacja na `/league`

**File**: `src/pages/league.astro`

**Intent**: Ranking użytkowników (FR-020) przy regule, z której wynika.

**Contract**:
- Sekcja „Klasyfikacja” pod punktacją, niezależna od błędu stawek (własny banner błędu).
- Statyczna tabela `.astro` z `data-testid="standings"`.
- Każdy wiersz ma `data-user="{display_name}"`, `data-rank`, `data-points` i `data-exact`, a wiersz zalogowanego jest pogrubiony i oznaczony „(Ty)”.
- Pusty stan: „Nikt jeszcze nie typował”.
- Pod tabelą zdanie: „Przy równej liczbie punktów wyżej jest osoba z większą liczbą dokładnych wyników; przy pełnym remisie miejsce jest wspólne.”

### Success Criteria:

#### Automated Verification:

- `npx astro check` przechodzi
- `npm run lint` przechodzi
- `npm run build` przechodzi

#### Manual Verification:

- Organizator wpisuje, poprawia i usuwa wynik z dialogu na liście; wiersz od razu pokazuje wynik i własne punkty, a fokus wraca na przycisk
- Pracownik na liście widzi Wynik i Pkt bez przycisku wyniku; na meczu przed startem kolumna Wynik pokazuje „—”
- `/league` pokazuje klasyfikację z poprawną kolejnością i wspólnym miejscem przy pełnym remisie; po zmianie stawek punkty w klasyfikacji i na liście się zmieniają
- Widok mobilny (wąskie okno) listy i klasyfikacji jest czytelny, bez poziomego przewijania strony

**Implementation Note**: Po automatycznych sprawdzeniach zatrzymaj się na ręczne potwierdzenie przed fazą 4.

---

## Phase 4: Smoke i dokumentacja

### Overview

Smoke dowodzi reguł S-04 przez UI i bezpośrednio przez REST Supabase, a dokumentacja opisuje nowe kroki.

### Changes Required:

#### 1. Kroki smoke

**File**: `scripts/smoke.mjs`

**Intent**: Każda reguła S-04 ma krok, który by ją złapał, w kolejności opisanej w „Critical Implementation Details”.

**Contract**: Krok 1 jest anonimowy (zawsze, bez service role) i stoi obok istniejących anonimowych kroków `/matches/1` i `POST /api/tips`. Kroki 2–13 są w sekcji organizatora (service role wymagany), w tej kolejności:

1. Anonimowy `POST /api/results` przekierowuje na `/auth/signin`.
2. `POST /api/results` pracownika na rozpoczętym meczu przekierowuje na `/matches/{id}?error=` z komunikatem organizatora, a service role czyta wynik nadal `null`.
3. Bezpośredni `PATCH /rest/v1/matches` wyniku z tokenem pracownika niczego nie zmienia: 200 z pustą tablicą albo 401/403, a service role czyta `null`.
4. Bezpośredni `PATCH /rest/v1/tips?…` z `points` na własnym przyszłym typie pracownika zwraca 401/403.
5. `POST /api/results` organizatora na przyszłym meczu przekierowuje na `/matches/{id}?error=`.
6. Service role wstawia pracownikowi typ 2:0 na rozpoczęty mecz, po istniejącym kroku „list shows only own tip after kick-off”.
7. Organizator zapisuje 2:0 przez `/api/results` i dostaje redirect na `/matches/{id}`.
8. Wiersz pracownika (`matchRow`) ma `data-result="2:0"` i `data-points` równe zapamiętanemu `exact_points`.
9. Service role czyta 1:0 organizatora z `points` równym zapamiętanemu `outcome_points`.
10. `/league` pracownika: wiersze obu kont smoke (`data-user` z zamaskowanymi e-mailami) mają odpowiednie `data-points` i `data-exact`, a `data-rank` pracownika jest mniejszy niż organizatora.
11. Po istniejącym kroku zmiany stawek wiersz pracownika ma `data-points` równe nowemu `exact_points`.
12. Poprawka na 1:0 z `Accept: application/json` zwraca 200 i `match.score_a = 1`, a punkty się zamieniają: pracownik dostaje nowe `outcome_points`, organizator nowe `exact_points`.
13. `action=clear` przekierowuje na `/matches/{id}`, wiersz pracownika ma `data-result=""` i `data-points=""`, a service role czyta `points` `null`.

Sprzątanie bez zmian.

#### 2. Opis smoke i dokumentacja

**File**: `CLAUDE.md` (§ Verification), `README.md` (Smoke test, Roles)

**Intent**: Opis kroków smoke zostaje jedynym źródłem ich listy w repo, a README mówi, że organizator wpisuje wyniki i jak liczą się punkty i klasyfikacja.

**Contract**: Akapit Verification w `CLAUDE.md` dostaje kroki z punktu 1 w tej samej kolejności. README dostaje krótki opis wyniku, punktów (zmiana stawek przelicza wszystko) i klasyfikacji.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` przechodzi
- `npm run lint` przechodzi
- `npm run build` przechodzi
- `npm run smoke:local` przeciw `npm run dev:local` kończy się bez FAIL i SKIP

#### Manual Verification:

- Opis w `CLAUDE.md` § Verification zgadza się z kolejnością kroków w `scripts/smoke.mjs`
- Po przebiegu smoke w lokalnej bazie nie ma meczów ani kont smoke, a stawki są takie jak przed przebiegiem

**Implementation Note**: Po automatycznych sprawdzeniach zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- Brak: projekt nie ma test runnera (AGENTS.md). Regułę `tip_points` sprawdza SQL w fazie 1 i smoke w fazie 4.

### Integration Tests:

- `npm run smoke:local`:
  - zapis, poprawka (JSON) i usunięcie wyniku;
  - punkty za dokładny wynik, trafiony rezultat i błędny typ;
  - przeliczenie po zmianie stawek;
  - odmowy dla pracownika w endpoincie i w REST (wynik i `points`);
  - granica „po rozpoczęciu”;
  - kolejność klasyfikacji.

### Manual Testing Steps:

1. Jako organizator dodaj mecz z datą w przeszłości, a jako dwóch graczy (service role albo wcześniejszy mecz) miej typy 2:1 i 1:0.
2. Wpisz wynik 2:1 na stronie meczu: pierwszy gracz dostaje stawkę dokładną, drugi stawkę za rezultat.
3. Popraw wynik w dialogu na liście na 1:0 i sprawdź zamianę punktów na liście, na stronie meczu i w `/league`.
4. Zmień stawki na `/league` i sprawdź, że punkty i klasyfikacja się przeliczyły.
5. Usuń wynik i sprawdź, że punkty zniknęły, a gracze zostali w klasyfikacji z 0 pkt.

## Performance Considerations

Zmiana stawek przelicza wszystkie rozliczone typy jednym `update`, co przy skali jednej firmy (setki osób, sezon meczów) to ułamek sekundy. `league_standings()` agreguje całe `tips` przy każdym wejściu na `/league`. Indeks `tips_user_id_idx` i PK wystarczą, bez cache.

## Migration Notes

Migracja jest addytywna: nowa kolumna nullable, nowe funkcje, triggery i polityka. Zmiana grantów `tips` zawęża uprawnienia, nie rozszerza ich. Backfill przelicza punkty istniejących typów (zaimportowane rozegrane mecze nie mają typów, więc zwykle niczego nie zmienia). Na produkcję migracja idzie ręcznym `db push` przed `wrangler deploy`, bo nowy kod czyta `points` i wywołuje `league_standings()`.

## References

- Roadmap: `context/foundation/roadmap.md` (S-04)
- PRD: `context/foundation/prd.md` (US-01, FR-009, FR-010, FR-014, FR-015, FR-020, Business Logic)
- Stawki (S-03): `context/archive/2026-10-06-set-league-point-stakes/plan.md`, `supabase/migrations/20261007000000_league_settings.sql`
- Typy i RLS (S-02): `supabase/migrations/20261004120000_tips_and_display_names.sql`
- Kolumny wyniku: `supabase/migrations/20261006000000_match_scores_and_external_ids.sql`
- Wzorzec endpointu JSON i redirect: `src/pages/api/tips.ts`
- Wzorzec dialogu: `src/components/matches/TipDialog.tsx`, `src/components/matches/MatchesTable.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza — punkty i klasyfikacja

#### Automated

- [x] 1.1 Migracje stosują się od zera: `npx supabase db reset` — 101fecd
- [x] 1.2 `npx astro check` i `npm run lint` przechodzą (bez zmian w TS ta faza nie może ich zepsuć) — 101fecd

#### Manual

- [x] 1.3 SQL na lokalnym stacku: typ 2:1, wynik meczu 2:1 → `points = exact_points`; wynik 3:0 → `outcome_points`; 0:1 → `0`; usunięcie wyniku → `null` — 101fecd
- [x] 1.4 Zmiana stawek przez `update league_settings` przelicza `points` rozliczonych typów, a `tips.updated_at` się nie zmienia — 101fecd
- [x] 1.5 `league_standings()` dla dwóch graczy z równymi punktami i różną liczbą dokładnych daje rank 1 i 2, a przy pełnym remisie 1 i 1 — 101fecd

### Phase 2: Wpisanie wyniku i strona meczu

#### Automated

- [x] 2.1 `npx astro check` przechodzi — ed26487
- [x] 2.2 `npm run lint` przechodzi — ed26487
- [x] 2.3 `npm run build` przechodzi — ed26487

#### Manual

- [x] 2.4 Organizator na rozpoczętym meczu zapisuje 2:1 i widzi wynik oraz punkty przy typach; poprawka na 1:1 zmienia punkty; „Usuń wynik” usuwa wynik i punkty — ed26487
- [x] 2.5 Pracownik na tej stronie widzi wynik i punkty, ale nie widzi formularza; ręczny POST pracownika wraca z komunikatem organizatora — ed26487
- [x] 2.6 Organizator na meczu przed startem nie widzi formularza wyniku; ręczny POST wraca z komunikatem o rozpoczęciu — ed26487
- [x] 2.7 Zapis i poprawka typu na przyszłym meczu dalej działają (granty kolumnowe nie zepsuły upsertu) — ed26487

### Phase 3: Lista i klasyfikacja

#### Automated

- [x] 3.1 `npx astro check` przechodzi
- [x] 3.2 `npm run lint` przechodzi
- [x] 3.3 `npm run build` przechodzi

#### Manual

- [ ] 3.4 Organizator wpisuje, poprawia i usuwa wynik z dialogu na liście; wiersz od razu pokazuje wynik i własne punkty, a fokus wraca na przycisk
- [ ] 3.5 Pracownik na liście widzi Wynik i Pkt bez przycisku wyniku; na meczu przed startem kolumna Wynik pokazuje „—”
- [ ] 3.6 `/league` pokazuje klasyfikację z poprawną kolejnością i wspólnym miejscem przy pełnym remisie; po zmianie stawek punkty w klasyfikacji i na liście się zmieniają
- [ ] 3.7 Widok mobilny (wąskie okno) listy i klasyfikacji jest czytelny, bez poziomego przewijania strony

### Phase 4: Smoke i dokumentacja

#### Automated

- [ ] 4.1 `npx supabase db reset` przechodzi
- [ ] 4.2 `npm run lint` przechodzi
- [ ] 4.3 `npm run build` przechodzi
- [ ] 4.4 `npm run smoke:local` przeciw `npm run dev:local` kończy się bez FAIL i SKIP

#### Manual

- [ ] 4.5 Opis w `CLAUDE.md` § Verification zgadza się z kolejnością kroków w `scripts/smoke.mjs`
- [ ] 4.6 Po przebiegu smoke w lokalnej bazie nie ma meczów ani kont smoke, a stawki są takie jak przed przebiegiem
