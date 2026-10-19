import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { toDateInput, fromDateInput, addDays, formatRange } from '../dates';
import {
  buildEntries,
  layoutFlyer,
  drawFlyerPage,
  canvasMeasure,
  loadFlyerFonts,
  rangeLabel,
} from '../flyer';

export default function FlyerPage() {
  const today = new Date();
  const [from, setFrom] = useState(toDateInput(today));
  const [to, setTo] = useState(toDateInput(addDays(today, 6)));
  const [title, setTitle] = useState('Community Events');
  const [subtitle, setSubtitle] = useState('');
  const [subtitleEdited, setSubtitleEdited] = useState(false);
  const [rows, setRows] = useState([]);
  const [excluded, setExcluded] = useState(() => new Set());
  const [pages, setPages] = useState([]); // data URLs
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fromDate = from ? fromDateInput(from) : null;
  const toDate = to ? fromDateInput(to) : null;
  const rangeOk = fromDate && toDate && toDate >= fromDate;

  // Subtitle follows the date range until someone types their own.
  useEffect(() => {
    if (!subtitleEdited && rangeOk) setSubtitle(rangeLabel(fromDate, toDate));
  }, [from, to, subtitleEdited]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load events that start within the chosen days.
  useEffect(() => {
    if (!rangeOk) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('events')
      .select('*')
      .gte('starts_at', fromDate.toISOString())
      .lt('starts_at', addDays(toDate, 1).toISOString())
      .order('starts_at')
      .then(({ data, error: err }) => {
        if (cancelled) return;
        setLoading(false);
        if (err) return setError(err.message);
        setError('');
        setRows(data);
        setExcluded(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const included = useMemo(() => rows.filter((r) => !excluded.has(r.id)), [rows, excluded]);

  // Re-draw the flyer whenever its content changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadFlyerFonts();
      if (cancelled) return;
      const layout = layoutFlyer({
        title: title.trim(),
        subtitle: subtitle.trim(),
        entries: buildEntries(included),
        measure: canvasMeasure(),
      });
      const urls = layout.map((ops) => {
        const c = document.createElement('canvas');
        drawFlyerPage(c, ops);
        return c.toDataURL('image/png');
      });
      if (!cancelled) setPages(urls);
    })();
    return () => {
      cancelled = true;
    };
  }, [included, title, subtitle]);

  const toggle = (id) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const fileName = (i) =>
    `phantasia-events-${from}${pages.length > 1 ? `-page${i + 1}` : ''}.png`;

  function download(i) {
    const a = document.createElement('a');
    a.href = pages[i];
    a.download = fileName(i);
    a.click();
  }

  async function downloadAll() {
    for (let i = 0; i < pages.length; i++) {
      download(i);
      // small pause so browsers don't block multiple downloads
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  return (
    <div className="flyer-page">
      <h1>Make a flyer</h1>
      <p className="muted">
        Pick the dates, untick anything you want to leave off, then download. Repeat events (same
        name, place and time on different days) are combined, like “Friday &amp; Saturday”.
      </p>

      <div className="flyer-layout">
        <aside className="card form flyer-controls">
          <div className="row">
            <label>
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          {!rangeOk && <p className="error">The “To” date needs to be on or after the “From” date.</p>}

          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            Subtitle
            <input
              value={subtitle}
              onChange={(e) => {
                setSubtitle(e.target.value);
                setSubtitleEdited(true);
              }}
            />
          </label>
          {subtitleEdited && (
            <button type="button" className="link-button" onClick={() => setSubtitleEdited(false)}>
              Reset subtitle to the date range
            </button>
          )}

          <fieldset className="flyer-events">
            <legend>
              Events {loading ? '…' : `(${included.length} of ${rows.length})`}
            </legend>
            {!loading && rows.length === 0 && rangeOk && (
              <p className="muted">No events start in these dates.</p>
            )}
            {rows.map((r) => (
              <label key={r.id} className="checkbox flyer-event">
                <input type="checkbox" checked={!excluded.has(r.id)} onChange={() => toggle(r.id)} />
                <span>
                  <strong>{r.title}</strong>
                  <span className="muted">{formatRange(r)}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {error && <p className="error">{error}</p>}
        </aside>

        <section className="flyer-preview">
          <div className="flyer-actions">
            <span className="muted">
              {pages.length} page{pages.length === 1 ? '' : 's'} · 1080 × 1350 PNG
            </span>
            <span className="spacer" />
            {pages.length > 1 && (
              <button className="btn btn-primary" onClick={downloadAll}>
                Download all
              </button>
            )}
            {pages.length === 1 && (
              <button className="btn btn-primary" onClick={() => download(0)}>
                Download PNG
              </button>
            )}
          </div>
          <div className="flyer-pages">
            {pages.map((src, i) => (
              <figure key={i} className="flyer-thumb">
                <img src={src} alt={`Flyer page ${i + 1}`} />
                {pages.length > 1 && (
                  <figcaption>
                    <span>Page {i + 1}</span>
                    <button className="btn btn-ghost" onClick={() => download(i)}>
                      Download
                    </button>
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
