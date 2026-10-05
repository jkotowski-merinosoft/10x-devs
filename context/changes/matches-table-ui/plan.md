# Interaktywna tabela meczów Implementation Plan

## Overview

Lista `/matches` staje się interaktywną tabelą (wyspa React) zbudowaną na generycznym `DataTable` (TanStack Table + shadcn `Table`). Tabela ma wyszukiwanie po nazwach drużyn, sortowanie po dacie rozpoczęcia, stan zapisany w URL, modal „Dodaj mecz” dla organizatora i modal typowania otwierany kliknięciem w „brak typu” lub własny typ. Zapis meczu lub typu aktualizuje tabelę bez przeładowania strony. Zmiana jest spoza roadmapy. Jej drugim celem jest zestaw bazowych komponentów (motyw shadcn dopasowany do „cosmic”, Dialog, Input, Label, Field/Form, Sonner, `DataTable`, klient JSON i wspólne schematy zod), na którym powstaną kolejne strony (stawki S-03, wynik i klasyfikacja S-04).

## Current State Analysis

- `/matches` renderuje `<ul>` w `.astro`, a formularz dodawania meczu dla organizatora wisi stale nad listą (`src/pages/matches.astro:45-73,88-115`). Wiersz pokazuje link do meczu, datę, „Twój typ: A:B” albo „brak typu” oraz status „otwarte”/„zamknięte” (`src/pages/matches.astro:93-111`).
- `POST /api/matches` i `POST /api/tips` przyjmują `formData`, walidują zod (`astro/zod`) i zawsze odpowiadają przekierowaniem: sukces → `/matches` lub `/matches/{id}`, błąd → `?error=` (`src/pages/api/matches.ts:304-331`, `src/pages/api/tips.ts:357-405`). Schematy zod są zdefiniowane lokalnie w plikach endpointów.
- `createMatch` i `saveTip` zwracają tylko `{ error }`, bez zapisanego wiersza (`src/lib/services/matches.ts:452-465`, `src/lib/services/tips.ts:541-557`).
- Z shadcn/ui jest tylko `Button` (`src/components/ui/button.tsx`). Tokeny w `src/styles/global.css` to domyślna neutralna paleta, a klasa `.dark` nigdzie nie jest włączona. `body` ma `bg-background text-foreground` (`src/styles/global.css:121-123`), a każda strona nakłada `bg-cosmic`. Komponenty shadcn wyrenderowałyby się jako jasne elementy na ciemnym tle.
- Interaktywne formularze auth to kontrolowany `useState` z ręczną walidacją (`src/components/auth/SignInForm.tsx`). Nie ma react-hook-form, TanStack ani sonner.
- `formatWarsaw` i `warsawLocalToUtc` (`src/lib/time.ts`) opierają się wyłącznie na `Intl`, więc działają też w przeglądarce.
- `astro/zod` to zwykły re-eksport `zod/v4` 4.6.2 (`node_modules/astro/dist/zod.js`), więc schematy mogą być importowane po stronie klienta.
- Smoke zależy od obecnego HTML:
  - `FORM = 'action="/api/matches"'` (`scripts/smoke.mjs:24,155,218`);
  - `matchRow` wycina `<li …</li>` (`scripts/smoke.mjs:102-109`);
  - asercje `"Twój typ: 97:3"`, `"Twój typ: 98:4"`, `notContains: "97:3"`, `"brak typu"`, `notContains: "1:0"` (`scripts/smoke.mjs:247,256,331`).
- Strona `/matches/[id]` (formularz typu HTML, typy wszystkich po rozpoczęciu meczu) zostaje i dalej jest pokryta przez smoke.

## Desired End State

- `/matches` pokazuje tabelę z kolumnami: Mecz (link do `/matches/{id}`), Data (sortowalna ↑↓), Twój typ (przycisk), Status. Na ekranach węższych niż `sm` kolumny Data i Status są ukryte: data jest drugą linią pod nazwą meczu, a status kolorową kropką przy typie. Tabela przewija się poziomo w swoim kontenerze.
- Pole wyszukiwania filtruje po Stronie A i B, bez rozróżniania wielkości liter i polskich znaków („lodz” znajduje „Łódź”). Fraza i kierunek sortowania trafiają do `?q=&sort=asc|desc`. Odświeżenie strony albo link odtwarza widok, a HTML z serwera jest już przefiltrowany i posortowany.
- Organizator widzi przycisk „Dodaj mecz” (`data-testid="add-match"`), który otwiera modal z formularzem.
  - Sukces: modal się zamyka, wyszukiwanie się czyści, nowy wiersz pojawia się na swoim miejscu wg sortowania, zostaje przewinięty w widok i krótko podświetlony, a toast potwierdza zapis.
  - Błąd: modal zostaje otwarty z komunikatem, a wpisane dane nie giną.
