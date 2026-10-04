# [AGENTS.md](http://AGENTS.md) — checklist-shift

PWA mobile-first (Bahasa Indonesia) untuk SOP shift karyawan F&amp;B. Dokumen ini aturan kerja untuk AI coding agent.

## 1. Sumber Kebenaran (urutan prioritas)

1. [PRD.md](http://PRD.md) : perilaku produk

2. DATABASE\_[SCHEMA.md](http://SCHEMA.md) : struktur data Google Sheets

3. [TRD.md](http://TRD.md) : keputusan teknis

4. APP\_[FLOW.md](http://FLOW.md) : layar, modal, alur

5. IMPLEMENTATION\_[PLAN.md](http://PLAN.md) : urutan kerja

6. [TESTING.md](http://TESTING.md) : kriteria lulus

Jika dokumen bertentangan dengan kode atau dengan instruksi, BERHENTI dan tanyakan. Jangan memilih sendiri.

## 2. Aturan Anti-Overwrite (WAJIB)

- Kerjakan SATU fase IMPLEMENTATION\_[PLAN.md](http://PLAN.md) pada satu waktu, hanya fase yang diminta.

- Sebelum menulis kode: tuliskan asumsi dan daftar file yang akan dibuat/diubah/dihapus, lalu tunggu persetujuan.

- Jangan menimpa file yang sudah ada secara utuh. Ubah dengan edit minimal (diff kecil). Jika perlu menulis ulang &gt;30% sebuah file, minta izin dulu.

- Jangan memformat ulang, mengganti nama, memindahkan, atau merapikan kode di luar lingkup tugas.

- Jangan menghapus file, fungsi, kolom, tab, atau test tanpa izin eksplisit.

- Jangan mengubah dokumen (PRD, TRD, DATABASE\_SCHEMA, APP\_FLOW, IMPLEMENTATION\_PLAN, TESTING, AGENTS) kecuali diminta. Jika keputusan berubah, usulkan perubahan teksnya, jangan langsung menulis.

- Jangan menambah dependensi, library, atau service baru tanpa izin. Jelaskan alasannya dulu.

- Jangan membuat fitur, halaman, atau abstraksi di luar permintaan (tanpa over-engineering).

- Jangan menyentuh `.env*`, file kredensial, atau konfigurasi deploy.

- Jangan menjalankan migrasi atau menulis ke spreadsheet produksi. Gunakan spreadsheet uji.

- Jangan commit atau push kecuali diminta.

- Jika tugas terlalu besar, pecah dan usulkan langkah, jangan dikerjakan sekaligus.

## 3. Lingkup Produk

- Peran hanya dua: Petugas dan Admin. Penanggung Jawab (PJ) adalah status per shift, bukan peran.

- TIDAK ADA: penjadwalan, tukar shift, izin/cuti, absensi, penggajian, stok, integrasi POS, aplikasi native, multi-bahasa, 2FA, pembagian MVP.

- Hanya Bahasa Indonesia. Hanya PWA.

- Jangan menambah fitur yang tidak ada di PRD.

## 4. Stack

- Monorepo: `apps/web` (Next.js App Router, TypeScript, Tailwind, shadcn/ui, Lucide), `apps/api` (TypeScript, Hono), `packages/shared` (tipe + Zod), `apps/gas` (opsional).

- Database: Google Sheets via Sheets API + service account. Satu registry + satu spreadsheet per cabang.

- Upstash Redis: lock, cache, sesi, rate limit.

- Offline: Serwist + Dexie + TanStack Query.

- Deploy: Vercel (dua project), web meneruskan `/api/*` ke api lewat rewrites (satu origin).

- Tema: Minimalist Corporate.

- Foto: Drive atau Vercel Blob (TBD, jangan pilih sendiri).

## 5. Aturan Data (Sheets)

- Baca/tulis kolom berdasarkan NAMA header, bukan urutan.

- Tulis dengan `valueInputOption=RAW`.

- DILARANG menghapus, menyisipkan, atau mengurutkan baris. Hanya append dan update. Nonaktifkan lewat `is_active`/status/void.

- Waktu disimpan UTC ISO 8601. Tampil sesuai zona waktu cabang.

- ID memakai ULID, dibuat di aplikasi.

- Semua tulis memakai batch (`spreadsheets.batchUpdate`). Satu aksi pengguna maksimal satu panggilan tulis.

- Semua tulis atomik berurutan: ambil lock Redis -&gt; baca -&gt; validasi -&gt; satu batch -&gt; lepas lock.

- Jika Redis tidak tersedia, operasi atomik DITOLAK (fail closed).

- Setiap aksi dari klien membawa `client_action_id` (idempotensi).

- Skema Zod di `packages/shared` harus identik dengan DATABASE\_[SCHEMA.md](http://SCHEMA.md). Jangan mengubah skema tanpa izin dan tanpa migrasi.

- Kolom baru hanya ditambah di ujung kanan, lewat skrip migrasi.

## 6. Aturan Bisnis yang Tidak Boleh Dilanggar

- BR-01: satu shift non-void per (definisi shift + tanggal) per cabang, ditegakkan di bawah lock.

- BR-02: tanggal shift = tanggal saat dibuka (zona waktu cabang).

- BR-05: shift memakai snapshot template; perubahan template tidak memengaruhi shift berjalan.

- BR-12: aksi pertama pada item diterima; yang kalah mendapat "sudah diselesaikan oleh X".

- BR-14: tidak ada "centang semua".

- BR-23: penentuan waktu memakai jam server terkoreksi, bukan jam HP.

- BR-30: tutup shift hanya oleh PJ, semua item wajib selesai/skip beralasan, handover terisi.

- Setelah ditutup, shift, checklist, handover, dan laporan tidak dapat diubah lewat API. Koreksi hanya lewat addendum.

- BR-40: tidak ada hapus permanen.

- BR-41: isi incident tidak dapat diedit; koreksi lewat catatan tambahan.

- BR-43: audit log append-only dengan hash chain.

- Aksi sensitif admin wajib alasan + konfirmasi PIN dan tercatat di audit log.

- Admin terakhir tidak boleh dinonaktifkan atau diturunkan.

## 7. Keamanan

- Otorisasi di server pada SETIAP request: peran + akses cabang. Jangan mengandalkan penyembunyian di UI.

- Jangan pernah menaruh rahasia (service account key, SESSION\_SECRET, PIN\_PEPPER) di kode klien, log, atau respons.

- Jangan mencatat PIN atau pin\_hash di log atau audit.

- Cookie sesi: HttpOnly, Secure, SameSite. Pasang CSRF dan rate limiting.

- Validasi semua input di server dengan Zod.

- Pesan galat ke pengguna tidak membocorkan detail Sheets/Google.

- Foto disajikan lewat route API yang memeriksa akses cabang, bukan tautan langsung.

## 8. Gaya Kode

- TypeScript strict. Tanpa `any` tanpa alasan tertulis.

- Ikuti pola yang sudah ada di repo sebelum membuat pola baru.

- Fungsi kecil, tanpa abstraksi spekulatif.

- Komentar minimal; hanya untuk "mengapa", bukan "apa".

- Teks antarmuka Bahasa Indonesia, singkat dan lugas.

- UI: mobile-first, target sentuh minimal 48px, teks dasar 16px, status tidak hanya dengan warna (sertakan ikon + teks), gunakan komponen shadcn yang sudah ada sebelum membuat komponen baru.

- Drawer untuk modal di HP, Dialog di desktop.

## 9. Cara Bekerja

1. Baca dokumen yang relevan dengan tugas, ringkas pemahaman Anda dalam beberapa baris.

2. Sebutkan kontradiksi, informasi yang hilang, dan asumsi. Tanyakan jika ada keputusan terbuka (lihat bagian 11).

3. Usulkan rencana + daftar file. Tunggu persetujuan.

4. Implementasikan hanya yang disetujui.

5. Jalankan pemeriksaan relevan dari [TESTING.md](http://TESTING.md).

6. Laporkan: apa yang diubah, apa yang diuji, apa yang BELUM terverifikasi.

## 10. Pengujian dan Pelaporan

- Jangan menandai sesuatu lulus kecuali benar-benar dijalankan atau diverifikasi.

- Pisahkan: \[Otomatis\] dan \[Manual\] untuk pengguna.

- Uji konkurensi (BR-01, BR-12) dengan dua akun/permintaan paralel, bukan satu alur.

- Jika tes gagal, laporkan apa adanya (Tes, Diharapkan, Aktual, Langkah). Jangan melemahkan atau menghapus tes agar lulus.

- Jangan mengklaim "aman" tanpa menyebut apa yang diperiksa.

## 11. Keputusan Terbuka (JANGAN diputuskan sendiri, tanyakan)

- Penyimpanan foto: Drive vs Vercel Blob.

- Target skala (cabang x petugas serentak) dan strategi kuota Sheets (pool service account, write-behind).

- Nilai bawaan usulan: photo\_max\_size\_kb, photo\_retention\_days, pin\_block\_weak, public\_show\_photos.

- Apakah pembuka shift otomatis tercatat peserta.

- Kebijakan arsip file (bulan lama vs spreadsheet per tahun).

- Akordeon vs tab untuk Kategori SOP; apakah admin memakai HP.

## 12. Perintah (terverifikasi Fase 0, npm workspaces)

- Install: `npm install` (root)

- Dev api: `npm run dev --workspace=apps/api` (butuh `.env`, default `:3001` via `API_PORT`)

- Dev web: `npm run dev --workspace=apps/web` (default `:3000`, rewrites `/api/*` ke api via `API_BASE`)

- Typecheck: `npx tsc --noEmit -p packages/shared/tsconfig.json`, `npx tsc --noEmit -p apps/api/tsconfig.json --allowImportingTsExtensions`

- Setup registry: `npm run setup:registry --workspace=apps/api` (idempoten, butuh SA Editor)

- Build: TBD (belum diverifikasi)

## 13. Saat Ragu

Tanyakan, jangan menebak. Lebih baik satu pertanyaan singkat daripada perubahan besar yang salah.

## 14. Saat Ragu

Lakukan commit dan push berkala.