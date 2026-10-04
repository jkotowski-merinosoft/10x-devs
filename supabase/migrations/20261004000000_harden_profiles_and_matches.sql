-- Deleting an organizer account must not fail on matches they created.
-- Matches are shared data, so they stay and lose their author instead.
-- The RLS insert check (created_by = auth.uid()) still rejects null on insert.

alter table public.matches
  alter column created_by drop not null;

alter table public.matches
  drop constraint if exists matches_created_by_fkey,
  add constraint matches_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete set null;

-- Supabase grants anon all privileges on new public tables; RLS alone was the barrier.
-- Revoke them so a future policy without "to authenticated" cannot open data to anon.
revoke all on public.profiles, public.matches from anon;

-- Functions are executable by PUBLIC by default and exposed at /rest/v1/rpc/.
-- The matches insert policy calls is_organizer() as the signed-in user.
revoke execute on function public.is_organizer() from public, anon;
grant execute on function public.is_organizer() to authenticated;

-- A failing insert here would abort signup, so tolerate an existing profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
