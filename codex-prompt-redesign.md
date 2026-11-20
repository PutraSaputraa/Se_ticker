# Prompt untuk Codex — Rebrand Palet + Perbaikan Dashboard

Copy-paste teks di bawah garis ini ke Codex:

---

Kamu bekerja di repo **Cek Saham** (React 19 + Vite, CSS token-based, Firebase). Lakukan dua pekerjaan berikut. Jangan ubah logic JavaScript, data flow, atau struktur komponen — hanya styling, warna, dan layout CSS. Jangan install dependency baru.

## Konteks

Sistem warna terpusat sebagai CSS custom properties di `src/App.css` (blok `:root` untuk tema terang dan `:root[data-theme="dark"]` untuk tema gelap), dikonsumsi oleh `src/styles/*.css` dan `src/components/*.css`. Spesifikasi desain lama ada di `DESIGN.md`. Logo brand adalah hitam solid, huruf "CS" putih, dengan aksen diagonal kuning-emas — namun tema web saat ini masih navy/biru/teal yang tidak nyambung dengan logo. Halaman dashboard (`src/pages/DashboardPage.jsx` + `src/styles/dashboard.css`) saat ini hanya berisi 3 kartu daftar teks dan terasa kosong karena sisa viewport kosong.

## Pekerjaan 1 — Rebrand palet warna mengikuti logo (hitam-putih-emas)

Ganti seluruh nilai token di `src/App.css` (KEDUA blok `:root` dan `:root[data-theme="dark"]`) mengikuti skema baru di bawah. Pertahankan NAMA token yang sudah ada — jangan rename, jangan tambah token baru kecuali tercantum di sini — supaya semua file CSS lain ikut berubah otomatis tanpa perlu diedit satu per satu.

### Tema gelap (`:root[data-theme="dark"]`) — ini tema utama/default

| Token | Nilai baru | Catatan |
|---|---|---|
| `--page` | `#0C0E11` | charcoal sangat gelap, bukan hitam pekat |
| `--surface` | `#15181D` | panel utama |
| `--surface-muted` | `#101318` | panel inset |
| `--surface-tint` | `#1B1F26` | |
| `--surface-heading` | `#1B2027` | |
| `--surface-hover` | `#22272F` | |
| `--surface-identity` | `#171A1F` | |
| `--text` | `#F2F4F7` | off-white |
| `--muted` | `#9AA3AF` | |
| `--border` | `#2A303A` | |
| `--workspace-action` | `#F5C518` | emas dari logo — aksi utama |
| `--workspace-action-hover` | `#FFD94A` | |
| `--workspace-action-active` | `#D9A90E` | |
| `--workspace-action-soft` | `#2E2A14` | tint emas gelap |
| `--action-text` | `#F5C518` | |
| `--support` | `#F5C518` | teal dibuang, diganti emas |
| `--support-text` | `#FFD94A` | |
| `--support-soft` | `#2E2A14` | |
| `--support-border` | `#4A4018` | |
| `--positive` | `#4ADE80` | hijau naik |
| `--positive-soft` | `#152A1C` | |
| `--negative` | `#F87171` | merah turun |
| `--negative-soft` | `#33191B` | |
| `--warning` | `#F5C518` | |
| `--warning-soft` | `#2E2A14` | |
| `--danger` | `#F87171` | |
| `--danger-soft` | `#33191B` | |
| `--danger-border` | `#5A2A2E` | |
| `--nav-surface` | `#0A0B0D` | navbar paling gelap — nyambung ke blok hitam logo |

Tambahkan token baru di blok dark: `--workspace-on-action: #0C0E11` (teks gelap di atas tombol emas — WAJIB, teks putih di atas emas kontrasnya tidak cukup).

### Tema terang (`:root`)

Background putih/abu sangat terang, teks hampir hitam, aksen TETAP emas (agar identitas brand konsisten lintas tema):

| Token | Nilai baru |
|---|---|
| `--page` | `#F7F7F5` |
| `--surface` | `#FFFFFF` |
| `--surface-muted` | `#F4F4F1` |
| `--surface-tint` | `#EDEDE9` |
| `--surface-heading` | `#F0F0EC` |
| `--surface-hover` | `#F0F0EB` |
| `--surface-identity` | `#F5F4EF` |
| `--text` | `#14161A` |
| `--muted` | `#5C6470` |
| `--border` | `#E1E1DC` |
| `--workspace-action` | `#C79400` | emas lebih gelap agar kontras di putih |
| `--workspace-action-hover` | `#A87E00` |
| `--workspace-action-active` | `#8A6800` |
| `--workspace-action-soft` | `#FDF3D3` |
| `--action-text` | `#8A6800` |
| `--support` | `#C79400` |
| `--support-text` | `#8A6800` |
| `--support-soft` | `#FDF3D3` |
| `--support-border` | `#E8D9A6` |
| `--positive` | `#15803D` |
| `--positive-soft` | `#E8F5EC` |
| `--negative` | `#B91C1C` |
| `--negative-soft` | `#FBEAEA` |
| `--warning` | `#A16207` |
| `--warning-soft` | `#FDF3D3` |
| `--danger` | `#B91C1C` |
| `--danger-soft` | `#FBEAEA` |
| `--danger-border` | `#EFC9C9` |
| `--nav-surface` | `#0A0B0D` | navbar tetap hitam di tema terang — logo selalu di atas hitam |

