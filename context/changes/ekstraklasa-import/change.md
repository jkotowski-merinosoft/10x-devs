---
change_id: ekstraklasa-import
title: One-off import of current-season Ekstraklasa fixtures (apifootball.com) for MVP demo data
status: implemented
created: 2026-10-06
updated: 2026-10-06
archived_at: null
---

## Notes

Poza roadmapą. Cel: jednorazowy import meczów polskiej Ekstraklasy z API-Football, żeby aplikacja
na prezentacji MVP miała znane widzom spotkania (zamiast ręcznie wpisanych). Nie jest to stała
synchronizacja ani wyniki na żywo.

### Rozpoznanie źródeł (2026-10-06, wyszukiwanie Exa + testowe wywołania API)

| Źródło | Ekstraklasa | Darmowy plan | Uwagi |
|---|---|---|---|
| API-Football (api-sports.io, v3) | tak, `league=106` | 100 zapytań/dzień, wszystkie endpointy, **tylko sezony 2022–2024** | wybrane źródło |
| football-data.org v4 | brak w darmowym planie | 10 zapytań/min, 12 lig (PL, BL1, SA, PD, FL1, CL, MŚ, Euro…) | alternatywa bez Ekstraklasy; Liga Narodów płatna |
| openfootball/europe (`poland/`) | tylko `2023-24_pl1.txt`, `2024-25_pl1.txt`, `2024-25_pl2.txt` | domena publiczna, bez klucza | format Football.TXT, brak bieżącego sezonu |
| apifootball.com | tak (id 259) | nie sprawdzono | — |

### Zweryfikowane na koncie użytkownika (plan Free, aktywny do 2027-10-06)

- `GET https://v3.football.api-sports.io/leagues?country=Poland&type=League` → Ekstraklasa `id=106`,
  sezony 2022–2026 (2026 = bieżący, oznaczony `current`).
- `GET /fixtures?league=106&season=2026` i `season=2025` → błąd
  `"Free plans do not have access to this season, try from 2022 to 2024."`
- `GET /fixtures?league=106&season=2024` → 306 meczów, wszystkie `FT` (zakończone). Jedno wywołanie
  zwraca cały sezon.
- Nagłówek autoryzacji: `x-apisports-key: <klucz>`. `GET /status` pokazuje zużycie dziennego limitu.
- Kształt pojedynczego meczu (istotne pola):
  `fixture.id`, `fixture.date` (ISO, UTC), `fixture.status.short` (`NS`/`FT`/…), `fixture.venue.{name,city}`,
  `league.round` (np. `"Regular Season - 1"`), `teams.home.{id,name,logo}`, `teams.away.{id,name,logo}`,
  `goals.{home,away}`.

### Klucz problem dla planu

Darmowy plan daje wyłącznie **zakończone** mecze (sezon 2024/25 i starsze), a aplikacja przyjmuje typy
tylko na mecze, które jeszcze się nie zaczęły (`starts_at` w przyszłości; smoke test to sprawdza).
Sam import historycznych dat da więc tabelę meczów, na które nie da się typować. Opcje do rozstrzygnięcia
w `/10x-plan`:

1. **Przesunięcie dat (rekomendowane dla demo)**: importujemy prawdziwe pary i kolejki z sezonu 2024/25,
   ale `starts_at` przesuwamy o stały offset tak, żeby część kolejek była w przeszłości, a część w
   przyszłości (zachowane dni tygodnia i godziny). Widzowie widzą znane drużyny, typowanie działa.
   Trzeba jawnie oznaczyć dane jako demonstracyjne.
2. Import bez zmian dat: tylko historia, przydatne co najwyżej do pokazania widoku wyników.
3. Płatny plan API-Football (dostęp do sezonu 2026/27, prawdziwy terminarz).
4. Ręczne uzupełnienie bieżącej kolejki obok importu historycznego.

### Dopasowanie do obecnego schematu

- `public.matches` (`supabase/migrations/20261001000000_profiles_and_matches.sql`): `side_a`, `side_b`
  (1–100 znaków, różne), `starts_at timestamptz`, `created_by uuid not null default auth.uid()`.
  Brak kolumny na zewnętrzne id: do idempotentnego importu (upsert bez duplikatów) potrzebna migracja,
  np. `external_source text` + `external_id text` z unikalnym indeksem na parze.
- `created_by` jest wymagane: import z service role musi jawnie podać id organizatora.
- Brak kolumn na wynik i kolejkę. Wynik dodajemy (decyzja 2 niżej); kolejkę na razie pomijamy.
- Wariant wykonania do wyboru w planie: skrypt `scripts/import-ekstraklasa.mjs` (jak `scripts/smoke.mjs`,
  uruchamiany ręcznie z service role) albo endpoint tylko dla organizatora. Przy jednorazowym imporcie
  skrypt jest prostszy i nie wymaga trzymania klucza API w sekretach Workera.

### apifootball.com: sprawdzone na kluczu użytkownika (2026-10-06)

To inny dostawca niż API-Football (api-sports.io). Rozwiązuje kluczowy problem: **daje bieżący sezon**.

- Endpoint: `GET https://apiv3.apifootball.com/?action=<akcja>&APIkey=<klucz>` (klucz w query, nie w nagłówku).
- `action=get_leagues` → 1019 lig, m.in. Ekstraklasa `league_id=259` (2026/2027), Puchar Polski 260,
  Liga Narodów 633 (2026/2027), Liga Mistrzów 3, MŚ 28.
