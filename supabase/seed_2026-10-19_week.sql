-- =====================================================================
-- Krewe of Phantasia — Community Events, October 19–25, 2026
-- Run in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run more than once: an event with the same title and start
-- time is skipped instead of duplicated.
--
-- NOTE: the flyer lists "Friday & Saturday 10/16&17" and
-- "Friday & Sunday 10/16&18". Those weekdays fall on 10/23–25 this week,
-- so they are entered as 10/23, 10/24 and 10/25. Edit those rows below
-- if the flyer dates were actually right.
-- =====================================================================

-- Let events added from the SQL editor keep the author we give them
-- (signed-in users are still always stamped as themselves).
create or replace function public.stamp_event()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by, new.created_by);
  new.updated_at := now();
  return new;
end;
$$;

with admin as (
  select id from public.profiles where email = 'theycallmejeff@gmail.com'
),
new_events (title, location, description, starts_at, ends_at, color) as (
  values
  -- Monday 10/19
  ('Fuego Latin Edition – Vinyl DJ',
   'Paradigm Gardens, 1131 South Rampart Street',
   E'Vinyl DJ with food and drinks.\nAdmission is $20, with food for purchase.\nCream Daddy will be selling ice cream.',
   '2026-10-19 18:30 America/Chicago', '2026-10-19 21:30 America/Chicago', '#ff66c4'),

  ('Filipineaux History Salon Series (Online)',
   'Online – Zoom link given after registration',
   E'Admission is FREE.\nRegister at: https://www.eventbrite.com/e/1997985856481?aff=oddtdcreator',
   '2026-10-19 20:00 America/Chicago', '2026-10-19 21:30 America/Chicago', '#7a2e6b'),

  ('New Wave – Documentary Screening + Q&A',
   'Lake Theater, 29 McAlister Drive',
   E'New Wave documentary screening with filmmaker Elizabeth Ai Q&A.\nAdmission is FREE.',
   '2026-10-19 19:30 America/Chicago', null, '#b03a5b'),

  -- Tuesday 10/20
  ('LeUyen Pham – The Princess in Black Celebration',
   'Octavia Books, 513 Octavia Street',
   E'Illustrator LeUyen Pham celebrates The Princess in Black series.\nAdmission is FREE.',
   '2026-10-20 16:30 America/Chicago', '2026-10-20 18:00 America/Chicago', '#ffde59'),

  ('Happy Dumplings at BJ''s Lounge',
   'BJ''s Lounge, 4301 Burgundy Street',
   'Happy Dumplings (Rochelle) will be selling handmade dumplings.',
   '2026-10-20 17:30 America/Chicago', '2026-10-20 21:30 America/Chicago', '#ff8a73'),

  -- Thursday 10/22
  ('Ethan Santos – Filipino Jazz',
   'DBA, 618 Frenchmen Street',
   E'Ethan Santos, Filipino jazz musician.\nAdmission is FREE – Filipino food and cocktails for sale.',
   '2026-10-22 18:00 America/Chicago', '2026-10-22 21:00 America/Chicago', '#7a2e6b'),

  -- Friday & Saturday 10/23 & 10/24, 9 PM – 3 AM
  ('Wukong Ramen Midnight Diner',
   'Wukong Ramen Midnight Diner, 3304 St. Claude Ave',
   E'Late night ramen by Chef Swee.\nPhoto show by Thorn Chen.',
   '2026-10-23 21:00 America/Chicago', '2026-10-24 03:00 America/Chicago', '#2a1d22'),

  ('Wukong Ramen Midnight Diner',
   'Wukong Ramen Midnight Diner, 3304 St. Claude Ave',
   E'Late night ramen by Chef Swee.\nPhoto show by Thorn Chen.',
   '2026-10-24 21:00 America/Chicago', '2026-10-25 03:00 America/Chicago', '#2a1d22'),

  -- Friday & Sunday 10/23 & 10/25, Noon – 5 PM
  ('Miniature Art Exhibit',
   'Nola ''Nacular, 1172 Magazine Street',
   'Admission is FREE.',
   '2026-10-23 12:00 America/Chicago', '2026-10-23 17:00 America/Chicago', '#ffb58a'),

  ('Miniature Art Exhibit',
   'Nola ''Nacular, 1172 Magazine Street',
   'Admission is FREE.',
   '2026-10-25 12:00 America/Chicago', '2026-10-25 17:00 America/Chicago', '#ffb58a'),

  -- Saturday 10/24
  ('NOFF Screening: Y Vân: The Lost Sounds of Saigon',
   'MBS Black Box Theater at CAC, 900 Camp Street',
   E'New Orleans Film Festival screening of "Y Vân: The Lost Sounds of Saigon".\nAdmission is $16.00. Buy tickets at https://neworleansfilmsociety.org/lineup-events/',
   '2026-10-24 17:30 America/Chicago', null, '#b03a5b')
)
insert into public.events (title, location, description, starts_at, ends_at, all_day, color, created_by)
select
  e.title, e.location, e.description,
  e.starts_at::timestamptz, e.ends_at::timestamptz, false, e.color,
  (select id from admin)
from new_events e
where not exists (
  select 1 from public.events x
  where x.title = e.title and x.starts_at = e.starts_at::timestamptz
);

-- Check what's on the calendar for the week:
select to_char(starts_at at time zone 'America/Chicago', 'Dy MM/DD HH12:MI AM') as starts,
       title, location
from public.events
where starts_at >= '2026-10-19 00:00 America/Chicago'
  and starts_at <  '2026-10-26 00:00 America/Chicago'
order by starts_at;
