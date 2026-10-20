-- =====================================================================
-- Phantasia Community Calendar — capped Google address search
-- Run once in Supabase: SQL Editor → New query → paste → Run.
--
-- BEFORE RUNNING: replace PASTE_YOUR_GOOGLE_KEY_HERE (one line below) with your
-- Google API key. Run this file again any time to change the key or the limits.
--
-- The site asks the database for address suggestions; the database calls Google.
--   • At most 9,000 searches per month and 1,000 per day (Pacific time, like Google's
--     billing), so usage can never pass Google's 10,000 free monthly searches.
--   • The key is stored encrypted in Supabase Vault and never sent to browsers.
--   • Only signed-in editors and admins can search.
-- =====================================================================

-- ---------- Settings ----------
do $$
declare
  new_key text := 'PASTE_YOUR_GOOGLE_KEY_HERE';
  existing uuid;
begin
  if new_key = 'PASTE_YOUR_GOOGLE_KEY_HERE' or length(trim(new_key)) < 20 then
    raise exception 'Paste your Google API key into this SQL (replace PASTE_YOUR_GOOGLE_KEY_HERE) and run it again.';
  end if;
  select id into existing from vault.secrets where name = 'google_maps_api_key';
  if existing is null then
    perform vault.create_secret(trim(new_key), 'google_maps_api_key', 'Google Places key for event location search');
  else
    perform vault.update_secret(existing, trim(new_key));
  end if;
end $$;

-- HTTP client for Postgres (built into Supabase)
create extension if not exists http with schema extensions;

-- Private schema: not reachable through the website's API
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.places_limits (
  id          boolean primary key default true check (id),  -- single row
  per_month   integer not null,
  per_day     integer not null
);
insert into private.places_limits (per_month, per_day) values (9000, 1000)
on conflict (id) do update set per_month = excluded.per_month, per_day = excluded.per_day;

create table if not exists private.places_usage (
  period  text primary key,          -- 'month:2026-10' or 'day:2026-10-20'
  count   integer not null default 0
);

-- ---------- Search ----------
create or replace function public.place_suggestions(q text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  query     text := left(trim(coalesce(q, '')), 100);
  now_pt    timestamp := now() at time zone 'America/Los_Angeles';
  month_key text := 'month:' || to_char(now_pt, 'YYYY-MM');
  day_key   text := 'day:' || to_char(now_pt, 'YYYY-MM-DD');
  lim       private.places_limits;
  used_m    integer;
  used_d    integer;
  api_key   text;
  resp      extensions.http_response;
  body      jsonb;
begin
  if public.app_role() not in ('editor', 'admin') or public.app_role() is null then
    raise exception 'Only approved members can search addresses' using errcode = '42501';
  end if;
  if length(query) < 3 then
    return jsonb_build_object('suggestions', '[]'::jsonb);
  end if;

  -- Reserve one search against both limits, one caller at a time
  perform pg_advisory_xact_lock(hashtext('places_usage'));
  select * into lim from private.places_limits;
  select coalesce((select count from private.places_usage where period = month_key), 0) into used_m;
  select coalesce((select count from private.places_usage where period = day_key), 0) into used_d;
  if used_m >= lim.per_month or used_d >= lim.per_day then
    return jsonb_build_object(
      'suggestions', '[]'::jsonb,
      'limited', case when used_m >= lim.per_month then 'month' else 'day' end
    );
  end if;
  insert into private.places_usage (period, count) values (month_key, 1), (day_key, 1)
  on conflict (period) do update set count = private.places_usage.count + 1;

  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'google_maps_api_key';
  if api_key is null then
    return jsonb_build_object('suggestions', '[]'::jsonb, 'error', 'no_key');
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '5000');
  begin
    resp := extensions.http((
      'POST',
      'https://places.googleapis.com/v1/places:autocomplete',
      array[extensions.http_header('X-Goog-Api-Key', api_key)],
      'application/json',
      jsonb_build_object(
        'input', query,
        'includedRegionCodes', jsonb_build_array('us'),
        'regionCode', 'us',
        -- Greater New Orleans: nearby places rank first
        'locationBias', jsonb_build_object('rectangle', jsonb_build_object(
          'low',  jsonb_build_object('latitude', 29.7, 'longitude', -90.45),
          'high', jsonb_build_object('latitude', 30.4, 'longitude', -89.7)
        ))
      )::text
    )::extensions.http_request);
  exception when others then
    return jsonb_build_object('suggestions', '[]'::jsonb, 'error', 'unreachable');
  end;

  begin
    body := resp.content::jsonb;
  exception when others then
    body := null; -- not JSON (e.g. an HTML error page)
  end;

  if resp.status <> 200 or body is null then
    return jsonb_build_object(
      'suggestions', '[]'::jsonb,
      'error', 'google',
      'status', resp.status,
      'message', left(coalesce(body #>> '{error,message}', ''), 200)
    );
  end if;

  return jsonb_build_object('suggestions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',        s #>> '{placePrediction,placeId}',
      'main',      coalesce(s #>> '{placePrediction,structuredFormat,mainText,text}', s #>> '{placePrediction,text,text}'),
      'secondary', coalesce(s #>> '{placePrediction,structuredFormat,secondaryText,text}', '')
    ))
    from (
      select s
      from jsonb_array_elements(coalesce(body -> 'suggestions', '[]'::jsonb)) with ordinality as t(s, n)
      where s ? 'placePrediction'
      order by n
      limit 5
    ) places
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.place_suggestions(text) from public, anon;
grant execute on function public.place_suggestions(text) to authenticated;

-- ---------- Usage for the Admin page ----------
create or replace function public.places_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  now_pt timestamp := now() at time zone 'America/Los_Angeles';
  lim    private.places_limits;
begin
  if public.app_role() is distinct from 'admin' then
    raise exception 'Admins only' using errcode = '42501';
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

-- Tidy old daily counters (keeps the table tiny); runs whenever this file is re-run
delete from private.places_usage
where period like 'day:%' and period < 'day:' || to_char((now() at time zone 'America/Los_Angeles') - interval '60 days', 'YYYY-MM-DD');
