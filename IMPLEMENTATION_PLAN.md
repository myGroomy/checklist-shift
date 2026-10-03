# Implementation Plan — checklist-shift

## Aturan Kerja
- Kerjakan satu fase pada satu waktu. Jangan mulai fase berikutnya sebelum verifikasi fase ini lulus.
- Tidak ada pembagian MVP: seluruh fitur PRD dibangun, urutan di bawah hanya ketergantungan teknis.
- Sebelum coding tiap fase: daftar asumsi dan file yang akan dibuat/diubah.
- Ubah dokumen (TRD/APP_FLOW) bila keputusan berubah.

## Fase 0 — Setup Monorepo dan Akses Google
Tugas:
- Monorepo: `apps/web`, `apps/api`, `packages/shared` (`apps/gas` opsional).
- TypeScript, lint, format, `.env.example`.
- Project Google Cloud, aktifkan Sheets API (dan Drive API bila foto di Drive), buat service account.
- Buat `_registry` dan `_template-cabang` di folder root; bagikan ke service account.
- Akun Upstash; dua project Vercel; `rewrites` `/api/*` dari web ke api.
Hasil: web dan api jalan lokal dan terdeploy; `GET /api/health` lewat satu origin.
Verifikasi:
- API dapat membaca tab `Settings` di registry.
- Request web `/api/health` diteruskan ke api tanpa CORS.

## Fase 1 — Lapisan Data Sheets
Tugas:
- Klien Sheets (batchGet, batchUpdate, append) dengan retry/backoff dan batching.
- Repository generik: skema Zod per tab, validasi header, ULID, timestamp UTC.
- Cache peta `id -> baris` dan cache registry di Redis, dengan invalidasi.
- Penyedia lock Redis (`SET NX EX`), fail closed.
- Resolver cabang: `branch_id -> spreadsheet_id` dari registry.
- Util tab per bulan (`Entries_YYYY-MM`) dibuat otomatis bila belum ada.
- Util hash chain untuk audit log.
Hasil: CRUD terpetakan untuk semua entitas registry dan satu cabang uji.
Verifikasi:
- Tulis/baca/update satu baris di tiap tab; header salah ditolak.
- 20 tulis bersamaan tidak melewati kuota karena batching.
- Edit manual baris audit terdeteksi oleh pemeriksa hash chain.

## Fase 2 — Autentikasi dan Akses
Tugas:
- Login username + PIN (argon2 + pepper), batas percobaan, kunci sementara.
- Sesi JWT cookie + pencabutan di Redis; paksa logout.
- Middleware otorisasi: peran + akses cabang di server.
- Ganti PIN (wajib login pertama), logout semua perangkat.
- Rate limiting login.
- Audit log global.
Hasil: login/logout aman; rute dilindungi.
Verifikasi:
- Lima PIN salah mengunci akun; admin dapat membuka.
- Petugas tidak dapat mengakses cabang di luar izinnya (uji langsung ke API).
- Akun nonaktif kehilangan sesi.

## Fase 3 — Konfigurasi Admin
Tugas:
- Cabang (termasuk daftarkan spreadsheet ID + verifikasi + auto-lengkapi tab), salin dari cabang lain.
- Akun (CRUD, akses cabang, reset PIN, buka kunci, nonaktifkan, perlindungan admin terakhir).
- Definisi Shift, Checklist Builder (kategori, point, drag & drop, duplikasi, pratinjau), Handover Builder, Kategori Incident.
- Pengaturan sistem.
- Komponen aksi sensitif (alasan + PIN) dan audit log tertulis.
- Audit Log (viewer).
Hasil: admin dapat menyiapkan cabang lengkap tanpa menyentuh Sheets manual.
Verifikasi:
- Tambah cabang baru hanya dengan spreadsheet ID.
- Perubahan template tercatat di audit log dengan sebelum/sesudah.
- Admin terakhir tidak dapat dinonaktifkan.

## Fase 4 — Siklus Shift dan Checklist Bersama
Tugas:
- Buka shift (lock BR-01, tanggal sesuai zona cabang, snapshot template), gabung, "Saya bertugas".
- Checklist: semua tipe input, wajib/opsional, hari berlaku, label waktu (jam server), skip beralasan, batal centang + log.
- Aturan BR-12 (yang pertama diterima) dengan lock.
- Peserta tercatat pada aksi pertama.
- Polling progress 15-30 detik.
- Home dan tab Checklist, checklist aktif (akordeon per kategori).
Hasil: beberapa petugas mengerjakan satu checklist bersama.
Verifikasi:
- Dua akun menekan Buka Shift bersamaan: satu PJ, satu bergabung.
- Dua akun mencentang item sama: satu diterima, satu melihat "sudah diselesaikan oleh X".
- Label Tepat waktu/Lebih awal/Terlambat benar di batas toleransi.

