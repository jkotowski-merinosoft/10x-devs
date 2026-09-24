---
project: "Liga typera"
context_type: greenfield
created: 2026-09-24
updated: 2026-09-24
product_type: web-app
target_scale:
  users: medium
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2027-01-10
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "context type"
      decision: "greenfield — user override. Auto-detection was brownfield (git history, 33 commits; package-lock.json; src/; .github; tsconfig.json; package.json)."
    - topic: "pain category"
      decision: "coordination overhead, workflow friction, trapped data, missing capability"
    - topic: "primary persona scope"
      decision: "a specific role inside one company"
    - topic: "primary role"
      decision: "organizer who currently keeps the Excel and updates scores"
    - topic: "insight"
      decision: "each person enters their own tip; the organizer enters only the match result; scoring follows from that"
    - topic: "auth strategy"
      decision: "login (email + password, OAuth, or passwordless — method not chosen)"
    - topic: "role separation"
      decision: "two roles: organizer adds matches and enters the result; employee enters their own tip"
    - topic: "mvp flow"
      decision: "organizer adds a match; employee enters a tip; organizer enters the result; updated scoring is visible"
    - topic: "mvp timeline"
      decision: "3 weeks of after-hours work is enough for that flow"
    - topic: "secondary success"
      decision: "notify the employee when the organizer enters a result, including whether the tip was correct"
    - topic: "guardrails"
      decision: "cannot edit someone else's tip; scoring must be correct"
    - topic: "business rule"
      decision: "after a result is entered, each tip scores the full stake for an exact score, a lower stake for the correct winner or draw with a different score, and zero when the result does not match; the organizer sets both stakes once for the whole league"
    - topic: "non-functional requirements"
      decision: "none — user said brak"
    - topic: "product type"
      decision: "web-app"
    - topic: "target scale"
      decision: "medium — dozens to a hundred people"
    - topic: "hard deadline"
      decision: "2027-01-10"
    - topic: "after hours"
      decision: "after hours, about 20h per week"
    - topic: "non-goals"
      decision: "no categories, leagues, tournaments, or rounds in v1; no tip history, stats, or accuracy; no external match or result feed — the organizer enters them"
  frs_drafted: 17
  quality_check_status: accepted
---

# Seed idea

Liga typera dla pracowników firmy, na 10x-astro-starter. Użytkownik typuje wyniki meczów. Administrator dodaje mecze i wpisuje wyniki. System liczy punkty. Cel: ukończyć projekt i nauczyć się pracy z agentami oraz skillami. Około 20 h tygodniowo, termin 10 stycznia 2027. Do ustalenia: które rozgrywki (Mistrzostwa Świata 2026 już się skończyły — inny turniej albo mecze wpisywane ręcznie), dokładna punktacja i czy typ zamyka się przed początkiem meczu.

## Vision & Problem Statement

Organizator w firmie prowadzi notatki, kto z kolegów jak typuje wynik spotkania. Typy przychodzą ustnie, lądują w Excelu, a po zakończonym spotkaniu ta sama osoba ręcznie aktualizuje punktację, gdy typ się zgadza. Robi to jedna osoba: koordynuje zbiórkę, trzyma punktację w swoim arkuszu, a pracownik nie wpisuje typu sam.

Każdy wpisuje swój typ, organizator wpisuje tylko wynik spotkania, a punktacja wynika z tego sama.

Przy stu razy większej liczbie osób reguła zostaje ta sama: zawsze działa według ustalonej punktacji.

## User & Persona

Organizator ligi typera w jednej firmie. Sięga po to, gdy trzeba zebrać typy i gdy po zakończonym spotkaniu trzeba zaktualizować punkty. Imienia nie podał.

### Secondary persona

Pracownik firmy, który typuje wynik. Dziś przekazuje typ ustnie i ma sam go wpisać.

## Success Criteria

### Primary

- Działa ścieżka: organizator dodaje mecz, pracownik wpisuje typ, organizator wpisuje wynik, widać zaktualizowaną punktację.

### Secondary

- Pracownik dostaje powiadomienie, gdy organizator wprowadzi wynik, i widzi, czy poprawnie wytypował spotkanie.

### Guardrails

- Nie da się edytować cudzego typu.
- Punktacja musi być poprawna.

## User Stories

### US-01: Od meczu do klasyfikacji

- **Given** organizator i pracownik są zalogowani, a tego meczu nie ma jeszcze na liście
- **When** organizator dodaje mecz, pracownik wpisuje swój typ, a organizator wpisuje wynik spotkania
- **Then** widać przeliczone punkty i zaktualizowaną klasyfikację

## Functional Requirements

### Mecze

- FR-001: Organizator can dodać mecz, podając drużynę lub zawodników oraz datę i godzinę rozpoczęcia. Priority: must-have
  > Socrates: Brak kontrargumentu; zostaje jak jest.
- FR-002: Organizator can edytować mecz. Priority: must-have
  > Socrates: Brak kontrargumentu; zostaje jak jest.
- FR-003: Organizator can usunąć mecz. Priority: dropped
  > Socrates: Kontrargument: usuwanie nie jest potrzebne, żeby ścieżka dodaj–typ–wynik–punkty zadziałała. Rozstrzygnięcie: usunięte z pierwszej wersji.
- FR-004: Organizator can zobaczyć osobną listę meczów. Priority: dropped
  > Socrates: Kontrargument: to ta sama lista co u użytkownika. Rozstrzygnięcie: jedna lista dla organizatora i użytkownika, zapisana w FR-011.
