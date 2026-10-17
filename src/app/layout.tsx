import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/auth-provider';

export const metadata: Metadata = {
  title: 'Veeva Inventory | Transaksi & Monitoring Stok',
  description: 'Aplikasi pencatatan transaksi dan monitoring stok barang.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body><AuthProvider>{children}</AuthProvider></body></html>;
}
