-- Profiles with a role (default: employee), auto-created for every account,
-- and a shared matches table: readable by any signed-in user, writable by organizers only.
-- Roles are granted manually via SQL; there is no self-service path to change a role.

-- profiles ------------------------------------------------------------------

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'employee' check (role in ('organizer', 'employee')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Auto-create a profile for every new account.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for accounts that existed before this migration.
insert into public.profiles (user_id)
select id from auth.users
on conflict do nothing;

create or replace function public.is_organizer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = (select auth.uid())
      and role = 'organizer'
  );
$$;

-- matches -------------------------------------------------------------------

create table if not exists public.matches (
  id bigint generated always as identity primary key,
  side_a text not null,
  side_b text not null,
  starts_at timestamptz not null,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  constraint matches_side_a_length check (char_length(btrim(side_a)) between 1 and 100),
  constraint matches_side_b_length check (char_length(btrim(side_b)) between 1 and 100),
  constraint matches_sides_differ check (lower(btrim(side_a)) <> lower(btrim(side_b)))
);

create index if not exists matches_starts_at_id_idx on public.matches (starts_at, id);

alter table public.matches enable row level security;

drop policy if exists "matches_select_authenticated" on public.matches;
create policy "matches_select_authenticated" on public.matches
  for select
  to authenticated
  using (true);

drop policy if exists "matches_insert_organizer" on public.matches;
create policy "matches_insert_organizer" on public.matches
  for insert
  to authenticated
  with check (public.is_organizer() and created_by = (select auth.uid()));

-- Explicit privileges, independent of Supabase's default grants in public.
grant select on public.profiles to authenticated;
grant select, insert on public.matches to authenticated;
