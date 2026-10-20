import { Routes, Route, Link, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import CalendarPage from './pages/CalendarPage';
import LoginPage from './pages/LoginPage';
import RequestAccountPage from './pages/RequestAccountPage';
import AdminPage from './pages/AdminPage';
import FlyerPage from './pages/FlyerPage';
import SetPasswordModal from './components/SetPasswordModal';

function Header() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="site-header">
      <Link to="/" className="brand">
        <span className="brand-mark" aria-hidden="true">◷</span>
        Phantasia Community Calendar
      </Link>
      <nav>
        <NavLink to="/" end>Calendar</NavLink>
        {isAdmin && <NavLink to="/flyer">Flyer</NavLink>}
        {isAdmin && <NavLink to="/admin">Admin</NavLink>}
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
