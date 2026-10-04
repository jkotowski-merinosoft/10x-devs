# Własny typ (S-02) Implementation Plan

## Overview

Zalogowany użytkownik (pracownik albo organizator) wpisuje typ meczu jako wynik A:B na stronie `/matches/[id]` i może go poprawiać do startu meczu. Do startu meczu nikt nie widzi cudzego typu ani go nie zmieni. Po starcie strona meczu pokazuje typy wszystkich, podpisane zamaskowanym e-mailem. Lista `/matches` linkuje do strony meczu i pokazuje własny typ oraz status typowania. To roadmap S-02 (PRD US-01, FR-012, FR-013) i dane wejściowe dla punktacji w S-04.

## Current State Analysis

- `public.matches` (`side_a`, `side_b`, `starts_at timestamptz`) jest czytelna dla każdego zalogowanego, a zapis ma tylko organizator przez RLS `is_organizer()` (`supabase/migrations/20261001000000_profiles_and_matches.sql:59-90`).
- `public.profiles` ma tylko `user_id`, `role` i `created_at`, a polityka select pozwala czytać wyłącznie własny wiersz (`20261001000000_profiles_and_matches.sql:7-19`). Nie ma czym podpisać cudzego typu, a `auth.users` nie jest czytelna dla `authenticated`.
- Trigger `handle_new_user()` tworzy profil przy rejestracji z `on conflict do nothing` (`supabase/migrations/20261004000000_harden_profiles_and_matches.sql:23-35`). Błąd w nim przerywa rejestrację.
- Wzorzec S-01: formularz HTML → `POST /api/...` → zod → serwis w `src/lib/services/` → redirect z `?error=` (`src/pages/api/matches.ts`, `src/lib/services/matches.ts`). Rola leży w `Astro.locals.role` (`src/middleware.ts:17-25`).
- `PROTECTED_ROUTES` sprawdza prefiks przez `startsWith` (`src/middleware.ts:5,34`), więc `/matches` chroni też `/matches/[id]`. `/api/tips` trzeba dopisać.
- Lista `/matches` renderuje wiersze bez linków (`src/pages/matches.astro:69-78`) i używa `class:list` (zgłoszone w review S-01 jako F5).
- Smoke ma kroki organizatora z kluczem service role, sprzątanie i asercje `contains`/`notContains` (`scripts/smoke.mjs:122-205`).
- Lekcje z review S-01 (`context/archive/2026-10-01-add-match-to-shared-list/reviews/impl-review.md`) przyjmujemy jako założenia:
  - odebrać `anon` uprawnienia do nowych tabel i funkcji;
  - FK z jawnym `on delete`;
  - błąd DB nie może wyglądać jak pusta lista;
  - smoke sprząta po sobie.

## Desired End State

- Tabela `public.tips` z jednym typem na osobę i mecz (`score_a`, `score_b` w 0–99). RLS pozwala dodać lub zmienić **tylko własny** typ i **tylko gdy `now() < starts_at`**. Czytać można własny typ zawsze, a cudze dopiero po starcie meczu. Delete nie istnieje.
- `profiles.display_name` z zamaskowanym e-mailem dla każdego konta (trigger + backfill). `profiles` jest czytelna dla wszystkich zalogowanych.
- `/matches/[id]`:
  - przed startem: formularz typu wypełniony własnym typem i podpowiedź o punktach za zwycięzcę;
  - po starcie: własny typ tylko do odczytu i lista typów wszystkich;
  - nieistniejący mecz: 404.
- `/matches`: każdy mecz jest linkiem i pokazuje „Twój typ: A:B” albo „brak typu” oraz status „otwarte” lub „zamknięte”.
- `npm run smoke` w CI dowodzi każdej reguły S-02, a kroki organizatora mają `PASS`.

### Key Discoveries:

- Upsert przez PostgREST to `INSERT ... ON CONFLICT DO UPDATE`. Pod RLS musi przejść polityka insert, a dla istniejącego wiersza także select (`using`) i update (`using` + `with check`). Wszystkie trzy muszą przepuszczać własny typ na otwarty mecz.
- Polityka select na `tips` zwraca cudze typy dla meczów po starcie. Każde zapytanie o „mój typ” musi więc jawnie filtrować `user_id = <ja>`, inaczej lista pokaże cudzy typ jako własny.
- Otwarcie odczytu `profiles` ujawnia każdemu zalogowanemu `role` innych osób przez REST. Zaakceptowane świadomie, bo to aplikacja firmowa, a alternatywą była funkcja `security definer` z większą ilością kodu.
- Granica czasu jest liczona w bazie (`now()` w RLS). Endpoint sprawdza ją wcześniej tylko po to, by zwrócić czytelny komunikat.

