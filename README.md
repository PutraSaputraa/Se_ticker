# Cek Saham

Aplikasi React dan Vite untuk melihat harga tertinggi, terendah, buka, dan tutup dari sesi perdagangan sebelumnya. Netlify Function mengambil data dari Yahoo Finance.

## Jalankan lokal

Gunakan Node.js 22.13 atau lebih baru.

```sh
npm install
npx netlify-cli dev
```

Buka [localhost:8888](http://localhost:8888). Jika Netlify CLI sudah terpasang global, jalankan `netlify dev`. Tambahkan `--offline` untuk simulasi lokal tanpa koneksi ke akun Netlify. Fungsi tetap membutuhkan internet untuk mengambil data Yahoo Finance.

## Build dan deploy

```sh
npm run build
```

Buat repo kosong di GitHub, ganti URL berikut dengan URL repo tersebut, lalu jalankan dari folder proyek.

```sh
git remote add origin https://github.com/akun-kamu/cek-saham.git
git push -u origin main
```

Impor repo GitHub di Netlify, pilih branch `main`, lalu jalankan deploy. Netlify membaca perintah build, direktori `dist`, dan direktori Functions dari `netlify.toml`. Aplikasi tidak memerlukan API key atau environment variable.

## Cara kerja

- Kode 3–4 digit mendapat akhiran `.T` (Tokyo). Kode 2–5 huruf mendapat `.JK` (Indonesia). `AAPL` dan ticker bersufiks dipakai langsung setelah spasi tepi dibuang dan huruf dikapitalisasi.
- Fungsi memilih bar harian kedua dari akhir respons Yahoo Finance. Tanggal di kartu mengikuti zona waktu bursa.
- Lima pencarian sukses terakhir tersimpan di browser dan bisa dijalankan ulang dari tombol riwayat.
