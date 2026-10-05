-- Score tips: each signed-in user keeps one tip per match, editable until kick-off.
-- Before kick-off a user sees only their own tips; after it, everyone's tips are visible.
-- Tips are signed with a masked e-mail (display_name), so profiles become readable
-- to every signed-in user. Roles are still changed only via SQL.

-- display names -------------------------------------------------------------

-- Masks the first domain label: "jkotowski@merinosoft.com.pl" -> "jkotowski@m..t.com.pl".
-- Called from the signup trigger, so it must never raise: anything it cannot
-- mask (null, no "@", empty local part or domain) yields null instead.
create or replace function public.mask_email(email text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  local_part text;
  domain text;
  first_label text;
  domain_rest text;
  dot_pos int;
begin
  if email is null then
    return null;
  end if;

  -- Split on the last "@" (a quoted local part may itself contain "@").
  local_part := substring(email from '^(.*)@');
  domain := substring(email from '@([^@]*)$');

  if local_part is null or local_part = '' or domain is null or domain = '' then
    return null;
  end if;

  dot_pos := position('.' in domain);
  if dot_pos = 0 then
    first_label := domain;
    domain_rest := '';
  else
    first_label := left(domain, dot_pos - 1);
    domain_rest := substr(domain, dot_pos);
  end if;

  -- A one-letter label repeats its letter ("a@x.pl" -> "a@x..x.pl"); harmless.
  return local_part || '@' || left(first_label, 1) || '..' || right(first_label, 1) || domain_rest;
exception
  -- Safety net: a masking bug must not abort signup.
  when others then
    return null;
end;
$$;

-- Only the signup trigger and this migration call it; keep it off /rest/v1/rpc/.
revoke execute on function public.mask_email(text) from public, anon, authenticated;

alter table public.profiles
  add column if not exists display_name text;

-- A failing insert here would abort signup, so tolerate an existing profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, public.mask_email(new.email))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Backfill display names for accounts that existed before this migration.
update public.profiles p
set display_name = public.mask_email(u.email)
from auth.users u
where u.id = p.user_id
  and p.display_name is null;

-- Tips after kick-off show other users' display names, so any signed-in user may
-- read profiles. There are still no insert/update policies: role stays SQL-only.
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles
  for select
  to authenticated
  using (true);

-- tips ----------------------------------------------------------------------

create table if not exists public.tips (
  match_id bigint not null references public.matches (id) on delete cascade,
  -- References profiles (not auth.users) so PostgREST can embed profiles(display_name).
  -- Deleting an account cascades to its profile and from there to its tips.
  user_id uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  score_a smallint not null,
  score_b smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, user_id),
  constraint tips_score_a_range check (score_a between 0 and 99),
  constraint tips_score_b_range check (score_b between 0 and 99)
);

-- The primary key leads with match_id; this serves "my tips" lookups.
create index if not exists tips_user_id_idx on public.tips (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

drop trigger if exists tips_set_updated_at on public.tips;
create trigger tips_set_updated_at
  before update on public.tips
  for each row execute function public.set_updated_at();

-- True while the match has not started. Security definer so the check does not
-- depend on the caller's view of matches. For a missing match it returns false,
-- which the FK on tips.match_id makes irrelevant.
create or replace function public.match_is_open(match_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.matches m
    where m.id = match_is_open.match_id
      and m.starts_at > now()
  );
$$;

-- The tips policies call match_is_open() as the signed-in user.
revoke execute on function public.match_is_open(bigint) from public, anon;
grant execute on function public.match_is_open(bigint) to authenticated;

alter table public.tips enable row level security;

-- Own tips always; everyone's tips only once the match has started,
-- so nobody can copy a tip before kick-off.
drop policy if exists "tips_select_own_or_started" on public.tips;
create policy "tips_select_own_or_started" on public.tips
  for select
  to authenticated
  using (user_id = (select auth.uid()) or not public.match_is_open(match_id));

drop policy if exists "tips_insert_own_open" on public.tips;
create policy "tips_insert_own_open" on public.tips
  for insert
  to authenticated
  with check (user_id = (select auth.uid()) and public.match_is_open(match_id));

-- The time limit is enforced here, not only in the app: a tip cannot change after kick-off.
drop policy if exists "tips_update_own_open" on public.tips;
create policy "tips_update_own_open" on public.tips
  for update
  to authenticated
  using (user_id = (select auth.uid()) and public.match_is_open(match_id))
  with check (user_id = (select auth.uid()) and public.match_is_open(match_id));

-- Explicit privileges: Supabase grants anon everything on new public tables.
-- No delete: a tip is changed, never withdrawn.
revoke all on public.tips from anon;
grant select, insert, update on public.tips to authenticated;
