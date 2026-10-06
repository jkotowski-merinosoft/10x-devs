-- League point stakes: points for an exact score and for the right outcome only.
-- One row for the whole league, readable by every signed-in user and changed
-- only by an organizer. The 3 / 1 seed row means scoring always has stakes to use.
-- Stakes may be changed at any time; scoring (S-04) decides what that means
-- for points already counted.

create table if not exists public.league_settings (
  -- Always true: the primary key plus the check allow exactly one row.
  id boolean primary key default true,
  exact_points smallint not null,
  outcome_points smallint not null,
  updated_at timestamptz not null default now(),
  constraint league_settings_single_row check (id),
  -- An exact score must be worth more than the outcome alone, so exact_points >= 1.
  constraint league_settings_stakes_range
    check (outcome_points >= 0 and outcome_points < exact_points and exact_points <= 99)
);

insert into public.league_settings (id, exact_points, outcome_points)
values (true, 3, 1)
on conflict (id) do nothing;

-- set_updated_at() comes from the tips migration.
drop trigger if exists league_settings_set_updated_at on public.league_settings;
create trigger league_settings_set_updated_at
  before update on public.league_settings
  for each row execute function public.set_updated_at();

alter table public.league_settings enable row level security;

drop policy if exists "league_settings_select_authenticated" on public.league_settings;
create policy "league_settings_select_authenticated" on public.league_settings
  for select
  to authenticated
  using (true);

drop policy if exists "league_settings_update_organizer" on public.league_settings;
create policy "league_settings_update_organizer" on public.league_settings
  for update
  to authenticated
  using (public.is_organizer())
  with check (public.is_organizer());

-- Explicit privileges: Supabase grants anon everything on new public tables.
-- Revoked from authenticated too, so the column grant below really limits updates.
-- No insert or delete: the single row is seeded here and only its stakes change.
revoke all on public.league_settings from anon, authenticated;
grant select on public.league_settings to authenticated;
grant update (exact_points, outcome_points) on public.league_settings to authenticated;
