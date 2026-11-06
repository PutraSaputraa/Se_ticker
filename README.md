# Cek Saham

Aplikasi React dan Vite untuk melihat level Buy dan Sell Trigger, OHLCV, serta cek volume dan harga pantauan. Netlify Function mengambil data dari Yahoo Finance.

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

- Pilih **AS** untuk ticker seperti `NVDA`, `MSFT`, dan `AAPL`. Pilih **Indonesia** untuk `BBCA` atau **Jepang** untuk `7203`. Mode **Otomatis** mengarahkan kode 3–4 digit ke Tokyo dan kode 2–5 huruf ke Indonesia, dengan `AAPL` sebagai pengecualian. Ticker yang sudah bersufiks dikirim langsung.
- Pilih bursa untuk ticker Hong Kong (`.HK`), Korea Selatan (KOSPI `.KS` atau KOSDAQ `.KQ`), dan China (Shanghai `.SS` atau Shenzhen `.SZ`). Kode numerik dilengkapi nol di depan jika diperlukan. Contoh `700` menjadi `0700.HK` di Hong Kong.
- Kartu menampilkan OHLCV dari sesi terakhir yang sudah tutup dalam data Yahoo Finance. Bar hari ini dipakai setelah jadwal tutup terlewati dan waktu kuotasi Yahoo sudah mencapai penutupan. Tanggal sesi mengikuti zona waktu bursa.
- Lima pencarian sukses terakhir tersimpan di browser dan bisa dijalankan ulang dari tombol riwayat.

## Rumus Buy Trigger

Kartu menonjolkan level Buy Trigger, diikuti Sell trigger dan True Range. OHLCV, rata-rata volume 50 sesi, dan Close 2 sesi lalu tampil di bawahnya. Close 2 sesi lalu adalah harga tutup satu sesi sebelum acuan, dihitung relatif terhadap sesi berikutnya.

- **True Range** = MAX(High acuan − Low acuan, |High acuan − Close sebelumnya|, |Low acuan − Close sebelumnya|).
- **Level Buy Trigger sesi berikutnya** = Close acuan + 0,4 × True Range.
- **Ambang volume** = 1,4 × rata-rata volume 50 sesi yang mendahului kedua sesi yang dicek. Ambang minimum dibulatkan ke atas ke satuan lembar. Volume sesi acuan dan volume sesi sebelumnya masing-masing memenuhi syarat jika mencapai ambang itu.
- **Level Sell Trigger sesi berikutnya** = Close acuan − 0,4 × True Range.

Rumus memakai nilai asli Yahoo Finance. Pembulatan harga mengikuti format mata uang saat hasil ditampilkan.

## Cek volume dan harga pantauan

- **N dan M** masing-masing YES jika volume sesi acuan atau sesi sebelumnya mencapai ambang. Kedua sesi dicek secara terpisah.
- **A** YES jika Close yang ditampilkan lebih tinggi dari harga pantauan yang diisi pengguna. Isi angka tanpa pemisah ribuan dalam mata uang ticker.
