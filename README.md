# Cek Saham

Aplikasi React dan Vite untuk melihat level Buy dan Sell Trigger, OHLCV, serta cek volume dan harga pantauan. Netlify Function mengambil data dari Yahoo Finance.

## Jalankan lokal

Gunakan Node.js 22.13 atau lebih baru.

```sh
npm install
cp .env.example .env.local
npx netlify-cli dev
```

Buka [localhost:8888](http://localhost:8888). Jika Netlify CLI sudah terpasang global, jalankan `netlify dev`. Tambahkan `--offline` untuk simulasi lokal tanpa koneksi ke akun Netlify. Fungsi tetap membutuhkan internet untuk mengambil data Yahoo Finance.

## Firebase dan akun pengguna

Login menggunakan Firebase Authentication dengan email dan password. Pendaftaran, reset password, pemulihan sesi login, dan keluar akun tersedia di aplikasi.

1. Isi `.env.local` dengan konfigurasi Web App dari **Project settings → Your apps** untuk proyek `seticker`. Variabel yang diperlukan tersedia di `.env.example`. Mulai ulang Vite setelah mengubah konfigurasi.
2. Aktifkan **Authentication → Sign-in method → Email/Password** di Firebase Console.
3. Gunakan database Cloud Firestore `(default)`. Publikasikan isi `firestore.rules` lewat tab **Firestore → Rules**, atau jalankan perintah di bawah setelah login Firebase CLI.

```sh
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules --project seticker
```

Dokumen `users/{uid}` menyimpan `watchlist`, `history`, dan waktu pembaruan `updatedAt`. Aturan membatasi akses dokumen ke akun dengan UID yang sama. Password dikelola Firebase Authentication. Konfigurasi Web App merupakan konfigurasi publik yang disertakan dalam bundle frontend. Hak akses data ditegakkan oleh Firestore Rules. [Dokumentasi Firebase](https://firebase.google.com/docs/firestore/security/rules-conditions)

Wallet jurnal mencatat saldo USD dan mutasinya pada akun. Saat membuka posisi, nilai posisi dipindahkan dari saldo tersedia ke dana di posisi. Penutupan mengembalikan dana tersebut beserta PnL terealisasi, sedangkan pembatalan posisi mengembalikan dana awal. Publikasikan versi terbaru `firestore.rules` sebelum merilis frontend yang memakai field `wallet`.

Watchlist dan lima pencarian terakhir disinkronkan antarperangkat melalui listener Firestore. Pembaruan menggunakan transaksi agar perubahan bersamaan tetap tergabung. Penyimpanan membutuhkan koneksi internet. Aplikasi menampilkan kegagalan baca atau simpan dan mengembalikan input harga jika penyimpanan ditolak.

Jika browser memiliki data dari versi sebelumnya, tombol **Impor ke akun** memindahkan watchlist dan riwayat lokal ke akun yang sedang masuk. Impor mempertahankan harga pantauan yang sudah tersimpan di akun dan bisa diulang dengan aman. Data lokal lama dibersihkan setelah transaksi berhasil.

## Pengujian Firebase lokal

Gunakan Java 21 atau lebih baru dan Firebase Emulator Suite.

```sh
npx firebase-tools emulators:exec --only auth,firestore --project demo-seticker "node --test tests/firebase.test.js"
```

Pengujian mencakup isolasi akun, penolakan akses tamu, validasi dokumen, perubahan serentak, impor data lama, dan login ulang. Untuk mencoba tampilan, jalankan emulator dengan `emulators:start`, lalu tambahkan `VITE_FIREBASE_USE_EMULATORS=true` ke `.env.local` dan jalankan Vite. Mode emulator hanya aktif pada development dan menggunakan proyek `demo-seticker`.

## Build dan deploy

```sh
npm run build
```

Buat repo kosong di GitHub, ganti URL berikut dengan URL repo tersebut, lalu jalankan dari folder proyek.

```sh
git remote add origin https://github.com/akun-kamu/cek-saham.git
git push -u origin main
```

Impor repo GitHub di Netlify, pilih branch `main`, lalu jalankan deploy. Netlify membaca perintah build, direktori `dist`, dan direktori Functions dari `netlify.toml`. Isi keempat variabel `VITE_FIREBASE_*` dari `.env.example` pada environment Netlify sebelum build. Tambahkan domain aplikasi di **Authentication → Settings → Authorized domains**. Konfigurasi Vite dimasukkan saat build, sehingga perubahan variabel memerlukan deploy ulang.

## Cara kerja

- Pilih **AS** untuk ticker seperti `NVDA`, `MSFT`, dan `AAPL`. Pilih **Indonesia** untuk `BBCA` atau **Jepang** untuk `7203`. Mode **Otomatis** mengarahkan kode 3–4 digit ke Tokyo dan kode 2–5 huruf ke Indonesia, dengan `AAPL` sebagai pengecualian. Ticker yang sudah bersufiks dikirim langsung.
- Pilih bursa untuk ticker Hong Kong (`.HK`), Korea Selatan (KOSPI `.KS` atau KOSDAQ `.KQ`), dan China (Shanghai `.SS` atau Shenzhen `.SZ`). Kode numerik dilengkapi nol di depan jika diperlukan. Contoh `700` menjadi `0700.HK` di Hong Kong.
- Kartu menampilkan OHLCV dari sesi terakhir yang sudah tutup dalam data Yahoo Finance. Bar hari ini dipakai setelah jadwal tutup terlewati dan waktu kuotasi Yahoo sudah mencapai penutupan. Tanggal sesi mengikuti zona waktu bursa.
- Lima pencarian sukses terakhir tersimpan di akun dan bisa dijalankan ulang dari tombol riwayat.

## Rumus Buy Trigger

Kartu menempatkan Long di kiri dan Short di kanan. Badge Long memakai level Buy Trigger ≥ Close acuan, sedangkan Short memakai level Sell Trigger ≤ Close acuan. OHLCV, rata-rata volume 50 sesi, dan Close 2 sesi lalu tampil di bawahnya. Close 2 sesi lalu adalah harga tutup satu sesi sebelum acuan, dihitung relatif terhadap sesi berikutnya.

- **True Range** = MAX(High acuan − Low acuan, |High acuan − Close sebelumnya|, |Low acuan − Close sebelumnya|).
- **Level Buy Trigger sesi berikutnya** = Close acuan + 0,4 × True Range.
- **Ambang volume** = 1,4 × rata-rata volume 50 sesi yang mendahului kedua sesi yang dicek. Ambang minimum dibulatkan ke atas ke satuan lembar. Volume sesi acuan dan volume sesi sebelumnya masing-masing memenuhi syarat jika mencapai ambang itu.
- **Level Sell Trigger sesi berikutnya** = Close acuan − 0,4 × True Range.

Rumus memakai nilai asli Yahoo Finance. Pembulatan harga mengikuti format mata uang saat hasil ditampilkan.

## Cek volume dan harga pantauan

- **N dan M** masing-masing YES jika volume sesi acuan atau sesi sebelumnya mencapai ambang. Kedua sesi dicek secara terpisah.
- **A** YES jika Close yang ditampilkan lebih tinggi dari harga pantauan yang diisi pengguna. Isi angka tanpa pemisah ribuan dalam mata uang ticker.

Grafik candlestick menampilkan OHLC dari hingga 20 sesi perdagangan yang sudah tutup sampai tanggal acuan.
