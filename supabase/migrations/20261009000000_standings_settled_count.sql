-- League standings gain settled_count: the number of a player's tips on matches
-- that already have a result. Ranking and privileges are unchanged.
-- The return type changes, so the function is dropped and created again
-- (create or replace cannot change the columns of a returned table).

drop function if exists public.league_standings();

-- Everyone with at least one tip, by points, ties broken by exact scores; equal on
-- both means the same rank. Security definer: tips RLS hides other users' tips
-- before kick-off, but those have no points yet and only add a player to the list.
-- settled_count counts only tips on matches with a result, so it does not reveal
-- how many tips a player has placed on open matches.
create function public.league_standings()
returns table (
  rank bigint,
  user_id uuid,
  display_name text,
  points bigint,
  exact_count bigint,
  settled_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with totals as (
    select
      t.user_id,
      sum(coalesce(t.points, 0))::bigint as points,
      count(*) filter (where t.score_a = m.score_a and t.score_b = m.score_b) as exact_count,
      count(*) filter (where m.score_a is not null and m.score_b is not null) as settled_count
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
      tt.exact_count,
      tt.settled_count
    from totals tt
    left join public.profiles p on p.user_id = tt.user_id
  )
  select r.rank, r.user_id, r.display_name, r.points, r.exact_count, r.settled_count
  from ranked r
  order by r.rank, r.display_name nulls last, r.user_id;
$$;

revoke execute on function public.league_standings() from public, anon;
grant execute on function public.league_standings() to authenticated;
