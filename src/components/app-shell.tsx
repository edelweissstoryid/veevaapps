'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, ReceiptText, PackageSearch, Warehouse, LineChart,
  LogOut, Menu, X, ShieldCheck, CircleUser, ArrowUpRight, Settings2, LoaderCircle
} from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import type { Role } from '@/lib/types';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'owner'] },
  { href: '/transactions', label: 'Transaksi', icon: ReceiptText, roles: ['admin'] },
  { href: '/products', label: 'Daftar Barang', icon: PackageSearch, roles: ['admin', 'owner'] },
  { href: '/stock-movements', label: 'Pergerakan Stok', icon: Warehouse, roles: ['admin'] },
  { href: '/reports', label: 'Laporan', icon: LineChart, roles: ['admin', 'owner'] }
] as const;

export function AppShell({ children, title, subtitle, requiredRole }: { children: React.ReactNode; title: string; subtitle?: string; requiredRole?: Role }) {
  const { configured, loading, user, profile, authError, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    if (!loading && configured && !user) router.replace('/login');
    if (!loading && user && profile && requiredRole && profile.role !== requiredRole) router.replace('/dashboard');
  }, [loading, configured, user, profile, authError, requiredRole, router]);

  if (!configured) return <ConfigurationNotice />;
  if (loading || !user || !profile || (requiredRole && profile.role !== requiredRole)) {
    return <div className="screen-loader"><div className="loading-orb"><LoaderCircle size={24} className="spin" /></div><span>Memuat ruang kerja...</span></div>;
  }

  const items = navItems.filter(item => item.roles.includes(profile.role));
  return (
    <div className="app-frame">
      {mobileNav && <button aria-label="Tutup navigasi" className="mobile-backdrop" onClick={() => setMobileNav(false)} />}
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark">V</div>
          <div><div className="brand-name">VEEVA</div><div className="brand-subtitle">INVENTORY SYSTEM</div></div>
          <button className="icon-button mobile-close" aria-label="Tutup menu" onClick={() => setMobileNav(false)}><X size={19} /></button>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="side-nav">
          {items.map(item => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return <Link key={item.href} href={item.href} onClick={() => setMobileNav(false)} className={`nav-link ${active ? 'nav-link-active' : ''}`}>
              <Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>{active && <span className="nav-indicator" />}
            </Link>;
          })}
        </nav>
        <div className="sidebar-spacer" />
        <div className="role-panel">
          <div className={`role-avatar ${profile.role === 'owner' ? 'role-owner' : ''}`}>{profile.role === 'owner' ? <LineChart size={17} /> : <ShieldCheck size={17} />}</div>
          <div className="role-meta"><div className="role-display">{profile.display_name || user.email?.split('@')[0] || 'Pengguna'}</div><div className="role-label">{profile.role === 'admin' ? 'ADMIN OPERASIONAL' : 'OWNER · READ ONLY'}</div></div>
          <span className="online-dot" title="Sesi aktif" />
        </div>
        <button className="signout-button" onClick={async () => { await signOut(); router.replace('/login'); }}><LogOut size={17} /> Keluar dari aplikasi</button>
        <div className="sidebar-footer"><span className="status-dot" /> Database secured <span className="build-tag">v1.0</span></div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Buka navigasi" onClick={() => setMobileNav(true)}><Menu size={21} /></button>
          <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>{title}</strong></div>
          <div className="topbar-right"><div className="secure-pill"><ShieldCheck size={14} /> Secure session</div><div className="topbar-user"><div className="user-avatar"><CircleUser size={18} /></div><div className="topbar-user-meta"><span>{profile.role === 'admin' ? 'Admin' : 'Owner'}</span><small>{profile.display_name || user.email}</small></div></div></div>
        </header>
        <div className="content-wrap">
          <div className="page-heading"><div><div className="eyebrow">{profile.role === 'admin' ? 'OPERATIONAL CENTER' : 'BUSINESS INTELLIGENCE'}</div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div><div className="date-today">{new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date())}</div></div>
          {authError && <div className="alert alert-error"><ShieldCheck size={18} /><div><strong>Akses profil perlu diperiksa</strong><p>{authError}</p></div></div>}
          {children}
          <footer className="app-footer"><span>Veeva Inventory <span className="footer-separator">•</span> Operational suite</span><span>Built for clarity & control <ArrowUpRight size={13} /></span></footer>
        </div>
      </main>
    </div>
  );
}

function ConfigurationNotice() {
  return <main className="setup-screen"><div className="setup-card glass-panel"><div className="brand-mark brand-mark-large">V</div><span className="eyebrow">FIRST-TIME SETUP</span><h1>Hubungkan Supabase</h1><p>Aplikasi sudah disiapkan, tetapi belum terhubung ke proyek database. Tambahkan konfigurasi Supabase agar autentikasi, transaksi, barang, dan laporan aktif.</p><div className="setup-code"><span>NEXT_PUBLIC_SUPABASE_URL=...</span><span>NEXT_PUBLIC_SUPABASE_ANON_KEY=...</span></div><ol><li>Salin <code>.env.example</code> menjadi <code>.env.local</code>.</li><li>Isi URL dan publishable/anon key dari dashboard Supabase.</li><li>Jalankan migrasi SQL dari folder <code>supabase/migrations</code>.</li><li>Mulai ulang server pengembangan.</li></ol><p className="setup-note">Lihat <code>README.md</code> untuk panduan lengkap. Tidak ada data demo yang ditampilkan sebagai data aktual.</p></div></main>;
}
