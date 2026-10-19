import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);

  const loadProfile = useCallback(async (user) => {
    if (!user) {
      setProfile(null);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    setProfile(data);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session?.user);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      // tidy the one-time "?code=" off the address bar after an email link
      if (window.location.search.includes('code=')) {
        window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      }
      // defer so we don't call Supabase inside the auth callback
      setTimeout(() => loadProfile(newSession?.user), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const role = profile?.role ?? null;
  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role,
    loading,
    canEdit: role === 'editor' || role === 'admin',
    isAdmin: role === 'admin',
    recovering,
    finishRecovery: () => setRecovering(false),
    refreshProfile: () => loadProfile(session?.user),
    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
