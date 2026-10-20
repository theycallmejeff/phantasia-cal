import { useEffect, useState } from 'react';
import { supabase, siteUrl } from '../supabase';
import { buildIcs, googleCalendarUrl, eventUrl, icsFileName } from '../ics';
import { useAuth } from '../auth';
import {
  toDateInput,
  toDateTimeInput,
  fromDateInput,
  fromDateTimeInput,
  formatRange,
} from '../dates';

export const COLORS = [
  { value: '', label: 'Default' },
  { value: '#ff66c4', label: 'Pink' },
  { value: '#b03a5b', label: 'Rose' },
  { value: '#ff8a73', label: 'Coral' },
  { value: '#ffb58a', label: 'Peach' },
  { value: '#ffde59', label: 'Sunshine' },
  { value: '#7a2e6b', label: 'Plum' },
  { value: '#2a1d22', label: 'Ink' },
];

function blankForm(initial) {
  const start = initial?.start ?? new Date();
  const allDay = initial?.allDay ?? false;
  const end = initial?.end ?? new Date(start.getTime() + 60 * 60 * 1000);
  return {
    title: '',
    description: '',
    location: '',
    color: '',
    all_day: allDay,
    startDate: toDateInput(start),
    endDate: toDateInput(allDay && initial?.end ? new Date(initial.end.getTime() - 1) : start),
    startTime: toDateTimeInput(start),
    endTime: toDateTimeInput(end),
  };
}

function rowToForm(row) {
  const start = new Date(row.starts_at);
  const end = row.ends_at ? new Date(row.ends_at) : start;
  return {
    title: row.title,
    description: row.description || '',
    location: row.location || '',
    color: row.color || '',
    all_day: row.all_day,
    startDate: toDateInput(start),
    endDate: toDateInput(end),
    startTime: toDateTimeInput(start),
    endTime: toDateTimeInput(row.ends_at ? end : new Date(start.getTime() + 3600000)),
  };
}

/**
 * mode: 'view' | 'edit' | 'create'
 * row:  the database row (view/edit)
 * initial: { start, end, allDay } from a calendar click (create)
 */
export default function EventModal({ mode: initialMode, row, initial, onClose, onSaved }) {
  const { canEdit, isAdmin, user } = useAuth();
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState(() => (row ? rowToForm(row) : blankForm(initial)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const canDelete = row && (isAdmin || (canEdit && row.created_by === user?.id));

  async function save(e) {
    e.preventDefault();
    setError('');

    let starts_at, ends_at;
    if (form.all_day) {
      const s = fromDateInput(form.startDate);
      const en = fromDateInput(form.endDate || form.startDate);
      if (en < s) return setError('The end date is before the start date.');
      starts_at = s.toISOString();
      ends_at = en.toISOString();
    } else {
      const s = fromDateTimeInput(form.startTime);
      const en = form.endTime ? fromDateTimeInput(form.endTime) : null;
      if (en && en < s) return setError('The end time is before the start time.');
      starts_at = s.toISOString();
      ends_at = en ? en.toISOString() : null;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      color: form.color || null,
      all_day: form.all_day,
      starts_at,
      ends_at,
    };
    if (!payload.title) return setError('Give the event a title.');

    setBusy(true);
    const query = row
      ? supabase.from('events').update(payload).eq('id', row.id)
      : supabase.from('events').insert(payload);
    const { error: err } = await query;
    setBusy(false);
    if (err) return setError(err.message);
    onSaved();
  }

  async function remove() {
    if (!window.confirm(`Delete “${row.title}”? This can't be undone.`)) return;
    setBusy(true);
    const { error: err } = await supabase.from('events').delete().eq('id', row.id);
    setBusy(false);
    if (err) return setError(err.message);
    onSaved();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>

        {mode === 'view' && row && (
          <div className="event-view">
            <div className="event-swatch" style={{ background: row.color || 'var(--accent)' }} />
            <h2>{row.title}</h2>
            <p className="muted">{formatRange(row)}</p>
            {row.location && <p className="event-location">📍 {row.location}</p>}
            {row.description && <p className="event-description">{linkify(row.description)}</p>}
            <ShareActions row={row} />
            {error && <p className="error">{error}</p>}
            {canEdit && (
              <div className="modal-actions">
                {canDelete && (
                  <button className="btn btn-danger" onClick={remove} disabled={busy}>
                    Delete
                  </button>
                )}
                <span className="spacer" />
                <button className="btn btn-primary" onClick={() => setMode('edit')}>
                  Edit
                </button>
              </div>
            )}
          </div>
        )}

        {(mode === 'edit' || mode === 'create') && (
          <form onSubmit={save} className="form">
            <h2>{mode === 'create' ? 'New event' : 'Edit event'}</h2>

            <label>
              Title
              <input value={form.title} onChange={set('title')} required maxLength={200} autoFocus />
            </label>

            <label className="checkbox">
              <input type="checkbox" checked={form.all_day} onChange={set('all_day')} />
              All-day event
            </label>

            {form.all_day ? (
              <div className="row">
                <label>
                  Starts
                  <input type="date" value={form.startDate} onChange={set('startDate')} required />
                </label>
                <label>
                  Ends
                  <input type="date" value={form.endDate} onChange={set('endDate')} />
                </label>
              </div>
            ) : (
              <div className="row">
                <label>
                  Starts
                  <input type="datetime-local" value={form.startTime} onChange={set('startTime')} required />
                </label>
                <label>
                  Ends
                  <input type="datetime-local" value={form.endTime} onChange={set('endTime')} />
                </label>
              </div>
            )}

            <label>
              Location <span className="muted">(optional)</span>
              <input value={form.location} onChange={set('location')} />
            </label>

            <label>
              Details <span className="muted">(optional)</span>
              <textarea rows={4} value={form.description} onChange={set('description')} />
            </label>

            <fieldset className="colors">
              <legend>Color</legend>
              {COLORS.map((c) => (
                <label key={c.value || 'default'} className="color-choice" title={c.label}>
                  <input
                    type="radio"
                    name="color"
                    value={c.value}
                    checked={form.color === c.value}
                    onChange={set('color')}
                  />
                  <span style={{ background: c.value || 'var(--accent)' }} />
                </label>
              ))}
            </fieldset>

            {error && <p className="error">{error}</p>}

            <div className="modal-actions">
              {mode === 'edit' && canDelete && (
                <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
                  Delete
                </button>
              )}
              <span className="spacer" />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => (row ? setMode('view') : onClose())}
              >
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// Turn bare URLs in a description into links (ticket and registration pages).
function linkify(text) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      part
    )
  );
}

/** Share link + add-to-calendar buttons shown to every visitor. */
function ShareActions({ row }) {
  const [copied, setCopied] = useState(false);
  const site = siteUrl();
  const link = eventUrl(site, row.id);

  async function share() {
    // Phones get the native share sheet (Messages, Instagram, etc.); computers copy the link.
    if (navigator.share) {
      try {
        await navigator.share({ title: row.title, text: row.location || row.title, url: link });
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return; // they closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt('Copy this link:', link);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadIcs() {
    const blob = new Blob([buildIcs([row], { siteUrl: site })], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = icsFileName(row);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="share-actions">
      <button type="button" className="btn btn-ghost" onClick={share}>
        {copied ? '✓ Link copied' : navigator.share ? 'Share' : 'Copy link'}
      </button>
      <a
        className="btn btn-ghost"
        href={googleCalendarUrl(row, site)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Google Calendar
      </a>
      <button type="button" className="btn btn-ghost" onClick={downloadIcs}>
        Apple / Outlook
      </button>
    </div>
  );
}