## What We're NOT Doing

- Tryb „wskaż zwycięzcę” (select Remis / strona A / strona B). Typ jest zawsze wynikiem. Wrócimy do tego, jeśli zgłoszą to użytkownicy.
- Usuwanie typu, ręczne zamykanie typowania (FR-005) i reakcja typów na zmianę `starts_at` (S-05).
- Nazwy wyświetlane ustawiane przez użytkownika ani ich edycja (kolumna `display_name` jest na nie gotowa).
- Wynik meczu, punkty i ranking (S-03, S-04).
- Formularz zbiorczy dla wielu meczów i React. Wszystko zostaje w `.astro` + formularzu HTML.
- Ukrywanie `role` innych osób.
- Test runner (AGENTS.md).

## Implementation Approach

Kolejność taka jak w S-01: najpierw schemat z RLS jako właściwą barierą, potem serwis, endpoint i widoki, na końcu smoke dowodzący każdej reguły przez UI i bezpośrednio przez REST Supabase. Typ zapisuje się przez klienta Supabase z tokenem użytkownika, więc RLS obowiązuje także dla ścieżki aplikacji.

## Critical Implementation Details

**Zmiana triggera rejestracji.** `handle_new_user()` dostaje `display_name`. Błąd w `mask_email()` przerwałby każdą rejestrację. Funkcja nie może więc rzucać wyjątków (null albo adres bez `@` → `null`), a istniejący krok smoke „signup creates account” jest kontrolą regresji.

**Reguła maski (decyzja użytkownika).** Część przed `@` zostaje. W domenie maskowany jest człon do pierwszej kropki: pierwsza litera + `..` + ostatnia litera, a reszta domeny od pierwszej kropki zostaje. Przykłady kontrolne:
- `jkotowski@gmail.com` → `jkotowski@g..l.com`
- `jkotowski@merinosoft.com` → `jkotowski@m..t.com`
- `jkotowski@merinosoft.com.pl` → `jkotowski@m..t.com.pl`
- `smoke-1@example.com` → `smoke-1@e..e.com`
- `a@localhost` → `a@l..t`

## Phase 1: Schemat i RLS

### Overview

Migracja zakłada `tips` z politykami, dodaje `display_name` do profili i otwiera ich odczyt. Typy TS dostają nowe encje.

### Changes Required:

#### 1. Migracja typów i podpisów

**File**: `supabase/migrations/20261004120000_tips_and_display_names.sql`

**Intent**: Dodać tabelę typów z RLS, które wymusza właściciela, granicę czasu i ukrycie cudzych typów przed startem. Dodać zamaskowany podpis użytkownika czytelny dla zalogowanych.

**Contract**:
- `public.mask_email(email text) returns text`: `immutable`, `set search_path = ''`, reguła z „Critical Implementation Details”; zwraca `null` dla `null` albo adresu bez `@`. `revoke execute ... from public, anon, authenticated` (wywołują ją tylko trigger i migracja).
- `profiles.display_name text` (nullable). `handle_new_user()` wstawia `(user_id, display_name) = (new.id, public.mask_email(new.email))` z `on conflict (user_id) do nothing`. Backfill: `update profiles set display_name = mask_email(u.email) from auth.users u where ...`.
- Polityka `profiles_select_own` zastąpiona przez `profiles_select_authenticated` (`for select to authenticated using (true)`). Brak polityk insert i update na `profiles` (rola nadal tylko przez SQL).
- `public.tips`:
  - `match_id bigint not null references public.matches (id) on delete cascade`
  - `user_id uuid not null default auth.uid() references public.profiles (user_id) on delete cascade` (FK do `profiles` umożliwia embed `profiles(display_name)` w PostgREST; usunięcie konta kasuje profil, a z nim typy)
  - `score_a smallint not null`, `score_b smallint not null`, każdy z check `between 0 and 99`
  - `created_at`, `updated_at timestamptz not null default now()`; `updated_at` ustawiany triggerem `before update`
  - `primary key (match_id, user_id)`; indeks na `(user_id)` dla listy własnych typów
