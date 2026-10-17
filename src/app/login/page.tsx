'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { errorMessage } from '@/lib/format';

export default function LoginPage() {
  const { configured, supabase, user, profile, loading: authLoading, authError } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (!authLoading && user && profile) router.replace('/dashboard'); }, [authLoading, user, profile, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!supabase) { setError('Supabase belum dikonfigurasi. Periksa .env.local.'); return; }
    setPending(true);
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (loginError) throw loginError;
      const { data: { user: signedInUser } } = await supabase.auth.getUser();
      if (!signedInUser) throw new Error('Login berhasil tetapi sesi pengguna belum tersedia. Coba lagi.');
      const { data: profileData, error: profileQueryError } = await supabase.from('profiles').select('id,display_name,role,is_active').eq('id', signedInUser.id).maybeSingle();
      if (profileQueryError) throw profileQueryError;
      if (!profileData || !profileData.is_active) {
        await supabase.auth.signOut();
        throw new Error('Akun belum terdaftar pada profil aplikasi atau dinonaktifkan. Minta pengelola menetapkan role Admin/Owner.');
      }
      router.replace('/dashboard');
      router.refresh();
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setPending(false); }
  }

  return <main className="auth-screen"><div className="auth-card">
    <div className="auth-brand"><div className="brand-mark">V</div><div><div className="brand-name">VEEVA</div><div className="brand-subtitle">INVENTORY SYSTEM</div></div></div>
    <div className="eyebrow">WELCOME BACK</div><h1>Masuk ke workspace</h1><p>Kelola transaksi, periksa persediaan, dan pantau operasional bisnis dalam satu tempat.</p>
    {!configured && <div className="alert alert-error"><ShieldCheck size={17}/><div>Konfigurasi Supabase belum tersedia. Salin <code>.env.example</code> ke <code>.env.local</code>, isi kedua variabel, lalu mulai ulang aplikasi.</div></div>}
    {(error || authError) && <div className="alert alert-error"><ShieldCheck size={17}/><div>{error || authError}</div></div>}
    <form onSubmit={handleSubmit}>
      <div className="auth-field"><label className="filter-label" htmlFor="email">EMAIL</label><input id="email" className="input-control" type="email" autoComplete="username" placeholder="nama@perusahaan.com" value={email} onChange={e => setEmail(e.target.value)} required disabled={!configured || pending}/></div>
      <div className="auth-field"><label className="filter-label" htmlFor="password">PASSWORD</label><div style={{position:'relative'}}><input id="password" className="input-control" type={showPassword?'text':'password'} autoComplete="current-password" placeholder="Masukkan password" value={password} onChange={e => setPassword(e.target.value)} required disabled={!configured || pending} style={{paddingRight:44}}/><button type="button" aria-label={showPassword?'Sembunyikan password':'Tampilkan password'} className="icon-button" onClick={()=>setShowPassword(v=>!v)} style={{position:'absolute',right:5,top:3}}>{showPassword?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></div>
      <button type="submit" disabled={!configured || pending} className="btn btn-primary btn-block" style={{marginTop:7,minHeight:44}}>{pending?<LoaderCircle size={17} className="spin"/>:<KeyRound size={16}/>} Masuk dengan aman <ArrowRight size={16}/></button>
    </form>
    <div className="auth-foot"><ShieldCheck size={13} style={{verticalAlign:'middle',marginRight:5,color:'#34d399'}}/>Akses dilindungi autentikasi dan kebijakan database.</div>
  </div></main>;
}