- Kliknięcie w typ lub „brak typu” otwiera modal z danymi meczu.
  - Mecz otwarty: formularz typu. Po zapisie wiersz pokazuje nowy typ i pojawia się toast.
  - Mecz rozpoczęty: widok tylko do odczytu (własny typ albo „brak typu”, komunikat „Typowanie zamknięte”, link do `/matches/{id}` z typami wszystkich).
- `POST /api/matches` i `POST /api/tips` z nagłówkiem `Accept: application/json` zwracają JSON. Bez niego działają jak dotąd (przekierowania).
- `npm run smoke:local` przechodzi z dostosowanymi markerami.

### Key Discoveries:

- Wyspy Astro z `client:load` są renderowane po stronie serwera, więc asercje smoke na treść HTML nadal działają. Zamknięty Radix `Dialog` nie renderuje zawartości, więc marker formularza musi być na przycisku-wyzwalaczu.
- Middleware przekierowuje anonimowe żądania do chronionych ścieżek na `/auth/signin` (`src/middleware.ts`). `fetch` podąża za przekierowaniem i dostaje HTML 200, więc klient musi rozpoznać `res.redirected` albo brak JSON jako wygasłą sesję.
- `listMatches` sortuje po `starts_at`, potem po `id` (`src/lib/services/matches.ts:421-422`). Sortowanie w tabeli zachowuje ten tie-break w obu kierunkach.
- Dodając komponent `sonner`, shadcn dociąga `next-themes` (`useTheme`), który nie ma sensu w Astro.

## What We're NOT Doing

- Bez nowych kroków smoke dla ścieżki JSON (decyzja: tylko dostosowanie markerów). Kontrakt JSON jest weryfikowany ręcznie.
- Bez Playwright ani test runnera (AGENTS.md).
- Bez przebudowy `/matches/[id]`. Dostaje tylko nowe tokeny motywu przez `.dark`, bez zmian w kodzie.
- Bez przepisywania formularzy auth na react-hook-form.
- Bez filtrów „tylko otwarte”/„bez mojego typu”, zakresu dat i paginacji (serwerowej ani klienckiej).
- Bez edycji i usuwania meczów (S-05, FR-003 dropped).
- Bez Astro Actions. Zostają endpointy `/api/*`.
- Bez odświeżania na żywo (realtime/polling) zmian innych użytkowników.
- Bez zmian w schemacie bazy i RLS.

## Implementation Approach

Fundament przed funkcją. Faza 1 instaluje i stylizuje bazowe komponenty oraz wydziela schematy zod, nie zmieniając zachowania aplikacji. Faza 2 dodaje do endpointów odpowiedź JSON obok przekierowań, więc smoke dalej przechodzi bez zmian. Faza 3 zamienia `<ul>` na wyspę z `DataTable`, wyszukiwaniem i sortowaniem. Inline formularz dodawania zostaje jeszcze w `.astro`, a smoke dostaje marker `<tr`/`data-tip`. Faza 4 dodaje oba modale, usuwa inline formularz i zmienia marker smoke na `data-testid="add-match"`. Po każdej fazie aplikacja działa i smoke jest zielony.

## Critical Implementation Details

- **Formularz wysyła surowe wartości**: zodResolver w RHF oddaje do `onSubmit` wartości po `transform` (np. `starts_at` jako ISO UTC). Klient musi wysłać do API surowe wartości z pól (`YYYY-MM-DDTHH:mm` czasu warszawskiego, wyniki jako napisy), bo endpoint ponownie uruchamia ten sam schemat z transformacją. Wysłanie wartości po transformacji skończy się błędem walidacji.
- **Hydracja i czas**: status „otwarte/zamknięte” liczy się względem `now` przekazanego z serwera jako prop. Nie wolno wołać `Date.now()` w renderze klienta, bo grozi to rozjazdem hydracji. O faktycznym zamknięciu typowania decyduje serwer (409 i RLS).
- **Normalizacja wyszukiwania**: „ł”/„Ł” nie rozkłada się w NFD. Trzeba je zamienić na „l” jawnie przed `normalize("NFD")` i usunięciem znaków diakrytycznych.
- **Toaster między wyspami**: `toast()` z wyspy tabeli trafia do `<Toaster>` w innej wyspie tylko wtedy, gdy obie korzystają z tej samej instancji modułu `sonner`. Vite wydziela go do wspólnego chunka, ale trzeba to sprawdzić ręcznie w buildzie produkcyjnym (`npm run preview`). Jeśli toast się nie pokaże, `Toaster` trafia do wyspy `MatchesTable`.

