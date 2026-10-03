# Mecz na wspólnej liście (S-01) Implementation Plan

## Overview

Pierwszy przekrój funkcjonalny Ligi typera (roadmap S-01; PRD US-01, FR-001, FR-011). Organizator dodaje mecz: dwie strony (drużyny albo zawodnicy) oraz datę i godzinę rozpoczęcia. Organizator i pracownik widzą ten mecz na jednej, wspólnej liście pod `/matches`. Slice wprowadza też pierwszą persystencję (migracja Supabase) i rozdzielenie ról, bo dodawanie meczu jest pierwszą akcją, którą można wykonać tylko w jednej z ról.

## Current State Analysis

- Baza danych nie ma żadnych tabel aplikacji. `AGENTS.md:25` mówi „`supabase/` is CLI config only; no SQL migrations are committed”, `README.md:115` mówi „No database tables or migrations are required”, a `CLAUDE.md` (Key conventions → Supabase) mówi „Auth uses the built-in `auth.users` table only”. Te trzy zapisy przestają być prawdziwe po tym slice'ie.
- W `supabase/` jest tylko `config.toml` (plus `.gitignore`). `[db.migrations]` jest domyślnie włączone, więc `supabase start` / `supabase db reset` zastosuje pliki z `supabase/migrations/`. `enable_confirmations = false`, więc konta smoke logują się od razu.
- Ról nie ma: `src/middleware.ts:6-25` ustawia tylko `locals.user`, a `src/env.d.ts:2-4` deklaruje tylko `user`.
- Ochrona tras działa przez `PROTECTED_ROUTES` z dopasowaniem `startsWith` (`src/middleware.ts:4,18`). `/api/matches` nie zaczyna się od `/matches`, więc musi być dopisane osobno.
- Wzorzec endpointu formularza: `POST` czyta `formData()`, tworzy klienta `createClient(headers, cookies)`, przy błędzie przekierowuje na `?error=<encoded>`, a przy sukcesie robi redirect (`src/pages/api/auth/signin.ts:4-20`).
- Smoke (`scripts/smoke.mjs`) to skrypt bez zależności z jednym słoikiem ciasteczek (`jar`, linia 7) i `request()`, który zwraca tylko status i location (linia 35). Nie da się w nim prowadzić dwóch sesji ani sprawdzić treści strony bez rozbudowy.
- CI `smoke` (`.github/workflows/ci.yml:39-53`) uruchamia lokalne Supabase CLI, wycina z `supabase status -o env` tylko `API_URL` i `ANON_KEY` i pisze je do `.env` / `.dev.vars`.
- Walidacja: zod jest dostępny jako `astro/zod` (`node_modules/astro/package.json` export `./zod`), bez nowej zależności.

## Desired End State

- Każde konto ma wiersz w `public.profiles` z rolą `employee` (nowe konta przez trigger, istniejące przez backfill w migracji). Rolę `organizer` nadaje się ręcznie jednym `UPDATE` (opisanym w README). Użytkownik nie może zmienić własnej roli.
- Tabela `public.matches` przechowuje mecze. RLS pozwala czytać zalogowanym, a wstawiać tylko organizatorowi, także przy bezpośrednim wywołaniu REST Supabase z tokenem pracownika.
- `/matches` (chroniona) pokazuje wszystkie mecze rosnąco po starcie, a przy równym starcie w kolejności dodania. Mecze, które już się zaczęły, zostają na liście. Godziny są pokazywane w czasie Europe/Warsaw. Organizator widzi nad listą formularz dodawania, pracownik go nie widzi.
- `POST /api/matches` waliduje dane (zod), czyta godzinę jako Europe/Warsaw, zapisuje ją jako `timestamptz` i wraca na `/matches`. Dla pracownika zwraca przekierowanie z `?error=` bez zapisu.
- `npm run smoke` sprawdza outcome S-01 end-to-end, a CI uruchamia go z kluczem service role.