## Fase 5 — Handover, Incident, Penutupan Shift
Tugas:
- Handover: field terstruktur + teks + foto; baca dan tandai "sudah dibaca".
- Incident: buat, foto (maks 5), kategori, penautan otomatis (jendela 4 jam), di luar shift, catatan, status oleh admin.
- Penyimpanan foto (sesuai keputusan TBD) + route akses yang mengecek cabang.
- Stepper Tutup Shift: validasi BR-30, handover, toggle "tidak ada incident", PIN, buat laporan terkunci.
Hasil: shift dapat ditutup menghasilkan laporan terkunci.
Verifikasi:
- Tutup ditolak jika item wajib belum selesai/skip atau handover wajib kosong.
- Hanya PJ dapat menutup.
- Setelah ditutup, tidak ada data shift yang dapat diubah lewat API.

## Fase 6 — Laporan, Berbagi, Operasi Admin
Tugas:
- Tab Report (dua kolom/kartu), detail laporan, kontribusi per petugas, addendum.
- WhatsApp `wa.me` dengan template admin; tautan publik bertoken (kedaluwarsa, cabut) dan halaman `/r/[token]`.
- Operasi Shift: tutup paksa, ganti PJ, buka atas nama, void, addendum, buka kunci darurat.
- Incident admin: ubah status, tautkan ke shift.
Hasil: laporan dapat dilihat, dibagikan, dikoreksi lewat addendum.
Verifikasi:
- Token kedaluwarsa/dicabut menampilkan halaman informasi.
- Tutup paksa menandai laporan dan item tidak lengkap.
- Buka kunci memerlukan alasan + PIN dan tercatat.

## Fase 7 — PWA, Offline, Sinkronisasi
Tugas:
- Manifest, service worker (Serwist), ajakan pasang.
- Antrian Dexie untuk centang, isi, skip, incident + foto, draf handover.
- Waktu aksi terkoreksi (kalibrasi jam server); resolusi konflik BR-12.
- Indikator koneksi, drawer antrian (menunggu/gagal/coba lagi).
Hasil: kerja tetap berjalan saat sinyal buruk.
Verifikasi:
- Mode pesawat: centang beberapa item, buat incident; saat online semua tersinkron.
- Aksi offline yang kalah ditampilkan jelas, tidak hilang diam-diam.
- Jam HP dimajukan 1 jam: label ketepatan tetap benar.

## Fase 8 — Notifikasi, Statistik, Ekspor, Dashboard
Tugas:
- Pusat notifikasi + web push; preferensi per jenis.
- Vercel Cron: tab `Summary` harian, deteksi shift tidak ditutup/dibuka, pembersihan token/foto.
- Dashboard admin dan peringatan.
- Statistik dan ekspor PDF/CSV.
- Mode pratinjau petugas (data uji ditandai, dikecualikan dari statistik).
Hasil: seluruh 13 modul admin lengkap.
Verifikasi:
- Dashboard membaca `Summary`, bukan data mentah.
- Shift yang melewati jam selesai memunculkan peringatan.
- Data mode pratinjau tidak masuk statistik.

## Fase 9 — Produksi
Tugas:
- Uji responsif dan aksesibilitas, tinjauan keamanan, monitoring error.
- Uji beban sederhana pada kuota Sheets (jumlah cabang/petugas target).
- Backup terjadwal, dokumen runbook (tambah cabang, migrasi skema, rotasi service account).
- Deploy produksi.
Hasil: siap rilis.
Verifikasi: seluruh TESTING.md lulus; tidak ada release blocker.

## Di Luar Lingkup
Penjadwalan, tukar shift, izin/cuti, absensi, penggajian, stok, integrasi POS, aplikasi native, multi-bahasa, 2FA.

## Risiko yang Dipantau
- Kuota Sheets API dan latensi saat banyak cabang aktif bersamaan.
- Ukuran `template_snapshot` terhadap batas sel.
- Ketergantungan Redis untuk lock (fail closed).
- Migrasi skema per spreadsheet cabang.