## Phase 1: Fundament UI i wspólne schematy

### Overview

Motyw shadcn dopasowany do cosmic, nowe komponenty bazowe, generyczny `DataTable`, klient JSON i schematy zod wydzielone z endpointów. Zachowanie aplikacji się nie zmienia.

### Changes Required:

#### 1. Zależności i komponenty shadcn

**File**: `package.json`, `src/components/ui/*`

**Intent**: Dodać bibliotekę tabeli, formularzy i powiadomień oraz prymitywy shadcn jako bazę dla tej i kolejnych stron.

**Contract**:
- `npm i @tanstack/react-table react-hook-form @hookform/resolvers sonner`, przy czym `@hookform/resolvers` w wersji ≥5 (obsługuje zod v4).
- `npx shadcn@latest add table dialog input label field sonner`, co daje `src/components/ui/{table,dialog,input,label,field,sonner}.tsx`. Jeśli rejestr nie ma `field`, użyć `form`.
- W `sonner.tsx` usunąć `next-themes`: stały `theme="dark"`. Odinstalować `next-themes`, jeśli CLI go dodało.
- Pliki z CLI przepuścić przez `npm run lint:fix`.

#### 2. Motyw cosmic w tokenach

**File**: `src/styles/global.css`, `src/layouts/Layout.astro`

**Intent**: Włączyć ciemny wariant shadcn i przestroić jego tokeny pod paletę cosmic, żeby każdy dodany komponent od razu pasował wizualnie.

**Contract**:
- `<html class="dark">` w `Layout.astro`.
- W bloku `.dark` ustawić:
  - `--background` na granat tła cosmic (≈`#0a0e1a`);
  - `--card`/`--popover` na nieco jaśniejszy granat, nieprzezroczysty, żeby treść modala była czytelna;
  - `--primary` na fiolet zgodny z `purple-600`, a `--primary-foreground` na biały;
  - `--border` na `white/10`, `--input` na `white/20`;
  - `--ring` na `purple-400`;
  - `--muted-foreground` w tonacji `blue-100/60`;
  - `--accent` na `white/10`.
- Istniejące strony (`bg-cosmic` i klasy inline) nie mogą zmienić wyglądu.

#### 3. Wspólne schematy zod

**File**: `src/lib/schemas/match.ts`, `src/lib/schemas/tip.ts`, `src/pages/api/matches.ts`, `src/pages/api/tips.ts`

**Intent**: Przenieść schematy z endpointów do modułów współdzielonych z klientem: jedna walidacja i te same komunikaty po obu stronach.

**Contract**:
- `match.ts` eksportuje `matchSchema`. Przenieść go 1:1 z `api/matches.ts`, razem z transformacją `starts_at` przez `warsawLocalToUtc` i regułą „Strony meczu muszą być różne”.
- `tip.ts` eksportuje `matchIdSchema`, `scoresSchema` i `SCORE_MESSAGE` (1:1 z `api/tips.ts`).
- Import `z` z `astro/zod`. Endpointy importują schematy, a ich zachowanie się nie zmienia.

#### 4. Generyczny `DataTable`

**File**: `src/components/data-table/DataTable.tsx`, `src/components/data-table/SortableHeader.tsx`

**Intent**: Wielokrotnego użytku tabela na TanStack + shadcn `Table` ze sterowanym stanem filtra i sortowania, żeby właściciel stanu (np. hook URL) był poza komponentem.

**Contract**:
- `DataTable<TData>` przyjmuje props: `columns: ColumnDef<TData, any>[]`, `data`, `getRowId`, `sorting`, `onSortingChange`, `globalFilter`, `onGlobalFilterChange`, `globalFilterFn`, opcjonalne `rowProps?(row) => HTMLAttributes` (klasy, `data-*`) i `emptyMessage: ReactNode`.
- Używa `getCoreRowModel`, `getSortedRowModel`, `getFilteredRowModel`.
- Kolumna może dostać `meta.className`, które trafia do `<th>`/`<td>` (np. `hidden sm:table-cell`).
- `SortableHeader` to przycisk z ikoną kierunku (lucide) i `aria-sort` na `<th>`.

#### 5. Klient JSON

**File**: `src/lib/api-client.ts`