Weryfikacja: organizator wpisuje „Polska” – „Niemcy”, `2026-10-10 20:45`. W bazie `starts_at = 2026-10-10 18:45:00+00`, a pracownik widzi na `/matches` „Polska – Niemcy, 10.10.2026, 20:45”.

### Key Discoveries:

- `src/middleware.ts:9-16`: user jest pobierany przy każdym żądaniu, więc tu doczytujemy rolę (jedno zapytanie, tylko dla zalogowanego).
- `src/pages/api/auth/signin.ts:9-12`: obsługa `createClient()` zwracającego `null` (brak konfiguracji). Powtórzyć w nowym endpoincie.
- `src/components/Topbar.astro:10-12`: miejsce na link do listy obok „Dashboard”.
- `.github/workflows/ci.yml:42`: `grep` zostawia tylko `API_URL|ANON_KEY`. Trzeba dodać `SERVICE_ROLE_KEY`, ale nie wpisywać go do `.env` aplikacji.
- `supabase/config.toml:58-70`: migracje włączone, `seed.sql` skonfigurowany, ale nieobecny (nie jest potrzebny).

## What We're NOT Doing

- Edycja i usuwanie meczu (S-05, FR-003 dropped). Brak polityk RLS `UPDATE`/`DELETE` na `matches`.
- UI do nadawania ról ani „pierwsze konto = organizator”. Rolę nadaje się SQL-em.
- Typy, wyniki, punkty, klasyfikacja (S-02 … S-04).
- Katalog drużyn i zawodników. Strony to wolny tekst.
- Strefa czasowa przeglądarki. Zawsze stała Europe/Warsaw.
- Podział listy na sekcje nadchodzące i rozegrane, paginacja.
- Blokada dodawania meczów z datą w przeszłości (dozwolone świadomie).
- Generowane typy bazy (`supabase gen types`). Typy pisane ręcznie w `src/types.ts`.
- Test runner i pliki `*.test.ts` (zakaz z `AGENTS.md:7`). Weryfikacja przez smoke.
- Zmiany w `/dashboard` i przekierowaniu po logowaniu (`/`).

## Implementation Approach

Kolejność „schemat → logika → API → UI → weryfikacja”. Faza 1 kładzie migrację, role w `locals` i dokumentację. Bezpieczeństwo zapisu leży w RLS (`is_organizer()`), a sprawdzenie roli w aplikacji służy tylko UX i czytelnemu komunikatowi. Faza 2 dokłada helper czasu, serwis, endpoint i stronę według wzorca endpointów auth. Faza 3 rozszerza smoke o dwie sesje (pracownik i organizator), a organizatora zakłada admin API Supabase z kluczem service role, przekazywanym tylko do kroku smoke.

## Critical Implementation Details

**Konwersja czasu Europe/Warsaw bez biblioteki.** `<input type="datetime-local">` wysyła `YYYY-MM-DDTHH:mm` bez strefy, a Worker działa w UTC, więc `new Date(value)` dałby błędną godzinę. Offset trzeba policzyć przez `Intl.DateTimeFormat` z `timeZone: "Europe/Warsaw"` w dwóch przebiegach (stabilizuje wynik przy zmianie czasu). Kontrolnie: `2026-10-10T20:45` → `2026-10-10T18:45:00Z` (CEST, +2), `2026-12-10T20:45` → `2026-12-10T19:45:00Z` (CET, +1). Godzina nieistniejąca (np. `2027-03-28T02:30`) ma zostać odrzucona: wynik sformatowany z powrotem w Warszawie musi być równy wejściu. Godzina podwójna przy przejściu na czas zimowy (np. `2026-10-25T02:30`, występuje w CEST i w CET) też ma zostać odrzucona jako nieistniejąca: jeśli oba kandydaty `guess − offsetMs(guess − 3h)` i `guess − offsetMs(guess + 3h)` są różne i oba po sformatowaniu w Warszawie dają wejście, zwróć `null`. To rzadki przypadek, więc świadomie nie wybieramy wariantu.

