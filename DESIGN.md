---
version: alpha
name: Cek Saham
description: Workspace riset untuk mencari kandidat, membandingkan saham, membaca level trading, menguji strategi, dan mencatat posisi.
colors:
  canvas: "#f3f6f8"
  surface: "#ffffff"
  surface-muted: "#f5f8fa"
  border: "#d5dfe5"
  text: "#172b3a"
  muted: "#526474"
  action: "#0052ff"
  action-hover: "#0048e0"
  action-active: "#003ecc"
  action-soft: "#eaf1ff"
  on-action: "#ffffff"
  positive: "#176449"
  negative: "#a13235"
  warning: "#775017"
  dark-canvas: "#101010"
  dark-surface: "#1e1e20"
  dark-surface-muted: "#181819"
  dark-border: "#39393d"
  dark-text: "#f0f0f2"
  dark-muted: "#babac1"
  dark-action: "#a9c4ff"
  dark-action-hover: "#bfd3ff"
  dark-action-active: "#95b3f5"
  dark-action-soft: "#273650"
  dark-on-action: "#101c3a"
  dark-positive: "#85cca8"
  dark-negative: "#f1a6a0"
  dark-warning: "#f1cd87"
typography:
  page-title:
    fontFamily: "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 3.2cqi, 2.25rem)"
    fontWeight: 500
    lineHeight: 1.12
  section-title:
    fontSize: "clamp(1.125rem, 2cqi, 1.3125rem)"
    fontWeight: 600
    lineHeight: 1.25
  closing-price:
    fontSize: "clamp(1.75rem, 3.5cqi, 2.5rem)"
    fontWeight: 600
    lineHeight: 1.08
  trading-level:
    fontSize: "clamp(1.125rem, 2cqi, 1.375rem)"
    fontWeight: 600
    lineHeight: 1.15
  body:
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontSize: "13–14px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  card: 16px
  inset: 12px
  control: 8px
  pill: 999px
spacing:
  card-padding: "clamp(0.875rem, 1.65vw, 1.375rem)"
  card-gap: "clamp(0.75rem, 1.5vw, 1rem)"
  touch-height: 44px
components:
  data-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    borderColor: "{colors.border}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-padding}"
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    rounded: "{rounded.pill}"
    height: "{spacing.touch-height}"
  chart-range-selected:
    backgroundColor: "{colors.action-soft}"
    textColor: "{colors.action}"
    borderColor: "{colors.action}"
    rounded: "{rounded.control}"
---

# Cek Saham

Sistem visual ini mengadaptasi palet netral, aksen biru yang hemat, tombol pil, dan garis pemisah tipis dari analisis desain Coinbase. Detail saham, Pantauan saham, Rekomendasi, Uji strategi, dan Jurnal memakai sistem ini. Gunakan nama dan simbol instrumen, tanggal sesi, grafik, dan angka untuk membangun hierarki halaman.

## Warna dan tipografi

- Gunakan token tema bersama di `src/App.css` untuk kanvas, permukaan, teks, garis, dan status. Token `--workspace-*` menetapkan aksen biru, skala judul, dan ukuran panel.
- Aksi utama memakai biru solid. Gunakan biru lembut dan garis biru untuk pilihan aktif, seperti rentang grafik atau tombol **Dipantau**. Gunakan label, tanda, atau pola garis untuk membedakan arah harga, risiko, dan status breakout.
- Gunakan IBM Plex Sans yang sudah tersedia di aplikasi. Harga, persentase, volume, dan data tabel memakai angka tabular. Ratakan kolom numerik ke kanan dan tampilkan mata uang atau satuannya bila diperlukan untuk membaca nilai.
- Pisahkan panel data dengan garis 1 px. Area di dalam panel, seperti sel level dan bingkai grafik, memakai permukaan netral yang sedikit berbeda dari kartu.

## Detail saham

1. Mulai dari identitas instrumen, tanggal sesi acuan, harga penutupan, dan tindakan **Pantau**. Beri harga penutupan penekanan paling kuat. Tampilkan arah dan perubahan terhadap harga buka dengan kata dan persentase.
2. Letakkan **Buy Trigger** dan **Sell Trigger / Stop loss** di awal Rencana trading, diikuti Target dan Resistance 50 hari. Pasangkan status breakout dengan teks yang menjelaskan statusnya.
3. Tampilkan pilihan rentang di dekat judul grafik. Letakkan legenda dan data candle yang dipilih langsung di bawah grafik. Bedakan garis Buy Trigger, Sell Trigger, dan volume rata-rata dengan pola garis dan label.
4. Tempatkan rincian sesi acuan di sebelah grafik saat ruangnya cukup. Lanjutkan dengan analisis Minervini, tabel OHLCV, dan fundamental.

## Pantauan saham

1. Tempatkan **Cari saham** sebagai aksi utama. Di atas tabel, tampilkan jumlah saham, urutan breakout, dan status sinkronisasi akun.
2. Mulai dari simbol, harga tutup, dan status agar data utama mudah dibandingkan. Ikuti dengan harga pantauan, Stage 2, volume, rata-rata volume 50 sesi, dan aksi baris. Gunakan panah atau tanda sama dengan untuk menunjukkan arah harga tutup terhadap harga buka.
3. Di HP, pertahankan struktur tabel dan sematkan kolom saham di sisi kiri. Tempatkan gulir horizontal di dalam panel tabel dan tampilkan petunjuk geser saat kolom melampaui panel. Beri tinggi minimal `44px` untuk kontrol harga pantauan dan aksi baris.
4. Tampilkan keadaan harga yang sedang dimuat atau gagal di baris saham terkait. Tampilkan pesan daftar kosong beserta cara menambahkan saham setelah sinkronisasi selesai.