**Intent**: Jedno miejsce do wysyłania formularzy do `/api/*` w trybie JSON i mapowania błędów sieci/sesji na komunikaty dla użytkownika.

**Contract**: `postForm<T>(url: string, values: Record<string, string>): Promise<{ data: T; error: null } | { data: null; error: string }>`.
- Wysyła `URLSearchParams` z nagłówkiem `Accept: application/json`.
- `res.redirected` albo odpowiedź bez JSON → „Sesja wygasła. Zaloguj się ponownie.”
- Błąd sieci → „Brak połączenia z serwerem”.
- Odpowiedź z `{ error }` → `error`.

#### 6. Toaster w Layout

**File**: `src/layouts/Layout.astro`

**Intent**: Globalny punkt wyświetlania toastów dla wszystkich stron.

**Contract**: `<Toaster client:idle />` z `@/components/ui/sonner` w `<body>`. Weryfikacja działania między wyspami: patrz Critical Implementation Details.

### Success Criteria:

#### Automated Verification:

- Sprawdzenie typów przechodzi: `npx astro check`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Smoke przechodzi bez zmian: `npm run dev:local` w tle, potem `npm run smoke:local`

#### Manual Verification:

- `/`, `/auth/signin`, `/auth/signup`, `/dashboard`, `/matches`, `/matches/[id]` wyglądają jak przed zmianą (tło, kolory, przyciski)
- Dodawanie meczu i typu formularzami HTML działa jak dotąd

**Implementation Note**: Po fazie i zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed kolejną fazą.

---

## Phase 2: Kontrakt JSON w API

### Overview

Endpointy zapisu odpowiadają JSON-em na żądania z `Accept: application/json`, a serwisy zwracają zapisany wiersz. Ścieżka przekierowań zostaje bez zmian.

### Changes Required:

#### 1. Serwisy zwracają zapisany wiersz

**File**: `src/lib/services/matches.ts`, `src/lib/services/tips.ts`

**Intent**: Klient potrzebuje zapisanego meczu (z `id`, `starts_at` w UTC) i typu, żeby zaktualizować tabelę bez ponownego pobierania listy.

**Contract**:
- `createMatch(...) : Promise<{ data: Match | null; error: string | null }>` przez `.insert(input).select("id, side_a, side_b, starts_at, created_at").single<Match>()`.
- `saveTip(...) : Promise<{ data: Tip | null; error: string | null }>` przez `.upsert(...).select("match_id, score_a, score_b").single<Tip>()`.
- Komunikaty błędów i logowanie bez zmian.

#### 2. Negocjacja odpowiedzi w endpointach

**File**: `src/pages/api/matches.ts`, `src/pages/api/tips.ts`

**Intent**: Ta sama walidacja i logika z dwoma formatami odpowiedzi: JSON dla wysp, przekierowanie dla formularzy HTML i smoke.

**Contract**: `wantsJson = request.headers.get("accept")?.includes("application/json")`. Każde miejsce, które dziś robi `redirect…(message)`, w trybie JSON zwraca `Response.json({ error: message }, { status })`.

`/api/matches`:
- `201 { match: Match }` przy sukcesie;
- `400` przy walidacji;
- `403` dla nie-organizatora;
- `500` przy braku konfiguracji Supabase lub błędzie zapisu.

`/api/tips`:
- `200 { tip: Tip }` przy sukcesie;
- `400` przy złym `match_id` lub wyniku;
- `404` gdy nie ma meczu;
- `409` gdy typowanie jest zamknięte;
- `500` przy błędzie odczytu lub zapisu.

Brak użytkownika w `/api/tips` zwraca `401 { error }` w trybie JSON (przekierowanie bez niego).

### Success Criteria:

#### Automated Verification:

- Sprawdzenie typów przechodzi: `npx astro check`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Smoke przechodzi bez zmian (ścieżka przekierowań): `npm run smoke:local` na `npm run dev:local`

#### Manual Verification:

- W konsoli przeglądarki na `/matches` (zalogowany pracownik) `fetch("/api/tips", { method: "POST", headers: { Accept: "application/json" }, body: new URLSearchParams({ match_id, score_a: "2", score_b: "1" }) })` zwraca 200 `{ tip }`. Dla rozpoczętego meczu zwraca 409 `{ error }`, a dla wyniku `"x"` zwraca 400.
- Analogiczny `fetch("/api/matches", …)` zwraca 201 `{ match }` dla organizatora i 403 `{ error }` dla pracownika

**Implementation Note**: Po fazie i zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed kolejną fazą.

---

## Phase 3: Tabela meczów z wyszukiwaniem i sortowaniem