**Rola w RLS bez rekurencji.** Polityka insert na `matches` woła `public.is_organizer()` jako `security definer` z `set search_path = ''`, żeby czytać `profiles` niezależnie od RLS `profiles` (które pozwala czytać tylko własny wiersz).

## Phase 1: Schemat i role

### Overview

Pierwsza migracja (profile z rolą, tabela meczów, RLS), wspólne typy, rola w `Astro.locals` i aktualizacja dokumentacji, która dziś zabrania migracji.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261001000000_profiles_and_matches.sql`

**Intent**: Utworzyć profile z rolą (domyślnie pracownik), automatycznie zakładane dla każdego konta, oraz tabelę meczów, którą czytają wszyscy zalogowani, a zapisuje tylko organizator. Bez ścieżki do samodzielnej zmiany roli.

**Contract**:
- `public.profiles(user_id uuid primary key references auth.users(id) on delete cascade, role text not null default 'employee' check (role in ('organizer','employee')), created_at timestamptz not null default now())`. RLS włączone. Jedyna polityka: `select` dla `authenticated` z `user_id = (select auth.uid())`. Brak polityk insert/update/delete.
- `public.handle_new_user()` (`security definer`, `set search_path = ''`) i trigger `after insert on auth.users` wstawiający `(new.id)` do `profiles`. Backfill: `insert into public.profiles (user_id) select id from auth.users on conflict do nothing`.
- `public.is_organizer() returns boolean` (`stable`, `security definer`, `set search_path = ''`): istnieje profil `auth.uid()` z `role = 'organizer'`.
- `public.matches(id bigint generated always as identity primary key, side_a text not null, side_b text not null, starts_at timestamptz not null, created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now())`. Checki: `char_length(btrim(side_x)) between 1 and 100` dla obu stron oraz `lower(btrim(side_a)) <> lower(btrim(side_b))`. Indeks `(starts_at, id)`.
- RLS `matches`: `select` dla `authenticated` `using (true)`, `insert` dla `authenticated` `with check (public.is_organizer() and created_by = (select auth.uid()))`. Brak update/delete.
- Jawne uprawnienia (niezależne od domyślnych grantów Supabase w `public`): `grant select on public.profiles to authenticated; grant select, insert on public.matches to authenticated;`. Bez grantów dla `anon`.

#### 2. Typy współdzielone

**File**: `src/types.ts` (nowy)

**Intent**: Jedno miejsce na typy encji i DTO dla meczów i ról (konwencja z `CLAUDE.md`).

**Contract**: `type Role = "organizer" | "employee"`; `interface Match { id: number; side_a: string; side_b: string; starts_at: string; created_at: string }`; `interface CreateMatchInput { side_a: string; side_b: string; starts_at: string /* ISO UTC */ }`.

#### 3. Rola w locals

**Files**: `src/env.d.ts`, `src/middleware.ts`

**Intent**: Każde żądanie zalogowanego zna rolę, żeby strona mogła pokazać formularz, a endpoint odmówić wcześnie.

**Contract**: `App.Locals` dostaje `role: import("@/types").Role | null`. Po `getUser()` middleware dla zalogowanego czyta `profiles.role` (`.eq("user_id", user.id).maybeSingle()`). Brak wiersza albo błąd oznacza `"employee"`, a anonim dostaje `null`. `PROTECTED_ROUTES` na razie bez zmian (faza 2).

#### 4. Dokumentacja reguł repo

**Files**: `AGENTS.md`, `CLAUDE.md`, `README.md`

**Intent**: Usunąć zakaz migracji i opisać nowy stan: migracje są commitowane, tabele `profiles`/`matches`, nadawanie roli organizatora SQL-em.

**Contract**:
- `AGENTS.md` (Layout, linia 25): `supabase/migrations/` zawiera commitowane migracje SQL; lokalnie stosuje je `npx supabase start` / `npx supabase db reset`.
- `CLAUDE.md` (Key conventions → Supabase): schemat aplikacji w `supabase/migrations/`, role w `public.profiles`.
- `README.md` (linia 115 i nowa podsekcja „Roles”): zamiast „No database tables” opis migracji, `npx supabase db push` dla projektu w chmurze i polecenie nadania roli: `update public.profiles set role = 'organizer' where user_id = (select id from auth.users where email = '<email>');`.

### Success Criteria:

#### Automated Verification:

- Migracja stosuje się na czysto: `npx supabase db reset`
- Type check przechodzi: `npx astro check`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Istniejący smoke przechodzi bez regresji: `npm run smoke`

#### Manual Verification:

- W Studio nowo zarejestrowane konto ma wiersz w `profiles` z `role = 'employee'`
- Po `UPDATE` z README konto ma `role = 'organizer'`, a zalogowany pracownik nie może przez REST Supabase zmienić swojej roli (brak polityki update)

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Phase 2: Dodawanie i lista meczów

### Overview

Helper czasu, serwis meczów, endpoint `POST /api/matches`, chroniona strona `/matches` z listą i formularzem dla organizatora oraz link w `Topbar`.

### Changes Required:

#### 1. Helper czasu Europe/Warsaw

**File**: `src/lib/time.ts` (nowy)

**Intent**: Zamienić lokalny czas warszawski z formularza na instant UTC i sformatować instant do wyświetlenia w Warszawie, niezależnie od strefy runtime'u.

**Contract**: `warsawLocalToUtc(local: string): Date | null`. Przyjmuje `YYYY-MM-DDTHH:mm`. Zwraca `null` dla złego formatu, nieistniejącej daty kalendarzowej albo godziny nieistniejącej w Warszawie (test powrotnego formatowania), a także dla godziny podwójnej przy zmianie czasu (patrz Critical Implementation Details). `formatWarsaw(iso: string): string`: `pl-PL`, `timeZone: "Europe/Warsaw"`, data i godzina, np. `10.10.2026, 20:45`. Stała `TIME_ZONE = "Europe/Warsaw"`. Algorytm offsetu:

```ts
function offsetMs(at: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(at).map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - at.getTime();
}
// guess = Date.UTC(fields of local); utc = guess - offsetMs(new Date(guess)); utc = guess - offsetMs(new Date(utc));
```

#### 2. Serwis meczów

**File**: `src/lib/services/matches.ts` (nowy)

**Intent**: Wydzielić zapytania o mecze z endpointu i strony.

**Contract**: `listMatches(supabase): Promise<Match[]>`: `order("starts_at", asc)`, potem `order("id", asc)`. `createMatch(supabase, input: CreateMatchInput): Promise<{ error: string | null }>`. Insert bez `created_by` (default `auth.uid()`), błąd RLS i checków logowany (`console.error(error.message)`), a zwracany jako stały polski komunikat „Nie udało się zapisać meczu” (bez nazw constraintów). `supabase` typowany jako `NonNullable<ReturnType<typeof createClient>>`.

#### 3. Endpoint dodawania

**File**: `src/pages/api/matches.ts` (nowy)

**Intent**: Przyjąć formularz organizatora, zwalidować go i zapisać mecz według wzorca endpointów auth.

**Contract**: `export const POST: APIRoute`. Pola formularza: `side_a`, `side_b`, `starts_at`. Schemat zod (`import { z } from "astro/zod"`):
- obie strony to stringi po `trim`, długość 1–100, różne bez względu na wielkość liter;
- `starts_at` musi dać się zamienić przez `warsawLocalToUtc`.

Kolejność obsługi:
1. Brak klienta: redirect `/matches?error=Supabase is not configured`.
2. `locals.role !== "organizer"`: redirect `/matches?error=<Tylko organizator może dodawać mecze>`, bez zapytania do bazy.
3. Błąd walidacji: redirect `/matches?error=<pierwszy komunikat>`.
4. Błąd zapisu: redirect `/matches?error=<komunikat>`.
5. Sukces: redirect `/matches`.

Komunikaty po polsku.

#### 4. Strona listy

**File**: `src/pages/matches.astro` (nowy)

**Intent**: Jedna lista dla obu ról, a formularz tylko dla organizatora (FR-011, FR-001).

**Contract**: Statyczna strona `.astro` (bez wyspy React, formularz HTML z `method="POST" action="/api/matches"`) w `Layout` z `Topbar`. Dla `locals.role === "organizer"` pokazuje formularz z polami `side_a`, `side_b` (`required`, `maxlength=100`) i `starts_at` (`type="datetime-local"`, `required`) oraz komunikatem `?error=` (styl jak `ServerError`). Lista: `listMatches()`, każdy wiersz to `side_a – side_b` i `formatWarsaw(starts_at)`. Przy pustej liście komunikat „Brak meczów”. Klasy przez `cn()` tam, gdzie są warunkowe. Styl zgodny z `src/pages/dashboard.astro`.

#### 5. Nawigacja i ochrona tras

**Files**: `src/middleware.ts`, `src/components/Topbar.astro`

**Intent**: Anonim nie widzi listy i nie może wysłać formularza. Zalogowany ma do listy link.

**Contract**: `PROTECTED_ROUTES = ["/dashboard", "/matches", "/api/matches"]`. W `Topbar` link `href="/matches"` „Mecze” przed „Dashboard”.

### Success Criteria:

#### Automated Verification:

- Type check przechodzi: `npx astro check`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Istniejący smoke przechodzi: `npm run smoke`

#### Manual Verification:

- Organizator dodaje „Polska” – „Niemcy”, `2026-10-10 20:45`. W Studio `starts_at = 2026-10-10 18:45:00+00`, a na liście „10.10.2026, 20:45”.
- Mecz dodany na `2026-12-10 20:45` ma w bazie `19:45:00+00` (CET) i wyświetla się jako 20:45
- Pracownik widzi ten sam mecz na `/matches`, nie widzi formularza, a wysłany ręcznie `POST /api/matches` wraca z `?error=` i nie tworzy meczu
- Dwa mecze z tym samym startem pokazują się w kolejności dodania, a mecz z datą w przeszłości daje się dodać i zostaje na liście
- Puste strony, identyczne strony („Polska”/„polska”) i godzina nieistniejąca (`2027-03-28 02:30`) dają czytelny błąd bez zapisu
- Anonim na `/matches` jest przekierowany do `/auth/signin`

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed fazą 3.

---

## Phase 3: Smoke i CI

### Overview

Rozszerzyć smoke o outcome S-01 (anonim, pracownik, organizator) i przekazać w CI klucz service role tylko do kroku smoke.

### Changes Required:

#### 1. Smoke test

**File**: `scripts/smoke.mjs`

**Intent**: Automatycznie sprawdzać, że obie role widzą tę samą listę, pracownik nie doda meczu, a organizator doda. Bez nowych zależności.

**Contract**:
- Sesje: osobny słoik ciasteczek na użytkownika (pracownik i organizator).
- `request()` zwraca dodatkowo `body` (tekst), a `expected` może mieć `contains` / `notContains`.
- Kroki doklejone za istniejącymi, które zostają bez zmian:
  1. anonimowy `/matches` daje 302 → `/auth/signin`;
  2. anonimowy `POST /api/matches` daje 302 → `/auth/signin`;
  3. zalogowany pracownik (konto z istniejącego signup, ponowny sign-in po signout) dostaje 200 na `/matches` bez formularza (`notContains` `action="/api/matches"`);
  4. `POST /api/matches` od pracownika daje 302 → `/matches?error=`, a `/matches` nie zawiera unikalnej nazwy meczu.
- Kroki organizatora (tylko gdy ustawione `SUPABASE_URL`, `SUPABASE_KEY` (anon) i `SUPABASE_SERVICE_ROLE_KEY`; w przeciwnym razie `SKIP` bez faila, chyba że ustawione `SMOKE_REQUIRE_ADMIN=1` — wtedy brak kluczy to `FAIL`):
  1. `POST {SUPABASE_URL}/auth/v1/admin/users` (`{email, password, email_confirm: true}`, nagłówki `apikey` + `Authorization: Bearer`) zwraca `id`;
  2. `PATCH {SUPABASE_URL}/rest/v1/profiles?user_id=eq.<id>` ustawia `{role: "organizer"}`;
  3. sign-in przez aplikację;
  4. `/matches` zawiera formularz;
  5. `POST /api/matches` z unikalnymi stronami `Smoke A <ts>` / `Smoke B <ts>` i `starts_at` daje 302 → `/matches` (bez `?error=`);
  6. `/matches` pracownika zawiera `Smoke A <ts>`;
  7. RLS bez aplikacji: pracownik loguje się wprost przez `POST {SUPABASE_URL}/auth/v1/token?grant_type=password` (`apikey` = anon), a `POST {SUPABASE_URL}/rest/v1/matches` z jego tokenem w `Authorization: Bearer` zwraca 401 albo 403 (dowód, że to RLS, a nie endpoint, blokuje zapis).
- Klucz service role nigdy nie trafia do aplikacji. Używa go wyłącznie skrypt.

#### 2. CI

**File**: `.github/workflows/ci.yml`

**Intent**: Uruchamiać kroki organizatora w CI na lokalnym Supabase.

**Contract**: W `grep` dodać `SERVICE_ROLE_KEY`. `.env` / `.dev.vars` dalej mają tylko `SUPABASE_URL`/`SUPABASE_KEY`. Krok smoke: `source supabase.env` i `SUPABASE_URL="$API_URL" SUPABASE_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" SMOKE_REQUIRE_ADMIN=1 BASE_URL=http://localhost:4321 npm run smoke`.

