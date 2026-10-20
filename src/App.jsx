import { useEffect, useState } from 'react';
import { Routes, Route, Link, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from './supabase';
import { useAuth } from './auth';
import CalendarPage from './pages/CalendarPage';
import LoginPage from './pages/LoginPage';
import RequestAccountPage from './pages/RequestAccountPage';
import AdminPage from './pages/AdminPage';
import FlyerPage from './pages/FlyerPage';
import SetPasswordModal from './components/SetPasswordModal';

/** Number of account requests waiting, for the badge on the Admin link. */
function usePendingCount(enabled) {
  const [count, setCount] = useState(0);
  const location = useLocation();
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () =>
      supabase.rpc('pending_request_count').then(({ data, error }) => {
        if (alive && !error && typeof data === 'number') setCount(data);
      });
    load();
    const timer = setInterval(load, 60 * 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [enabled, location.pathname]); // refresh when moving between pages, e.g. after approving
  return enabled ? count : 0;
}

function Header() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const pending = usePendingCount(isAdmin);

  return (
    <header className="site-header">
      <Link to="/" className="brand">
        <span className="brand-mark" aria-hidden="true">◷</span>
        Phantasia Community Calendar
      </Link>
      <nav>
        <NavLink to="/" end>Calendar</NavLink>
        {isAdmin && <NavLink to="/flyer">Flyer</NavLink>}
        {isAdmin && (
          <NavLink to="/admin" title={pending ? `${pending} account request${pending === 1 ? '' : 's'} waiting` : undefined}>
            Admin
            {pending > 0 && <span className="nav-badge">{pending}</span>}
          </NavLink>
        )}
        {user ? (
          <>
            <span className="who" title={profile?.email}>
              {profile?.full_name || profile?.email}
              {profile && <span className={`role-pill role-${profile.role}`}>{profile.role}</span>}
            </span>
            <button
              className="btn btn-ghost"
              onClick={async () => {
                await signOut();
                navigate('/');
              }}
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <NavLink to="/login">Sign in</NavLink>
            <Link to="/request" className="btn btn-primary">Request account</Link>
          </>
        )}
      </nav>
    </header>
  );
}

function StatusBanner() {
  const { user, role } = useAuth();
  if (!user || !role) return null;
  if (role === 'pending')
    return (
      <div className="banner">
        Your account request is waiting for admin approval. You can view the calendar in the meantime.
      </div>
    );
  if (role === 'rejected')
    return <div className="banner banner-warn">Your account request was not approved.</div>;
  return null;
}

function RequireAdmin({ children }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  return isAdmin ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <div className="app">
      <Header />
      <StatusBanner />
      <main>
        <Routes>
          <Route path="/" element={<CalendarPage />} />
          <Route path="/event/:id" element={<CalendarPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/request" element={<RequestAccountPage />} />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminPage />
              </RequireAdmin>
            }
          />
          <Route
            path="/flyer"
            element={
              <RequireAdmin>
                <FlyerPage />
              </RequireAdmin>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <SetPasswordModal />
    </div>
  );
}
