# Technical Requirements Document — checklist-shift

Acuan fungsional: `PRD.md`. Jika konflik, PRD.md berlaku untuk perilaku produk; dokumen ini berlaku untuk keputusan teknis.

## 1. Ringkasan
PWA mobile-first (Bahasa Indonesia) untuk memastikan SOP tiap shift outlet F&B dijalankan dan terdokumentasi: checklist bersama, incident, handover, laporan shift terkunci. Dua peran: Petugas dan Admin.

## 2. Tujuan Teknis
- Pengisian cepat dan tahan koneksi buruk (offline queue).
- Aturan "yang pertama diterima" (BR-12) dan satu shift per kunci (BR-01) ditegakkan di awal, bukan dikoreksi belakangan.
- Riwayat tidak bisa diubah diam-diam (BR-43), setidaknya terdeteksi.
- Menambah cabang tanpa mengubah kode.
- Semua komponen dapat di-deploy di Vercel.

## 3. Stack (keputusan)

| Lapisan | Pilihan | Status |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript, Tailwind, shadcn/ui, Lucide | Putus |
| Tema | Minimalist Corporate | Putus |
| Backend | TypeScript, terpisah dari frontend (decouple) | Putus |
| Framework backend | Hono (jalan di Vercel) | Asumsi, dapat diganti |
| Validasi | Zod, skema dibagi lewat `packages/shared` | Putus |
| Database | Google Sheets via **Sheets API** + service account | Putus |
| GAS | Hanya untuk fitur tertentu dan opsional (trigger/email); bukan jalur tulis utama | Putus |
| Lock, cache, rate limit, pencabutan sesi | Upstash Redis | Asumsi (pengganti LockService) |
| Hash PIN | argon2 | Putus (PRD AUTH-02) |
| Sesi | JWT cookie HttpOnly + daftar pencabutan di Redis | Asumsi |
| Offline/PWA | Serwist, Dexie (IndexedDB), TanStack Query | Asumsi |
| Push | web-push + pusat notifikasi dalam aplikasi | Asumsi |
| Foto | Drive API (service account) atau Vercel Blob | **TBD** |
| PDF/CSV | `@react-pdf/renderer`, CSV dari data laporan | Asumsi |
| Hosting | Vercel (dua project dari satu monorepo) | Putus |

## 4. Arsitektur

```
Browser (PWA) -> apps/web (Next.js, Vercel)
                   | rewrites /api/* (satu origin)
                   v
                 apps/api (Hono, Vercel)
                   |-- Sheets API : registry + spreadsheet per cabang
                   |-- Upstash    : lock, cache, rate limit, sesi
                   |-- Drive/Blob : foto
                   |-- (opsional) GAS : trigger/email
```

- Browser memanggil `/api/*` pada domain web; Next.js `rewrites` meneruskan ke project API. Satu origin menghindari CORS dan masalah cookie SameSite lintas domain (iOS).
- Alternatif jika rewrites bermasalah: subdomain dengan cookie `Domain=.domain.com`.

### Struktur monorepo
```
apps/web        Next.js (UI, PWA, service worker)
apps/api        Hono (otorisasi, logika bisnis, akses Sheets)
apps/gas        (opsional) kode GAS via clasp
packages/shared tipe, skema Zod, konstanta
```
Tipe dan Zod di `packages/shared` menjadi kontrak antara web dan api.

## 5. Desain Data (Google Sheets)

### 5.1 Registry (satu spreadsheet global)

| Tab | Isi |
|---|---|
| `Branches` | branch_id, name, code, timezone, spreadsheet_id, schema_version, is_active |
| `Users` | id, name, username, pin_hash, role, is_active, failed_attempts, locked_until, last_login_at |
| `UserBranchAccess` | user_id, branch_id |
| `IncidentCategories` | id, name, is_active, sort_order |
| `Settings` | key, value |
| `ShareTokens` | token_hash, branch_id, report_id, expires_at, revoked_at, created_by |
| `AuditLog_Global` | aksi lintas cabang (akun, cabang, pengaturan, token) |

### 5.2 Spreadsheet per cabang

