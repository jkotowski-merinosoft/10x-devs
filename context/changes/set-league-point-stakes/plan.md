# Stawki punktacji ligi (S-03) Implementation Plan

## Overview

Organizator ustala dla całej ligi dwie stawki: ile punktów daje dokładny wynik i ile trafiony zwycięzca albo remis przy innym wyniku. Liga startuje ze stawkami 3 / 1 (przykład z FR-008), a organizator może je zmienić w każdej chwili na nowej stronie `/league`. Każdy zalogowany widzi tam aktualne stawki, a podpowiedź przy wpisywaniu typu pokazuje rzeczywiste liczby. To roadmap S-03 (PRD US-01, FR-008) i źródło liczb dla przeliczenia punktów w S-04.

## Current State Analysis

- W bazie nie ma miejsca na ustawienia ligi. Są tylko `profiles`, `matches` i `tips` (`supabase/migrations/`). `matches` ma już `score_a`/`score_b`, które czyta S-04 (`supabase/migrations/20261006000000_match_scores_and_external_ids.sql:1-18`).
- Uprawnienia organizatora w bazie daje `public.is_organizer()` (security definer, wykonywalna tylko przez `authenticated`) (`20261001000000_profiles_and_matches.sql:46-58`, `20261004000000_harden_profiles_and_matches.sql:19-21`). Generyczny trigger `public.set_updated_at()` już istnieje (`20261004120000_tips_and_display_names.sql:112-127`).
- Lekcje z S-01 i S-02 obowiązują dla nowej tabeli: `revoke all ... from anon`, jawne granty i brak uprawnień, których nikt nie potrzebuje (`20261004000000_harden_profiles_and_matches.sql:13-17`, `20261004120000_tips_and_display_names.sql:172-175`).
- Wzorzec zapisu: formularz HTML → `POST /api/...` → sprawdzenie `locals.role` → zod w `src/lib/schemas/` → serwis w `src/lib/services/` zwracający `{ data, error }` z polskim komunikatem → redirect z `?error=` (`src/pages/api/matches.ts:6-42`, `src/lib/services/matches.ts`, `src/lib/schemas/tip.ts`).
- Wynik z formularza jest walidowany jako ciąg samych cyfr, a nie przez koercję (`src/lib/schemas/tip.ts:14-19`).
- `PROTECTED_ROUTES` sprawdza prefiksy przez `startsWith` (`src/middleware.ts:5,34`). `/league` i `/api/league` trzeba dopisać.
- Podpowiedź o punktach jest wpisana na sztywno, bez liczb, w dwóch miejscach: `src/components/matches/TipDialog.tsx:153-155` (wyspa React, dane przez `MatchesTable` z `src/pages/matches.astro`) i `src/pages/matches/[id].astro:113-115`.
- Topbar linkuje `/matches` i `/dashboard` (`src/components/Topbar.astro:8-14`).
- Smoke ma sekcję anonimową, pracownika i organizatora (service role), a sprzątanie robi przez service role (`scripts/smoke.mjs`). Opis kroków jest powtórzony w `CLAUDE.md` § Verification.

## Desired End State

- Tabela `public.league_settings` ma dokładnie jeden wiersz ze stawkami `exact_points` i `outcome_points`. Migracja zakłada go z wartościami 3 / 1. Baza wymusza `0 ≤ outcome_points < exact_points ≤ 99`.
- Każdy zalogowany czyta stawki. Zmienia je tylko organizator (RLS `is_organizer()`). Nikt nie dodaje ani nie usuwa wiersza, a `anon` nie ma żadnych uprawnień.
- `/league`:
  - każdy zalogowany widzi obie stawki i regułę „błędny typ: 0 pkt”;
  - organizator ma formularz wypełniony bieżącymi stawkami, a zapis wraca na `/league` z nowymi wartościami;
  - błąd walidacji albo zapisu pokazuje banner z `?error=`;
  - anonim trafia na `/auth/signin`.
- Topbar ma link „Liga”.
- Podpowiedź przy typie (dialog na `/matches` i formularz na `/matches/[id]`) pokazuje rzeczywiste stawki, np. „Dokładny wynik: 3 pkt. Trafiony zwycięzca albo remis przy innym wyniku: 1 pkt.”. Gdy stawek nie da się wczytać, zostaje obecny tekst bez liczb.
- `npm run smoke:local` dowodzi każdej reguły S-03 i przywraca stawki sprzed przebiegu.

