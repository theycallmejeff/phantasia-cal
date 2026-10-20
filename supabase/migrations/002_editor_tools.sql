-- =====================================================================
-- Phantasia Community Calendar — editor tools update
-- Run once in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run again.
--
-- Adds:
--   • event_history      — every add / edit / delete, with who and when (admins can undo)
--   • events.series_id   — links the dates of a repeating event
--   • pending_request_count() — number of account requests waiting (for the badge & email alert)
--   • member_names()     — lets editors see who added / last edited an event
-- =====================================================================

-- ---------- Repeating events ----------
alter table public.events add column if not exists series_id uuid;
create index if not exists events_series_idx on public.events (series_id) where series_id is not null;

-- ---------- Change history ----------
create table if not exists public.event_history (
  id          bigint generated always as identity primary key,
  event_id    uuid not null,              -- no foreign key: history outlives deleted events
  action      text not null check (action in ('insert', 'update', 'delete')),
  changed_by  uuid references public.profiles(id) on delete set null,
  changed_at  timestamptz not null default now(),
  old_data    jsonb,
  new_data    jsonb
);
create index if not exists event_history_changed_at_idx on public.event_history (changed_at desc);
create index if not exists event_history_event_idx on public.event_history (event_id);

create or replace function public.log_event_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_j jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_j jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  -- skip updates that changed nothing people care about
  if tg_op = 'UPDATE'
     and (old_j - 'updated_at' - 'updated_by') = (new_j - 'updated_at' - 'updated_by') then
    return null;
  end if;
  insert into public.event_history (event_id, action, changed_by, old_data, new_data)
  values (
    coalesce(new.id, old.id),
    lower(tg_op),
    coalesce(auth.uid(), (new_j ->> 'updated_by')::uuid, (old_j ->> 'created_by')::uuid),
    old_j,
    new_j
  );
  return null;
end;
$$;

drop trigger if exists log_event_change on public.events;
create trigger log_event_change
  after insert or update or delete on public.events
  for each row execute function public.log_event_change();

alter table public.event_history enable row level security;

-- Only admins can read the history. Rows are written by the trigger above (never directly).
drop policy if exists "history: admin read" on public.event_history;
create policy "history: admin read" on public.event_history
  for select using (public.app_role() = 'admin');

-- ---------- Account-request count (badge + email alert) ----------
-- Returns only a number, so it's safe for the public key to call.
create or replace function public.pending_request_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.profiles where role = 'pending'
$$;
grant execute on function public.pending_request_count() to anon, authenticated;

-- ---------- Member names for "added by / edited by" ----------
-- Editors and admins get names; everyone else gets nothing. Emails are never returned.
create or replace function public.member_names(ids uuid[])
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1))
  from public.profiles p
  where p.id = any(ids)
    and public.app_role() in ('editor', 'admin')
$$;
grant execute on function public.member_names(uuid[]) to authenticated;