### Overview

`<ul>` w `/matches` zastępuje wyspa `MatchesTable` na `DataTable`. Wyszukiwanie i sortowanie są zapisywane w URL i renderowane już po stronie serwera. Inline formularz dodawania zostaje w tej fazie w `.astro`.

### Changes Required:

#### 1. Normalizacja wyszukiwania i sortowanie

**File**: `src/lib/search.ts`

**Intent**: Wspólna funkcja porównywania tekstu bez wielkości liter i polskich znaków, do użycia także w przyszłych tabelach.

**Contract**:
- `normalizeForSearch(value: string): string` wykonuje kolejno: `toLocaleLowerCase("pl")`, zamianę `ł`→`l`, `normalize("NFD")`, usunięcie `\p{Diacritic}`.
- Dopasowanie: `normalizeForSearch(side_a + " " + side_b).includes(normalizeForSearch(q.trim()))`. Pusta fraza pasuje do wszystkiego.

#### 2. Stan tabeli w URL

**File**: `src/components/hooks/useUrlTableState.ts`

**Intent**: Trzymać frazę i kierunek sortowania w query stringu, żeby odświeżenie strony i link odtwarzały widok.

**Contract**:
- Hook przyjmuje `initialQuery` i `initialSort: "asc" | "desc"`.
- Zwraca `{ query, setQuery, sorting, setSorting }` w kształcie zgodnym z TanStack (`SortingState` z jedną kolumną `starts_at`).
- Przy zmianie wywołuje `history.replaceState`, a wartości domyślne (pusta fraza, `asc`) usuwa z URL.

#### 3. Wyspa `MatchesTable`

**File**: `src/components/matches/MatchesTable.tsx`, `src/components/matches/columns.tsx`

**Intent**: Interaktywna tabela meczów na `DataTable` ze stanem meczów i typów w React. Faza 4 dołoży do niej modale.

**Contract**:
- Props: `matches: Match[]`, `tips: Tip[]`, `tipsError: string | null`, `isOrganizer: boolean`, `now: number`, `initialQuery: string`, `initialSort: "asc" | "desc"`.
- Stan: lista meczów i mapa typów `match_id → Tip`.
- Nad tabelą pole wyszukiwania (shadcn `Input` z ikoną `Search`, `aria-label="Szukaj meczu"`, `maxLength=100`).

Kolumny:
- **Mecz**: link `/matches/{id}`, na `<sm` z datą `formatWarsaw` w drugiej linii.
- **Data** (`hidden sm:table-cell`): `SortableHeader`, `sortingFn` po `starts_at`, a przy remisie po `id`.
- **Twój typ**: przycisk tekstowy z `A:B` lub „brak typu” i atrybutem `data-tip="A:B"` lub `data-tip=""`. Na `<sm` przy przycisku jest kropka statusu. Gdy jest `tipsError`, kolumna jest ukryta, a nad tabelą pokazuje się banner (jak dziś).
- **Status** (`hidden sm:table-cell`): odznaka „otwarte”/„zamknięte” liczona od props `now`.

Pozostałe:
- `rowProps` ustawia `data-match-id`.
- Puste stany: „Brak meczów” albo „Brak meczów pasujących do „{q}””.
- W tej fazie przycisk typu prowadzi do `/matches/{id}` (zastąpi go modal w fazie 4).

#### 4. Strona `/matches`

**File**: `src/pages/matches.astro`

**Intent**: Strona ładuje dane jak dziś i oddaje renderowanie listy wyspie.

**Contract**:
- Parsuje `q` (`trim`, do 100 znaków) i `sort` (`"desc"`, w każdym innym przypadku `"asc"`) z `Astro.url.searchParams`.
- Renderuje `<MatchesTable client:load … now={Date.now()} />` zamiast `<ul>`.
- Bannery `?error=`, `loadError` i inline formularz organizatora zostają.
- Kontener można poszerzyć (`max-w-3xl`) dla tabeli.

#### 5. Markery smoke dla tabeli

**File**: `scripts/smoke.mjs`, `CLAUDE.md`

**Intent**: Dostosować asercje do wierszy `<tr>` i stabilnego atrybutu typu.

**Contract**:
- `matchRow` szuka `<tr` / `</tr>`.
- `contains: "Twój typ: 97:3"` → `'data-tip="97:3"'`, analogicznie `98:4`.
- `notContains: "97:3"` → `'data-tip="97:3"'`.
- Krok „list shows only own tip after kick-off”: `contains: 'data-tip=""'`, `notContains: 'data-tip="1:0"'`.
- W `CLAUDE.md` (sekcja Verification) zaktualizować opis tych asercji.

