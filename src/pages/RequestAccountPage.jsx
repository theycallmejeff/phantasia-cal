import { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { supabase, siteUrl } from '../supabase';
import { useAuth } from '../auth';

export default function RequestAccountPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: '', email: '', reason: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  if (user && !sent) return <Navigate to="/" replace />;

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) return setError('Use a password of at least 8 characters.');
    setBusy(true);
    const { data, error: err } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: siteUrl(),
        data: { full_name: form.full_name.trim(), reason: form.reason.trim() },
      },
    });
    setBusy(false);
    if (err) return setError(err.message);
    // If email confirmation is turned off in Supabase, they're signed in right away.
    if (data.session) return navigate('/');
    setSent(true);
  }

  if (sent) {
    return (
      <div className="center-card">
        <div className="card">
          <h1>Check your email</h1>
          <p>
            We sent a confirmation link to <strong>{form.email}</strong>. After you confirm, an admin
            will review your request. You'll be able to add and edit events once you're approved.
          </p>
          <Link to="/" className="btn btn-primary">Back to the calendar</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="center-card">
      <form className="card form" onSubmit={submit}>
        <h1>Request an account</h1>
        <p className="muted">
          Approved members can add and edit events. An admin reviews each request.
        </p>
        <label>
          Your name
          <input value={form.full_name} onChange={set('full_name')} required autoComplete="name" />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={set('password')}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        <label>
          Why do you want to post events? <span className="muted">(optional)</span>
          <textarea rows={3} value={form.reason} onChange={set('reason')} maxLength={500} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Sending…' : 'Send request'}
        </button>
        <div className="form-footer">
          <span />
          <Link to="/login">Already have an account?</Link>
        </div>
      </form>
    </div>
  );
}