| Tab | Catatan |
|---|---|
| `_meta` | schema_version, branch_id |
| `ShiftDefinitions`, `SopCategories`, `ChecklistPoints`, `HandoverFields` | template |
| `ShiftInstances` | termasuk `template_snapshot` (JSON) |
| `Participants`, `Reports`, `Addenda`, `Summary` | `Summary` = agregat harian oleh cron |
| `Entries_YYYY-MM`, `EntryLogs_YYYY-MM`, `Handovers_YYYY-MM`, `HandoverAcks_YYYY-MM` | volume tinggi, dipecah per bulan |
| `Incidents_YYYY-MM`, `IncidentNotes_YYYY-MM`, `IncidentPhotos_YYYY-MM` | dipecah per bulan |
| `AuditLog_YYYY-MM` | append-only + hash chain |

Shift lintas pergantian bulan menempel ke bulan tanggal shift (BR-02).

### 5.3 Konvensi skema
- Baris 1 = header; kolom A = `id` (ULID dibuat di aplikasi).
- Semua tab: `created_at`, `updated_at`; tab yang bisa dinonaktifkan: `is_active`.
- Waktu disimpan UTC ISO 8601; tampil sesuai zona waktu cabang.
- Tidak ada hapus baris (BR-40): nonaktif, arsip, atau void.
- Header divalidasi (Zod) saat cabang didaftarkan dan saat startup/cek kesehatan.
- `template_snapshot` dibatasi 50.000 karakter per sel; bila melebihi, pindah ke tab `Snapshots`. Ukur pada checklist terbesar sebelum memutuskan.
- Audit log: setiap baris menyimpan `prev_hash` dan `hash` (hash chain). Sifatnya mendeteksi manipulasi, bukan mencegah.

### 5.4 Pola akses
- Cache peta `id -> nomor baris` per tab aktif di Redis; baca dengan `batchGet`, tulis dengan `batchUpdate`/`append`.
- Cache registry (TTL singkat), invalidasi saat admin mengubah cabang/akun.
- Dashboard dan laporan lintas cabang membaca tab `Summary`, bukan fan-out data mentah.
- `/r/[token]`: cari token di registry untuk menentukan spreadsheet cabang.
- Kuota Sheets API dihitung per project Google Cloud. Semua tulis harus di-batch.

## 6. Konkurensi
- BR-01: lock Redis `SET lock:shift:{cabang}|{shift}|{tanggal} NX EX 10`, cek keberadaan, lalu tulis.
- BR-12: lock `lock:entry:{shiftId}|{pointRef}`; pemenang = aksi pertama; yang kalah menerima respons "sudah diselesaikan oleh X".
- Aksi offline memakai `action_at` terkoreksi (BR-23) sebagai pembanding urutan; kekalahan ditampilkan ke pengguna, tidak dibuang diam-diam.
- Penutupan shift: lock per shift, validasi BR-30, buat laporan, set terkunci dalam satu urutan operasi.

## 7. Autentikasi dan Keamanan
- Username + PIN 6 angka; argon2 + `PIN_PEPPER`; batas percobaan dan kunci sementara (Redis + `Users`).
- Sesi JWT cookie `HttpOnly`, `Secure`, `SameSite`; durasi default 30 hari; pencabutan via Redis (paksa logout, nonaktif akun).
- Otorisasi di server pada setiap request: peran + daftar cabang.
- Aksi sensitif (tutup shift, aksi admin pada 7.12 PRD): alasan + konfirmasi ulang PIN.
- CSRF, rate limiting (login dan aksi sensitif), validasi Zod di server.
- Service account hanya diberi akses ke folder root; file Sheets tidak dibagikan ke pengguna lain (klien melihat lewat ekspor/salinan read-only bila perlu).
- Foto disajikan lewat route API yang memeriksa akses cabang; tautan tidak mudah ditebak.

