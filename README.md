# Veeva Inventory — Transaksi & Monitoring Stok

Aplikasi web Next.js + TypeScript untuk pencatatan transaksi, pencarian barang, ledger pergerakan stok, dan laporan Admin/Owner. UI menggunakan dark glassmorphism dengan layout sidebar, kartu ringkasan berwarna, form horizontal, tabel, serta panel responsif berdasarkan dokumen desain yang disediakan.

> Status saat paket dibuat: source code dan migrasi disiapkan; database/akun hosting belum terhubung karena URL, kredensial proyek, dan repository deploy tidak disediakan di sesi ini. Tidak ada data contoh yang ditampilkan sebagai laporan aktual.

> Catatan validasi: pemeriksaan sintaks transpile untuk 16 file TypeScript/TSX lolos. Instalasi dependency tidak selesai di lingkungan penyusunan ini, jadi `next build`, lint penuh, uji browser, dan eksekusi migrasi terhadap proyek Supabase nyata belum dapat diverifikasi di sini. Jalankan pemeriksaan tersebut secara lokal sesuai langkah di bawah sebelum production.

## Kemampuan aplikasi

- Login dengan Supabase Auth dan pemetaan profil ke role `admin`/`owner`.
- Dashboard Admin: pemasukan transfer, pemasukan tunai, total pemasukan/pengeluaran harian, pemasukan bulanan/YTD, pengeluaran bulanan, dan tabel transaksi per tanggal.
- Dashboard Owner: ringkasan YTD, grafik bulanan, monitoring stok, tabel transaksi; semua operasi Owner read-only diproteksi RLS dan pemeriksaan role di RPC.
- Transaksi: tambah, cari, filter, edit, soft delete dengan konfirmasi.
- Transaksi barang: opsional menambahkan beberapa baris barang. Penjualan (pemasukan) mengurangi stok; pembelian/pengadaan stok (pengeluaran) menambah stok.
- Konsistensi: RPC PostgreSQL membuat/mengedit/menghapus transaksi, detail barang, saldo stok, inventory movement, dan audit log dalam transaksi database yang sama. Perubahan ditolak bila saldo akan menjadi negatif.
- Barang: cari berdasarkan nama/SKU/kategori, filter kategori, urutkan stok/harga/nama, tambah/edit/arsip, status stok, dan penyesuaian stok manual.
- Laporan: harian dan tahun berjalan, angka dihitung dari baris transaksi aktif aktual di PostgreSQL, serta ekspor CSV untuk rincian transaksi yang dikembalikan laporan.
- Zona waktu laporan: `Asia/Jakarta`.

## 1. Persiapan

Instal:

- Node.js LTS yang kompatibel (disarankan Node.js 22 LTS).
- npm (ikut dengan Node.js).
- Git.
- Akun/proyek Supabase yang Anda miliki.
- Akun GitHub dan Vercel untuk deployment.

Pastikan akun yang telah tersedia memang ada pada Authentication di proyek Supabase yang akan dipakai. **Jangan membuat akun baru bila akun saat ini harus dipertahankan.**

## 2. Menyiapkan project secara lokal

Ekstrak folder proyek ini, lalu jalankan perintah di terminal dari root folder `veeva-inventory-app`:

```bash
npm install
cp .env.example .env.local
```

Pada Windows PowerShell, bila `cp` tidak tersedia gunakan:

```powershell
Copy-Item .env.example .env.local
```

Buka `.env.local`, lalu isi dua nilai publik yang memang boleh ada di browser:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

Ambil URL dan publishable/anon key dari halaman Project Settings / API Keys proyek Supabase Anda. Jangan menaruh **service role key**, password database, access token, atau secret lain pada variabel dengan awalan `NEXT_PUBLIC_`. Jangan commit `.env.local` ke Git.

## 3. Membuat skema database

### Cara yang mudah: Supabase SQL Editor

1. Buka proyek Supabase yang akan dipakai.
2. Masuk ke SQL Editor.
3. Buka file `supabase/migrations/20261017000100_schema.sql`, salin seluruh isinya, lalu jalankan.
4. Buka file `supabase/migrations/20261017000200_security_and_functions.sql`, salin seluruh isinya, lalu jalankan.
5. Periksa bagian Tables dan pastikan tabel `profiles`, `products`, `transactions`, `transaction_items`, `inventory_movements`, dan `audit_logs` tersedia.
6. Periksa Authentication dan pastikan akun pengguna yang ingin dipakai masih tersedia.

