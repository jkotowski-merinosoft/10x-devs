# Własny typ (S-02) — Plan Brief

> Full plan: `context/changes/enter-own-tip/plan.md`

## What & Why

Zalogowany użytkownik wpisuje typ meczu z listy jako wynik A:B i widzi własny typ, a cudzego nie może zmienić (roadmap S-02; PRD US-01, FR-012, FR-013). Typ jest środkiem ścieżki do north star: bez niego S-04 nie ma czego punktować.

## Starting Point

Po S-01 istnieją `profiles` (rola) i `matches` z RLS. Strona `/matches` pokazuje mecze bez linków i bez typów. Nic nie przechowuje typów, a profile nie mają czym podpisać użytkownika (czytelny jest tylko własny profil).

## Desired End State

Na `/matches/[id]` użytkownik wpisuje i poprawia typ do startu meczu, z podpowiedzią, że trafiony zwycięzca też daje punkty. Do startu nikt nie widzi ani nie zmieni cudzego typu. Po starcie strona pokazuje typy wszystkich z zamaskowanym e-mailem (`jkotowski@m..t.com.pl`). Lista `/matches` linkuje do meczu i pokazuje „Twój typ: A:B” albo „brak typu” oraz status otwarte/zamknięte. Smoke w CI dowodzi każdej reguły.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Kształt typu | Zawsze wynik A:B; bez trybu „wskaż zwycięzcę” | Wynik zawiera zwycięzcę, więc według FR-008 nigdy nie daje mniej punktów niż samo wskazanie; obawę użytkownika rozwiązuje podpowiedź. |
| Zakres wartości | Liczby całkowite 0–99 na stronę | Obejmuje każdą dyscyplinę i blokuje absurdalne wpisy. |
| Blokada | Typ i poprawka tylko gdy `now() < starts_at`, liczone w bazie | Nikt nie typuje, znając przebieg meczu (PRD Open Question 2). |
| Edycja | Jeden typ na osobę i mecz, upsert do blokady | Pomyłkę da się poprawić jednym formularzem. |
| Kto typuje | Każdy zalogowany, także organizator | Organizator w firmie też gra; ranking S-04 obejmuje wszystkich. |
| Widoczność | Przed startem tylko własny; po starcie typy wszystkich | Dosłowne S-02 do startu, potem przejrzystość jak w typerach. |
| Podpis | `profiles.display_name` = e-mail z zamaskowanym pierwszym członem domeny | Rozróżnia ten sam login w różnych domenach bez ujawniania adresu; imiona można dodać później. |
| Odczyt profili | Otwarty dla zalogowanych (widać też `role` innych) | Najprostsza droga do podpisu; w aplikacji firmowej ujawnienie roli jest akceptowalne. |
| UI | Osobna strona `/matches/[id]`; lista z linkiem, własnym typem i statusem | Miejsce na wynik i punkty w S-04; z listy widać, czego jeszcze nie wytypowano. |
| Weryfikacja | Pełny outcome + RLS w smoke | Każda reguła S-02 sprawdzana w CI przez UI i bezpośrednio przez REST. |

## Scope

**In scope:**
- Migracja: `tips`, `match_is_open()`, polityki RLS, `display_name` + `mask_email()` + trigger + backfill
- Serwisy `getMatch`, `listOwnTips`, `listMatchTips`, `saveTip`; `POST /api/tips` (zod)
- Strona `/matches/[id]`, rozszerzona lista `/matches`, `PROTECTED_ROUTES`
- Rozszerzony smoke i opis w `CLAUDE.md`

**Out of scope:**
- Tryb „wskaż zwycięzcę”, usuwanie typu, ręczne zamykanie (FR-005), reakcja na zmianę daty meczu (S-05)
- Nazwy ustawiane przez użytkownika, ukrywanie ról innych osób
- Wynik, punkty i ranking (S-03, S-04); React i formularz zbiorczy; test runner

## Architecture / Approach

Formularz na `/matches/[id]` → `POST /api/tips`: zod, wczesna odmowa po starcie (czytelny komunikat), a potem `saveTip()` (upsert) klientem Supabase z tokenem użytkownika. RLS na `tips` wymusza właściciela i `match_is_open()`, a select ukrywa cudze typy do startu. Strona meczu czyta typy z embedem `profiles(display_name)`. Lista czyta własne typy z jawnym filtrem `user_id`, bo RLS po starcie zwraca też cudze.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schemat i RLS | Tabela typów, polityki, zamaskowany podpis | Błąd w zmienionym triggerze blokuje rejestrację (łapie istniejący smoke) |
| 2. Typowanie i widoki | Endpoint, strona meczu, lista z typem i statusem | „Mój typ” bez filtra `user_id` pokazałby cudzy typ po starcie |
| 3. Smoke i dokumentacja | Dowód każdej reguły S-02 w CI | Upsert pod RLS wymaga zgodnych polityk insert, select i update |

**Prerequisites:** S-01 ukończony (jest); Docker i lokalne Supabase.
**Estimated effort:** ~2–3 sesje w 3 fazach.

## Open Risks & Assumptions

- Zakładamy, że ujawnienie ról innym zalogowanym jest akceptowalne; jeśli nie, potrzebna funkcja `security definer` zamiast otwarcia `profiles`.
- S-05 (edycja meczu) może przesunąć `starts_at` po wpisaniu typów; zachowanie typów zostaje do decyzji w S-05.
- Projekty w chmurze wymagają ręcznego `npx supabase db push` (najpierw dev, potem prod).

## Success Criteria (Summary)

- Użytkownik wpisuje i poprawia własny typ do startu meczu i widzi go na liście i na stronie meczu.
- Przed startem nikt nie widzi ani nie zmieni cudzego typu, także bezpośrednio przez REST Supabase.
- Po starcie wszyscy widzą typy z zamaskowanymi podpisami; `npm run smoke` w CI przechodzi z krokami typów jako `PASS`.