Tambahkan `--workspace-on-action: #0C0E11` juga di tema terang.

### Aturan emas

Emas adalah BUMBU, bukan nasi: hanya untuk tombol aksi utama, indikator aktif di navbar, garis aksen judul halaman, fokus ring, dan highlight kecil. Jangan jadikan emas background area besar. Hijau/merah tetap eksklusif untuk makna naik/turun — jangan dipakai untuk dekorasi lain.

### Pembersihan warna hardcoded

Setelah token diganti, cari warna hex hardcoded yang masih bernuansa navy/biru/teal lama di `src/App.css`, `src/styles/*.css`, dan `src/components/*.css` (contoh: `#285ae8`, `#087f8c`, `#15263f`, `#17263e`, `#0a1220`, `#91b2ff`, `#72d5d4`, dan turunannya) lalu ganti ke token terdekat yang sesuai skema baru. Jangan sentuh warna semantik hijau/merah selain lewat token. Perhatikan juga nilai `--nav-current`, `--nav-edge`, gradien tonal, dan shadow — sesuaikan agar harmonis dengan permukaan charcoal.

### Verifikasi kontras

Teks biasa minimal 4.5:1 terhadap permukaannya; teks besar dan batas kontrol minimal 3:1. Khusus teks `--muted` di atas `--surface-muted` tema gelap, pastikan tetap lolos — naikkan kecerahan `--muted` bila perlu.

## Pekerjaan 2 — Dashboard terasa "hidup"

Ubah HANYA `src/pages/DashboardPage.jsx` (markup/JSX minimal, tanpa mengubah cara data diambil) dan `src/styles/dashboard.css`:

1. **Kartu Watchlist & Recent searches**: setiap baris ticker yang datanya harga tersedia menampilkan harga terakhir + persen perubahan harian, rata kanan, angka tabular, dengan warna `--positive`/`--negative`. Jika data harga tidak tersedia tanpa perubahan logic, tampilkan placeholder strip pendek (`—`). JANGAN fetch data baru — gunakan hanya data yang sudah dimuat halaman ini saat ini; bila tidak ada sama sekali, cukup rapikan list-nya dan lanjut ke poin berikutnya.
2. **Isi ruang kosong bawah**: tambahkan satu baris kartu "Market overview" / index movers (mis. IHSG, S&P 500, Nasdaq, Gold) HANYA jika data semacam itu sudah tersedia di codebase (cari dulu di `src/data` atau util fetch yang ada). Jika tidak ada, jangan membuat fetch baru — sebagai gantinya perlebar ketiga kartu utama dan beri konten ringkas: Watchlist menampilkan sampai 8 item, Active trade setups menampilkan sampai 3 setup dengan ticker + arah (long/short) + harga trigger bila ada, bukan hanya "No pending setups".
3. **Hierarki visual**: judul halaman "Dashboard" mendapat garis aksen emas 3–4 px di kirinya (ganti aksen teal lama bila masih hardcoded). Buat kartu Watchlist sedikit lebih menonjol (atau urutan pertama pada grid), karena itu konten utama. Header kartu memakai `--section-title-size` yang sudah ada.
4. **Kerapatan vertikal**: kartu mengikuti tinggi kontennya; jangan ada ruang kosong raksasa di bawah — grid konten dibungkus max-width ~1200 px, rata tengah, dengan padding bawah halaman wajar (48–64 px).
5. Tetap hormati aturan DESIGN.md: radius panel 16 px, angka rata kanan & tabular, hover baris memakai perubahan permukaan, transisi 150–220 ms, target sentuh minimal 44 px.

## Update dokumentasi

Perbarui tabel warna dan narasi di `DESIGN.md` agar sesuai skema hitam-putih-emas yang baru (bagian "Sistem warna" dan frasa "navy/biru/teal" di bagian lain).

## Definition of done

- `npm run build` lolos tanpa error/warning baru.
- Kedua tema (terang & gelap) dirender benar: navbar hitam konsisten, tidak ada sisa warna navy/biru/teal lama yang terlihat di halaman mana pun (Dashboard, Watchlist, Stock detail, Recommend, Journal, Auth).
- Tidak ada logic JS yang berubah; tidak ada dependency baru; tidak ada fetch/API baru.
- Ringkas di akhir: token apa saja yang berubah, file apa saja yang disentuh, dan bagian mana yang tidak bisa dikerjakan (beserta alasannya).
