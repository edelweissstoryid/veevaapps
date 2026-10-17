VEEVA INVENTORY — MULAI DARI SINI

1. Ekstrak veeva-inventory-app.zip.
2. Buka folder veeva-inventory-app di terminal.
3. Jalankan: npm install
4. Salin .env.example menjadi .env.local, lalu isi URL dan publishable/anon key Supabase.
5. Jalankan kedua file SQL secara berurutan melalui Supabase SQL Editor:
   - supabase/migrations/20261017000100_schema.sql
   - supabase/migrations/20261017000200_security_and_functions.sql
6. Petakan ID pengguna Auth yang SUDAH ADA ke public.profiles (panduan dan SQL ada di README.md). Migrasi tidak membuat akun baru.
7. Jalankan: npm run dev
8. Buka http://localhost:3000
9. Sebelum rilis, jalankan npm run typecheck dan npm run build, lalu ikuti tes di tests/acceptance-checklist.md.

PENTING:
- Belum terhubung ke akun Supabase/GitHub/Vercel Anda karena kredensial dan repository tidak diberikan.
- Jangan memasukkan Service Role Key ke NEXT_PUBLIC_* atau meng-commit .env.local.
- Build Next.js, eksekusi migrasi di database nyata, dan pengujian end-to-end perlu dilakukan setelah dependency dan kredensial dipasang. Lihat README.md untuk panduan lengkap.
