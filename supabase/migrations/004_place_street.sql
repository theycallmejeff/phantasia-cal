-- =====================================================================
-- Phantasia Community Calendar — street address for picked places
-- Run once in Supabase (SQL Editor → New query → Run), after 003_places_search.sql.
-- No key needed here; it uses the one 003 stored in Vault.
--
-- When an editor picks a suggestion, the site asks for its street address and city
-- ("4301 Burgundy Street", "New Orleans") so locations always show the street; the
-- site adds the city only when it isn't New Orleans.
-- Each lookup counts against the same 9,000/month and 1,000/day limits.
-- =====================================================================

-- Shared by every Google call: reserve one use, or say which limit is reached.
create or replace function private.reserve_places_call()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  now_pt    timestamp := now() at time zone 'America/Los_Angeles';
  month_key text := 'month:' || to_char(now_pt, 'YYYY-MM');
  day_key   text := 'day:' || to_char(now_pt, 'YYYY-MM-DD');
  lim       private.places_limits;
  used_m    integer;
  used_d    integer;
begin
  perform pg_advisory_xact_lock(hashtext('places_usage'));
  select * into lim from private.places_limits;
  select coalesce((select count from private.places_usage where period = month_key), 0) into used_m;
  select coalesce((select count from private.places_usage where period = day_key), 0) into used_d;
  if used_m >= lim.per_month then return 'month'; end if;
  if used_d >= lim.per_day then return 'day'; end if;
  insert into private.places_usage (period, count) values (month_key, 1), (day_key, 1)
  on conflict (period) do update set count = private.places_usage.count + 1;
  return null; -- reserved
end;
$$;
revoke all on function private.reserve_places_call() from public, anon, authenticated;

create or replace function public.place_street(place_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  limited text;
  api_key text;
  resp    extensions.http_response;
  body    jsonb;
  num     text;
  route   text;
  city    text;
begin
  if public.app_role() is null or public.app_role() not in ('editor', 'admin') then
    raise exception 'Only approved members can look up addresses' using errcode = '42501';
  end if;
  if place_id is null or place_id !~ '^[A-Za-z0-9_-]+$' or length(place_id) not between 10 and 400 then
    return jsonb_build_object('street', null, 'city', null);
  end if;

  limited := private.reserve_places_call();
  if limited is not null then
    return jsonb_build_object('street', null, 'limited', limited);
  end if;

  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'google_maps_api_key';
  if api_key is null then
    return jsonb_build_object('street', null, 'error', 'no_key');
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '5000');
  begin
    resp := extensions.http((
      'GET',
      'https://places.googleapis.com/v1/places/' || place_id,
      array[
        extensions.http_header('X-Goog-Api-Key', api_key),
        -- addressComponents is an "Essentials" field (10,000 free a month)
        extensions.http_header('X-Goog-FieldMask', 'addressComponents')
      ],
      null,
      null
    )::extensions.http_request);
  exception when others then
    return jsonb_build_object('street', null, 'error', 'unreachable');
  end;

  begin
    body := resp.content::jsonb;
  exception when others then
    body := null;
  end;
  if resp.status <> 200 or body is null then
    return jsonb_build_object('street', null, 'error', 'google', 'status', resp.status,
      'message', left(coalesce(body #>> '{error,message}', ''), 200));
  end if;

  select c ->> 'longText' into num
  from jsonb_array_elements(coalesce(body -> 'addressComponents', '[]'::jsonb)) c
  where c -> 'types' ? 'street_number' limit 1;
  select c ->> 'longText' into route
  from jsonb_array_elements(coalesce(body -> 'addressComponents', '[]'::jsonb)) c
  where c -> 'types' ? 'route' limit 1;

  select c ->> 'longText' into city
  from jsonb_array_elements(coalesce(body -> 'addressComponents', '[]'::jsonb)) c
  where c -> 'types' ?| array['locality', 'postal_town']
  order by (c -> 'types' ? 'locality') desc
  limit 1;

  return jsonb_build_object(
    'street', nullif(trim(concat_ws(' ', num, route)), ''),
    'city', city
  );
end;
$$;

revoke all on function public.place_street(text) from public, anon;
grant execute on function public.place_street(text) to authenticated;