#### 3. Opis smoke

**Files**: `CLAUDE.md` (Commands, Verification), `README.md` (Smoke test)

**Intent**: Lista kontroli smoke i wymagane env odpowiadają nowym krokom.

**Contract**: Dopisać nowe kroki do listy w `CLAUDE.md` → Verification oraz opisać opcjonalne `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (lokalnie: `npx supabase status -o env`).

### Success Criteria:

#### Automated Verification:

- Lokalnie z kluczem service role wszystkie kroki smoke mają `PASS`, w tym organizatora: `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run smoke`
- Bez klucza service role kroki organizatora mają `SKIP`, a smoke kończy się kodem 0: `npm run smoke`
- Lint przechodzi: `npm run lint`
- Job `smoke` w CI przechodzi na PR z tą zmianą

#### Manual Verification:

- Log CI pokazuje `PASS` (nie `SKIP`) dla kroków organizatora, a klucz service role nie pojawia się w `.env` ani w logu

---

## Testing Strategy

### Unit Tests:

- Brak (zakaz test runnera w `AGENTS.md:7`). Logikę czasu sprawdzają przypadki kontrolne w Manual Verification fazy 2.

### Integration Tests:

- `scripts/smoke.mjs` przez HTTP: ochrona tras dla anonima, lista i odmowa zapisu dla pracownika, dodanie i widoczność meczu dla organizatora.

### Manual Testing Steps:

1. `npx supabase db reset`, `npm run dev`, rejestracja dwóch kont, nadanie jednemu roli SQL-em z README.
2. Organizator dodaje mecz CEST i mecz CET; porównaj `starts_at` w Studio z wyświetlaną godziną.
3. Pracownik widzi oba mecze w tej samej kolejności i nie widzi formularza.
4. Przypadki błędne: puste i identyczne strony, godzina `2027-03-28 02:30` (nieistniejąca) i `2026-10-25 02:30` (podwójna).

## Performance Considerations

Jedno dodatkowe zapytanie (`profiles.role`) na żądanie zalogowanego w middleware. Przy skali firmowej to pomijalne. Lista bez paginacji, indeks `(starts_at, id)` pokrywa sortowanie.

## Migration Notes

Pierwsza migracja w repo. Lokalnie: `npx supabase db reset` (albo świeże `supabase start`). W chmurze: `npx supabase db push`. Backfill zakłada profil `employee` dla kont istniejących przed migracją. Organizatora trzeba potem nadać ręcznie. Wycofanie: nowa migracja usuwająca tabele, trigger i funkcje (nie ma danych do zachowania przed S-02).

## References

- Roadmap: `context/foundation/roadmap.md` (S-01)
- PRD: `context/foundation/prd.md` (US-01, FR-001, FR-011, Access Control)
- Wzorzec endpointu: `src/pages/api/auth/signin.ts:4-20`
- Ochrona tras: `src/middleware.ts:4-22`
- Smoke: `scripts/smoke.mjs:23-59`; CI: `.github/workflows/ci.yml:39-53`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schemat i role

#### Automated

- [x] 1.1 Migracja stosuje się na czysto: `npx supabase db reset` — 5d78514
- [x] 1.2 Type check przechodzi: `npx astro check` — 5d78514
- [x] 1.3 Lint przechodzi: `npm run lint` — 5d78514
- [x] 1.4 Build przechodzi: `npm run build` — 5d78514
- [x] 1.5 Istniejący smoke przechodzi bez regresji: `npm run smoke` — 5d78514

#### Manual

- [x] 1.6 W Studio nowo zarejestrowane konto ma wiersz w `profiles` z `role = 'employee'` — 5d78514
- [x] 1.7 Po `UPDATE` z README konto ma `role = 'organizer'`, a zalogowany pracownik nie może przez REST Supabase zmienić swojej roli (brak polityki update) — 5d78514

### Phase 2: Dodawanie i lista meczów

#### Automated

- [x] 2.1 Type check przechodzi: `npx astro check`
- [x] 2.2 Lint przechodzi: `npm run lint`
- [x] 2.3 Build przechodzi: `npm run build`
- [x] 2.4 Istniejący smoke przechodzi: `npm run smoke`

#### Manual

- [x] 2.5 Organizator dodaje „Polska” – „Niemcy”, `2026-10-10 20:45`. W Studio `starts_at = 2026-10-10 18:45:00+00`, a na liście „10.10.2026, 20:45”.
- [x] 2.6 Mecz dodany na `2026-12-10 20:45` ma w bazie `19:45:00+00` (CET) i wyświetla się jako 20:45
- [x] 2.7 Pracownik widzi ten sam mecz na `/matches`, nie widzi formularza, a wysłany ręcznie `POST /api/matches` wraca z `?error=` i nie tworzy meczu
- [x] 2.8 Dwa mecze z tym samym startem pokazują się w kolejności dodania, a mecz z datą w przeszłości daje się dodać i zostaje na liście
- [x] 2.9 Puste strony, identyczne strony („Polska”/„polska”) i godzina nieistniejąca (`2027-03-28 02:30`) dają czytelny błąd bez zapisu
- [x] 2.10 Anonim na `/matches` jest przekierowany do `/auth/signin`

### Phase 3: Smoke i CI

#### Automated

- [ ] 3.1 Lokalnie z kluczem service role wszystkie kroki smoke mają `PASS`, w tym organizatora: `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run smoke`
- [ ] 3.2 Bez klucza service role kroki organizatora mają `SKIP`, a smoke kończy się kodem 0: `npm run smoke`
- [ ] 3.3 Lint przechodzi: `npm run lint`
- [ ] 3.4 Job `smoke` w CI przechodzi na PR z tą zmianą

#### Manual

- [ ] 3.5 Log CI pokazuje `PASS` (nie `SKIP`) dla kroków organizatora, a klucz service role nie pojawia się w `.env` ani w logu
