import { useEffect, useState } from 'react';
import { supabase, siteUrl } from '../supabase';
import { buildIcs, googleCalendarUrl, eventUrl, icsFileName } from '../ics';
import { useAuth } from '../auth';
import LocationInput, { mapsUrl } from './LocationInput';
import {
  toDateInput,
  toDateTimeInput,
  fromDateInput,
  fromDateTimeInput,
  formatRange,
  addDays,
  occurrences,
  repeatHint,
  REPEAT_OPTIONS,
  MAX_OCCURRENCES,
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

const repeatDefaults = (start) => ({ repeat: 'none', until: toDateInput(addDays(start, 7 * 8)) });

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
    ...repeatDefaults(start),
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
    ...repeatDefaults(start),
  };
}

/** Start/end Dates from the form, or an error message. */
function formTimes(form) {
  if (form.all_day) {
    const s = fromDateInput(form.startDate);
    const e = fromDateInput(form.endDate || form.startDate);
    if (e < s) return { error: 'The end date is before the start date.' };
    return { start: s, end: e };
  }
  const s = fromDateTimeInput(form.startTime);
  const e = form.endTime ? fromDateTimeInput(form.endTime) : null;
  if (e && e < s) return { error: 'The end time is before the start time.' };
  return { start: s, end: e };
}

/** Same calendar shift for the end as for the start (keeps local times across DST). */
function shiftLike(date, from, to) {
  const days = Math.round((new Date(to).setHours(12) - new Date(from).setHours(12)) / 86400000);
  return addDays(date, days);
}

/**
 * mode: 'view' | 'edit' | 'create'
 * row:  the database row (view/edit)
 * initial: { start, end, allDay } from a calendar click (create)
 */