### Key Discoveries:

- Polityka update odrzuca zmianę pracownika bez błędu: PostgREST zwraca `200` z pustą tablicą, bo RLS odfiltrowuje wiersz, a grant `update` istnieje. Smoke sprawdza więc przez service role, że wartości się nie zmieniły, zamiast oczekiwać `401/403`.
- Wiersz jest singletonem przez `id boolean primary key default true check (id)`. Nie trzeba polityki insert, a drugi wiersz jest niemożliwy.
- Reguła „dokładny > rezultat ≥ 0” obowiązuje w bazie (CHECK) i w zod (komunikat dla formularza). Zakres 0–99 jest ten sam co dla wyników typów.

## What We're NOT Doing

- Przeliczanie punktów, wpisywanie wyniku przez organizatora i klasyfikacja (S-04). Tutaj nie ma jeszcze żadnych punktów do przeliczenia.
- Decyzja, co zmiana stawek robi z punktami już policzonymi (przeliczyć czy zamrozić). Przechodzi do S-04 jako otwarte pytanie.
- Blokowanie zmiany stawek po pierwszym wyniku albo jednorazowe ustawienie. Organizator może je zmienić w każdej chwili.
- Stawki na mecz, kolejkę albo turniej (PRD Non-Goals) i stawka za błędny typ inna niż 0.
- Równe stawki (np. 1 / 1). Dokładny wynik zawsze daje więcej.
- Historia zmian stawek i informacja, kto je zmienił.
- Tryb JSON w `POST /api/league`. Strona `/league` jest `.astro` z formularzem HTML, bez wyspy React.
- Test runner (AGENTS.md).

## Implementation Approach

Kolejność taka jak w S-01 i S-02. Najpierw schemat z RLS jako właściwą barierą, potem typ, zod i serwis, następnie endpoint i widoki, na końcu smoke dowodzący reguł przez UI i bezpośrednio przez REST Supabase. Zapis idzie przez klienta Supabase z tokenem użytkownika, więc RLS obowiązuje także na ścieżce aplikacji. Sprawdzenie roli w endpoincie służy tylko czytelnemu komunikatowi.

## Critical Implementation Details

**Smoke zmienia współdzielony stan.** W przeciwieństwie do meczów i kont stawek nie da się utworzyć osobno dla przebiegu. Smoke najpierw odczytuje stawki przez service role, a w sprzątaniu zawsze zapisuje je z powrotem, także gdy wcześniejszy krok zawiódł. Kroki organizatora nadal nigdy nie mogą celować w produkcję.

## Phase 1: Schemat i dostęp do danych

### Overview

Tabela stawek z wierszem 3 / 1, RLS i grantami. Do tego typ, schemat zod i serwis, z których skorzystają endpoint i widoki.

### Changes Required:

#### 1. Migracja `league_settings`

**File**: `supabase/migrations/20261007000000_league_settings.sql`

**Intent**: Jedno miejsce na stawki całej ligi, czytelne dla każdego zalogowanego i zmieniane tylko przez organizatora. Wiersz startowy 3 / 1 sprawia, że S-04 zawsze ma z czego liczyć.

**Contract**:
- tabela `public.league_settings`:
  - `id boolean primary key default true` z `check (id)`;
  - `exact_points smallint not null`;
  - `outcome_points smallint not null`;
  - `updated_at timestamptz not null default now()`;
  - CHECK `league_settings_stakes_range`: `outcome_points >= 0 and outcome_points < exact_points and exact_points <= 99`.
- seed `insert ... values (true, 3, 1) on conflict (id) do nothing`;
- trigger `before update` wywołujący istniejące `public.set_updated_at()`;
- RLS włączone:
  - polityka `league_settings_select_authenticated` (`for select to authenticated using (true)`);
  - polityka `league_settings_update_organizer` (`for update to authenticated using (public.is_organizer()) with check (public.is_organizer())`);
  - brak polityk insert i delete;
- `revoke all ... from anon`, `grant select ... to authenticated`, `grant update (exact_points, outcome_points) ... to authenticated`.
- Komentarz nagłówkowy w stylu poprzednich migracji: co i dlaczego, w tym że zmianę stawek wolno robić w każdej chwili, a S-04 decyduje o skutkach dla policzonych punktów.

