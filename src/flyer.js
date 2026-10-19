// Flyer generator: turns calendar events into Instagram-size (1080×1350) flyer pages
// in the style of the Krewe of Phantasia "Community Events" flyers.
//
// The layout functions are pure (they take a `measure` function), so they work the
// same in the browser and in tests; drawFlyerPage() does the actual canvas painting.

export const PAGE_W = 1080;
export const PAGE_H = 1350;

export const FLYER_FONT = '"League Spartan", "Arial Black", Arial, sans-serif';

const STYLE = {
  marginX: 58,
  topFirst: 70, // first page: space above the title
  topOther: 80, // later pages: space above the first event
  bottom: 70,
  titleSize: 72,
  titleLine: 84,
  afterTitle: 56,
  headingSize: 50,
  headingMin: 40,
  headingWeight: 700,
  headingLine: 60,
  afterHeading: 6,
  bodySize: 31,
  bodyWeight: 600,
  bodyLine: 42,
  blockGap: 34,
  ink: '#111111',
  gradient: ['#ff66c4', '#ffa48a', '#ffde59'],
};

export const font = (weight, size) => `${weight} ${size}px ${FLYER_FONT}`;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const pad = (n) => String(n).padStart(2, '0');

// ---------- Labels like the flyers use ----------

function timeParts(d) {
  const h = d.getHours();
  const m = d.getMinutes();
  if (h === 12 && m === 0) return { word: 'Noon' };
  if (h === 0 && m === 0) return { word: 'Midnight' };
  return { text: m ? `${h % 12 || 12}:${pad(m)}` : `${h % 12 || 12}`, mer: h < 12 ? 'AM' : 'PM' };
}
const full = (p) => p.word || `${p.text} ${p.mer}`;

/** "6:30-9:30 PM", "9 PM-3 AM", "Noon - 5 PM", "5:30 PM", "All Day" */
export function timeLabel(start, end, allDay) {
  if (allDay) return 'All Day';
  const s = timeParts(start);
  if (!end || end.getTime() === start.getTime()) return full(s);
  const e = timeParts(end);
  if (s.word || e.word) return `${full(s)} - ${full(e)}`;
  if (s.mer === e.mer) return `${s.text}-${e.text} ${e.mer}`;
  return `${full(s)}-${full(e)}`;
}

/** ["Friday","Saturday"] -> "Friday & Saturday"; 3+ -> "Friday, Saturday & Sunday" */
function joinAnd(items, sep = ' & ') {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')}${sep}${items[items.length - 1]}`;
}

/** Dates like the flyer: "10/19", "10/23&24", "10/23, 24&25", "10/31&11/1" */
export function datesLabel(dates) {
  const parts = dates.map((d, i) => {
    const sameMonthAsPrev = i > 0 && dates[i - 1].getMonth() === d.getMonth();
    return sameMonthAsPrev ? `${d.getDate()}` : `${d.getMonth() + 1}/${d.getDate()}`;
  });
  return joinAnd(parts, '&');
}

/** "October 19-25, 2026", "October 26 - November 1, 2026", "December 28, 2026 - January 3, 2027" */
export function rangeLabel(from, to) {
  const m1 = MONTHS[from.getMonth()];
  const m2 = MONTHS[to.getMonth()];
  if (from.toDateString() === to.toDateString()) return `${m1} ${from.getDate()}, ${from.getFullYear()}`;
  if (from.getFullYear() !== to.getFullYear())
    return `${m1} ${from.getDate()}, ${from.getFullYear()} - ${m2} ${to.getDate()}, ${to.getFullYear()}`;
  if (from.getMonth() !== to.getMonth())
    return `${m1} ${from.getDate()} - ${m2} ${to.getDate()}, ${to.getFullYear()}`;
  return `${m1} ${from.getDate()}-${to.getDate()}, ${to.getFullYear()}`;
}

// ---------- Events -> flyer entries ----------

/**
 * Group repeats of the same event (same title, place, details and times on different
 * days) into one entry, like "Friday & Saturday - 10/23&24 - 9 PM-3 AM".
 * rows: database rows from the events table.
 */
export function buildEntries(rows) {
  const sorted = [...rows].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const groups = new Map();
  for (const row of sorted) {
    const start = new Date(row.starts_at);
    const end = row.ends_at ? new Date(row.ends_at) : null;
    const time = timeLabel(start, end, row.all_day);
    const key = [row.title, row.location || '', row.description || '', time].join('\u0000');
    const g = groups.get(key);
    if (g && !g.dates.some((d) => d.toDateString() === start.toDateString())) {
      g.dates.push(start);
    } else if (!g) {
      groups.set(key, { row, time, dates: [start] });
    } else {
      // same event twice on one day: keep it as its own entry
      groups.set(key + row.id, { row, time, dates: [start] });
    }
  }
  return [...groups.values()]
    .sort((a, b) => a.dates[0] - b.dates[0])
    .map(({ row, time, dates }) => {
      const days = joinAnd(dates.map((d) => WEEKDAYS[d.getDay()]));
      const lines = [row.location, row.title, ...(row.description || '').split('\n')]
        .map((l) => (l || '').trim())
        .filter(Boolean);
      return {
        id: row.id,
        heading: `${days} - ${datesLabel(dates)} - ${time}`,
        lines,
      };
    });
}

