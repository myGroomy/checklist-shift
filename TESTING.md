# Testing Guide — checklist-shift

## 1. Tujuan
Memastikan alur shift berjalan benar, gagal dengan aman, data antar cabang terisolasi, dan aturan konkurensi/penguncian tegak meski database adalah Google Sheets.

Tandai `[x]` hanya jika benar-benar diverifikasi. Pisahkan **[Otomatis]** dan **[Manual]**.

## 2. Alur Kritis (blocker bila rusak)
Login -> Buka Shift -> (Baca handover) -> Checklist bersama -> Handover -> Tutup Shift (PIN) -> Laporan terkunci -> Bagikan WhatsApp -> Buka `/r/[token]`

## 3. Autentikasi dan Sesi
- [ ] [Otomatis] PIN benar masuk; PIN salah ditolak dengan pesan umum
- [ ] [Otomatis] 5 PIN salah mengunci akun; hitung mundur tampil; admin dapat membuka
- [ ] [Otomatis] Akun nonaktif tidak bisa login dan sesinya dicabut
- [ ] [Manual] Login pertama memaksa ganti PIN
- [ ] [Otomatis] Ganti PIN butuh PIN lama
- [ ] [Otomatis] Paksa logout membuat sesi lama ditolak
- [ ] [Manual] Sesi bertahan 30 hari di HP (termasuk iOS PWA terpasang)
- [ ] [Otomatis] Hash PIN argon2, tidak ada PIN di log atau respons

## 4. Otorisasi dan Isolasi Cabang
- [ ] [Otomatis] Petugas tidak dapat membaca/menulis cabang di luar akses (uji langsung ke API, bukan hanya UI)
- [ ] [Otomatis] Petugas tidak dapat memanggil endpoint admin
- [ ] [Otomatis] Cabang nonaktif tidak bisa buka shift baru; riwayat tetap terbaca
- [ ] [Manual] Akun dua cabang: pemilih cabang benar, nama pelaku tercatat

## 5. Siklus Shift
- [ ] [Otomatis] BR-01: dua Buka Shift bersamaan pada kunci sama -> satu PJ, satu bergabung
- [ ] [Otomatis] Shift lewat tengah malam: tanggal = tanggal dibuka (zona cabang)
- [ ] [Manual] Buka shift di luar jam: peringatan lunak, laporan ditandai
- [ ] [Otomatis] Snapshot: ubah template saat shift berjalan tidak mengubah shift itu
- [ ] [Otomatis] Hanya PJ yang bisa Tutup Shift
- [ ] [Otomatis] Tutup ditolak jika item wajib belum selesai/skip atau handover wajib kosong
- [ ] [Otomatis] Setelah ditutup, semua tulis ke shift itu ditolak

## 6. Checklist Bersama
- [ ] [Otomatis] BR-12: dua akun mencentang item sama -> yang pertama diterima, yang kedua mendapat "sudah diselesaikan oleh X"
- [ ] [Otomatis] Semua tipe input tersimpan benar (centang, foto, teks, angka, OK/Tidak OK)
- [ ] [Otomatis] Angka di luar rentang ditandai
- [ ] [Otomatis] Label waktu benar di batas toleransi (tepat 15 menit, 15 menit + 1 detik)
- [ ] [Otomatis] Label memakai jam server, bukan jam HP
- [ ] [Otomatis] Skip wajib alasan; dihitung selesai; tampil di laporan
- [ ] [Otomatis] Batal centang tercatat di log (siapa, kapan)
- [ ] [Manual] Tidak ada tombol "centang semua"
- [ ] [Otomatis] Item hanya muncul pada hari berlaku
- [ ] [Otomatis] Peserta tercatat pada aksi pertama, bukan saat hanya membuka layar

## 7. Handover dan Incident
- [ ] [Otomatis] Handover wajib menahan penutupan bila field wajib kosong
- [ ] [Otomatis] "Sudah dibaca" tercatat (siapa, kapan)
- [ ] [Manual] Incident open tampil di handover
- [ ] [Otomatis] Incident tidak dapat diedit; catatan tambahan tercatat
- [ ] [Otomatis] Penautan otomatis: shift berjalan, jendela 4 jam setelah shift berakhir, selain itu "Di luar shift"
- [ ] [Otomatis] Status incident hanya dapat diubah admin
- [ ] [Manual] Foto hingga 5, ukuran besar dikompres; foto ke-6 ditolak
- [ ] [Manual] Waktu isi incident < 1 menit

## 8. Laporan, Berbagi, Operasi Admin
- [ ] [Otomatis] Laporan memuat header, checklist per kategori, foto, skip, incident, handover, kontribusi, addendum
- [ ] [Manual] Kontribusi per petugas tampil netral, tanpa peringkat
- [ ] [Otomatis] Addendum menambah catatan tanpa mengubah isi asli
- [ ] [Otomatis] Tutup paksa: ditandai, item wajib belum selesai ditandai tidak lengkap, alasan tercatat
- [ ] [Otomatis] Ganti PJ, void, buka kunci wajib alasan + PIN dan tercatat di audit log
- [ ] [Otomatis] Void dikecualikan dari statistik
- [ ] [Otomatis] Token publik: valid membuka laporan; kedaluwarsa dan dicabut menampilkan halaman informasi
- [ ] [Otomatis] Token tidak dapat ditebak dan hanya menampilkan satu laporan
- [ ] [Manual] Tautan `wa.me` memakai template admin dengan variabel terisi

