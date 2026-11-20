---
version: alpha
name: Cek Saham
description: Workspace riset saham dan jurnal trading.
---

# Cek Saham

Cek Saham memakai palet hitam, putih, dan emas yang diambil dari logo. Permukaan netral menjaga angka dan grafik sebagai pusat workspace. Aksen emas menandai aksi utama, menu aktif, fokus, dan detail kecil.

## Sistem warna

Token semantik didefinisikan di `src/App.css`. Palet gelap memakai beberapa tingkat arang dan teks putih tulang. Palet terang memakai putih dan abu hangat dengan aksen emas yang lebih gelap. Navbar memakai hitam yang sama di kedua tema. Saat memuat halaman, aplikasi membaca pilihan tema tersimpan atau preferensi perangkat.

| Kegunaan | Token | Terang | Gelap |
| --- | --- | --- | --- |
| Kanvas | `--page` | `#F7F7F5` | `#0C0E11` |
| Panel utama | `--surface` | `#FFFFFF` | `#15181D` |
| Panel inset | `--surface-muted` | `#F4F4F1` | `#101318` |
| Header tabel | `--surface-heading` | `#F0F0EC` | `#1B2027` |
| Area plot | `--chart-surface` | `#FAFAF8` | `#101318` |
| Teks utama | `--text` | `#14161A` | `#F2F4F7` |
| Metadata | `--muted` | `#5C6470` | `#9AA3AF` |
| Pembatas panel | `--border` | `#E1E1DC` | `#2A303A` |
| Batas isian | `--field-border` | `#827F75` | `#757C86` |
| Aksi utama | `--workspace-action` | `#C79400` | `#F5C518` |
| Teks aksi utama | `--workspace-on-action` | `#0C0E11` | `#0C0E11` |
| Tautan dan teks aksi | `--action-text` | `#8A6800` | `#F5C518` |
| Aksen pendukung | `--support` | `#C79400` | `#F5C518` |
| Cincin fokus | `--focus` | `#8A6800` | `#F5C518` |
| Latar navigasi | `--nav-surface` | `#0A0B0D` | `#0A0B0D` |
| Profit dan arah naik | `--positive` | `#15803D` | `#4ADE80` |
| Loss, risiko, dan arah turun | `--negative` | `#B91C1C` | `#F87171` |
| Peringatan dan bintang | `--warning` | `#A16207` | `#F5C518` |
| Galat dan aksi hapus | `--danger` | `#B91C1C` | `#F87171` |

Gunakan `--workspace-on-action` untuk teks gelap pada tombol emas. Pasangkan `--support-text` dengan `--support-soft` untuk status ringkas. Gunakan hijau dan merah untuk arah harga, untung, rugi, serta status yang menyampaikan makna serupa. Periksa rasio kontras minimal 4,5:1 untuk teks biasa dan 3:1 untuk teks besar, batas kontrol, serta indikator fokus.

## Tipografi dan kedalaman

- IBM Plex Sans dari aset lokal menjadi font antarmuka. Judul halaman memakai bobot 650 dengan jarak huruf rapat. Judul bagian memakai skala `--section-title-size`. Metadata dan label berada di kisaran 13–15 px.
- Harga penutupan, saldo tersedia, dan PnL berjalan mendapat ukuran paling kuat di konteks masing-masing. Gunakan angka tabular dan rata kanan untuk kolom angka. Biarkan format persen, mata uang, dan tanda negatif terlihat.
- Panel utama memakai radius 16 px dengan garis tipis dan `--shadow-panel`. Inset memakai radius 12 px, kontrol memakai radius 9 px, dan badge dapat berbentuk pil. Dialog dan daftar saran memakai `--shadow-raised`. Kontrol pada pita hitam memakai `--nav-current` dengan garis `--nav-edge` dan cincin fokus emas.
- Gunakan gradien tonal ringan pada area identitas dan brand. Tabel dan plot memakai warna solid. Baris hover memakai perubahan permukaan.

## Komposisi halaman

- **Shell.** Tombol Cari saham berada di antara Pantauan dan Rekomendasi dalam menu utama. Hingga lebar viewport 58 rem, menu berada di bagian bawah layar. Panel pencarian turun dari tepi bar atas, meredupkan latar, dan memuat pilihan bursa serta isian ticker.
- **Dashboard.** Pantauan mengambil kolom utama dengan hingga delapan ticker. Kolom samping memuat hingga tiga Trade Setup aktif dengan arah dan harga trigger, lalu pencarian terakhir. Baris ticker membuka detail saham. Tautan di judul kartu membuka daftar pantauan atau setup di Jurnal.
- **Detail saham.** Identitas dan penutupan berada di header. Candlestick memakai kolom utama. Di ruang konten mulai 52 rem, Rencana trading dan rincian sesi memakai kolom samping. Di lebar yang lebih sempit, bagian itu mengikuti grafik. Buy Trigger, Stop loss, Target, dan Resistance memakai label dan aksen semantik. Baca nilai sesi lewat pointer, sentuhan, atau tombol panah.
- **Pantauan.** Pertahankan ticker semat, isian harga, catatan, gambar, dan aksi baris. Bintang tampil sebagai tombol di desktop dan pemilih besar di layar sempit atau perangkat sentuh. Status penyimpanan berada di toolbar tabel.
- **Rekomendasi.** Metode dan bursa berada dalam panel konfigurasi. Mode Konsolidasi menyediakan pilihan harian dan bulanan. Saat pemindaian berjalan, indikator mengikuti status permintaan. Kartu konsolidasi menampilkan zona support dan resistance beserta posisi harga di antaranya.
- **Jurnal.** Saldo tersedia memimpin ringkasan wallet. Rincian posisi dan rencana keluar memakai kelompok inset. PnL berjalan berada di atas posisi terbuka. PnL terealisasi, statistik, dan grafik berada di bagian posisi ditutup.
- **Autentikasi.** Pita brand hitam membingkai form. Pilihan masuk dan daftar memakai kontrol segmented. Pesan login, pendaftaran, dan reset tampil di dekat form.

## Interaksi dan aksesibilitas

- Hover kontrol memakai 150 ms, segmented control dan overlay memakai 180 ms, dan pergantian halaman memakai satu transisi 220 ms. Perubahan angka harga dan PnL tampil langsung. Dengan `prefers-reduced-motion`, transisi ditiadakan dan teks loading tetap menjelaskan status.
- Loading awal detail menampilkan bidang placeholder sesuai plot. Perubahan rentang mempertahankan grafik yang sudah dimuat sambil menunjukkan permintaan yang berlangsung.
- Gunakan target utama minimal 44 px, cincin fokus di kedua tema, serta petunjuk saat tabel bergulir. Gulir horizontal dibatasi ke panel tabel. Uji lebar viewport 375, 768, dan 1440 px dengan ticker panjang, angka besar, serta nilai negatif.