File migrasi memasang RLS dan tidak membuat atau menghapus pengguna Auth. Kategori awal aplikasi disisipkan sebagai konfigurasi, bukan transaksi/produk fiktif.

### Cara alternatif: Supabase CLI

Untuk alur database yang terkelola oleh CLI, dari root proyek jalankan (setelah memasang Supabase CLI sesuai dokumentasi resmi Supabase):

```bash
supabase login
supabase link --project-ref PROJECT_REF
supabase db push
```

Jika direktori proyek Supabase belum diinisialisasi, jalankan `supabase init`, lalu letakkan file migrasi ini di direktori `supabase/migrations/` dengan penamaan timestamp yang sesuai sebelum `supabase db push`. Pilih satu pendekatan migrasi utama agar perubahan tidak diterapkan dua kali.

## 4. Memetakan akun yang sudah ada ke Admin/Owner

Setiap Auth user harus memiliki satu baris `profiles` dengan ID yang sama dengan `auth.users.id`. Tidak ada role default yang diberikan otomatis supaya akun tidak mendapat hak Admin secara tidak sengaja.

1. Di Supabase Authentication → Users, cari akun yang sudah ada dan salin UUID-nya.
2. Di SQL Editor, jalankan contoh berikut setelah mengganti UUID/nama sesuai akun yang benar-benar ada. **Jangan jalankan contoh dengan placeholder UUID.**

```sql
insert into public.profiles (id, display_name, role, is_active)
values
  ('UUID-AKUN-ADMIN', 'Admin Operasional', 'admin', true),
  ('UUID-AKUN-OWNER', 'Owner', 'owner', true)
on conflict (id) do update set
  display_name = excluded.display_name,
  role = excluded.role,
  is_active = excluded.is_active;
```

Jika hanya ada satu akun, masukkan satu baris saja. Penetapan atau pergantian role harus dilakukan oleh pengelola melalui dashboard SQL tepercaya, bukan melalui UI browser. Pastikan hanya orang yang memang berwenang yang mendapat role `admin`.

## 5. Jalankan dan uji lokal

```bash
npm run dev
```

Buka `http://localhost:3000`. Jika masih muncul instruksi konfigurasi, periksa nama file `.env.local`, URL, key, lalu hentikan dan mulai ulang server.

Cek tipe TypeScript sebelum build:

```bash
npm run typecheck
npm run build
```

Jika login ditolak dengan pesan profil tidak ditemukan, periksa `profiles.id`, `is_active`, dan role untuk UUID akun yang login. Jika laporan gagal memuat, cek apakah kedua migrasi berhasil dan fungsi RPC telah dibuat.

## 6. Menguji operasional

1. Login Admin dan buat transaksi pemasukan umum tanpa barang.
2. Pastikan transaksi muncul di riwayat, dashboard tanggal terkait, dan laporan harian.
3. Buat barang baru dengan saldo awal. Pastikan saldo awal tercatat di `inventory_movements`.
4. Buat transaksi pemasukan yang terkait barang. Pastikan saldo barang berkurang sesuai kuantitas.
5. Edit transaksi itu dan ubah kuantitas. Pastikan saldo dikoreksi terhadap dampak transaksi lama, bukan mengurangi stok dua kali.
6. Hapus transaksi terkait barang. Pastikan transaksi menjadi soft-deleted dan stok dibalik bila saldo masih cukup. Jika membalik stok akan menghasilkan saldo negatif, operasi harus ditolak dan semua perubahan database rollback.
7. Buat transaksi pengeluaran/pembelian yang terkait barang. Pastikan saldo bertambah.
8. Lakukan penyesuaian stok manual dengan alasan; cek saldo sebelum/sesudah pada ledger.
9. Login Owner; pastikan laporan dan daftar barang dapat dibaca tetapi menu/form operasional tidak tersedia.
10. Dengan Owner, coba panggil RPC `save_transaction`, `delete_transaction`, `save_product`, dan `adjust_stock` melalui console/REST; semuanya harus ditolak dengan otorisasi.
11. Coba akses aplikasi pada lebar mobile dan desktop serta uji state error/empty/loading.