- Funkcja pomocnicza `public.match_is_open(match_id bigint) returns boolean` (`stable`, `security definer`, `set search_path = ''`): `exists (select 1 from public.matches where id = match_id and starts_at > now())`. `revoke` od `public, anon`, `grant execute` dla `authenticated`.
- RLS na `tips`:
  - `tips_select_own_or_started`: `for select to authenticated using (user_id = (select auth.uid()) or not public.match_is_open(match_id))`
  - `tips_insert_own_open`: `for insert to authenticated with check (user_id = (select auth.uid()) and public.match_is_open(match_id))`
  - `tips_update_own_open`: `for update to authenticated using (user_id = (select auth.uid()) and public.match_is_open(match_id)) with check (` to samo `)`
- Uprawnienia: `revoke all on public.tips from anon`; `grant select, insert, update on public.tips to authenticated` (bez delete).
- `not match_is_open()` dla nieistniejącego meczu daje `true`, ale FK nie pozwala na typ bez meczu, więc to bez znaczenia.

#### 2. Typy współdzielone

**File**: `src/types.ts`

**Intent**: Opisać typ i jego widok z podpisem dla serwisu i stron.

**Contract**:
- `Tip { match_id: number; score_a: number; score_b: number }`
- `MatchTip extends Tip { user_id: string; display_name: string | null }`
- `SaveTipInput { match_id: number; score_a: number; score_b: number }`

### Success Criteria:

#### Automated Verification:

- Migracje stosują się od zera: `npx supabase db reset`
- `npx astro check` bez błędów
- `npm run lint` bez błędów
- `npm run build` przechodzi
- Istniejący `npm run smoke` (z kluczami z `npx supabase status -o env`) przechodzi w całości, w tym rejestracja przez zmieniony trigger

#### Manual Verification:

- Po `db reset` i rejestracji kont `x@gmail.com` i `x@merinosoft.com.pl` w Studio `profiles.display_name` ma wartości `x@g..l.com` i `x@m..t.com.pl`
- W SQL editorze jako użytkownik A (`set local role authenticated` + `request.jwt.claims`): insert typu na mecz w przyszłości działa, na mecz w przeszłości jest odrzucony, a typu B na przyszły mecz A nie widzi

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Typowanie i widoki

### Overview

Serwis typów, endpoint zapisu, strona meczu i rozszerzona lista.

### Changes Required:

#### 1. Serwis meczów i typów

**File**: `src/lib/services/matches.ts`, `src/lib/services/tips.ts` (nowy)

**Intent**: Zamknąć zapytania w serwisach według wzorca `listMatches` / `createMatch`: `{ data, error }`, błąd DB logowany przez `console.error` i zamieniany na polski komunikat, nigdy nie podawany jako pusty wynik.

**Contract**:
- `getMatch(supabase, id: number): Promise<{ data: Match | null; error: string | null }>` w `matches.ts` (`maybeSingle`; `null` bez błędu = brak meczu).
- `listOwnTips(supabase, userId: string): Promise<{ data: Tip[]; error: string | null }>`: **jawny filtr `user_id = userId`** (patrz Key Discoveries).
- `listMatchTips(supabase, matchId: number): Promise<{ data: MatchTip[]; error: string | null }>`: `select("match_id, user_id, score_a, score_b, profiles(display_name)")`, spłaszczone do `MatchTip`, posortowane po `display_name` (null na końcu), remis po `user_id`.
- `saveTip(supabase, userId: string, input: SaveTipInput): Promise<{ error: string | null }>`: `upsert({ ...input, user_id: userId }, { onConflict: "match_id,user_id" })`. Błąd RLS (mecz zdążył się zacząć) daje komunikat „Nie udało się zapisać typu”.

#### 2. Endpoint zapisu typu

**File**: `src/pages/api/tips.ts`

**Intent**: Przyjąć formularz typu, zwalidować go i zapisać. Czytelne komunikaty dla złego wejścia i zamkniętego meczu; RLS pozostaje barierą.

