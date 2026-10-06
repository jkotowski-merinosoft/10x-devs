-- Match result and provider identity on public.matches.
-- score_a/score_b hold the final score; they are shared with S-04 (results and points),
-- which will read them. The Ekstraklasa import fills them for finished matches.
-- external_source/external_id identify a match at its data provider, so the import
-- can upsert and re-running it never duplicates a match. Manually added matches keep
-- both columns null. RLS policies and grants are unchanged.

alter table public.matches
  add column if not exists score_a smallint null,
  add column if not exists score_b smallint null,
  add column if not exists external_source text null,
  add column if not exists external_id text null;

-- Same range as tips; a score is either complete or absent.
alter table public.matches
  drop constraint if exists matches_score_a_range,
  add constraint matches_score_a_range check (score_a between 0 and 99),
  drop constraint if exists matches_score_b_range,
  add constraint matches_score_b_range check (score_b between 0 and 99),
  drop constraint if exists matches_score_pair,
  add constraint matches_score_pair check ((score_a is null) = (score_b is null));

-- A provider id is meaningless without its source, and vice versa.
alter table public.matches
  drop constraint if exists matches_external_pair,
  add constraint matches_external_pair check ((external_source is null) = (external_id is null));

-- Plain (not partial) unique index: PostgREST on_conflict=external_source,external_id
-- needs it as the conflict target. Rows with both columns null never conflict.
create unique index if not exists matches_external_source_id_key
  on public.matches (external_source, external_id);
