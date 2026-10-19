import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth';
import { isConfigured } from './supabase';
import './styles.css';

function NotConfigured() {
  return (
    <div className="center-card">
      <div className="card">
        <h1>Almost there</h1>
        <p>
          This site isn't connected to Supabase yet. Set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> (in a local <code>.env</code> file, or as GitHub
          repository secrets for the deployed site). See the README for the steps.
        </p>
      </div>
    </div>
  );
}

// HashRouter keeps routes working on GitHub Pages, which has no server-side rewrites.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isConfigured ? (
      <HashRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </HashRouter>
    ) : (
      <NotConfigured />
    )}
  </React.StrictMode>
);
