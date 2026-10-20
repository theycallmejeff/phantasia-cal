import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { formatRange } from '../dates';

const FIELDS = ['title', 'starts_at', 'ends_at', 'all_day', 'location', 'description', 'color'];
const RESTORE_FIELDS = [...FIELDS, 'series_id'];
const LABELS = {
  title: 'Title',
  starts_at: 'Time',
  ends_at: 'Time',
  all_day: 'All-day',
  location: 'Location',
  description: 'Details',
  color: 'Color',
};
const VERBS = { insert: 'added', update: 'edited', delete: 'deleted' };

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
const when = (iso) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const short = (v) => {
  const s = String(v ?? '—').replace(/\s+/g, ' ');
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
};

/** Collapse a run of the same action on one repeating series (e.g. "added 8 dates"). */
function group(entries) {
  const out = [];
  for (const e of entries) {
    const data = e.new_data || e.old_data || {};
    const prev = out[out.length - 1];
    if (
      prev &&
      data.series_id &&
      prev.action === e.action &&
      prev.changed_by === e.changed_by &&
      prev.seriesId === data.series_id &&
      e.action !== 'update'
    ) {
      prev.items.push(e);
      continue;
    }
    out.push({ key: e.id, action: e.action, changed_by: e.changed_by, seriesId: data.series_id, items: [e] });
  }
  return out;
}

/** Field-by-field summary of an edit */
function Changes({ entry }) {
  const o = entry.old_data || {};
  const n = entry.new_data || {};
  const lines = [];
  const timeChanged = ['starts_at', 'ends_at', 'all_day'].some((k) => String(o[k]) !== String(n[k]));
  if (timeChanged) lines.push(['Time', formatRange(o), formatRange(n)]);
  for (const k of ['title', 'location', 'description', 'color']) {
    if ((o[k] ?? '') !== (n[k] ?? '')) lines.push([LABELS[k], o[k], n[k]]);
  }
  if (!lines.length) return null;
  return (
    <ul className="changes">
      {lines.map(([label, a, b]) => (
        <li key={label}>
          {label}: <del>{short(a)}</del> → {short(b)}
        </li>
      ))}
    </ul>
  );
}

export default function RecentChanges({ names }) {
  const [entries, setEntries] = useState([]);
  const [limit, setLimit] = useState(60);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('event_history')
      .select('*')
      .order('id', { ascending: false })
      .limit(limit);
    if (err) {
      // table not there yet: the 002 database update hasn't been run
      if (/event_history/.test(err.message) || err.code === '42P01' || err.code === 'PGRST205') setMissing(true);
      else setError(err.message);
      return;
    }
    setEntries(data);
  }, [limit]);

  useEffect(() => {
    load();
  }, [load]);

  async function undo(g) {
    setBusy(g.key);
    setError('');
    let err;
    if (g.action === 'insert') {
      const ids = g.items.map((e) => e.event_id);
      if (!window.confirm(`Remove ${ids.length > 1 ? `these ${ids.length} dates` : 'this event'} from the calendar?`)) {
        setBusy(null);
        return;
      }
      ({ error: err } = await supabase.from('events').delete().in('id', ids));
    } else if (g.action === 'delete') {
      const rows = g.items.map((e) => ({ id: e.event_id, ...pick(e.old_data, RESTORE_FIELDS) }));
      ({ error: err } = await supabase.from('events').insert(rows));
      if (err?.code === '23505') err = { message: 'That event is already back on the calendar.' };
    } else {
      const e = g.items[0];
      ({ error: err } = await supabase.from('events').update(pick(e.old_data, FIELDS)).eq('id', e.event_id));
    }
    setBusy(null);
    if (err) return setError(err.message);
    load();
  }

  if (missing) {
    return (
      <section>
        <h2>Recent changes</h2>
        <p className="muted">
          Run <code>supabase/migrations/002_editor_tools.sql</code> in the Supabase SQL Editor to turn on
          change history.
        </p>
      </section>
    );
  }

  const groups = group(entries);
  const undoLabel = { insert: 'Remove', delete: 'Restore', update: 'Undo edit' };

  return (
    <section>
      <h2>Recent changes</h2>
      {error && <div className="banner banner-warn">{error}</div>}
      {groups.length === 0 ? (
        <p className="muted">No changes yet.</p>
      ) : (
        <ul className="history">
          {groups.map((g) => {
            const first = g.items[0];
            const data = first.new_data || first.old_data || {};
            const who = names[g.changed_by] || 'Someone';
            const count = g.items.length;
            return (
              <li key={g.key}>
                <div className="what">
                  <span className={`action-pill action-${g.action}`}>{VERBS[g.action]}</span>
                  <strong>{who}</strong> {VERBS[g.action]}{' '}
                  {count > 1 ? `${count} dates of ` : ''}“{data.title}”
                  <div className="muted">
                    {when(first.changed_at)}
                    {count === 1 && g.action !== 'update' && <> · {formatRange(data)}</>}
                  </div>
                  {g.action === 'update' && <Changes entry={first} />}
                </div>
                <button className="btn btn-ghost" disabled={busy === g.key} onClick={() => undo(g)}>
                  {undoLabel[g.action]}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {entries.length >= limit && (
        <button className="btn btn-ghost" style={{ marginTop: '0.75rem' }} onClick={() => setLimit((l) => l + 60)}>
          Show older changes
        </button>
      )}
    </section>
  );
}
