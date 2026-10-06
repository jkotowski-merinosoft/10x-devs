# apifootball.com: opis API dla importu Ekstraklasy

Źródło: oficjalna dokumentacja <https://apifootball.com/documentation/> (API V3, wersja 3.0.2, ostatnia
aktualizacja 2023-07-22) oraz wywołania testowe na kluczu użytkownika z 2026-10-06 (`change.md`).
Dostawcy nie ma w Context7. To inny serwis niż API-Football (api-sports.io).

## Dostęp

- Bazowy URL: `https://apiv3.apifootball.com/`
- Każde wywołanie: `GET /?action=<akcja>&APIkey=<klucz>&...`
- Klucz jest w query stringu, nie w nagłówku. Nie logować pełnego URL (wyciek klucza do logów).
- Klucz: zmienna środowiskowa `APIFOOTBALL_KEY`, nigdy w repozytorium.
- Plan: płatny, bez limitu zapytań, ważny 14 dni od 2026-10-06 (do ok. 2026-10-20). Dokumentacja nie
  opisuje limitów ani kodów błędów przy przekroczeniu planu.
- Dokumentacja nie opisuje formatu błędów (niesprawdzone). Skrypt powinien sprawdzić, że odpowiedź jest
  niepustą tablicą (`Array.isArray`), zanim cokolwiek zapisze.

## Akcje potrzebne do importu

### `get_leagues`

Lista rozgrywek dostępnych w planie.

| Parametr | Wymagany | Opis |
|---|---|---|
| `country_id` | nie | tylko ligi z danego kraju |

Pola odpowiedzi: `country_id`, `country_name`, `league_id`, `league_name`, `league_season`,
`league_logo`, `country_logo`.

Zweryfikowane id: Ekstraklasa `259` (2026/2027), Puchar Polski `260`, Liga Narodów `633`,
Liga Mistrzów `3`, MŚ `28`.

### `get_events`

Mecze z danego zakresu dat.

| Parametr | Wymagany | Opis |
|---|---|---|
| `from` | tak | data początkowa `yyyy-mm-dd` |
| `to` | tak | data końcowa `yyyy-mm-dd` |
| `league_id` | nie | tylko dana liga (`259`) |
| `timezone` | nie | strefa w formacie TZ (np. `Europe/Warsaw`); domyślnie `Europe/Berlin` |
| `match_id` | nie | jeden mecz |
| `team_id`, `country_id` | nie | dodatkowe filtry |
| `match_live` | nie | `1` = tylko mecze na żywo |
| `withPlayerStats` | nie | dołącza statystyki zawodników (niepotrzebne) |

Wywołanie importu:
`?action=get_events&league_id=259&from=2026-07-01&to=2027-06-30&APIkey=…` → 306 meczów sezonu 2026/27
w jednej odpowiedzi (2026-10-06: 78 `Finished`, 218 `Not Started`, 10 z pustym statusem).

Pola istotne dla importu (wszystkie wartości są stringami):

| Pole | Przykład | Uwagi |
|---|---|---|
| `match_id` | `"780234"` | stabilne id zewnętrzne |
| `match_date` | `"2026-10-09"` | bez strefy |
| `match_time` | `"18:00"` | bez strefy, patrz „Otwarte kwestie” |
| `match_status` | `"Not Started"`, `"Finished"`, `""` | pusty status: znaczenie niepotwierdzone |
| `match_round` | `"12"` | kolejka |
| `match_hometeam_id`, `match_awayteam_id` | `"3081"` | id drużyn |
| `match_hometeam_name`, `match_awayteam_name` | `"Wisla Plock"` | bez polskich znaków |
| `match_hometeam_score`, `match_awayteam_score` | `""` przed meczem | importujemy dla `Finished`, `""` → `null` |
| `match_stadium` | `"Stadion … (Miasto)"` | |
| `team_home_badge`, `team_away_badge` | URL | herby, na razie niepotrzebne |
| `league_year` | `"2026/2027"` | |

Odpowiedź zawiera też pola, których import nie używa: składy, strzelców, kartki, statystyki.

## Mapowanie na `public.matches`

| Kolumna | Źródło |
|---|---|
| `side_a` | `match_hometeam_name` (ewentualnie zmapowana na polską pisownię) |
| `side_b` | `match_awayteam_name` |
| `starts_at` | `match_date` + `match_time` w strefie, w której API faktycznie zwraca czas |
| `created_by` | id organizatora podane jawnie (import przez service role, `auth.uid()` jest pusty) |
| `external_source` / `external_id` | `'apifootball'` / `match_id`; kolumny wymagają nowej migracji z unikalnym indeksem na parze |
| `score_a` / `score_b` (nowe, nullable) | `match_hometeam_score` / `match_awayteam_score`, tylko dla `Finished` |

Wyniki przyszłych meczów wpisuje organizator (S-04).

## Otwarte kwestie przed implementacją

1. **Strefa czasowa: rozstrzygnięte (2026-10-06).** `get_events&league_id=259&from=2026-10-09&to=2026-10-12`
   dla meczu o 18:00 w oficjalnym terminarzu Ekstraklasy: bez parametru 18:00, `Europe/Warsaw` 18:00,
   `UTC` 16:00, `America/New_York` 12:00. Parametr działa, a domyślna strefa to czas warszawski.
   **Pułapka: cache.** Po zmianie samego `timezone` w tym samym URL odpowiedź bywa przez chwilę
   nieaktualna (po `America/New_York` zapytanie z `UTC` wciąż zwracało 12:00). Pomaga odświeżenie po
   czasie albo dodatkowy losowy parametr (np. `&_=<timestamp>`). Prawdopodobnie to właśnie zepsuło
   wcześniejszy test z `match_id=780234`. Nie wiadomo, czy cache jest po stronie przeglądarki, czy
   dostawcy.
   Rekomendacja dla skryptu: `timezone=UTC` + losowy parametr przeciw cache, wtedy
   `starts_at = <match_date>T<match_time>:00Z` bez przeliczania czasu letniego. Sezon przechodzi przez
   zmianę czasu (2026-10-25 i 2027-03-28). Sprawdzenie po imporcie: kilka meczów porównać z terminarzem.
2. **Pusty `match_status`** (10 meczów): pomijamy (decyzja z 2026-10-06).
3. **Mecze rozegrane** (`Finished`): importujemy z wynikiem, nowe kolumny wyniku (decyzja z 2026-10-06,
   szczegóły w `change.md`).
4. **Nazwy drużyn:** mapujemy na polską pisownię (decyzja z 2026-10-06).

## Alternatywy (odrzucone, dla porządku)

| Źródło | Context7 | Dlaczego nie |
|---|---|---|
| API-Football (api-sports.io) | `/websites/api-football_documentation-v3` | darmowy plan tylko sezony 2022–2024 |
| football-data.org v4 | `/websites/football-data_general_v4` (najlepiej udokumentowane) | brak Ekstraklasy w darmowym planie |
| openfootball | `/websites/openfootball_github_io` | brak bieżącego sezonu |
