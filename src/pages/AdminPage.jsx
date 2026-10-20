import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import RecentChanges from '../components/RecentChanges';

const fmt = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export default function AdminPage() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    else setProfiles(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setRole(p, role) {
    if (role === 'rejected' && !window.confirm(`Turn down ${p.full_name || p.email}?`)) return;
    setBusyId(p.id);
    setError('');
    const { error: err } = await supabase.from('profiles').update({ role }).eq('id', p.id);
    setBusyId(null);
    if (err) return setError(err.message);
    load();
  }

  const pending = profiles.filter((p) => p.role === 'pending');
  const members = profiles.filter((p) => p.role === 'editor' || p.role === 'admin');
  const rejected = profiles.filter((p) => p.role === 'rejected');
  const names = Object.fromEntries(profiles.map((p) => [p.id, p.full_name || p.email.split('@')[0]]));

  if (loading) return <p className="muted pad">Loading…</p>;

  return (
    <div className="admin">
      <h1>Accounts</h1>
      {error && <div className="banner banner-warn">{error}</div>}

      <section>
        <h2>
          Requests waiting <span className="count">{pending.length}</span>
        </h2>
        {pending.length === 0 ? (
          <p className="muted">No one is waiting for approval.</p>
        ) : (
          <ul className="people">
            {pending.map((p) => (
              <li key={p.id} className="person">
                <div>
                  <strong>{p.full_name || '(no name)'}</strong>
                  <div className="muted">{p.email} · requested {fmt(p.created_at)}</div>
                  {p.reason && <p className="reason">“{p.reason}”</p>}
                </div>
                <div className="person-actions">
                  <button className="btn btn-ghost" disabled={busyId === p.id} onClick={() => setRole(p, 'rejected')}>
                    Decline
                  </button>
                  <button className="btn btn-primary" disabled={busyId === p.id} onClick={() => setRole(p, 'editor')}>
                    Approve
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>
          Members <span className="count">{members.length}</span>
        </h2>
        <ul className="people">
          {members.map((p) => {
            const isMe = p.id === user.id;
            return (
              <li key={p.id} className="person">
                <div>
                  <strong>{p.full_name || '(no name)'}</strong>{' '}
                  <span className={`role-pill role-${p.role}`}>{p.role}</span>
                  {isMe && <span className="muted"> (you)</span>}
                  <div className="muted">{p.email} · joined {fmt(p.created_at)}</div>
                </div>
                {!isMe && (
                  <div className="person-actions">
                    {p.role === 'editor' ? (
                      <button className="btn btn-ghost" disabled={busyId === p.id} onClick={() => setRole(p, 'admin')}>
                        Make admin
                      </button>
                    ) : (
                      <button className="btn btn-ghost" disabled={busyId === p.id} onClick={() => setRole(p, 'editor')}>
                        Remove admin
                      </button>
                    )}
                    <button className="btn btn-danger" disabled={busyId === p.id} onClick={() => setRole(p, 'rejected')}>
                      Revoke access
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {rejected.length > 0 && (
        <section>
          <h2>
            Declined or revoked <span className="count">{rejected.length}</span>
          </h2>
          <ul className="people">
            {rejected.map((p) => (
              <li key={p.id} className="person">
                <div>
                  <strong>{p.full_name || '(no name)'}</strong>
                  <div className="muted">{p.email}</div>
                </div>
                <div className="person-actions">
                  <button className="btn btn-ghost" disabled={busyId === p.id} onClick={() => setRole(p, 'editor')}>
                    Approve after all
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <RecentChanges names={names} />
    </div>
  );
}
