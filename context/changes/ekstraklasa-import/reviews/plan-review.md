<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Import terminarza Ekstraklasy (apifootball.com)

- **Plan**: context/changes/ekstraklasa-import/plan.md
- **Mode**: Deep (codebase checked inline)
- **Date**: 2026-10-06
- **Verdict**: REVISE → SOUND (after triage: all 5 findings fixed in the plan)
- **Findings**: 0 critical, 4 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
6/6 paths ✓, 6/6 symbols ✓ (localSupabaseEnv, supabase() in smoke.mjs:65-85, match_is_open, created_by nullable, tips_score_*_range, explicit column list in matches.ts), brief↔plan ✓, Progress↔Phase ✓

## Findings

### F1 — Prod matches entered by hand get duplicated

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Wdrożenie na prod
- **Detail**: Upsert matches rows only on (external_source, external_id). Matches the organizer already entered on prod have null/null, so the import adds a second copy next to them. Deleting a duplicate afterwards also deletes its tips (cascade).
- **Fix**: The report (including dry-run) prints how many matches have no external_source. Phase 3 gets a manual step: before --apply, review those rows on prod and decide whether to delete them.
  - Strength: Cheap. The script already reads matches. The user decides about data that may already have tips.
  - Tradeoff: The decision stays manual.
  - Confidence: HIGH — the null/null case is in the plan.
  - Blind spot: Current state of prod matches not checked.
- **Decision**: FIXED

### F2 — Report miscounts changed rows on a re-run

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Contract (read of existing rows)
- **Detail**: The read omits score_a/score_b, so Not Started → Finished counts as "bez zmian". PostgREST returns `+00:00`, while the script builds `Z`, so comparing strings marks every row as changed. Criterion 2.4 checks only "0 nowych".
- **Fix**: Also read score_a/score_b, compare starts_at with Date.getTime(), and add to 2.4: "i 0 zmienionych".
- **Decision**: FIXED

### F3 — Upsert failure path left undefined

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Contract ("Zapis (--apply)")
- **Detail**: There is no behaviour for a POST error. A duplicate match_id in one batch fails the whole upsert. merge-duplicates overwrites every key in the payload, not 5 columns. The same-team check should follow lower(btrim()) from matches_sides_differ.
- **Fix**: Dedupe by match_id with a warning. On a non-2xx response, print the status and a short message and exit 1. Correct the column list and compare sides case-insensitively after btrim.
- **Decision**: FIXED

### F4 — Nothing in code stops a run on the dev project

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Contract; brief key risk for Phase 3
- **Detail**: The brief names a key/URL mistake on prod as the key risk, and the dev project is excluded, but only dry-run protects against it, and the report does not say which database it reads.
- **Fix**: The report header prints the SUPABASE_URL host. The script refuses a URL with the ref mwmugmjikpltdaijjkoa.
- **Decision**: FIXED

### F5 — /matches opens on 78 finished matches

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Desired End State / What We're NOT Doing
- **Detail**: Sorting is asc and there is no pagination, so ~80 finished matches come before the next round.
- **Fix**: Record it in "What We're NOT Doing" as a known consequence and a candidate follow-up.
- **Decision**: FIXED
