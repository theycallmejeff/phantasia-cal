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