#### 2. Typ stawek

**File**: `src/types.ts`

**Intent**: Wspólny kształt stawek dla serwisu, stron i wyspy React.

**Contract**: `export interface LeagueStakes { exact_points: number; outcome_points: number; }`.

#### 3. Schemat zod

**File**: `src/lib/schemas/league.ts`

**Intent**: Walidacja formularza stawek z polskimi komunikatami, zgodna z CHECK w bazie.

**Contract**: `stakesSchema` przyjmuje `exact_points` i `outcome_points` jako ciągi samych cyfr (1–2 cyfry, jak `score` w `src/lib/schemas/tip.ts`) zamieniane na liczby. `refine` wymaga `outcome_points < exact_points` z komunikatem „Stawka za trafiony rezultat musi być niższa niż za dokładny wynik” na ścieżce `outcome_points`. Z tego wynika `exact_points ≥ 1`.

#### 4. Serwis stawek

**File**: `src/lib/services/league.ts`

**Intent**: Odczyt i zapis jedynego wiersza według konwencji `{ data, error }` z `src/lib/services/matches.ts`. Błąd bazy jest logowany i zamieniany na polski komunikat, nigdy na „brak danych”.

**Contract**:
- `getStakes(supabase): Promise<{ data: LeagueStakes | null; error: string | null }>` czyta `exact_points, outcome_points` z wiersza `id = true`. Brak wiersza jest błędem („Nie udało się wczytać stawek”).
- `updateStakes(supabase, input: LeagueStakes): Promise<{ data: LeagueStakes | null; error: string | null }>` robi `update ... eq("id", true)` z `select().single()`. Zero zwróconych wierszy (RLS) to błąd („Nie udało się zapisać stawek”).

### Success Criteria:

#### Automated Verification:

- Migracja nakłada się czysto na lokalną bazę: `npx supabase db reset`
- Po resecie `select exact_points, outcome_points from public.league_settings` zwraca dokładnie jeden wiersz `3 | 1`
- Baza odrzuca `update public.league_settings set outcome_points = 3` (CHECK) i `insert` drugiego wiersza
- Typy i Astro przechodzą: `npx astro check`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- W Supabase Studio tabela ma włączone RLS, dwie polityki (select, update) i brak uprawnień dla `anon`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Endpoint i UI

### Overview

Organizator zmienia stawki na `/league`. Każdy zalogowany je tam widzi, a podpowiedź przy typie pokazuje liczby.

### Changes Required:

#### 1. Endpoint zapisu stawek

**File**: `src/pages/api/league.ts`

**Intent**: Przyjąć formularz stawek od organizatora i wrócić na `/league`. Zachowanie i kolejność sprawdzeń jak w `src/pages/api/matches.ts`, bez gałęzi JSON.

**Contract**:
- `export const POST: APIRoute`;
- brak klienta Supabase → redirect `/league?error=`;
- `locals.role !== "organizer"` → redirect `/league?error=Tylko organizator może zmieniać stawki`;
- błąd `stakesSchema` → redirect `/league?error=<pierwszy komunikat>`;
- błąd `updateStakes` → redirect `/league?error=<komunikat>`;
- sukces → redirect `/league`.

#### 2. Ochrona tras

**File**: `src/middleware.ts`

**Intent**: Anonim nie wchodzi na stronę ani w endpoint stawek.

**Contract**: `PROTECTED_ROUTES` dostaje `"/league"` i `"/api/league"`.

#### 3. Strona ligi

**File**: `src/pages/league.astro`

**Intent**: Pokazać obie stawki każdemu zalogowanemu i dać organizatorowi formularz ich zmiany. Układ i klasy jak w `src/pages/matches/[id].astro` (Topbar, karta, banner błędu, `class:list`).

**Contract**:
- `getStakes` przy renderze;
- blok `data-testid="league-stakes"` z atrybutami `data-exact` i `data-outcome` oraz tekstem trzech reguł (dokładny wynik, trafiony zwycięzca albo remis przy innym wyniku, błędny typ 0 pkt);
- dla organizatora `form` z `data-testid="stakes-form"`, `method="POST" action="/api/league"`, pola `exact_points` i `outcome_points` (`type="number" min="0" max="99" step="1" required`) wypełnione bieżącymi stawkami;
- `?error=` jako banner `role="alert"`;
- błąd wczytania: banner, bez bloku stawek i bez formularza.