**Contract**:
- `POST`, pola formularza `match_id`, `score_a`, `score_b`.
- Zod: `match_id` jako dodatnia liczba całkowita; `score_*` jako liczby całkowite 0–99 („Wynik musi być liczbą całkowitą od 0 do 99”).
- Brak klienta Supabase albo złe `match_id` → `/matches?error=`.
- `getMatch` zwraca `null` → `/matches?error=Nie ma takiego meczu`.
- `Date.now() >= new Date(starts_at).getTime()` → `/matches/{id}?error=Typowanie tego meczu jest zamknięte`.
- Inne błędy walidacji i zapisu → `/matches/{id}?error=...`.
- Sukces → `/matches/{id}`.
- Bez sprawdzania roli: typuje każdy zalogowany.

#### 3. Strona meczu

**File**: `src/pages/matches/[id].astro`

**Intent**: Jedno miejsce na typ i (w S-04) na wynik i punkty meczu. Pokazuje formularz przed startem, a po starcie typy wszystkich.

**Contract**:
- `id` niebędące dodatnią liczbą całkowitą albo brak meczu → `Astro.response.status = 404` i komunikat „Nie ma takiego meczu” z linkiem do `/matches`.
- Nagłówek: `side_a – side_b`, `formatWarsaw(starts_at)`, status „Typowanie otwarte do …” albo „Typowanie zamknięte”; `?error=` w banerze jak na `/matches`.
- **Otwarte** (`Date.now() < new Date(starts_at).getTime()`): formularz `POST /api/tips` z ukrytym `match_id` i dwoma polami `number` (`min=0 max=99 step=1 required`) podpisanymi nazwami stron, wypełnionymi własnym typem (z `listOwnTips` zawężonego do meczu albo z `listMatchTips`, filtrowanego po `user_id`). Przycisk „Zapisz typ” albo „Popraw typ”. Podpowiedź: „Trafiony zwycięzca albo remis też daje punkty, nawet przy innym wyniku.” Cudzych typów nie ma.
- **Zamknięte**: lista z `listMatchTips`, każdy wiersz to `display_name ?? "Użytkownik"` i `A:B`, a własny oznaczony „(Ty)”. Pusta lista → „Nikt nie wytypował tego meczu”. Błąd ładowania → baner błędu, nie pusta lista.
- Klasy łączone przez `cn()` (AGENTS.md); reużyć styl formularza z `matches.astro`.

#### 4. Lista meczów

**File**: `src/pages/matches.astro`

**Intent**: Pokazać przy każdym meczu, czy użytkownik już typował i czy typowanie jest otwarte, oraz prowadzić do strony meczu.

**Contract**:
- Dodatkowo `listOwnTips(supabase, Astro.locals.user.id)` → mapa `match_id → Tip`. Błąd → baner błędu (lista meczów nadal się renderuje).
- Wiersz: nazwy meczu jako `<a href="/matches/{id}">`, data, `Twój typ: A:B` albo `brak typu` i znacznik `otwarte`/`zamknięte` (`Date.now() < new Date(starts_at).getTime()`).
- Przy okazji `class:list` → `cn()` (F5 z review S-01).

#### 5. Ochrona trasy

**File**: `src/middleware.ts`

**Intent**: Anonim nie zapisze typu.

**Contract**: `PROTECTED_ROUTES` dostaje `"/api/tips"` (`/matches/[id]` jest już chronione przez prefiks `/matches`).

### Success Criteria:

#### Automated Verification:

- `npx astro check` bez błędów
- `npm run lint` bez błędów
- `npm run build` przechodzi
- Istniejący `npm run smoke` przechodzi w całości

#### Manual Verification:

- Pracownik zapisuje typ 2:1 na przyszły mecz, widzi go w formularzu i na liście jako „Twój typ: 2:1”, poprawia na 1:1 i widzi 1:1
- Wynik 100, -1 albo 1.5 (przez DevTools) jest odrzucony komunikatem na stronie meczu
- Drugie konto na tym samym przyszłym meczu nie widzi typu pierwszego ani na stronie meczu, ani na liście
- Mecz dodany z datą w przeszłości: strona nie ma formularza, pokazuje typy wszystkich z zamaskowanymi podpisami i „(Ty)” przy własnym; POST z formularza otwartego przed startem, wysłany po starcie, daje „Typowanie tego meczu jest zamknięte”
- `/matches/999999` i `/matches/abc` dają 404 z linkiem do listy
- Organizator też może typować

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Smoke i dokumentacja