// ---------- Text wrapping & pagination ----------

/** Word-wrap one paragraph; words longer than a line (URLs) are broken by characters. */
export function wrap(text, maxWidth, measure) {
  const out = [];
  let line = '';
  const pushWord = (word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      return;
    }
    if (line) out.push(line);
    line = '';
    if (measure(word) <= maxWidth) {
      line = word;
      return;
    }
    // Too long for one line (usually a URL): prefer breaking after ? / & = - _ .
    let chunk = '';
    for (const ch of word) {
      if (measure(chunk + ch) > maxWidth && chunk) {
        const cut = Math.max(...['?', '/', '&', '=', '-', '_', '.'].map((c) => chunk.lastIndexOf(c)));
        if (cut > chunk.length * 0.4) {
          out.push(chunk.slice(0, cut + 1));
          chunk = chunk.slice(cut + 1);
        } else {
          out.push(chunk);
          chunk = '';
        }
      }
      chunk += ch;
    }
    line = chunk;
  };
  text.split(/\s+/).filter(Boolean).forEach(pushWord);
  if (line) out.push(line);
  return out;
}

/**
 * Lay entries out on as many pages as needed.
 * measure(text, fontString) -> width in px.
 * Returns pages; each page is a list of { text, font, x, y, align } draw operations.
 */
export function layoutFlyer({ title, subtitle, entries, measure }) {
  const S = STYLE;
  const width = PAGE_W - S.marginX * 2;
  const bodyFont = font(S.bodyWeight, S.bodySize);
  const titleFont = font(700, S.titleSize);

  const pages = [];
  let ops = [];
  let y;

  // Title block on page 1 (left side kept clear for a logo later is easy to add here)
  const titleLines = [title, subtitle]
    .filter(Boolean)
    .flatMap((t) => wrap(t, width, (s) => measure(s, titleFont)));
  y = S.topFirst;
  for (const t of titleLines) {
    ops.push({ text: t, font: titleFont, x: PAGE_W / 2, y: y + S.titleSize * 0.85, align: 'center' });
    y += S.titleLine;
  }
  y += titleLines.length ? S.afterTitle : 0;

  const bottomLimit = PAGE_H - S.bottom;

  for (const entry of entries) {
    // Shrink a long heading a little to keep it on one line, like the hand-made flyers
    let hSize = S.headingSize;
    while (hSize > S.headingMin && measure(entry.heading, font(S.headingWeight, hSize)) > width) hSize -= 2;
    const headingFont = font(S.headingWeight, hSize);
    const head = wrap(entry.heading, width, (s) => measure(s, headingFont));
    const body = entry.lines.flatMap((l) => wrap(l, width, (s) => measure(s, bodyFont)));
    const height = head.length * S.headingLine + S.afterHeading + body.length * S.bodyLine;

    // Start a new page when this event won't fit (unless the page holds no events yet,
    // so an unusually long event can't leave page 1 with only the title).
    const pageHasEvents = ops.some((o) => o.font !== titleFont);
    if (y + height > bottomLimit && pageHasEvents) {
      pages.push(ops);
      ops = [];
      y = S.topOther;
    }

    for (const t of head) {
      ops.push({ text: t, font: headingFont, x: S.marginX, y: y + hSize * 0.85, align: 'left' });
      y += S.headingLine;
    }
    y += S.afterHeading;
    for (const t of body) {
      ops.push({ text: t, font: bodyFont, x: S.marginX, y: y + S.bodySize * 0.85, align: 'left' });
      y += S.bodyLine;
    }
    y += S.blockGap;
  }
  if (ops.length) pages.push(ops);
  return pages;
}

// ---------- Canvas ----------

export function drawFlyerPage(canvas, ops) {
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, PAGE_W, 0);
  STYLE.gradient.forEach((c, i) => g.addColorStop(i / (STYLE.gradient.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  ctx.fillStyle = STYLE.ink;
  ctx.textBaseline = 'alphabetic';
  for (const op of ops) {
    ctx.font = op.font;
    ctx.textAlign = op.align;
    ctx.fillText(op.text, op.x, op.y);
  }
}

/** A measure() backed by a canvas, for layoutFlyer in the browser. */
export function canvasMeasure() {
  const ctx = document.createElement('canvas').getContext('2d');
  return (text, f) => {
    ctx.font = f;
    return ctx.measureText(text).width;
  };
}

/** Make sure the flyer font is loaded before measuring or drawing. */
export async function loadFlyerFonts() {
  if (!document.fonts?.load) return;
  await Promise.all([
    document.fonts.load(font(700, 50), 'Aa'),
    document.fonts.load(font(600, 31), 'Aa'),
  ]);
}