### Success Criteria:

#### Automated Verification:

- Sprawdzenie typów przechodzi: `npx astro check`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Smoke z nowymi markerami przechodzi: `npm run smoke:local` na `npm run dev:local`

#### Manual Verification:

- Wpisanie „lodz” znajduje mecz „Łódź – Kraków”, a „KRAK” też go znajduje. Fraza bez trafień pokazuje komunikat pustego stanu.
- Klik w nagłówek „Data” przełącza ↑/↓. Po odświeżeniu (F5) fraza i kierunek zostają, bez mignięcia nieprzefiltrowanej listy.
- Na szerokości telefonu (np. 375 px) kolumny Data i Status są ukryte, data jest pod nazwą, a strona nie przewija się poziomo.
- Typ pracownika i „brak typu” są widoczne przy właściwych meczach. Konsola przeglądarki nie zgłasza błędów hydracji.

**Implementation Note**: Po fazie i zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed kolejną fazą.

---

## Phase 4: Modale dodawania meczu i typowania

### Overview

Modal „Dodaj mecz” zastępuje inline formularz. Modal typowania otwiera się z komórki typu. Zapis aktualizuje tabelę bez przeładowania i potwierdza się toastem.

### Changes Required:

#### 1. `AddMatchDialog`

**File**: `src/components/matches/AddMatchDialog.tsx`

**Intent**: Formularz dodawania meczu w modalu, oparty na RHF + zod + shadcn Field.

**Contract**:
- Props: `onCreated(match: Match)`.
- Wyzwalacz: shadcn `Button` „Dodaj mecz” z ikoną `Plus` i `data-testid="add-match"`, renderowany tylko gdy `isOrganizer`.
- Pola: Strona A, Strona B, „Rozpoczęcie (czas warszawski)” jako `datetime-local` z `[color-scheme:dark]`.
- `useForm<z.input<typeof matchSchema>, unknown, z.output<typeof matchSchema>>({ resolver: zodResolver(matchSchema) })`. Błędy pól wyświetlane pod polami.
- Submit wysyła surowe wartości przez `postForm<{ match: Match }>("/api/matches", …)`. Przycisk jest zablokowany w trakcie wysyłki.
- Sukces: `onCreated`, reset formularza, zamknięcie modala, `toast.success("Dodano mecz")`.
- Błąd: komunikat w modalu nad przyciskiem (jak `ServerError`), wartości zostają, modal otwarty.

#### 2. `TipDialog`

**File**: `src/components/matches/TipDialog.tsx`

**Intent**: Jeden kontrolowany modal z danymi meczu i formularzem typu albo widokiem tylko do odczytu.

**Contract**:
- Props: `match: Match | null` (null = zamknięty), `tip: Tip | undefined`, `isOpen: boolean`, `onOpenChange`, `onSaved(tip: Tip)`.
- Treść zawsze zawiera: `side_a – side_b` jako tytuł, `formatWarsaw(starts_at)` i linię statusu („Typowanie otwarte do …” albo „Typowanie zamknięte”).
- Mecz otwarty:
  - dwa pola `number` (0–99) z etykietami nazw stron, wypełnione obecnym typem;
  - podpowiedź o punktach (tekst jak na `/matches/[id]`);
  - przycisk „Zapisz typ” albo „Popraw typ”;
  - walidacja przez `scoresSchema`, wysyłka przez `postForm<{ tip: Tip }>("/api/tips", { match_id, score_a, score_b })`;
  - sukces: `onSaved`, zamknięcie modala, `toast.success("Zapisano typ A:B")`;
  - błąd (w tym 409): komunikat w modalu, wartości zostają.
- Mecz rozpoczęty:
  - „Twój typ: A:B” albo „brak typu”;
  - link „Zobacz typy wszystkich” do `/matches/{id}`;
  - bez formularza.

#### 3. Podłączenie w `MatchesTable` i `/matches`

**File**: `src/components/matches/MatchesTable.tsx`, `src/components/matches/columns.tsx`, `src/pages/matches.astro`, `scripts/smoke.mjs`, `CLAUDE.md`

**Intent**: Modale zmieniają stan tabeli. Nowy mecz jest widoczny mimo aktywnego filtra.