### Overview

Smoke dowodzi każdej reguły S-02 przez UI i bezpośrednio przez REST Supabase. Opis smoke w `CLAUDE.md` odpowiada nowym krokom.

### Changes Required:

#### 1. Smoke test

**File**: `scripts/smoke.mjs`

**Intent**: Sprawdzać w CI zapis i poprawkę własnego typu, blokadę po starcie, ukrycie i nienaruszalność cudzego typu przed startem oraz widoczność z zamaskowanym podpisem po starcie. Organizator pełni rolę „drugiego użytkownika”, bo każdy zalogowany typuje.

**Contract**:
- Kroki bez klucza admina (`steps`): anonimowe `GET /matches/1` → 302 `/auth/signin`; anonimowe `POST /api/tips` → 302 `/auth/signin`.
- Kroki z kluczem (`organizerSteps`, po „employee sees organizer match”), w kolejności:
  1. organizator dodaje mecz w przeszłości (`side_a: Smoke Past A ${stamp}`, `side_b: Smoke Past B ${stamp}`, `starts_at: "2020-06-15T20:45"`) → 302 `/matches`;
  2. admin (service role) odczytuje `id` obu meczów smoke po `side_a`;
  3. pracownik zapisuje typ 97:3 na przyszły mecz → 302 `/matches/{id}` bez `?error=`;
  4. lista pracownika zawiera `97:3`;
  5. pracownik poprawia typ na 98:4 → 302; lista zawiera `98:4`, nie zawiera `97:3`;
  6. typ pracownika na mecz w przeszłości przez aplikację → 302 `/matches/{pastId}?error=`;
  7. bezpośredni `POST /rest/v1/tips` z tokenem pracownika na mecz w przeszłości → 401/403;
  8. `GET /rest/v1/tips?match_id=eq.{futureId}` z tokenem organizatora → pusta tablica;
  9. `PATCH /rest/v1/tips?match_id=eq.{futureId}&user_id=eq.{employeeId}` z tokenem organizatora (`return=representation`) → pusta tablica, a odczyt service role potwierdza 98:4;
  10. strona przyszłego meczu u organizatora nie zawiera `smoke-${stamp}@e..e.com`;
  11. admin wstawia typ organizatora 1:0 na mecz w przeszłości (service role omija RLS);
  12. lista pracownika zawiera `brak typu` i nie zawiera `1:0` (jawny filtr `user_id` po starcie; pracownik nie ma typu na mecz w przeszłości);
  13. strona meczu w przeszłości u pracownika zawiera `smoke-organizer-${stamp}@e..e.com` (dowód maski i widoczności po starcie).
- Tokeny i `user_id` pochodzą z `/auth/v1/token?grant_type=password`. Wspólny helper zamiast powtarzania kodu z kroku RLS dla meczów.
- Sprzątanie usuwa oba mecze smoke (typy kaskadowo), potem konta. Komentarz nagłówkowy mówi o „meczach”.
- Statusy i komunikaty wypisywane jak dotąd, nigdy tokeny.

#### 2. Opis smoke

**File**: `CLAUDE.md` (sekcja `## Verification`)

**Intent**: Opis kolejnych kroków smoke ma odpowiadać skryptowi.

**Contract**: Akapit o `scripts/smoke.mjs` dopisuje kroki z punktu 1 w tej samej formie zdania.

### Success Criteria:

#### Automated Verification:

- `npm run lint` bez błędów
- `npm run build` przechodzi
- `npm run smoke` lokalnie z kluczami z `npx supabase status -o env` i `SMOKE_REQUIRE_ADMIN=1`: wszystkie kroki `PASS`
- CI na PR: job smoke zielony, kroki typów jako `PASS`

#### Manual Verification:

- Po lokalnym smoke w Studio nie zostają mecze, typy ani konta smoke

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Brak (AGENTS.md: bez test runnera). Reguła maski jest sprawdzana przypadkami kontrolnymi w fazie 1 (ręcznie) i w smoke (`example.com`).

### Integration Tests:

- `scripts/smoke.mjs` (faza 3) to test integracyjny aplikacji, adaptera Cloudflare i RLS na lokalnym Supabase w CI.