## 8. PWA, Offline, Sinkronisasi
- Manifest, ikon, standalone, ajakan pasang; service worker (Serwist) meng-cache app shell; data baca stale-while-revalidate.
- Antrian aksi di Dexie: centang, isi, skip, incident (termasuk foto), draf handover. Status per aksi: menunggu / terkirim / gagal (coba lagi).
- Wajib online: login awal, buka/tutup shift, aksi admin, buat tautan bagikan.
- Foto dikompres di klien, diunggah bertahap.
- Progress bersama di-poll 15-30 detik dan saat aplikasi dibuka kembali (CK-10).
- Push iOS hanya setelah dipasang ke layar utama; pusat notifikasi dalam aplikasi adalah kanal utama.

## 9. Pekerjaan Terjadwal (Vercel Cron)
- Hitung `Summary` harian per cabang.
- Deteksi shift tidak ditutup/tidak dibuka dan bentuk notifikasi admin (ADM-DB-02, NT-04).
- Pembersihan token kedaluwarsa dan foto sesuai retensi.

## 10. Environment Variables

| Variabel | Fungsi |
|---|---|
| `REGISTRY_SPREADSHEET_ID` | titik masuk registry |
| `DRIVE_ROOT_FOLDER_ID` | folder root (template, foto bila Drive) |
| `GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY` | service account (ganti `\n` saat dibaca) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | lock, cache, sesi |
| `SESSION_SECRET` | tanda tangan JWT |
| `PIN_PEPPER` | pengaman tambahan hash PIN |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | web push |
| `CRON_SECRET` | proteksi endpoint cron |
| `BLOB_READ_WRITE_TOKEN` | hanya jika Vercel Blob dipakai |
| `GAS_URL`, `GAS_SECRET` | hanya jika GAS dipakai |

## 10b. Tambah Cabang (prosedur)
1. Admin menyalin spreadsheet `_template-cabang` ke folder cabang di Drive dan membagikannya ke service account sebagai Editor.
2. Admin memasukkan spreadsheet ID di form Cabang.
3. API memverifikasi akses, melengkapi tab/header yang kurang (`addSheet`), menulis `_meta`, lalu menambah baris di `Branches`.
Service account tidak membuat file sendiri (menghindari masalah kepemilikan dan kuota).

## 11. Persyaratan Non-Fungsional
- Responsif mulai 320px; target sentuh minimal 48px; teks dasar 16px; kontras memadai.
- Centang terasa instan (optimistic update); sinkronisasi di latar belakang.
- Skeleton untuk loading; pesan galat jelas dan dapat ditindaklanjuti.
- Backup: salinan terjadwal spreadsheet registry dan cabang (mis. salinan Drive mingguan).
- Migrasi skema dijalankan per spreadsheet cabang berdasarkan `schema_version`.

## 12. Batasan dan Risiko
- Sheets tanpa index: baca lewat cache peta baris; performa turun setelah puluhan ribu baris per tab (itulah alasan pemecahan per bulan).
- Throughput tulis terbatas kuota; semua tulis di-batch.
- Siapa pun dengan akses Editor ke file dapat mengubah data; hash chain hanya mendeteksi.
- Statistik berat; gunakan `Summary`.
- Ketergantungan pada Upstash untuk lock; jika Redis mati, operasi atomik harus ditolak (fail closed), bukan dilanjutkan tanpa lock.

## 13. Keputusan Terbuka
1. Penyimpanan foto: Drive vs Vercel Blob (TBD).
2. Framework backend: Hono (asumsi) vs Fastify/Express.
3. Skala target (jumlah cabang dan petugas) untuk memvalidasi batas kuota.
4. Apakah GAS dipakai sama sekali (trigger/email) atau cukup Vercel Cron.
5. Target numerik metrik keberhasilan (PRD 12).

## 14. Definition of Done
- Alur kritis petugas (buka -> checklist -> handover -> tutup -> laporan -> bagikan) berjalan end to end.
- BR-01 dan BR-12 lolos uji dua pengguna bersamaan.
- Tidak ada rahasia di kode klien; otorisasi per cabang diuji.
- Offline queue lolos uji putus-sambung.
- Semua fitur PRD (13 modul admin) tersedia.
- Deploy produksi di Vercel berhasil dan TESTING.md lulus.
