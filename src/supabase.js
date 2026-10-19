import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);

// The anon key is safe to ship in the browser: row-level security in
// supabase/schema.sql decides what each visitor can read or change.
// PKCE puts email-link codes in "?code=" instead of the URL hash, so they
// don't collide with the hash-based routing GitHub Pages needs.
export const supabase = isConfigured
  ? createClient(url, anonKey, { auth: { flowType: 'pkce' } })
  : null;

/** Where Supabase email links (confirm, reset password) should send people back to. */
export const siteUrl = () => window.location.origin + window.location.pathname;