## Rekomendasi

1. Satukan pilihan **Scan matematis** atau **Riset AI**, pemilih bursa, dan tombol mulai dalam satu panel. Tampilkan status proses dan pesan gagal di dekat kontrol, serta tampilkan aksi **Coba lagi** untuk mengulang permintaan.
2. Mulai tabel scan dari simbol, harga tutup, dan perubahan. Sematkan kolom saham saat tabel digeser di HP. Tampilkan resistance dan rasio volume dengan angka tabular. Catatan AI pada satu saham bisa dibuka dari baris saham tersebut.
3. Tampilkan hasil riset AI sebagai kartu kandidat. Letakkan identitas saham dan aksi **Pantau** di bagian atas, lalu susun analisis teknikal, level pantauan, dan katalis sesuai data yang tersedia. Susun rincian dalam satu kolom jika ruang sempit.
4. Tampilkan jumlah hasil dan sesi acuan atau tanggal riset di atas hasil. Gunakan tombol sekunder untuk **Pantau**, serta label **Dipantau** untuk saham yang sudah tersimpan.

## Uji strategi

1. Satukan pilihan **Per bursa** dan **Saham pilihan**, kolom sampel, serta aksi **Jalankan backtest** dalam satu panel. Tampilkan petunjuk input ticker dekat kolom tersebut dan letakkan status proses atau gagal di panel yang sama.
2. Mulai ringkasan dari return simulasi dan drawdown maksimum, diikuti win rate, jumlah transaksi, dan expectancy. Letakkan asumsi eksekusi dalam bagian tersendiri di bawah metrik. Jika sampel kosong, tampilkan pesan yang membantu pengguna memilih sampel lain.
3. Letakkan ringkasan dan kurva ekuitas berdampingan jika ruang cukup. Di HP, susun ringkasan sebelum kurva dan gunakan dua kolom untuk metrik. Tandai basis 100 pada grafik agar perubahan ekuitas mudah dibandingkan.
4. Tampilkan saham dan return di awal tabel performa dan transaksi. Pertahankan kolom ticker saat tabel digeser di HP. Gunakan tanggal ringkas dengan tahun untuk transaksi lintas tahun.

## Jurnal

1. Sediakan tautan ke Wallet, Catat posisi, Posisi terbuka, dan Posisi ditutup di dekat judul. Utamakan saldo tersedia di Wallet dan tempatkan aksi tambah dan tarik saldo dekat input jumlah.
2. Susun **Rincian posisi** dan **Rencana keluar** berdampingan saat ruang cukup. Letakkan **Type** di samping **Posisi**. Tempatkan **Notes** di samping **Setup** pada desktop dan di bawah **Setup** pada HP. Tampilkan umpan balik di dekat tombol buka posisi.
3. Letakkan PnL berjalan di atas tabel posisi terbuka. Tempatkan ringkasan posisi ditutup dan grafik jurnal berdampingan jika ruang cukup dan susun vertikal di HP. Pakai biru untuk garis saldo dan warna status untuk membedakan batang untung dan rugi.
4. Pertahankan ticker saat tabel posisi digeser dan tampilkan petunjuk saat tabel melampaui panel. Gunakan tinggi minimal `44px` untuk kontrol form, pemilih grafik, dan tombol aksi baris.

## Desktop dan HP

Ukuran berikut memakai lebar konten Detail saham setelah navigasi dan padding aplikasi. Batasi konten hingga `76rem`.

| Lebar area Detail saham | Tata letak |
| --- | --- |
| Di bawah `36rem` | Harga dan **Pantau** berada di bawah identitas. Level trading tersusun dua kolom. Rincian sesi tampil setelah grafik. |
| `36rem` hingga di bawah `52rem` | Identitas dan harga sejajar. Empat level trading tampil dalam satu baris. Rincian sesi tampil setelah grafik. |
| Mulai `52rem` | Grafik memakai kolom utama. Rincian sesi memakai kolom kanan. Tabel fundamental dapat tampil berdampingan. |

Pada area `22rem` atau lebih sempit, pilihan rentang grafik tersusun hingga tiga kolom. Gunakan tinggi minimal `44px` untuk **Pantau** dan pilihan rentang di HP. Pertahankan struktur kolom tabel dan izinkan gulir horizontal di panel tabel. Tampilkan petunjuk geser saat tabel melampaui panel.

## Keadaan interaksi

- Bedakan hover, fokus keyboard, pressed, dan disabled. Pakai cincin fokus yang terlihat di kedua tema. Tunjukkan pilihan menetap dengan batas, isian, serta status tombol `aria-pressed`.
- Tampilkan pesan saat memuat detail. Saat mengganti rentang, tampilkan status permintaan dekat kontrol dan pertahankan grafik yang sedang terlihat sampai data baru siap.
- Tampilkan pesan gagal di dekat bagian yang terdampak dan sediakan **Coba lagi** jika permintaan bisa diulang. Untuk data kosong, sebutkan bagian yang datanya belum tersedia.
- Pastikan harga, level, dan grafik mudah ditemukan di desktop dan HP. Cek ticker panjang, harga bernilai besar, tabel yang melebar, serta keadaan tombol dan grafik di tema terang dan gelap.