**Contract**:
- Przycisk w kolumnie „Twój typ” ustawia `selectedMatchId` i otwiera `TipDialog` (zamiast linku z fazy 3). Ma `aria-haspopup="dialog"`.
- `onSaved` aktualizuje mapę typów.
- `onCreated`, w tej kolejności:
  1. dodaje mecz do stanu;
  2. czyści frazę (`setQuery("")`, co aktualizuje też URL);
  3. ustawia `highlightId`;
  4. po renderze przewija wiersz `data-match-id` w widok (`scrollIntoView({ block: "nearest" })`);
  5. wiersz dostaje podświetlenie przez `rowProps` na ok. 2 s.
- Pasek nad tabelą: pole wyszukiwania i (dla organizatora) `AddMatchDialog`.
- Z `matches.astro` usunąć inline `<form action="/api/matches">`, `inputClass` i nieużywane importy. Banner `?error=` zostaje.
- Smoke: `FORM = 'data-testid="add-match"'`. Nazwy kroków „…without form”/„…renders form…” zmienić na „…add-match button”. W `CLAUDE.md` zaktualizować opis kroków organizatora i pracownika.

### Success Criteria:

#### Automated Verification:

- Sprawdzenie typów przechodzi: `npx astro check`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Smoke z markerem `data-testid="add-match"` przechodzi: `npm run smoke:local` na `npm run dev:local`

#### Manual Verification:

- Organizator: „Dodaj mecz” otwiera modal. Puste pola i te same strony pokazują błędy pod polami bez wysyłki. Poprawny mecz zamyka modal, wiersz pojawia się bez przeładowania we właściwym miejscu, jest podświetlony, a toast się pokazuje.
- Przy aktywnej frazie, która nie pasuje do nowego meczu, po dodaniu fraza się czyści i nowy mecz jest widoczny
- Data w zmienionej godzinie DST (np. 2026-10-25 02:30) daje błąd w modalu, a wpisane dane zostają
- Pracownik nie widzi przycisku „Dodaj mecz”
- Klik w „brak typu” przy otwartym meczu → zapis 2:1 → wiersz pokazuje `2:1`, toast. Ponowny klik pokazuje formularz wypełniony 2:1 z przyciskiem „Popraw typ”.
- Klik w typ przy rozpoczętym meczu pokazuje widok tylko do odczytu z linkiem do strony meczu
- Mecz, który rozpoczął się przy otwartej stronie: zapis typu daje komunikat „Typowanie tego meczu jest zamknięte” w modalu
- Po wylogowaniu w innej karcie zapis w modalu pokazuje „Sesja wygasła. Zaloguj się ponownie.”
- Toast działa w buildzie produkcyjnym (`npm run build` + `npm run preview`)
- Modal da się obsłużyć klawiaturą (Tab, Esc zamyka, fokus wraca na wyzwalacz)

**Implementation Note**: Po fazie i zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- Brak (AGENTS.md: bez test runnera). Logikę normalizacji i sortowania sprawdzić ręcznie w fazie 3.

### Integration Tests:

- `npm run smoke:local` po każdej fazie. Smoke pokrywa ścieżkę przekierowań, renderowanie wierszy `<tr>` z `data-tip` i obecność `data-testid="add-match"` tylko u organizatora. Ścieżka JSON nie ma kroków smoke (decyzja planu).

### Manual Testing Steps:

1. Jako organizator dodaj mecz „Łódź – Kraków” na jutro przez modal. Wiersz pojawia się bez przeładowania.
2. Wpisz „lodz”: widoczny tylko ten mecz. Przełącz sortowanie na ↓ i odśwież stronę: widok zostaje.
3. Przy aktywnej frazie „xyz” dodaj kolejny mecz: fraza się czyści, nowy wiersz jest podświetlony.
4. Jako pracownik kliknij „brak typu”, zapisz 2:1, potem popraw na 3:1. Wiersz się aktualizuje.
5. Kliknij typ przy rozpoczętym meczu: widok tylko do odczytu, link do strony meczu.
6. Sprawdź widok 375 px i obsługę klawiaturą.

## Performance Considerations

Filtrowanie i sortowanie odbywają się po stronie klienta na pełnej liście. Przy lidze firmowej (dziesiątki do setek meczów) to natychmiastowe. Przy tysiącach meczów trzeba będzie przejść na paginację. Nowe zależności (TanStack Table, react-hook-form, sonner, Radix Dialog) zwiększają bundle wyspy o kilkadziesiąt kB gz. Wyspa ładuje się tylko na `/matches`, a Toaster w trybie `client:idle`.

## Migration Notes

Bez migracji danych. Ścieżka przekierowań w API zostaje, więc formularz HTML na `/matches/[id]` i ewentualne stare zakładki z `?error=` działają dalej.