#### 4. Link w Topbarze

**File**: `src/components/Topbar.astro`

**Intent**: Strona ligi jest osiągalna z każdego widoku.

**Contract**: Link „Liga” do `/league` obok „Mecze”, w tym samym stylu.

#### 5. Podpowiedź z liczbami przy typie

**File**: `src/pages/matches/[id].astro`, `src/pages/matches.astro`, `src/components/matches/MatchesTable.tsx`, `src/components/matches/TipDialog.tsx`

**Intent**: Pracownik zna regułę punktacji w chwili typowania. Błąd wczytania stawek nie może zablokować typowania ani listy.

**Contract**:
- obie strony wołają `getStakes`;
- `MatchesTable` dostaje prop `stakes: LeagueStakes | null` i przekazuje go do `TipDialog`;
- przy niepustych stawkach tekst podpowiedzi to „Dokładny wynik: {exact_points} pkt. Trafiony zwycięzca albo remis przy innym wyniku: {outcome_points} pkt.”;
- przy `null` zostaje obecny tekst „Trafiony zwycięzca albo remis też daje punkty, nawet przy innym wyniku.”;
- błąd stawek nie pokazuje osobnego bannera.

### Success Criteria:

#### Automated Verification:

- Typy i Astro przechodzą: `npx astro check`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Istniejący smoke nadal przechodzi (zmiana middleware): `npm run dev:local` w tle, potem `npm run smoke:local`

#### Manual Verification:

- Pracownik widzi na `/league` stawki 3 / 1 i regułę 0 pkt, bez formularza
- Organizator zmienia stawki na 5 / 2, wraca na `/league` z nowymi wartościami, a podpowiedź w dialogu typu na `/matches` i na `/matches/[id]` pokazuje 5 i 2
- Organizator wpisuje 2 / 2 i 0 / 0, widzi banner błędu, a stawki się nie zmieniają
- Link „Liga” w Topbarze działa z `/matches` i `/matches/[id]`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Smoke i dokumentacja

### Overview

Smoke dowodzi reguł S-03 przez UI i bezpośrednio przez REST Supabase oraz przywraca stawki sprzed przebiegu. Opis smoke w `CLAUDE.md` odpowiada krokom.

### Changes Required:

#### 1. Kroki smoke

**File**: `scripts/smoke.mjs`

**Intent**: Każda reguła stawek ma krok, który zawiedzie, gdy reguła się zepsuje. Nowe kroki korzystają z istniejących helperów (`request`, `supabase`, `check`, `contains`/`notContains`).

**Contract**:
- sekcja anonimowa: `/league` i `POST /api/league` → redirect `/auth/signin`;
- sekcja pracownika:
  - `/league` → 200, zawiera `data-testid="league-stakes"`, nie zawiera `data-testid="stakes-form"`;
  - `POST /api/league` z 9 / 4 → redirect `/league?error=`.
- sekcja organizatora (service role):
  - service role odczytuje i zapamiętuje bieżące stawki, które nie zmieniły się po POST pracownika;
  - bezpośredni `PATCH /rest/v1/league_settings` z tokenem pracownika nie zmienia stawek (odczyt przez service role);
  - organizator widzi na `/league` `data-testid="stakes-form"`;
  - `POST /api/league` z 1 / 1 → `/league?error=`, stawki bez zmian;
  - `POST /api/league` z 5 / 2 → `/league`, strona ma `data-exact="5"` i `data-outcome="2"`, a strona przyszłego meczu smoke pracownika zawiera „Dokładny wynik: 5 pkt”.
- sprzątanie: service role zawsze zapisuje zapamiętane stawki z powrotem, zanim usunie mecze i konta.

#### 2. Opis smoke

**File**: `CLAUDE.md`

**Intent**: Akapit § Verification opisuje smoke krok po kroku, więc musi wymieniać nowe kroki i przywracanie stawek.

**Contract**: W opisie `scripts/smoke.mjs` dopisane kroki `/league` dla anonima, pracownika i organizatora oraz informacja, że sprzątanie przywraca stawki.

### Success Criteria:

#### Automated Verification:

