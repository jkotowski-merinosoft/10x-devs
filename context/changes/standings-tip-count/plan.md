# Liczba rozliczonych typów w klasyfikacji — plan implementacji

## Overview

Tabela klasyfikacji na `/league` dostaje ostatnią kolumnę **Typy**: liczbę typów danej osoby na mecze, które mają wynik. Pozwala odczytać punkty w kontekście („12 pkt z 5 meczów” wobec „14 pkt z 20”). Kolumna jest tylko informacyjna i nie zmienia kolejności.

## Current State Analysis

- `league_standings()` (`supabase/migrations/20261007120000_points_and_standings.sql:166-200`) grupuje typy po `user_id` i zwraca `rank, user_id, display_name, points, exact_count`. Jest `security definer`, wykonywać może ją tylko `authenticated`.
- `listStandings` (`src/lib/services/league.ts`) mapuje wiersze RPC, w których `bigint` może przyjść jako string, na `StandingsRow` (`src/types.ts:54-60`).
- `src/pages/league.astro:109-152` renderuje tabelę z kolumnami Miejsce, Użytkownik, Pkt i Dokładne oraz atrybutami `data-user`, `data-rank`, `data-points` i `data-exact`. Pod tabelą jest opis reguły remisu.
- Zmiana `result-to-standings` (S-04) ma otwartą fazę 4. Dopiero ona dodaje do smoke krok `/league` z `data-points` / `data-exact` dla obu kont smoke, a ta zmiana go rozszerza.
- PRD (`context/foundation/prd.md:123`) wyłącza z MVP „statystyki i skuteczność”. Liczba rozliczonych typów jest informacją kontekstową, nie wskaźnikiem skuteczności. Nie dodajemy procentów ani średnich.

## Desired End State

Każdy wiersz klasyfikacji ma w ostatniej kolumnie „Typy” liczbę typów tej osoby na mecze z wynikiem (`matches.score_a` i `score_b` nie są null) oraz atrybut `data-settled`. Typy na mecze bez wyniku nie są liczone, więc nikt nie widzi, ile otwartych meczów obstawił ktoś inny. Kolejność i miejsca są takie jak dziś. Smoke sprawdza wartość dla obu kont smoke.

Przykład: pracownik ma typ na mecz przyszły i na mecz rozpoczęty z wynikiem, więc pokazuje „1”. Po usunięciu wyniku pokazuje „0”, ale nadal jest w tabeli, bo ma typy.

### Key Discoveries:

- `create or replace function` nie zmieni kolumn `returns table`, dlatego potrzebne jest `drop function` + `create` + ponowne `revoke`/`grant` (`20261007120000_points_and_standings.sql:202-203`).
- Predykat „rozliczony” jest równoważny `t.points is not null` (inwariant triggerów w tej samej migracji). Plan używa warunku na wyniku meczu, tak jak `exact_count`.
- Osoba z samymi typami na mecze bez wyniku już dziś jest w klasyfikacji z 0 pkt. Zostaje w niej, z „0” w nowej kolumnie.

## What We're NOT Doing

- Nie liczymy typów na mecze bez wyniku i nie pokazujemy „rozliczone / wszystkie”, bo to ujawnia aktywność na otwartych meczach.
- Liczba typów nie jest kryterium remisu. Reguła rankingu i test 1.5 z `result-to-standings` zostają bez zmian.
- Nie pokazujemy skuteczności (%), średniej punktów ani historii typów (PRD wyklucza to z MVP).
- Nie edytujemy już zastosowanej migracji `20261007120000`.
- Nie rozszerzamy zakresu `result-to-standings`.

## Implementation Approach

Nowa migracja odtwarza `league_standings()` z dodatkową kolumną na końcu. Typ, serwis i widok przyjmują pole według istniejącego wzorca `exact_count`. Smoke rozszerza krok `/league` z fazy 4 S-04.

## Phase 1: Baza i widok

### Overview

