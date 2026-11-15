import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './lib/supabase';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still loading
  const [profile, setProfile] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setProfile(session === null ? null : undefined); return; }
    supabase.from('users').select('id,full_name,email,role').eq('id', session.user.id).single()
      .then(({ data }) => setProfile(data || null));
  }, [session]);

  const signOut = () => supabase.auth.signOut();
  return <Ctx.Provider value={{ session, profile, signOut }}>{children}</Ctx.Provider>;
}