- `action=get_events&league_id=259&from=2026-07-01&to=2027-06-30` → 306 meczów sezonu 2026/27:
  78 `Finished`, 218 `Not Started`, 10 z pustym statusem; **228 meczów od 2026-10-09 do 2027-05-22**.
- Liga Narodów (633), ten sam zakres → 156 meczów, 62 przyszłe (do 2026-11-17).
- Pola meczu: `match_id`, `match_date` (`YYYY-MM-DD`), `match_time` (`HH:MM`), `match_status`
  (`""`, `Not Started`, `Finished`, …), `match_round`, `match_hometeam_name`, `match_awayteam_name`,
  `match_hometeam_score`, `match_awayteam_score` (puste przed meczem), `match_stadium`,
  `team_home_badge`, `league_year`.
- Nazwy drużyn bez polskich znaków (`Wieczysta Krakow`, `Wisla Plock`): mapujemy (decyzja 3 niżej).
- **Strefa czasowa: rozstrzygnięte 2026-10-06**, szczegóły i pułapka z cache w `api-reference.md`
  (parametr `timezone` działa, domyślna strefa to czas warszawski). Notatka sprzed weryfikacji:
  Data i godzina przychodzą osobno, bez strefy. Według dokumentacji
  domyślna strefa to Europe/Berlin (taka sama jak w Warszawie), ale parametr `timezone=UTC` dla zapytania
  `match_id=780234` nie zmienił godziny (`18:00`). Przed importem trzeba to zweryfikować
  na `get_events` z `from/to` i porównać z oficjalnym terminarzem; jest to krytyczne, bo `starts_at`
  decyduje o blokadzie typowania.
- Plan: użytkownik wykupił plan płatny bez limitu zapytań, ważny 14 dni (od 2026-10-06, czyli do ok.
  2026-10-20). W tym czasie trzeba opracować import i zasilić bazę. Po wygaśnięciu planu import nie musi
  działać: dane zostają w bazie, a wyniki wprowadza organizator.
- Dostawca udostępnia też serwer MCP (`https://mcp.apifootball.com/mcp`, `Authorization: Bearer <klucz>`).
  Przydaje się do ręcznego przeglądania danych przez agenta, ale nie jest potrzebny do samego importu.

**Wniosek:** apifootball.com zastępuje API-Football jako źródło. Importujemy prawdziwy terminarz
bieżącego sezonu bez przesuwania dat; opcja 1 z sekcji „Klucz problem” przestaje być potrzebna.
Zmienna środowiskowa: `APIFOOTBALL_KEY`.

Zakres: import ma ułatwić start projektu: od pierwszego dnia jest na co typować, a prawdziwe mecze są
lepsze niż wymyślone. Wyniki przyszłych meczów wpisuje organizator.

### Decyzje użytkownika (2026-10-06), wejście do `/10x-plan`

1. **Mecze z pustym `match_status` (10): pomijamy.** Ich data i godzina mogą być umowne.
2. **Mecze rozegrane (`Finished`, 78): importujemy razem z wynikiem**, żeby liga miała pełną historię
   sezonu. Wymaga migracji z kolumnami na wynik w `public.matches` (nullable, `null` = brak wyniku);
   wynik będzie potrzebny także później. Źródło: `match_hometeam_score` / `match_awayteam_score`
   (pusty string → `null`).
3. **Nazwy drużyn mapujemy na polską pisownię** (tabela w imporcie, np. `Wisla Plock` → `Wisła Płock`).
   Nazwa spoza tabeli zostaje bez zmian, a import wypisuje ostrzeżenie.
4. **Strefa czasowa:** zapytanie z `timezone=UTC` i losowym parametrem przeciw cache,
   `starts_at = <match_date>T<match_time>:00Z` (szczegóły w `api-reference.md`).
5. **Import idempotentny** (upsert po `external_source` + `external_id`), żeby dało się go uruchomić
   ponownie przed końcem planu płatnego i złapać mecze, którym ustalono termin.

Do uwzględnienia w planie przy decyzji 2:

- **Pokrywa się z S-04 (`result-to-standings`)** z `context/foundation/roadmap.md`, gdzie organizator
  wpisuje wynik, a z niego liczą się punkty. Kolumny wyniku dodane tutaj muszą być tymi, których S-04
  użyje (nazwy i zakres jak w `tips`: `score_a` / `score_b smallint`, 0–99), a nie drugim zestawem.
  Ta zmiana dodaje tylko kolumny i ich zapis przy imporcie; formularz wyniku, punkty i klasyfikacja
  zostają w S-04.
- **Roadmapa parkuje „Pobieranie meczów i wyników z zewnątrz”** (PRD §Non-Goals). Ta zmiana jest
  świadomym, jednorazowym wyjątkiem na dane startowe, nie stałą synchronizacją.
- Na zaimportowane rozegrane mecze nie ma typów, więc po S-04 nie dadzą nikomu punktów; są historią.

Opis API (parametry, pola, mapowanie na `public.matches`): `api-reference.md` w tym folderze.

### Sekrety

Klucz apifootball.com **nie** może trafić do repozytorium ani do tego pliku. Trzymać go w zmiennej
środowiskowej `APIFOOTBALL_KEY` (np. w gitignorowanym `.env`); jeśli import zostanie endpointem,
dodać go do `astro:env/server` i `.dev.vars`, a w `.env.example` zostawić `APIFOOTBALL_KEY=###`.
Klucz API-Football (api-sports.io) nie jest już potrzebny.
