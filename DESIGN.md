---
version: alpha
name: Cek Saham
description: Workspace riset saham dan jurnal trading.
---

# Cek Saham

**Precision with Energy** memakai struktur navy, aksi biru, dan aksen teal yang terukur. Angka dan grafik tetap menjadi pusat workspace. Wordmark, logo, dan nama aplikasi memakai aset Cek Saham yang sudah ada.

## Sistem warna

Token semantik didefinisikan di `src/App.css`. Tema gelap memakai permukaan navy tersendiri untuk kanvas, panel, area inset, dan overlay.

| Kegunaan | Token | Terang | Gelap |
| --- | --- | --- | --- |
| Kanvas | `--page` | `#F2F5FA` | `#0A1220` |
| Panel utama | `--surface` | `#FFFFFF` | `#17263E` |
| Panel inset | `--surface-muted` | `#F6F8FC` | `#111D31` |
| Header tabel | `--surface-heading` | `#EEF3FA` | `#1C2F4B` |
| Area plot | `--chart-surface` | `#F8FAFE` | `#101C30` |
| Teks utama | `--text` | `#15243B` | `#EDF3FC` |
| Metadata | `--muted` | `#4C5F78` | `#A8BAD0` |
| Pembatas panel | `--border` | `#DCE4EF` | `#33465F` |
| Aksi utama | `--workspace-action` | `#285AE8` | `#91B2FF` |
| Tautan dan teks aksi | `--action-text` | `#234CC7` | `#AAC4FF` |
| Aksen pendukung | `--support` | `#087F8C` | `#72D5D4` |
| Latar navigasi | `--nav-surface` | `#15263F` | `#101C2F` |
| Profit dan arah naik | `--positive` | `#176143` | `#83D0A7` |
| Loss, risiko, dan arah turun | `--negative` | `#A02D3C` | `#FFADB7` |
| Peringatan dan bintang | `--warning` | `#865200` | `#EFC77A` |
| Galat dan aksi hapus | `--danger` | `#8A305A` | `#F3B0D1` |

Gunakan `--workspace-on-action` di tombol biru. Pasangkan `--support-text` dengan `--support-soft` untuk sinkronisasi, status pemindaian, dan kriteria yang terpenuhi. Gunakan label, tanda angka, atau bentuk garis bersama warna. Periksa rasio kontras minimal 4,5:1 untuk teks biasa dan 3:1 untuk batas kontrol serta indikator fokus terhadap permukaannya.

## Tipografi dan kedalaman

- IBM Plex Sans dari aset lokal menjadi font antarmuka. Judul halaman memakai bobot 650 dengan jarak huruf rapat. Judul bagian memakai skala `--section-title-size`. Metadata dan label berada di kisaran 13–15 px.
- Harga penutupan, saldo tersedia, dan PnL berjalan mendapat ukuran paling kuat di konteks masing-masing. Gunakan angka tabular dan rata kanan untuk kolom angka. Biarkan format persen, mata uang, dan tanda negatif terlihat.
- Panel utama memakai radius 16 px dengan garis tipis dan `--shadow-panel`. Inset memakai radius 12 px. Kontrol memakai radius 9 px, sedangkan badge dapat berbentuk pil. Dialog dan daftar saran memakai `--shadow-raised`; kartu autentikasi memakai `--shadow-panel` agar tidak terasa mengambang. Kontrol di atas pita navy memakai `--nav-current` dengan garis `--nav-edge`, bukan permukaan kartu, sehingga tetap terbaca di kedua tema.
- Gunakan gradien tonal ringan pada area identitas dan brand. Tabel dan plot memakai warna solid. Baris hover memakai perubahan permukaan.

## Komposisi halaman

- **Shell.** Navbar memusatkan tombol Cari saham di antara brand dan kontrol akun. Menu utama berada di baris bawah pada desktop dan di bagian bawah layar hingga lebar viewport 58 rem. Panel pencarian turun dari tepi navbar dan memuat pilihan bursa serta isian ticker.
- **Dashboard.** Tampilkan ringkasan Pantauan, Trade Setup aktif, dan pencarian terakhir di halaman awal setelah masuk. Baris ticker membuka detail saham, sedangkan tautan di judul kartu membuka daftar pantauan atau setup di Jurnal.
- **Detail saham.** Identitas dan penutupan berada di header. Candlestick memakai kolom utama. Di ruang konten mulai 52 rem, Rencana trading dan rincian sesi memakai kolom samping. Di lebar yang lebih sempit, bagian itu mengikuti grafik. Buy Trigger, Stop loss, Target, dan Resistance memakai label dan aksen semantik. Baca nilai sesi lewat pointer, sentuhan, atau tombol panah.
- **Pantauan.** Pertahankan ticker semat, isian harga, catatan, gambar, dan aksi baris. Bintang tampil sebagai tombol di desktop dan pemilih besar di layar sempit atau perangkat sentuh. Status penyimpanan berada di toolbar tabel.
- **Rekomendasi.** Metode dan bursa berada dalam panel konfigurasi. Mode Konsolidasi menyediakan pilihan harian dan bulanan. Saat pemindaian berjalan, indikator mengikuti status permintaan. Kartu konsolidasi menampilkan zona support dan resistance beserta posisi harga di antaranya.
- **Jurnal.** Saldo tersedia memimpin ringkasan wallet. Rincian posisi dan rencana keluar memakai kelompok inset. PnL berjalan berada di atas posisi terbuka. PnL terealisasi, statistik, dan grafik berada di bagian posisi ditutup.
- **Autentikasi.** Brand band navy membingkai satu form fokus. Pilihan masuk dan daftar memakai kontrol segmented. Pesan login, pendaftaran, dan reset tampil di dekat form.

## Interaksi dan aksesibilitas

- Hover kontrol memakai 150 ms, segmented control dan overlay memakai 180 ms, dan pergantian halaman memakai satu transisi 220 ms. Perubahan angka harga dan PnL tampil langsung. Dengan `prefers-reduced-motion`, transisi ditiadakan dan teks loading tetap menjelaskan status.
- Loading awal detail menampilkan bidang placeholder sesuai plot. Perubahan rentang mempertahankan grafik yang sudah dimuat sambil menunjukkan permintaan yang berlangsung.
- Gunakan target utama minimal 44 px, cincin fokus di kedua tema, serta petunjuk saat tabel bergulir. Gulir horizontal dibatasi ke panel tabel. Uji lebar viewport 375, 768, dan 1440 px dengan ticker panjang, angka besar, serta nilai negatif.
