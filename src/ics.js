// Calendar export helpers shared by the browser (single events) and the
// deploy script (scripts/build-ics.mjs, the subscribable feed).
// No browser-only or Node-only APIs here.

export const CALENDAR_NAME = 'Phantasia Community Calendar';
const DEFAULT_LENGTH_MS = 2 * 60 * 60 * 1000; // events with no end time: assume 2 hours

const pad = (n) => String(n).padStart(2, '0');

/** Date -> 20261019T233000Z */
function utcStamp(d) {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Date -> 20261019 using local calendar date (browser's zone, or TZ in the build) */
function localDate(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function addDays(d, n) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

/** Start/end for calendars: all-day uses dates (end exclusive), timed uses UTC stamps. */
function times(row) {
  const start = new Date(row.starts_at);
  if (row.all_day) {
    const last = row.ends_at ? new Date(row.ends_at) : start;
    return { allDay: true, start: localDate(start), end: localDate(addDays(last, 1)) };
  }
  const end = row.ends_at ? new Date(row.ends_at) : new Date(start.getTime() + DEFAULT_LENGTH_MS);
  return { allDay: false, start: utcStamp(start), end: utcStamp(end) };
}

/** The link that opens this event on the site. siteUrl ends with "/". */
export function eventUrl(siteUrl, id) {
  return `${siteUrl}#/event/${id}`;
}

function detailsText(row, url) {
  return [row.description, url ? `More info: ${url}` : null].filter(Boolean).join('\n\n');
}

/** "Add to Google Calendar" link for one event */
export function googleCalendarUrl(row, siteUrl) {
  const t = times(row);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: row.title,
    dates: `${t.start}/${t.end}`,
    details: detailsText(row, siteUrl ? eventUrl(siteUrl, row.id) : null),
    location: row.location || '',
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

// ---------- iCalendar (RFC 5545) ----------

function escapeText(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Fold lines longer than 75 bytes, as the format requires (never splitting a character). */
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let cur = '';
  let curBytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (curBytes + b > limit) {
      parts.push(cur);
      cur = '';
      curBytes = 0;
    }
    cur += ch;
    curBytes += b;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

function vevent(row, siteUrl, now) {
  const t = times(row);
  const url = siteUrl ? eventUrl(siteUrl, row.id) : null;
  const lines = [
    'BEGIN:VEVENT',
    `UID:${row.id}@phantasia-cal`,
    `DTSTAMP:${utcStamp(now)}`,
    t.allDay ? `DTSTART;VALUE=DATE:${t.start}` : `DTSTART:${t.start}`,
    t.allDay ? `DTEND;VALUE=DATE:${t.end}` : `DTEND:${t.end}`,
    `SUMMARY:${escapeText(row.title)}`,
  ];
  if (row.location) lines.push(`LOCATION:${escapeText(row.location)}`);
  const desc = detailsText(row, url);
  if (desc) lines.push(`DESCRIPTION:${escapeText(desc)}`);
  if (url) lines.push(`URL:${url}`);
  if (row.updated_at) lines.push(`LAST-MODIFIED:${utcStamp(new Date(row.updated_at))}`);
  lines.push('END:VEVENT');
  return lines;
}

/**
 * Build a .ics calendar.
 * rows: event rows; opts.feed: true adds the name/refresh hints calendar apps use for subscriptions.
 */
export function buildIcs(rows, { siteUrl, feed = false, now = new Date() } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Krewe of Phantasia//Phantasia Community Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  if (feed) {
    lines.push(
      `X-WR-CALNAME:${escapeText(CALENDAR_NAME)}`,
      'X-WR-TIMEZONE:America/Chicago',
      'REFRESH-INTERVAL;VALUE=DURATION:PT3H',
      'X-PUBLISHED-TTL:PT3H'
    );
  }
  for (const row of rows) lines.push(...vevent(row, siteUrl, now));
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Safe file name like "fuego-latin-edition-vinyl-dj.ics" */
export function icsFileName(row) {
  const slug = row.title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${slug || 'event'}.ics`;
}
