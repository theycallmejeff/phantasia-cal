import { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { supabase, siteUrl } from '../supabase';
import { useAuth } from '../auth';

export default function LoginPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (user) return <Navigate to="/" replace />;

  async function signIn(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (err) return setError(err.message);
    navigate('/');
  }

  async function forgot() {
    if (!email) return setError('Type your email above first, then click “Forgot password?”.');
    setError('');
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() });
    if (err) return setError(err.message);
    setNotice('If that email has an account, a reset link is on its way.');
  }

  return (
    <div className="center-card">
      <form className="card form" onSubmit={signIn}>
        <h1>Sign in</h1>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="form-footer">
          <button type="button" className="link-button" onClick={forgot}>
            Forgot password?
          </button>
          <Link to="/request">Need an account?</Link>
        </div>
      </form>
    </div>
  );
}
