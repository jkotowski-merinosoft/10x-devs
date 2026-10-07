-- Points per tip and the league standings.
-- Invariant: tips.points always equals tip_points() of the tip, its match's result and
-- the current league stakes, whoever changed any of them (app, import, SQL). Triggers
-- keep it: a tip's own write computes its points, a result change recomputes that
-- match's tips (back to null when the result is cleared), and a stakes change
-- recomputes every tip. Decision: changing the stakes rescores the whole season,
-- there are no per-match historical stakes.
-- An organizer may change only a match's result, and only after kick-off.
-- Clients can no longer write tips.points; the trigger overwrites any value anyway.

-- points column -------------------------------------------------------------

-- Null while the match has no result.
alter table public.tips
  add column if not exists points smallint null;

-- The only place of the scoring rule: exact score, else the right outcome, else nothing.
create or replace function public.tip_points(
  tip_a smallint,
  tip_b smallint,
  result_a smallint,
  result_b smallint,
  exact_points smallint,
  outcome_points smallint
)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select (
    case
      when result_a is null or result_b is null then null
      when tip_a = result_a and tip_b = result_b then exact_points
      when sign(tip_a - tip_b) = sign(result_a - result_b) then outcome_points
      else 0
    end
  )::smallint;
$$;

-- Called only by the triggers and functions below; keep it off /rest/v1/rpc/.
revoke execute on function public.tip_points(smallint, smallint, smallint, smallint, smallint, smallint)
  from public, anon, authenticated;

-- Every tip write takes its points from the match result and the current stakes.
-- Security definer: reads matches and league_settings regardless of the caller.
create or replace function public.tips_set_points()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select public.tip_points(new.score_a, new.score_b, m.score_a, m.score_b, s.exact_points, s.outcome_points)
  into new.points
  from public.matches m
  left join public.league_settings s on s.id
  where m.id = new.match_id;
  return new;
end;
$$;

revoke execute on function public.tips_set_points() from public, anon, authenticated;

drop trigger if exists tips_set_points on public.tips;
create trigger tips_set_points
  before insert or update on public.tips
  for each row execute function public.tips_set_points();

-- A recompute writes only points, so it must not look like the user changed the tip.
drop trigger if exists tips_set_updated_at on public.tips;
create trigger tips_set_updated_at
  before update of score_a, score_b on public.tips
  for each row execute function public.set_updated_at();

-- Recomputes the points of one match's tips, or of all tips when match_id is null.
-- Security definer: tips RLS allows updates only to the owner before kick-off.
-- Only rows whose points change are written; tips_set_points() then confirms the value.
create or replace function public.recompute_points(match_id bigint default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.tips t
  set points = public.tip_points(t.score_a, t.score_b, m.score_a, m.score_b, s.exact_points, s.outcome_points)
  from public.matches m
  left join public.league_settings s on s.id
  where m.id = t.match_id
    and (recompute_points.match_id is null or t.match_id = recompute_points.match_id)
    and t.points is distinct from
      public.tip_points(t.score_a, t.score_b, m.score_a, m.score_b, s.exact_points, s.outcome_points);
$$;

revoke execute on function public.recompute_points(bigint) from public, anon, authenticated;

-- Security definer, so an organizer's update can call recompute_points() without execute on it.
create or replace function public.recompute_points_on_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'matches' then
    perform public.recompute_points(new.id);
  else
    -- league_settings: new stakes rescore every tip.
    perform public.recompute_points(null);
  end if;
  return null;
end;
$$;

revoke execute on function public.recompute_points_on_change() from public, anon, authenticated;

-- The WHEN clauses skip writes that repeat the same values (e.g. an import re-run).
drop trigger if exists matches_recompute_points on public.matches;
create trigger matches_recompute_points
  after update of score_a, score_b on public.matches
  for each row
  when (old.score_a is distinct from new.score_a or old.score_b is distinct from new.score_b)
  execute function public.recompute_points_on_change();

drop trigger if exists league_settings_recompute_points on public.league_settings;
create trigger league_settings_recompute_points
  after update of exact_points, outcome_points on public.league_settings
  for each row
  when (old.exact_points is distinct from new.exact_points
    or old.outcome_points is distinct from new.outcome_points)
  execute function public.recompute_points_on_change();

-- privileges ----------------------------------------------------------------

-- The organizer enters the result once the match has started; a result before
-- kick-off would score tips that can still change.
drop policy if exists "matches_update_result_organizer" on public.matches;
create policy "matches_update_result_organizer" on public.matches
  for update
  to authenticated
  using (public.is_organizer() and not public.match_is_open(id))
  with check (public.is_organizer() and not public.match_is_open(id));

-- Supabase's default grants give authenticated update on every column; revoke it,
-- so the column grant below really limits the organizer to the result.
revoke update on public.matches from authenticated;
grant update (score_a, score_b) on public.matches to authenticated;

-- Users write only their tip, never its points. Covers the saveTip() upsert payload.
-- select stays as granted by the tips migration.
revoke insert, update on public.tips from authenticated;
grant insert (match_id, user_id, score_a, score_b),
  update (match_id, user_id, score_a, score_b)
  on public.tips to authenticated;

-- standings -----------------------------------------------------------------

-- Everyone with at least one tip, by points, ties broken by exact scores; equal on
-- both means the same rank. Security definer: tips RLS hides other users' tips
-- before kick-off, but those have no points yet and only add a player to the list.
create or replace function public.league_standings()
returns table (rank bigint, user_id uuid, display_name text, points bigint, exact_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with totals as (
    select
      t.user_id,
      sum(coalesce(t.points, 0))::bigint as points,
      count(*) filter (where t.score_a = m.score_a and t.score_b = m.score_b) as exact_count
    from public.tips t
    join public.matches m on m.id = t.match_id
    group by t.user_id
  ),
  ranked as (
    select
      rank() over (order by tt.points desc, tt.exact_count desc) as rank,
      tt.user_id,
      p.display_name,
      tt.points,
      tt.exact_count
    from totals tt
    left join public.profiles p on p.user_id = tt.user_id
  )
  select r.rank, r.user_id, r.display_name, r.points, r.exact_count
  from ranked r
  order by r.rank, r.display_name nulls last, r.user_id;
$$;

revoke execute on function public.league_standings() from public, anon;
grant execute on function public.league_standings() to authenticated;

-- backfill ------------------------------------------------------------------

-- Imported matches may already have a result, so score the existing tips once.
select public.recompute_points(null);
