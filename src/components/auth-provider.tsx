'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client';
import type { Profile } from '@/lib/types';

type AuthContextValue = {
  configured: boolean;
  supabase: SupabaseClient | null;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  authError: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    if (!supabase?.auth) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setProfile(null); return; }
    const { data, error } = await supabase.from('profiles').select('id,display_name,role,is_active').eq('id', user.id).maybeSingle();
    if (error) { setAuthError(error.message); setProfile(null); return; }
    if (!data || !data.is_active) {
      setProfile(null);
      setAuthError('Profil aplikasi tidak ditemukan atau dinonaktifkan. Hubungi pengelola untuk mengatur role Admin/Owner.');
      return;
    }
    setAuthError(null);
    setProfile(data as Profile);
  }, [supabase]);

  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    let alive = true;
    const client = getSupabaseBrowserClient();
    setSupabase(client);
    client.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (data.session) {
        const { data: profileData, error } = await client.from('profiles').select('id,display_name,role,is_active').eq('id', data.session.user.id).maybeSingle();
        if (!alive) return;
        if (error) setAuthError(error.message);
        else if (!profileData || !profileData.is_active) setAuthError('Profil aplikasi tidak ditemukan atau dinonaktifkan. Hubungi pengelola untuk mengatur role Admin/Owner.');
        else { setProfile(profileData as Profile); setAuthError(null); }
      }
      if (alive) setLoading(false);
    }).catch((error: unknown) => {
      if (alive) { setAuthError(error instanceof Error ? error.message : 'Tidak dapat memuat sesi.'); setLoading(false); }
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) { setProfile(null); setAuthError(null); setLoading(false); }
      else {
        // Fetch profile after the auth event callback to avoid blocking Supabase's internal lock.
        setTimeout(() => { void client.from('profiles').select('id,display_name,role,is_active').eq('id', nextSession.user.id).maybeSingle().then(({ data, error }) => {
          if (!alive) return;
          if (error) setAuthError(error.message);
          else if (!data || !data.is_active) setAuthError('Profil aplikasi tidak ditemukan atau dinonaktifkan.');
          else { setProfile(data as Profile); setAuthError(null); }
          setLoading(false);
        }); }, 0);
      }
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, [configured]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null); setProfile(null);
  }, [supabase]);

  const value = useMemo(() => ({ configured, supabase, session, user: session?.user ?? null, profile, loading, authError, refreshProfile, signOut }),
    [configured, supabase, session, profile, loading, authError, refreshProfile, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth harus digunakan di dalam AuthProvider.');
  return value;
}
