-- =====================================================================
-- Phantasia Community Calendar — address-search usage visible to the owner only
-- Run once in Supabase: SQL Editor → New query → Run (after 003).
-- To let a different account see the counts, change the email below and re-run.
-- =====================================================================

create or replace function public.places_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner_email constant text := 'theycallmejeff@gmail.com';
  now_pt timestamp := now() at time zone 'America/Los_Angeles';
  lim    private.places_limits;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and lower(email) = lower(owner_email) and role = 'admin'
  ) then
    raise exception 'Only the site owner can see address-search usage' using errcode = '42501';
  end if;
  select * into lim from private.places_limits;
  return jsonb_build_object(
    'month',     coalesce((select count from private.places_usage where period = 'month:' || to_char(now_pt, 'YYYY-MM')), 0),
    'day',       coalesce((select count from private.places_usage where period = 'day:' || to_char(now_pt, 'YYYY-MM-DD')), 0),
    'per_month', lim.per_month,
    'per_day',   lim.per_day
  );
end;
$$;

revoke all on function public.places_usage() from public, anon;
grant execute on function public.places_usage() to authenticated;
