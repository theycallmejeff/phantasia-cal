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