- Pełny smoke przechodzi lokalnie bez `SKIP`: `npm run dev:local` w tle, potem `npm run smoke:local`
- Po smoke `public.league_settings` ma te same stawki co przed nim
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- CI (lint, build, smoke na produkcyjnym preview z lokalnym Supabase) jest zielone na pushu

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Brak. AGENTS.md zabrania dodawania test runnera bez prośby użytkownika.

### Integration Tests:

- `scripts/smoke.mjs`:
  - anonim, pracownik i organizator na `/league` i `POST /api/league`;
  - bezpośredni PATCH pracownika przez REST;
  - odrzucenie równych stawek;
  - widoczność nowych stawek na stronie meczu;
  - przywrócenie stawek.

### Manual Testing Steps:

1. Zaloguj się jako pracownik i otwórz `/league`. Widać 3 / 1 i 0 pkt za błędny typ, nie ma formularza.
2. Zaloguj się jako organizator, zmień stawki na 5 / 2 i sprawdź `/league` oraz podpowiedź w dialogu typu na `/matches`.
3. Wpisz 2 / 2. Pojawia się banner błędu, a stawki zostają 5 / 2.
4. Przywróć 3 / 1.

## Performance Considerations

Jeden dodatkowy odczyt jednego wiersza przy renderze `/matches`, `/matches/[id]` i `/league`. Pomijalne.

## Migration Notes

- Migracja jest addytywna: nowa tabela z wierszem 3 / 1. Istniejące dane się nie zmieniają.
- Na produkcję trafia ręcznym `supabase db push` przed `wrangler deploy`, jak poprzednie migracje. Kod z fazy 2 bez tabeli pokazałby tylko podpowiedź bez liczb i błąd na `/league`.
- Wycofanie: `drop table public.league_settings`. Nic innego od niej jeszcze nie zależy.

## References

- Roadmap: `context/foundation/roadmap.md` (S-03)
- PRD: `context/foundation/prd.md` (US-01, FR-008, § Business Logic)
- Similar implementation: `src/pages/api/matches.ts:6-42`, `src/lib/services/matches.ts`, `supabase/migrations/20261004120000_tips_and_display_names.sql:150-175`
- Prior plan: `context/archive/2026-10-04-enter-own-tip/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schemat i dostęp do danych

#### Automated

- [x] 1.1 Migracja nakłada się czysto na lokalną bazę: `npx supabase db reset`
- [x] 1.2 Po resecie `select exact_points, outcome_points from public.league_settings` zwraca dokładnie jeden wiersz `3 | 1`
- [x] 1.3 Baza odrzuca `update public.league_settings set outcome_points = 3` (CHECK) i `insert` drugiego wiersza
- [x] 1.4 Typy i Astro przechodzą: `npx astro check`
- [x] 1.5 Lint przechodzi: `npm run lint`

#### Manual

- [x] 1.6 W Supabase Studio tabela ma włączone RLS, dwie polityki (select, update) i brak uprawnień dla `anon`

### Phase 2: Endpoint i UI

#### Automated

- [ ] 2.1 Typy i Astro przechodzą: `npx astro check`
- [ ] 2.2 Lint przechodzi: `npm run lint`
- [ ] 2.3 Build przechodzi: `npm run build`
- [ ] 2.4 Istniejący smoke nadal przechodzi (zmiana middleware): `npm run dev:local` w tle, potem `npm run smoke:local`

#### Manual

- [ ] 2.5 Pracownik widzi na `/league` stawki 3 / 1 i regułę 0 pkt, bez formularza
- [ ] 2.6 Organizator zmienia stawki na 5 / 2, wraca na `/league` z nowymi wartościami, a podpowiedź w dialogu typu na `/matches` i na `/matches/[id]` pokazuje 5 i 2
- [ ] 2.7 Organizator wpisuje 2 / 2 i 0 / 0, widzi banner błędu, a stawki się nie zmieniają
- [ ] 2.8 Link „Liga” w Topbarze działa z `/matches` i `/matches/[id]`

### Phase 3: Smoke i dokumentacja

#### Automated

- [ ] 3.1 Pełny smoke przechodzi lokalnie bez `SKIP`: `npm run dev:local` w tle, potem `npm run smoke:local`
- [ ] 3.2 Po smoke `public.league_settings` ma te same stawki co przed nim
- [ ] 3.3 Lint przechodzi: `npm run lint`

#### Manual

- [ ] 3.4 CI (lint, build, smoke na produkcyjnym preview z lokalnym Supabase) jest zielone na pushu
