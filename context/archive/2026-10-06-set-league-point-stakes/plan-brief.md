# Stawki punktacji ligi (S-03) — Plan Brief

> Full plan: `context/changes/set-league-point-stakes/plan.md`

## What & Why

Organizator ustala dla całej ligi, ile punktów daje dokładny wynik i ile trafiony zwycięzca albo remis przy innym wyniku. Błędny typ daje 0 (FR-008). Bez tych dwóch liczb S-04 nie ma z czego policzyć punktów i klasyfikacji, a reguła ma być jedna dla wszystkich zamiast poprawek w arkuszu.

## Starting Point

Baza ma `profiles`, `matches` (z wynikiem z importu) i `tips`. Nigdzie nie ma ustawień ligi. Podpowiedź przy wpisywaniu typu mówi tylko „trafiony zwycięzca albo remis też daje punkty”, bez liczb (`TipDialog.tsx`, `matches/[id].astro`).

## Desired End State

Liga startuje ze stawkami 3 / 1. Na nowej stronie `/league` (link „Liga” w Topbarze) każdy zalogowany widzi obie stawki i regułę 0 pkt za błędny typ. Organizator ma tam formularz zmiany. Podpowiedź przy typie pokazuje rzeczywiste liczby. Baza nie pozwala pracownikowi zmienić stawek ani ustawić stawki za rezultat równej lub wyższej niż za dokładny wynik.

## Key Decisions Made

| Decision                    | Choice                                              | Why (1 sentence)                                                                               |
| --------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Stawki przed ustawieniem    | Domyślnie 3 / 1, wiersz zakłada migracja            | S-04 zawsze ma z czego liczyć, bez stanu „stawki nieustalone”.                                 |
| Dozwolone wartości          | Całkowite 0–99, dokładny > rezultat ≥ 0 (CHECK + zod) | Zgodne z „niższą stawką” z PRD i wyklucza bezsensowne konfiguracje.                            |
| Znaczenie „raz dla ligi”    | Jedna para stawek, zmiana w każdej chwili           | Literówkę da się poprawić, a dziś nie ma jeszcze punktów; skutki dla policzonych punktów → S-04. |
| Miejsce w UI                | Strona `/league` dla wszystkich, formularz dla organizatora | Pracownik zna regułę przed typowaniem, a S-04 ma gotowe miejsce na klasyfikację.              |
| Model danych                | Tabela-singleton `league_settings` (`id boolean check (id)`) | Drugi wiersz jest niemożliwy, nie trzeba polityki insert.                                      |
| Podpowiedź przy typie       | Liczby ze stawek; przy błędzie odczytu stary tekst  | Błąd stawek nie może zablokować typowania.                                                     |

## Scope

**In scope:**
- migracja `league_settings` z RLS (odczyt: zalogowani, update: organizator), seed 3 / 1, `revoke` dla `anon`;
- typ `LeagueStakes`, zod `stakesSchema`, serwis `getStakes` i `updateStakes`;
- `POST /api/league`, strona `/league`, `PROTECTED_ROUTES`, link w Topbarze;
- podpowiedź z liczbami na `/matches` (dialog) i `/matches/[id]`;
- kroki smoke z przywracaniem stawek i opis smoke w `CLAUDE.md`.

**Out of scope:**
- wynik meczu, przeliczanie punktów i klasyfikacja (S-04);
- skutek zmiany stawek dla policzonych już punktów (S-04);
- blokada zmian po pierwszym wyniku;
- stawki na mecz, kolejkę albo turniej;
- równe stawki;
- historia zmian;
- tryb JSON w API;
- test runner.

## Architecture / Approach

Formularz HTML na `/league` → `POST /api/league` (sprawdzenie roli dla komunikatu, zod) → `updateStakes` przez klienta Supabase z tokenem użytkownika → RLS `is_organizer()` jako właściwa bariera → redirect `/league` albo `/league?error=`. Strony `/league`, `/matches` i `/matches/[id]` czytają stawki przez `getStakes`. `/matches` przekazuje je do wyspy `MatchesTable` → `TipDialog`.

## Phases at a Glance

| Phase                          | What it delivers                                            | Key risk                                                                 |
| ------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1. Schemat i dostęp do danych  | Tabela 3 / 1 z RLS, typ, zod, serwis                        | Brak `revoke` dla `anon` albo zbyt szeroki grant update                  |
| 2. Endpoint i UI               | `/league`, `POST /api/league`, link, podpowiedź z liczbami  | Zmiana middleware; błąd stawek psujący listę meczów                      |
| 3. Smoke i dokumentacja        | Kroki smoke dla trzech ról, przywracanie stawek, `CLAUDE.md` | Smoke zostawiający zmienione stawki we współdzielonej bazie             |

**Prerequisites:** S-01 (role, `is_organizer()`) — done. Docker i lokalny Supabase dla `db reset` i `smoke:local`.
**Estimated effort:** ~1 sesja, 3 fazy.

## Open Risks & Assumptions

- Zmiana stawek po wpisaniu wyników: S-04 musi zdecydować, czy punkty się przeliczają, czy zostają.
- Pracownik zmieniający stawki przez REST dostaje `200` z pustą tablicą, a nie `403`. Smoke sprawdza więc niezmienione wartości.
- Produkcja wymaga ręcznego `supabase db push` przed `wrangler deploy`.

## Success Criteria (Summary)

- Organizator zmienia stawki na `/league`, a nowe liczby widać tam i w podpowiedzi przy typie.
- Pracownik widzi stawki, ale nie może ich zmienić ani przez UI, ani przez REST.
- `npm run smoke:local` przechodzi bez `SKIP` i zostawia stawki takie, jakie były.
