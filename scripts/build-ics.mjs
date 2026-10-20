// Writes dist/calendar.ics — the feed people subscribe to — from the events in Supabase.
// Run by the deploy workflow after `vite build`. Uses only the public key, so it sees
// exactly what any visitor can see.
//
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY  Supabase project (repository secrets)
//   SITE_URL                                    e.g. https://theycallmejeff.github.io/phantasia-cal/
//   TZ=America/Chicago                          so all-day events land on the right date

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { buildIcs } from '../src/ics.js';

const base = (process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.VITE_SUPABASE_ANON_KEY || '';
const siteUrl = process.env.SITE_URL || '';
const out = process.argv[2] || 'dist/calendar.ics';

if (!base || !key) {
  console.error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set.');
  process.exit(1);
}

// Keep the feed a sensible size: events from 90 days ago onward.
const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
const url =
  `${base}/rest/v1/events?select=*` +
  `&starts_at=gte.${encodeURIComponent(since)}&order=starts_at.asc&limit=5000`;

const res = await fetch(url, { headers: { apikey: key } });
if (!res.ok) {
  console.error(`Supabase answered HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
const rows = await res.json();

await mkdir(path.dirname(path.resolve(out)), { recursive: true });
await writeFile(out, buildIcs(rows, { siteUrl, feed: true }), 'utf8');
console.log(`Wrote ${out} with ${rows.length} events.`);