export default function EventModal({ mode: initialMode, row, initial, onClose, onSaved }) {
  const { canEdit, isAdmin, user } = useAuth();
  const [mode, setMode] = useState(initialMode);
  const [editing, setEditing] = useState(row || null); // the event being changed; null = new event
  const [duplicating, setDuplicating] = useState(false);
  const [form, setForm] = useState(() => (row ? rowToForm(row) : blankForm(initial)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const canDelete = row && (isAdmin || (canEdit && row.created_by === user?.id));
  const isNew = mode === 'create';

  // Preview how many dates a repeating event will create
  const times = formTimes(form);
  const dates =
    isNew && !times.error && form.repeat !== 'none'
      ? occurrences(times.start, form.repeat, form.until ? fromDateInput(form.until) : null)
      : null;

  function startDuplicate() {
    setEditing(null);
    setDuplicating(true);
    setForm(rowToForm(row));
    setMode('create');
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    if (times.error) return setError(times.error);

    const base = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      color: form.color || null,
      all_day: form.all_day,
    };
    if (!base.title) return setError('Give the event a title.');

    const { start, end } = times;
    const payloadFor = (s) => ({
      ...base,
      starts_at: s.toISOString(),
      ends_at: end ? shiftLike(end, start, s).toISOString() : null,
    });

    setBusy(true);
    let err;
    if (editing) {
      ({ error: err } = await supabase.from('events').update(payloadFor(start)).eq('id', editing.id));
    } else {
      const starts = form.repeat === 'none' ? [start] : dates;
      if (!starts?.length) {
        setBusy(false);
        return setError('The “until” date is before the first date.');
      }
      const series_id = starts.length > 1 ? crypto.randomUUID() : undefined;
      const rows = starts.map((s) => ({ ...payloadFor(s), ...(series_id && { series_id }) }));
      ({ error: err } = await supabase.from('events').insert(rows));
    }
    setBusy(false);
    if (err) return setError(friendlySaveError(err));
    onSaved();
  }

  async function remove(scope) {
    setBusy(true);
    let query = supabase.from('events').delete();
    query =
      scope === 'following'
        ? query.eq('series_id', row.series_id).gte('starts_at', row.starts_at)
        : query.eq('id', row.id);
    const { error: err } = await query;
    setBusy(false);
    if (err) return setError(err.message);
    onSaved();
  }

  const deleteControls = canDelete && (
    confirmDelete ? (
      <div className="confirm-delete">
        <span>Delete {row.series_id ? 'which dates' : 'this event'}?</span>
        {row.series_id ? (
          <>
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => remove('one')}>
              Only this date
            </button>
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => remove('following')}>
              This and later dates
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => remove('one')}>
            Yes, delete
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
          Keep
        </button>
      </div>
    ) : (
      <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
        Delete
      </button>
    )
  );

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>

        {mode === 'view' && row && (
          <div className="event-view">
            <div className="event-swatch" style={{ background: row.color || 'var(--accent)' }} />
            <h2>{row.title}</h2>
            <p className="muted">{formatRange(row)}</p>
            {row.location && (
              <p className="event-location">
                📍{' '}
                {/^online\b/i.test(row.location) ? (
                  row.location
                ) : (
                  <a href={mapsUrl(row.location)} target="_blank" rel="noopener noreferrer" title="Open in Google Maps">
                    {row.location}
                  </a>
                )}
              </p>
            )}
            {row.description && <p className="event-description">{linkify(row.description)}</p>}
            <ShareActions row={row} />
            {canEdit && <EditedBy row={row} />}
            {error && <p className="error">{error}</p>}
            {canEdit && (
              <div className="modal-actions">
                {deleteControls}
                {!confirmDelete && (
                  <>
                    <span className="spacer" />
                    <button className="btn btn-ghost" onClick={startDuplicate}>
                      Duplicate
                    </button>
                    <button className="btn btn-primary" onClick={() => setMode('edit')}>
                      Edit
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {(mode === 'edit' || mode === 'create') && (
          <form onSubmit={save} className="form">
            <h2>{duplicating ? 'Duplicate event' : isNew ? 'New event' : 'Edit event'}</h2>
            {duplicating && <p className="muted form-hint">Change the date, then save to add a copy.</p>}
            {mode === 'edit' && editing?.series_id && (
              <p className="muted form-hint">This event repeats. Changes here apply to this date only.</p>
            )}

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

            {isNew && (
              <div className="row repeat-row">
                <label>
                  Repeats
                  <select value={form.repeat} onChange={set('repeat')}>
                    {REPEAT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                {form.repeat !== 'none' && (
                  <label>
                    Until
                    <input type="date" value={form.until} onChange={set('until')} required />
                  </label>
                )}
              </div>
            )}
            {dates && !times.error && (
              <p className="muted form-hint">
                {repeatHint(form.repeat, times.start)} · {dates.length} date{dates.length === 1 ? '' : 's'}
                {dates.length >= MAX_OCCURRENCES ? ` (limit ${MAX_OCCURRENCES}; pick an earlier “until”)` : ''}
              </p>
            )}

            <label>
              Location <span className="muted">(optional)</span>
              <LocationInput
                value={form.location}
                onChange={(next) =>
                  setForm((f) => ({ ...f, location: typeof next === 'function' ? next(f.location) : next }))
                }
              />
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
              {mode === 'edit' && deleteControls}
              {!(mode === 'edit' && confirmDelete) && (
                <>
                  <span className="spacer" />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      if (!row) return onClose();
                      setEditing(row);
                      setDuplicating(false);
                      setForm(rowToForm(row));
                      setMode('view');
                    }}
                  >
                    Cancel
                  </button>
                  <button className="btn btn-primary" disabled={busy}>
                    {busy ? 'Saving…' : dates && dates.length > 1 ? `Save ${dates.length} dates` : 'Save'}
                  </button>
                </>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function friendlySaveError(err) {
  if (/series_id/.test(err.message || '')) {
    return 'Repeating events need the latest database update. Ask the admin to run supabase/migrations/002_editor_tools.sql.';
  }
  return err.message;
}

/** "Added by Jeff · Edited by Edie, Oct 19 11:20 PM" — editors and admins only. */
function EditedBy({ row }) {
  const [names, setNames] = useState({});
  useEffect(() => {
    const ids = [...new Set([row.created_by, row.updated_by].filter(Boolean))];
    if (!ids.length) return;
    supabase.rpc('member_names', { ids }).then(({ data }) => {
      if (data) setNames(Object.fromEntries(data.map((r) => [r.id, r.name])));
    });
  }, [row.created_by, row.updated_by]);

  const added = names[row.created_by];
  const edited = names[row.updated_by];
  const wasEdited =
    row.updated_at && new Date(row.updated_at) - new Date(row.created_at) > 60 * 1000;
  if (!added && !(wasEdited && edited)) return null;
  const when = (iso) =>
    new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return (
    <p className="edited-by muted">
      {added && <>Added by {added}</>}
      {added && wasEdited && edited && ' · '}
      {wasEdited && edited && (
        <>
          Edited by {edited}, {when(row.updated_at)}
        </>
      )}
      {row.series_id && ' · Repeating'}
    </p>
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