## References

- Poprzednia zmiana (typowanie): `context/changes/enter-own-tip/plan.md`
- Lista meczów: `src/pages/matches.astro:45-115`
- Endpointy: `src/pages/api/matches.ts:304-331`, `src/pages/api/tips.ts:357-405`
- Serwisy: `src/lib/services/matches.ts:452-465`, `src/lib/services/tips.ts:541-557`
- Smoke: `scripts/smoke.mjs:24,102-109,155,218,247,256,331`
- Wzorzec wyspy formularza: `src/components/auth/SignInForm.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Fundament UI i wspólne schematy

#### Automated

- [x] 1.1 Sprawdzenie typów przechodzi: `npx astro check`
- [x] 1.2 Lint przechodzi: `npm run lint`
- [x] 1.3 Build przechodzi: `npm run build`
- [x] 1.4 Smoke przechodzi bez zmian: `npm run dev:local` w tle, potem `npm run smoke:local`

#### Manual

- [x] 1.5 `/`, `/auth/signin`, `/auth/signup`, `/dashboard`, `/matches`, `/matches/[id]` wyglądają jak przed zmianą (tło, kolory, przyciski)
- [x] 1.6 Dodawanie meczu i typu formularzami HTML działa jak dotąd

### Phase 2: Kontrakt JSON w API

#### Automated

- [ ] 2.1 Sprawdzenie typów przechodzi: `npx astro check`
- [ ] 2.2 Lint przechodzi: `npm run lint`
- [ ] 2.3 Build przechodzi: `npm run build`
- [ ] 2.4 Smoke przechodzi bez zmian (ścieżka przekierowań): `npm run smoke:local` na `npm run dev:local`

#### Manual

- [ ] 2.5 `fetch("/api/tips")` z `Accept: application/json` zwraca 200 `{ tip }`, 409 dla rozpoczętego meczu, 400 dla złego wyniku
- [ ] 2.6 `fetch("/api/matches")` z `Accept: application/json` zwraca 201 `{ match }` dla organizatora i 403 `{ error }` dla pracownika

### Phase 3: Tabela meczów z wyszukiwaniem i sortowaniem

#### Automated

- [ ] 3.1 Sprawdzenie typów przechodzi: `npx astro check`
- [ ] 3.2 Lint przechodzi: `npm run lint`
- [ ] 3.3 Build przechodzi: `npm run build`
- [ ] 3.4 Smoke z nowymi markerami przechodzi: `npm run smoke:local` na `npm run dev:local`

#### Manual

- [ ] 3.5 Wyszukiwanie ignoruje wielkość liter i polskie znaki; pusty stan dla frazy bez trafień
- [ ] 3.6 Sortowanie po dacie ↑/↓ i fraza przetrwają odświeżenie bez mignięcia
- [ ] 3.7 Widok 375 px: ukryte Data i Status, data pod nazwą, brak poziomego przewijania strony
- [ ] 3.8 Typy i „brak typu” przy właściwych meczach, brak błędów hydracji

### Phase 4: Modale dodawania meczu i typowania

#### Automated

- [ ] 4.1 Sprawdzenie typów przechodzi: `npx astro check`
- [ ] 4.2 Lint przechodzi: `npm run lint`
- [ ] 4.3 Build przechodzi: `npm run build`
- [ ] 4.4 Smoke z markerem `data-testid="add-match"` przechodzi: `npm run smoke:local` na `npm run dev:local`

#### Manual

- [ ] 4.5 Modal „Dodaj mecz”: błędy pól, zapis bez przeładowania, wiersz na miejscu i podświetlony, toast
- [ ] 4.6 Dodanie meczu przy niepasującej frazie czyści frazę i pokazuje nowy mecz
- [ ] 4.7 Data w zmienionej godzinie DST daje błąd w modalu, dane zostają
- [ ] 4.8 Pracownik nie widzi przycisku „Dodaj mecz”
- [ ] 4.9 Zapis i poprawa typu z modalu aktualizuje wiersz i pokazuje toast
- [ ] 4.10 Rozpoczęty mecz otwiera modal tylko do odczytu z linkiem do strony meczu
- [ ] 4.11 Zapis typu po rozpoczęciu meczu pokazuje komunikat w modalu
- [ ] 4.12 Wygasła sesja daje komunikat „Sesja wygasła. Zaloguj się ponownie.”
- [ ] 4.13 Toast działa w buildzie produkcyjnym (`npm run preview`)
- [ ] 4.14 Modal obsługiwany klawiaturą (Tab, Esc, powrót fokusu)