### Manual Testing Steps:

1. Dwa konta, jeden mecz za godzinę, jeden wczoraj (organizator dodaje oba).
2. Konto A typuje i poprawia typ na przyszły mecz; B nie widzi typu A na liście ani na stronie.
3. Na meczu z wczoraj nie ma formularza; po wstawieniu typów (service role) obie osoby widzą oba typy z podpisami.
4. Wpis typu tuż przed startem i wysłanie formularza po starcie: komunikat o zamkniętym typowaniu.

## Performance Considerations

Lista wykonuje jedno dodatkowe zapytanie o własne typy (indeks `tips(user_id)`), a strona meczu jedno zapytanie z embedem profili (klucz główny `(match_id, user_id)`). `match_is_open()` w RLS to wyszukiwanie po kluczu głównym `matches`. Skala ligi firmowej nie wymaga więcej.

## Migration Notes

- Lokalnie: `npx supabase db reset`. W chmurze ręcznie `npx supabase db push`, najpierw na projekcie dev, potem na prod (CI nie deployuje).
- Backfill `display_name` obejmuje istniejące konta. Konta bez e-maila dostają `null` i w UI wyświetlają się jako „Użytkownik”.
- Wycofanie: nowa migracja usuwająca `tips`, `match_is_open`, kolumnę i zmianę polityki `profiles` oraz przywracająca poprzedni `handle_new_user()`.

## References

- Roadmap: `context/foundation/roadmap.md` (S-02)
- PRD: `context/foundation/prd.md` (US-01, FR-008, FR-012, FR-013, Open Question 2)
- Poprzedni slice: `context/archive/2026-10-01-add-match-to-shared-list/plan.md`, `reviews/impl-review.md`
- Wzorzec endpointu: `src/pages/api/matches.ts`
- Wzorzec serwisu: `src/lib/services/matches.ts`
- Wzorzec RLS i uprawnień: `supabase/migrations/20261001000000_profiles_and_matches.sql:44-90`, `supabase/migrations/20261004000000_harden_profiles_and_matches.sql`
- Smoke: `scripts/smoke.mjs:122-205`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schemat i RLS

#### Automated

- [x] 1.1 Migracje stosują się od zera: `npx supabase db reset` — 41a0812
- [x] 1.2 `npx astro check` bez błędów — 41a0812
- [x] 1.3 `npm run lint` bez błędów — 41a0812
- [x] 1.4 `npm run build` przechodzi — 41a0812
- [x] 1.5 Istniejący `npm run smoke` przechodzi w całości, w tym rejestracja przez zmieniony trigger — 41a0812

#### Manual

- [x] 1.6 `display_name` ma zamaskowane wartości dla kont gmail.com i merinosoft.com.pl — 41a0812
- [x] 1.7 RLS w SQL: insert na przyszły mecz działa, na przeszły odrzucony, cudzy typ przed startem niewidoczny — 41a0812

### Phase 2: Typowanie i widoki

#### Automated

- [x] 2.1 `npx astro check` bez błędów
- [x] 2.2 `npm run lint` bez błędów
- [x] 2.3 `npm run build` przechodzi
- [x] 2.4 Istniejący `npm run smoke` przechodzi w całości

#### Manual

- [x] 2.5 Zapis i poprawka typu widoczne w formularzu i na liście
- [x] 2.6 Wynik spoza 0–99 albo niecałkowity odrzucony komunikatem
- [x] 2.7 Drugie konto nie widzi cudzego typu przed startem
- [x] 2.8 Mecz po starcie: brak formularza, typy wszystkich z podpisami, zapis po starcie odrzucony
- [x] 2.9 Nieistniejący albo błędny id meczu daje 404
- [x] 2.10 Organizator też może typować

### Phase 3: Smoke i dokumentacja

#### Automated

- [ ] 3.1 `npm run lint` bez błędów
- [ ] 3.2 `npm run build` przechodzi
- [ ] 3.3 `npm run smoke` lokalnie z `SMOKE_REQUIRE_ADMIN=1`: wszystkie kroki `PASS`
- [ ] 3.4 CI na PR: job smoke zielony, kroki typów jako `PASS`

#### Manual

- [ ] 3.5 Po lokalnym smoke nie zostają mecze, typy ani konta smoke
