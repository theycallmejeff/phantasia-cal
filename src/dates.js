// Small helpers for moving between <input> values, the database and FullCalendar.

const pad = (n) => String(n).padStart(2, '0');

/** Date -> "YYYY-MM-DD" in the visitor's local time zone */
export function toDateInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Date -> "YYYY-MM-DDTHH:mm" in local time, for <input type="datetime-local"> */
export function toDateTimeInput(d) {
  return `${toDateInput(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM-DD" -> Date at local midnight */
export function fromDateInput(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "YYYY-MM-DDTHH:mm" -> Date in local time */
export function fromDateTimeInput(s) {
  return new Date(s);
}

export function addDays(d, n) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

/**
 * Database row -> FullCalendar event.
 * All-day events are stored with an inclusive last day (local midnight);
 * FullCalendar wants an exclusive end date, so we add one day.
 */
export function rowToCalendarEvent(row) {
  const start = new Date(row.starts_at);
  const end = row.ends_at ? new Date(row.ends_at) : null;
  const base = {
    id: row.id,
    title: row.title,
    backgroundColor: row.color || undefined,
    borderColor: row.color || undefined,
    textColor: row.color ? readableText(row.color) : undefined,
    extendedProps: { row },
  };
  if (row.all_day) {
    return {
      ...base,
      allDay: true,
      start: toDateInput(start),
      end: toDateInput(addDays(end || start, 1)),
    };
  }
  return { ...base, allDay: false, start, end: end || undefined };
}

export function formatRange(row) {
  const start = new Date(row.starts_at);
  const end = row.ends_at ? new Date(row.ends_at) : null;
  const dateOpts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  const timeOpts = { hour: 'numeric', minute: '2-digit' };

  if (row.all_day) {
    const s = start.toLocaleDateString(undefined, dateOpts);
    if (!end || toDateInput(end) === toDateInput(start)) return `${s} · All day`;
    return `${s} – ${end.toLocaleDateString(undefined, dateOpts)}`;
  }
  const s = `${start.toLocaleDateString(undefined, dateOpts)}, ${start.toLocaleTimeString(undefined, timeOpts)}`;
  if (!end) return s;
  if (toDateInput(end) === toDateInput(start)) return `${s} – ${end.toLocaleTimeString(undefined, timeOpts)}`;
  return `${s} – ${end.toLocaleDateString(undefined, dateOpts)}, ${end.toLocaleTimeString(undefined, timeOpts)}`;
}

/** Black text on light event colors (yellow, peach), white on dark ones. */
export function readableText(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return undefined;
  const n = parseInt(m[1], 16);
  const lin = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // pick whichever of black or white contrasts more (crossover at L ≈ 0.18)
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#1a1214' : '#ffffff';
}

// ---------- Repeating events ----------

export const REPEAT_OPTIONS = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Every month (same weekday)' },
];
export const MAX_OCCURRENCES = 60;

const ORDINALS = ['1st', '2nd', '3rd', '4th', 'last'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Which week of the month a date falls in: 0-3, or 4 meaning "last" (5th or final week). */
function weekOfMonth(d) {
  const n = Math.floor((d.getDate() - 1) / 7);
  const lastWeek = addDays(d, 7).getMonth() !== d.getMonth();
  return n >= 4 || (n === 3 && lastWeek) ? 4 : n;
}

/** "Every month on the 2nd Tuesday" style hint for the form */
export function repeatHint(rule, start) {
  if (rule === 'weekly') return `Every ${DAY_NAMES[start.getDay()]}`;
  if (rule === 'biweekly') return `Every other ${DAY_NAMES[start.getDay()]}`;
  if (rule === 'monthly') return `The ${ORDINALS[weekOfMonth(start)]} ${DAY_NAMES[start.getDay()]} of each month`;
  return '';
}

/** Same weekday-of-month (e.g. 3rd Thursday, or last Friday) in another month, keeping the clock time. */
function nthWeekdayInMonth(template, year, month) {
  const wk = weekOfMonth(template);
  const day = template.getDay();
  const norm = new Date(year, month, 1); // handles month 12 → January of next year
  const d = new Date(template);
  d.setFullYear(norm.getFullYear(), norm.getMonth(), 1);
  if (wk === 4) {
    d.setFullYear(norm.getFullYear(), norm.getMonth() + 1, 0); // last day of that month
    while (d.getDay() !== day) d.setDate(d.getDate() - 1);
  } else {
    while (d.getDay() !== day) d.setDate(d.getDate() + 1);
    d.setDate(d.getDate() + wk * 7);
  }
  return d;
}

/**
 * Start dates for a repeating event, beginning with `start` itself, up to and including
 * the `until` day. Local clock times are kept across daylight-saving changes.
 */
export function occurrences(start, rule, until) {
  if (rule === 'none' || !until) return [new Date(start)];
  const last = new Date(until);
  last.setHours(23, 59, 59, 999);
  const out = [];
  for (let i = 0; out.length < MAX_OCCURRENCES; i++) {
    let d;
    if (rule === 'weekly') d = addDays(start, 7 * i);
    else if (rule === 'biweekly') d = addDays(start, 14 * i);
    else d = nthWeekdayInMonth(start, start.getFullYear(), start.getMonth() + i);
    if (d > last) break;
    out.push(d);
  }
  return out;
}
