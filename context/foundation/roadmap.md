---
project: Liga typera
version: 1
status: draft
created: 2026-09-30
updated: 2026-10-06
prd_version: 1
main_goal: speed
top_blocker: time
milestone_id: match-to-standings
milestone_seq: 1
milestone_status: open
---

# Roadmap: Liga typera

> Derived from context/foundation/prd.md (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: Od meczu do klasyfikacji** — Status: open

- **Intent:** Organizator dodaje mecz, pracownik wpisuje typ, organizator wpisuje wynik, a punkty i klasyfikacja wynikają z dwóch stawek ustalonych dla całej ligi.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every S-NN below is `done`.
- **Scope anchors:** US-01; FR-001, FR-002, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-020.

## Vision recap

Organizator w firmie zbiera typy ustnie i sam poprawia punktację w arkuszu. Każdy ma wpisać swój typ, organizator tylko wynik spotkania, a punkty mają wynikać z reguły ustalonej raz dla ligi. Ta sama reguła zostaje, gdy osób jest wielokrotnie więcej.

## North star

**S-04: Użytkownik widzi przeliczone punkty i klasyfikację po wpisaniu wyniku** — przy szybkim dojściu do działającej ścieżki ten przekrój jest dowodem, że arkusz nie jest już potrzebny do policzenia kolejki.

> Gwiazda przewodnia (north star) to najmniejszy przekrój od początku do końca, którego dostarczenie udowadnia, że produkt działa. Stoi tak wcześnie, jak pozwalają zależności, bo reszta ma sens tylko wtedy, gdy ta ścieżka działa.

## At a glance


| ID   | Change ID                 | Outcome (user can …)                                                      | Prerequisites | PRD refs                                             | Status   |
| ---- | ------------------------- | ------------------------------------------------------------------------- | ------------- | ---------------------------------------------------- | -------- |
| S-01 | add-match-to-shared-list  | organizator dodaje mecz, a obie role widzą go na jednej liście            | —             | US-01, FR-001, FR-011                                | done        |
| S-02 | enter-own-tip             | pracownik wpisuje typ i widzi tylko swój                                  | S-01          | US-01, FR-012, FR-013                                | done        |
| S-03 | set-league-point-stakes   | organizator ustala dwie stawki punktacji dla całej ligi                   | S-01          | US-01, FR-008                                        | proposed |
| S-04 | result-to-standings       | po wpisaniu wyniku widać punkty przy typie i zaktualizowaną klasyfikację  | S-02, S-03    | US-01, FR-009, FR-010, FR-014, FR-015, FR-020        | proposed |
| S-05 | edit-match                | organizator poprawia drużyny albo termin meczu                           | S-01          | FR-002                                               | blocked  |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                         | Chain                                        | Note                                                                                          |
| ------ | ----------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A      | Od meczu do klasyfikacji      | `S-01` → `S-02` → `S-04` → `S-05`            | Ścieżka z kryterium sukcesu, ustawiona pod szybkie dojście do działającego przepływu.        |
| B      | Stawki ligi                   | `S-03`                                       | Joins Stream A at `S-04`. Stawki nie czekają na typ i nie opóźniają listy meczów.            |

## Baseline

What's already in place in the codebase as of 2026-09-30 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — SSR UI, file routing under `src/pages/`, component set declared in `components.json`.
- **Backend / API:** present — request handlers exist only for sign-in, sign-up, and sign-out under `src/pages/api/auth/`.
- **Data:** partial — login client in `src/lib/supabase.ts`; `supabase/` is CLI config only, with no schema, migrations, or league rows.
- **Auth:** present — password sign-in issues a session (`src/pages/api/auth/signin.ts`); `src/middleware.ts` resolves the user and guards `/dashboard`.
- **Deploy / infra:** partial — Worker config in `wrangler.jsonc`; `.github/workflows/ci.yml` lints and builds, and does not deploy.
- **Observability:** partial — platform flag in `wrangler.jsonc`; no application logging, error tracking, or metrics.

## Foundations

No foundation item. Login, the UI shell, and the request path are already present, so this milestone does not rebuild them. League rows do not exist yet; the first slice that stores a match carries the smallest persistence that slice needs. Deploy and application observability stay partial and do not gate that slice. Two roles are enforced inside the slices that grant or deny an action, not as a separate identity project.

## Slices

### S-01: Mecz na wspólnej liście

- **Outcome:** Organizator może dodać mecz (drużyny albo zawodnicy, data i godzina rozpoczęcia), a organizator i pracownik widzą ten mecz na jednej liście.
- **Change ID:** add-match-to-shared-list
- **PRD refs:** US-01, FR-001, FR-011
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Stoi pierwsze, bo bez meczu na wspólnej liście nie ma typu ani punktów; rozdzielenie ról wchodzi tutaj, skoro logowanie już jest.
- **Status:** done

### S-02: Własny typ

- **Outcome:** Pracownik może wytypować mecz z listy i zobaczyć własny typ; nie może zmienić typu innej osoby.
- **Change ID:** enter-own-tip
- **PRD refs:** US-01, FR-012, FR-013
- **Prerequisites:** S-01
- **Parallel with:** S-03, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Zaraz po liście, bo typ jest środkiem ścieżki z kryterium sukcesu, a zakaz edycji cudzego typu da się sprawdzić dopiero, gdy typ istnieje.
- **Status:** done

### S-03: Stawki punktacji ligi

- **Outcome:** Organizator może raz dla całej ligi ustalić, ile punktów daje dokładny wynik i ile daje trafiony zwycięzca albo remis przy innym wyniku.
- **Change ID:** set-league-point-stakes
- **PRD refs:** US-01, FR-008
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Równolegle z typem, bo stawki nie potrzebują zapisanego typu, a przeliczenie punktów nie ma z czego brać liczb, dopóki stawek nie ma.
- **Status:** proposed

### S-04: Wynik, punkty i klasyfikacja

- **Outcome:** Organizator może wpisać wynik zakończonego meczu, a użytkownik widzi przy swoim typie wynik i zdobyte punkty oraz zaktualizowaną klasyfikację.
- **Change ID:** result-to-standings
- **PRD refs:** US-01, FR-009, FR-010, FR-014, FR-015, FR-020
- **Prerequisites:** S-02, S-03
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Tak wcześnie, jak pozwalają typ i stawki — tu widać, czy reguła punktów zastępuje arkusz.
- **Status:** proposed

### S-05: Edycja meczu

- **Outcome:** Organizator może poprawić drużyny, zawodników albo termin już dodanego meczu.
- **Change ID:** edit-match
- **PRD refs:** FR-002
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04
- **Blockers:** —
- **Unknowns:**
  - Czy edycja meczu po wpisanym wyniku przelicza punkty od nowa, czy poprawka jest możliwa tylko zanim padnie wynik? — Owner: user. Block: yes.
- **Risk:** Za ścieżką punktacji, bo poprawka meczu nie jest w kryterium sukcesu, a zmiana po wyniku może ruszyć już zapisane punkty.
- **Status:** blocked

## Backlog Handoff

| Roadmap ID | Change ID                | Suggested issue title                                              | Ready for `/10x-plan` | Notes                                                                 |
| ---------- | ------------------------ | ------------------------------------------------------------------ | --------------------- | --------------------------------------------------------------------- |
| S-01       | add-match-to-shared-list | Organizator dodaje mecz na wspólną listę                          | yes                   | Run `/10x-plan add-match-to-shared-list`                              |
| S-02       | enter-own-tip            | Pracownik wpisuje i widzi własny typ                               | no                    | Czeka na S-01                                                         |
| S-03       | set-league-point-stakes  | Organizator ustala stawki punktacji ligi                           | no                    | Równolegle z S-02 po S-01                                             |
| S-04       | result-to-standings      | Wynik meczu aktualizuje punkty i klasyfikację                      | no                    | Gwiazda przewodnia; czeka na S-02 i S-03                              |
| S-05       | edit-match               | Organizator edytuje mecz                                           | no                    | Zablokowane, dopóki nie wiadomo, co edycja robi z policzonymi punktami |

## Open Roadmap Questions

1. **Jaki jest sposób logowania?** E-mail i hasło, OAuth albo logowanie bez hasła. — Owner: user. Block: no. Nie bramkuje przekrojów: logowanie e-mailem i hasłem już działa.
2. **Czy typ zamyka się przed początkiem meczu?** Ręczne zamknięcie typowania zostało jako nice-to-have i nie weszło do cięcia zakresu. — Owner: user. Block: no. Nie bramkuje S-02; ręczne zamknięcie jest w Parked.

## Parked

- **Kategorie, ligi, turnieje i kolejki** — Why parked: PRD §Non-Goals oraz FR-006 i FR-007; nie są na ścieżce punktacji.
- **Historia typów, statystyki i skuteczność** — Why parked: PRD §Non-Goals oraz FR-017, FR-018 i FR-019; nie są potrzebne, żeby zobaczyć punkty i klasyfikację.
- **Pobieranie meczów i wyników z zewnątrz** — Why parked: PRD §Non-Goals; mecze i wyniki wpisuje organizator.
- **Ręczne zamknięcie typowania** — Why parked: FR-005 nie weszło do cięcia zakresu, a czas trzyma kolejkę przy ścieżce punktacji.
- **Powiadomienie pracownika po wpisaniu wyniku** — Why parked: drugie kryterium sukcesu, bez wymagania funkcjonalnego; nie jest potrzebne, żeby punkty i klasyfikacja były widoczne.
- **Usuwanie meczu** — Why parked: FR-003 usunięte z pierwszej wersji; ścieżka dodaj–typ–wynik–punkty go nie wymaga.
- **Osobna lista meczów organizatora** — Why parked: FR-004 usunięte; jedna lista jest w FR-011.
- **Osobny widok typu, wyniku i punktów** — Why parked: FR-016 usunięte jako powtórzenie FR-013, FR-014 i FR-015, które niesie S-04.

## Milestone History

## Done

- **S-01: Organizator może dodać mecz (drużyny albo zawodnicy, data i godzina rozpoczęcia), a organizator i pracownik widzą ten mecz na jednej liście.** — Archived 2026-10-04 → `context/archive/2026-10-01-add-match-to-shared-list/`. Lesson: —.
- **S-02: Pracownik może wytypować mecz z listy i zobaczyć własny typ; nie może zmienić typu innej osoby.** — Archived 2026-10-06 → `context/archive/2026-10-04-enter-own-tip/`. Lesson: —.