## 7. Hubungkan ke GitHub

Buat repository private bila aplikasi berisi informasi internal:

```bash
git init
git add .
git commit -m "Initial Veeva inventory app"
git branch -M main
git remote add origin https://github.com/USERNAME/veeva-inventory.git
git push -u origin main
```

Ganti URL remote dengan repository Anda. Pastikan `.env.local` tidak masuk ke daftar file di-commit:

```bash
git status --short
```

Jika file rahasia pernah ter-commit, menghapusnya dari commit terbaru saja tidak cukup; rotasi key/secret terkait dan bersihkan riwayat bila diperlukan.

## 8. Deployment ke Vercel

1. Login ke Vercel lalu pilih **Add New → Project**.
2. Impor repository GitHub yang telah dibuat.
3. Framework preset harus terdeteksi sebagai Next.js. Biarkan build command default (`next build`) dan output default.
4. Tambahkan variabel environment `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` pada Preview dan Production. Jangan memasukkan service role key.
5. Deploy Preview dahulu. Login dengan akun Admin/Owner, lalu ulangi pemeriksaan CRUD, laporan, dan otorisasi.
6. Setelah lolos, merge/promosikan perubahan yang sama ke branch production (biasanya `main`) dan tunggu deployment production.
7. Bila memakai custom domain, atur melalui Vercel → Project → Settings → Domains dan ikuti instruksi DNS yang ditampilkan Vercel.
8. Di Supabase Authentication → URL Configuration, tambahkan URL produksi pada Site URL/Redirect URLs sesuai alur login yang digunakan. Pertahankan URL localhost untuk pengembangan bila diperlukan.
9. Setelah deployment, buka URL production dalam sesi browser bersih dan uji akun masing-masing role.

## 9. Environment dan keamanan

- `NEXT_PUBLIC_SUPABASE_URL` dan publishable/anon key bukan secret admin; akses data tetap dilindungi RLS.
- Service role key dan kredensial database hanya untuk lingkungan tepercaya, jangan pernah masuk source code/front-end.
- Mutasi transaksi/stok menggunakan RPC yang memeriksa role Admin dan dijalankan atomik.
- Kebijakan RLS membatasi tabel operasional ke user dengan profil aktif; tabel ledger tidak menyediakan policy direct insert/update/delete.
- Soft delete transaksi digunakan untuk menjaga audit. Pergerakan stok dan audit log tetap dipertahankan.
- Backup database dan prosedur pemulihan harus diaktifkan/diperiksa di dashboard Supabase sesuai paket yang digunakan.
- Pastikan konfigurasi MFA dan kebijakan password akun Owner/Admin sesuai risiko bisnis.

## 10. Batasan yang perlu dipahami sebelum produksi

- Paket ini belum bisa dihubungkan ke proyek Supabase Anda tanpa konfigurasi environment dan penerapan migrasi.
- Repository GitHub, project Vercel, DNS/domain, dan URL autentikasi tidak dibuat dari sesi ini karena akses akun tidak tersedia.
- Laporan menampilkan pemasukan, pengeluaran, dan selisih arus kas tercatat. Selisih tersebut bukan laba akuntansi; perhitungan laba memerlukan biaya pokok, biaya lain, aturan retur, dan perlakuan akuntansi yang disepakati.
- Sistem ini menolak edit/hapus transaksi yang membalik stok hingga negatif. Dalam skenario histori stok kompleks, Admin perlu meninjau transaksi terkait terlebih dahulu.
- Ekspor CSV berisi transaksi yang dikembalikan oleh fungsi laporan (maksimal 1.000 baris detail dalam rentang). Untuk ekspor sangat besar, implementasikan ekspor server-side berpaginasi.
- Tabel transaksi UI saat ini memuat hingga 500 transaksi terbaru; angka dashboard/laporan tetap dihitung dengan agregasi database, bukan hasil dari batas tabel UI.

## Folder penting

```text
src/app/                  Halaman Next.js
src/components/            Shell, auth provider, komponen umum
src/lib/supabase/          Klien Supabase browser
src/lib/types.ts           Tipe data aplikasi
supabase/migrations/       Skema, RLS, RPC database
.env.example               Contoh konfigurasi tanpa kredensial
```