- FR-005: Organizator can ręcznie zamknąć typowanie. Priority: nice-to-have
  > Socrates: Brak kontrargumentu; zostaje jak jest.
- FR-006: Organizator can grupować mecze w kategorie, ligi albo turnieje. Priority: nice-to-have
  > Socrates: Brak kontrargumentu; zostaje jak jest.
- FR-007: Organizator can grupować spotkania w kolejki. Priority: nice-to-have
  > Socrates: Kontrargument: to drugie grupowanie obok lig i turniejów, a żadne nie jest w ścieżce punktacji. Rozstrzygnięcie: zostaje jako nice-to-have.

### Punktacja

- FR-008: Organizator can ustalić globalnie dla całej ligi, ile punktów daje dokładny wynik oraz ile daje prawidłowe wskazanie zwycięzcy lub remisu. Priority: must-have. Przykład: dokładny wynik 3 pkt, prawidłowy rezultat przy błędnym wyniku 1 pkt, błędny typ 0 pkt.
  > Socrates: Kontrargument: wystarczy stałe 3 / 1 / 0, a konfigurowanie punktacji to drugi produkt. Rozstrzygnięcie: zostaje must-have.
- FR-009: Organizator can wpisać rzeczywisty wynik zakończonego meczu. Priority: must-have
  > Socrates: Brak kontrargumentu; zostaje jak jest.
- FR-010: System can po wpisaniu wyniku sprawdzić typy, obliczyć punkty, zapisać je przy każdym typie i zaktualizować klasyfikację. Priority: must-have
  > Socrates: Brak kontrargumentu; zostaje jak jest.

### Typowanie

- FR-011: Organizator i użytkownik can zobaczyć jedną listę spotkań. Priority: must-have
  > Socrates: Brak kontrargumentu wobec listy spotkań; osobna lista organizatora (FR-004) włączona tutaj.
- FR-012: Użytkownik can wytypować mecz. Priority: must-have
  > Socrates: Brak kontrargumentu; zostaje jak jest.
- FR-013: Użytkownik can zobaczyć własny typ. Priority: must-have
  > Socrates: Brak kontrargumentu; zostaje jak jest.
- FR-014: Użytkownik can zobaczyć rzeczywisty wynik. Priority: must-have
  > Socrates: Brak kontrargumentu; zostaje jak jest.
- FR-015: Użytkownik can zobaczyć zdobyte punkty. Priority: must-have
  > Socrates: Brak kontrargumentu; zostaje jak jest.
- FR-016: Użytkownik can po wprowadzeniu wyniku zobaczyć przy meczu swój typ, wynik i zdobyte punkty. Priority: dropped
  > Socrates: Kontrargument: FR-013, FR-014 i FR-015 już to opisują. Rozstrzygnięcie: usunięte.
- FR-017: Użytkownik can zobaczyć historię wszystkich typów. Priority: nice-to-have
  > Socrates: Brak kontrargumentu; zostaje jak jest.
- FR-018: Użytkownik can zobaczyć statystyki. Priority: nice-to-have
  > Socrates: Brak kontrargumentu; zostaje jak jest.
- FR-019: Użytkownik can zobaczyć skuteczność typowania. Priority: nice-to-have
  > Socrates: Brak kontrargumentu; zostaje jak jest.
- FR-020: Użytkownik can zobaczyć ranking użytkowników. Priority: must-have
  > Socrates: Brak kontrargumentu; zostaje jak jest.

## Non-Functional Requirements

- Brak. Użytkownik nie wskazał progów jakościowych mierzalnych z zewnątrz.

## Business Logic

Po wpisaniu wyniku meczu każdy typ dostaje pełną stawkę za dokładny wynik, niższą stawkę za trafionego zwycięzcę albo remis przy innym wyniku, a zero gdy rezultat się nie zgadza; obie stawki organizator ustala raz dla całej ligi.

Liczba punktów bierze się z typu, wpisanego wyniku i tych dwóch stawek. Punkty są zapisywane przy typie. Po wpisaniu wyniku widać przeliczone punkty i zaktualizowaną klasyfikację.

## Access Control

Logowanie. Dwie role. Organizator dodaje mecze i wpisuje wynik. Pracownik wpisuje swój typ. Sposób logowania (e-mail i hasło, OAuth albo bez hasła) nie jest wybrany.

## Non-Goals

- Kategorie, ligi, turnieje i kolejki — nie są na ścieżce punktacji; zostają poza pierwszą wersją.
- Historia typów, statystyki i skuteczność — nie są potrzebne, żeby zobaczyć punkty i klasyfikację.
- Pobieranie meczów i wyników z zewnątrz — mecze i wyniki wpisuje organizator.

## Open Questions

1. **Jaki jest sposób logowania?** E-mail i hasło, OAuth albo logowanie bez hasła. Owner: user. Block: no.
2. **Czy typ zamyka się przed początkiem meczu?** Ręczne zamknięcie typowania zostało jako nice-to-have i nie weszło do cięcia zakresu. Owner: user. Block: no.

## Quality cross-check

Wszystkie elementy kontroli są obecne. Brak luk do przeniesienia.

- Access Control: present
- Business Logic: present — jednozdaniowa reguła punktacji
- Project artifacts: present
- Timeline-cost ack: present — mvp_weeks 3
- Non-Goals: present
- Preserved behavior: n/a (greenfield)

## Forward: tech-stack

- Build target named by the user: 10x-astro-starter (this repository). Captured here because it is a stack choice, not a product decision.
