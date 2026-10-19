import { useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../auth';

// Shown after someone follows a "reset password" email link.
export default function SetPasswordModal() {
  const { recovering, finishRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!recovering) return null;

  async function save(e) {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters.');
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(err.message);
    finishRecovery();
  }

  return (
    <div className="modal-backdrop">
      <form className="modal form" onSubmit={save}>
        <h2>Choose a new password</h2>
        <label>
          New password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="new-password"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <span className="spacer" />
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save password'}
          </button>
        </div>
      </form>
    </div>
  );
}