## 9. Data Layer (Sheets)
- [ ] [Otomatis] Header tab salah/hilang terdeteksi saat daftarkan cabang
- [ ] [Otomatis] Tambah cabang hanya dengan spreadsheet ID: tab kurang dibuat otomatis
- [ ] [Otomatis] Tab bulanan dibuat otomatis saat bulan berganti; shift lintas bulan menempel ke bulan tanggal shift
- [ ] [Otomatis] Batching: 20 aksi bersamaan tidak melampaui kuota (tidak ada 429 tak tertangani)
- [ ] [Otomatis] Respons 429/5xx ditangani dengan retry/backoff
- [ ] [Otomatis] Redis tidak tersedia -> operasi atomik ditolak (fail closed), bukan jalan tanpa lock
- [ ] [Otomatis] Cache peta baris benar setelah baris bergeser; invalidasi registry setelah admin mengubah akun/cabang
- [ ] [Otomatis] Pemeriksa hash chain mendeteksi edit manual pada baris audit
- [ ] [Manual] `template_snapshot` checklist terbesar < 50.000 karakter
- [ ] [Manual] Waktu respons wajar dengan data realistis (mis. puluhan ribu baris `Entries`)
- [ ] [Otomatis] Tidak ada baris yang dihapus oleh kode aplikasi (BR-40)

## 10. Offline dan Sinkronisasi
- [ ] [Manual] Mode pesawat: centang beberapa item, buat incident + foto -> online -> semua tersinkron
- [ ] [Manual] Indikator antrian akurat (menunggu/terkirim/gagal); coba lagi berfungsi
- [ ] [Otomatis] Aksi offline yang kalah ditampilkan jelas, tidak dibuang diam-diam
- [ ] [Manual] Jam HP dimajukan/dimundurkan: label ketepatan tetap benar
- [ ] [Manual] Aksi wajib online (buka/tutup shift, aksi admin) menampilkan pesan jelas saat offline
- [ ] [Manual] Sesi habis saat offline: antrian lokal tetap ada setelah login ulang
- [ ] [Manual] Foto gagal unggah tidak menghalangi item lain

## 11. Notifikasi dan Pekerjaan Terjadwal
- [ ] [Otomatis] Cron `Summary` menghasilkan angka sama dengan hitungan data mentah
- [ ] [Otomatis] Shift melewati jam selesai tanpa ditutup -> peringatan admin
- [ ] [Otomatis] Endpoint cron menolak request tanpa `CRON_SECRET`
- [ ] [Manual] Pusat notifikasi menandai sudah dibaca; preferensi per jenis berfungsi
- [ ] [Manual] Web push di Android; di iOS hanya setelah dipasang ke layar utama

## 12. Responsif dan Aksesibilitas
Uji minimal: 320px, HP besar, tablet, desktop.
- [ ] [Manual] Tidak ada horizontal overflow
- [ ] [Manual] Target sentuh >= 48px; bottom nav tidak menutupi tombol aksi
- [ ] [Manual] Safe-area iOS benar
- [ ] [Manual] Keypad numerik muncul untuk PIN
- [ ] [Manual] Checklist Builder dapat dipakai di layar target admin
- [ ] [Manual] Label input, fokus terlihat, navigasi keyboard di admin
- [ ] [Manual] Status tidak hanya dengan warna (ada ikon + teks)
- [ ] [Manual] Kontras terbaca di bawah cahaya terang

## 13. Keamanan dan Privasi
- [ ] [Otomatis] Tidak ada rahasia (service account, secret, pepper) di bundel klien
- [ ] [Otomatis] Cookie sesi `HttpOnly`, `Secure`, `SameSite`
- [ ] [Otomatis] CSRF dan rate limiting aktif (login, aksi sensitif)
- [ ] [Otomatis] Input divalidasi server; unggahan foto divalidasi tipe dan ukuran
- [ ] [Manual] File Sheets tidak dibagikan ke pihak lain selain service account dan admin sistem
- [ ] [Manual] Foto tidak dapat diakses lewat tautan langsung tanpa cek akses
- [ ] [Otomatis] Pesan galat tidak membocorkan detail Sheets/Google

## 14. Release Blockers
Jangan rilis bila:
- Login/otorisasi bocor antar cabang
- BR-01 atau BR-12 dapat dilanggar
- Shift/laporan terkunci masih dapat diubah lewat API
- Alur kritis (bagian 2) tidak selesai end to end
- Data hilang saat offline-sync
- Rahasia terekspos di klien
- Alur kritis tidak dapat dipakai di HP

## 15. Format Laporan Bug
- Tes:
- Diharapkan:
- Aktual:
- Perangkat/browser:
- Langkah reproduksi:
- Screenshot/log:
- Tingkat keparahan:
- Status:

## 16. Catatan Eksekusi
- Jalankan pengujian konkurensi dengan dua akun/perangkat nyata, bukan hanya satu tab.
- Uji dengan dua cabang agar isolasi data terverifikasi.
- Gunakan spreadsheet cabang uji terpisah dari produksi.
- Setiap fase di IMPLEMENTATION_PLAN.md menjalankan bagian TESTING.md yang relevan sebelum lanjut.