Funkcja zwraca `settled_count`, a `/league` pokazuje go w ostatniej kolumnie.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261009000000_standings_settled_count.sql`

**Intent**: Dodać do klasyfikacji liczbę typów na mecze z wynikiem bez zmiany rankingu i uprawnień.

**Contract**: `drop function if exists public.league_standings();`, a potem `create function public.league_standings()` z `returns table (rank bigint, user_id uuid, display_name text, points bigint, exact_count bigint, settled_count bigint)`. W CTE `totals` dochodzi `count(*) filter (where m.score_a is not null and m.score_b is not null) as settled_count`. Ranking (`order by points desc, exact_count desc`) i sortowanie wyniku są bez zmian. Po `create`: `revoke execute … from public, anon; grant execute … to authenticated;` jak w oryginale. Komentarz nad funkcją mówi, że licznik obejmuje tylko mecze z wynikiem, żeby nie ujawniać typów na otwarte mecze.

#### 2. Typ i serwis

**File**: `src/types.ts`, `src/lib/services/league.ts`

**Intent**: Przenieść nowe pole do widoku.

**Contract**: `StandingsRow.settled_count: number`, `StandingsRpcRow.settled_count: number | string`, w `listStandings` mapowanie `Number(row.settled_count)`.

#### 3. Tabela klasyfikacji

**File**: `src/pages/league.astro`

**Intent**: Pokazać liczbę w ostatniej kolumnie i wyjaśnić, co liczy.

**Contract**: Nowy `<th>` „Typy” po „Dokładne” i `<td>` `font-mono text-right`. Odstępy przesuwają się tak, że `pr-2` ma każda kolumna oprócz ostatniej. Wiersz `<tr>` dostaje `data-settled={row.settled_count}`. Opis pod tabelą dostaje zdanie: „Typy — liczba typów na mecze, które mają już wynik.”

### Success Criteria:

#### Automated Verification:

- Migracje stosują się od zera: `npx supabase db reset` (zapytaj przed resetem; alternatywnie `npx supabase migration up`)
- `npx astro check` przechodzi
- `npm run lint` przechodzi
- `npm run build` przechodzi

#### Manual Verification:

- Na lokalnym stacku osoba z typem na mecz z wynikiem i typem na mecz bez wyniku ma w kolumnie „Typy” 1, a po usunięciu wyniku 0 i dalej jest w tabeli
- Kolejność i miejsca w klasyfikacji są takie same jak przed zmianą (ten sam zestaw danych)
- Widok mobilny `/league` (wąskie okno) jest czytelny, bez poziomego przewijania strony

**Implementation Note**: Po automatycznych sprawdzeniach zatrzymaj się na ręczne potwierdzenie.

---

## Phase 2: Smoke i dokumentacja

### Overview

Smoke pilnuje, że kolumna liczy tylko typy rozliczone, a opis w `CLAUDE.md` mówi o nowej asercji.

### Changes Required:

#### 1. Asercje smoke

**File**: `scripts/smoke.mjs`

**Intent**: Złapać regresję, w której licznik obejmuje typy na mecze bez wyniku albo gubi typy rozliczone.

**Contract**: W kroku `/league` z fazy 4 S-04 (krok 10: wiersze obu kont smoke po zapisaniu wyniku 2:0) dochodzi warunek `data-settled="1"` dla pracownika i organizatora. Pracownik ma też typ na mecz przyszły, więc 1, a nie 2. W kroku po `action=clear` (krok 13) dochodzi sprawdzenie `/league` pracownika: jego wiersz ma `data-settled="0"`.

#### 2. Opis smoke

**File**: `CLAUDE.md` (§ Verification)

**Intent**: Opis kroków smoke pozostaje jedynym źródłem ich listy w repo.

**Contract**: Zdania o krokach `/league` i `action=clear` dostają wzmiankę o `data-settled` (1 dla obu kont, 0 u pracownika po usunięciu wyniku).

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi
- `npm run build` przechodzi
- `npm run smoke:local` przeciw `npm run dev:local` kończy się bez FAIL i SKIP

#### Manual Verification:

- Opis w `CLAUDE.md` § Verification zgadza się z krokami w `scripts/smoke.mjs`

**Implementation Note**: Po automatycznych sprawdzeniach zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Integration Tests:

- Smoke: pracownik z typem przyszłym i rozliczonym ma `data-settled="1"`, organizator z jednym rozliczonym ma `1`, a po usunięciu wyniku pracownik ma `0`.

### Manual Testing Steps:

1. Na lokalnym stacku wpisz typy na mecz przyszły i rozpoczęty, a organizatorem wpisz wynik rozpoczętego. `/league` pokazuje „Typy: 1”.
2. Usuń wynik. Wiersz zostaje, „Typy: 0”, punkty 0.
3. Sprawdź `/league` w wąskim oknie.

## Performance Considerations

Dodatkowe `count(*) filter` w tej samej agregacji nie dodaje skanów.

## Migration Notes

Migracja jest idempotentna (`drop function if exists`) i nie rusza danych. Produkcja wymaga ręcznego `db push`, tak jak dotychczas, przed `wrangler deploy` kodu, który czyta `settled_count`. W odwrotnej kolejności `Number(undefined)` dałoby w kolumnie `NaN`.

## References

- Funkcja źródłowa: `supabase/migrations/20261007120000_points_and_standings.sql:166-203`
- Serwis: `src/lib/services/league.ts` (`listStandings`)
- Widok: `src/pages/league.astro:109-157`
- Kroki smoke `/league`: `context/changes/result-to-standings/plan.md` (faza 4, kroki 10 i 13)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza i widok

#### Automated

- [ ] 1.1 Migracje stosują się od zera: `npx supabase db reset` (zapytaj przed resetem; alternatywnie `npx supabase migration up`)
- [ ] 1.2 `npx astro check` przechodzi
- [ ] 1.3 `npm run lint` przechodzi
- [ ] 1.4 `npm run build` przechodzi

#### Manual

- [ ] 1.5 Na lokalnym stacku osoba z typem na mecz z wynikiem i typem na mecz bez wyniku ma w kolumnie „Typy” 1, a po usunięciu wyniku 0 i dalej jest w tabeli
- [ ] 1.6 Kolejność i miejsca w klasyfikacji są takie same jak przed zmianą (ten sam zestaw danych)
- [ ] 1.7 Widok mobilny `/league` (wąskie okno) jest czytelny, bez poziomego przewijania strony

### Phase 2: Smoke i dokumentacja

#### Automated

- [ ] 2.1 `npm run lint` przechodzi
- [ ] 2.2 `npm run build` przechodzi
- [ ] 2.3 `npm run smoke:local` przeciw `npm run dev:local` kończy się bez FAIL i SKIP

#### Manual

- [ ] 2.4 Opis w `CLAUDE.md` § Verification zgadza się z krokami w `scripts/smoke.mjs`
