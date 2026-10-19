-- =====================================================================
-- Community Calendar — Supabase schema
-- Run this whole file once in Supabase: Dashboard → SQL Editor → New query
-- =====================================================================

-- ---------- Profiles (one per login) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  reason      text,                       -- why they want an account
  role        text not null default 'pending'
              check (role in ('pending', 'editor', 'admin', 'rejected')),
  created_at  timestamptz not null default now()
);

-- ---------- Events ----------
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 200),
  description text,
  location    text,
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  all_day     boolean not null default false,
  color       text,
  created_by  uuid references public.profiles(id) on delete set null,
  updated_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create index if not exists events_starts_at_idx on public.events (starts_at);

-- ---------- Helper: current user's role ----------
-- security definer so it can read profiles without tripping RLS recursion
create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ---------- Create a profile automatically on sign-up ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, reason)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'reason'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Keep updated_at / updated_by / created_by honest ----------
create or replace function public.stamp_event()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);  -- SQL editor can set an author
    new.created_at := now();
  else
    new.created_by := old.created_by;   -- can't reassign authorship
    new.created_at := old.created_at;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by, new.created_by);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists stamp_event on public.events;
create trigger stamp_event
  before insert or update on public.events
  for each row execute function public.stamp_event();

-- ---------- Stop non-admins from changing their own role ----------
create or replace function public.protect_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and coalesce(public.app_role(), '') <> 'admin'
     and auth.uid() is not null           -- allow SQL editor / service role
  then
    raise exception 'Only an admin can change roles';
  end if;
  new.id := old.id;
  new.email := old.email;
  return new;
end;
$$;

drop trigger if exists protect_role on public.profiles;
create trigger protect_role
  before update on public.profiles
  for each row execute function public.protect_role();

-- =====================================================================
-- Row-level security
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.events   enable row level security;

-- Profiles: you can see yourself; admins see everyone
drop policy if exists "profiles: read own or admin" on public.profiles;
create policy "profiles: read own or admin" on public.profiles
  for select using (id = auth.uid() or public.app_role() = 'admin');

-- Profiles: you can edit your own name/reason; admins can edit anyone (roles)
drop policy if exists "profiles: update own or admin" on public.profiles;
create policy "profiles: update own or admin" on public.profiles
  for update using (id = auth.uid() or public.app_role() = 'admin');

-- Profiles: admins can delete accounts' profiles
drop policy if exists "profiles: admin delete" on public.profiles;
create policy "profiles: admin delete" on public.profiles
  for delete using (public.app_role() = 'admin');

-- Events: everyone (even logged out) can view the calendar
drop policy if exists "events: public read" on public.events;
create policy "events: public read" on public.events
  for select using (true);

-- Events: approved editors and admins can add
drop policy if exists "events: editors insert" on public.events;
create policy "events: editors insert" on public.events
  for insert with check (public.app_role() in ('editor', 'admin'));

-- Events: approved editors and admins can edit any event
drop policy if exists "events: editors update" on public.events;
create policy "events: editors update" on public.events
  for update using (public.app_role() in ('editor', 'admin'));

-- Events: editors delete their own; admins delete anything
drop policy if exists "events: delete own or admin" on public.events;
create policy "events: delete own or admin" on public.events
  for delete using (
    public.app_role() = 'admin'
    or (public.app_role() = 'editor' and created_by = auth.uid())
  );

-- =====================================================================
-- Make yourself the main admin
-- 1. Sign up on the site with your email.
-- 2. Come back here and run (with your email):
--
--    update public.profiles set role = 'admin' where email = 'you@example.com';
-- =====================================================================
