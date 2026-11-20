# Prompt untuk Codex — Perbaikan Navbar + Scrollbar Stabil

Copy-paste teks di bawah garis ini ke Codex:

---

Lanjutan rebrand di repo **Cek Saham**. Dua perbaikan berikut. Styling saja — jangan ubah logic JS/data, jangan install dependency.

## Pekerjaan 1 — Navbar: tombol search emas, tombol utilitas jadi chip

Navbar memakai `--nav-surface` (hitam). Saat ini semua kontrol kanan (toggle bahasa ID/EN, toggle tema, Account) hanya outline tipis + ikon muted sehingga terlihat flat dan tidak jelas mana yang bisa diklik, dan tombol search di tengah menu tenggelam padahal itu satu-satunya aksi utama di navbar.

Prinsip: **emas eksklusif untuk aksi utama + state aktif; chip gelap untuk kontrol utilitas.**

### a. Tombol search (ikon kaca pembesar di tengah menu)

- Jadikan tombol aksi utama: background `var(--workspace-action)`, ikon `var(--workspace-on-action)` (hitam/gelap), radius 9 px, tinggi sejajar item menu lain.
- Beri perlakuan dimensi yang sama seperti tombol aksi utama konten (gradien tipis + inset highlight + shadow lembut) agar konsisten — bila pekerjaan tombol emas sudah diterapkan, gunakan kelas/pola yang sama.
- Hover: naik ke `--workspace-action-hover`; active ke `--workspace-action-active`. Transisi 150 ms.

### b. Empat kontrol kanan (ID/EN, tema, dan lainnya) + tombol Account

- Beri background chip: permukaan satu tingkat di atas navbar (gunakan `--nav-current` atau tint `--surface` gelap yang harmonis dengan `--nav-surface`), border halus `--nav-edge`, radius 9 px.
- Hover: background naik satu tingkat lagi dan ikon/teks menjadi terang (off-white), bukan emas — emas disimpan untuk state aktif.
- State aktif konsisten: segmen bahasa yang sedang aktif (mis. "EN") dan toggle tema yang sedang on memakai teks/ikon `var(--workspace-action)` dengan border atau indikator emas tipis — samakan polanya di semua kontrol yang punya state on/off.
- Tombol Account: pastikan kontras teksnya tidak paling redup dibanding kontrol lain; hover menaikkan background + kecerahan teks.
- Target sentuh minimal 44 px; cincin fokus tetap ada di kedua tema.

## Pekerjaan 2 — Scrollbar tidak boleh menggeser layout

Saat berpindah dari halaman pendek (tanpa scrollbar) ke halaman panjang (dengan scrollbar), seluruh konten termasuk navbar bergeser ~15 px. Perbaiki dengan memesan ruang scrollbar secara permanen:

```css
html {
  overflow-y: scroll;        /* fallback: scrollbar selalu tampil */
  scrollbar-gutter: stable;  /* browser modern: ruang dipesan, auto-hide tetap jalan */
}
```

Terapkan di root global (`src/App.css` pada selector `html`). Pastikan tidak ada aturan lain (mis. di `body` atau layout shell) yang menimpa perilaku ini, dan tidak ada elemen yang memakai `width: 100vw` sehingga ikut bergeser — bila ada, ganti ke `100%` atau kompensasi gutter.

## Pekerjaan 3 — Styling scrollbar mengikuti tema (emas)

Terapkan ke SEMUA scrollbar: window utama DAN scrollbar internal (panel tabel, area horizontal-scroll, daftar panjang). Gunakan kedua mekanisme agar konsisten lintas browser: pseudo-element `::-webkit-scrollbar*` (Chrome/Edge/Safari) dan properti standar `scrollbar-color` + `scrollbar-width` (Firefox).

Spesifikasi:

- **Lebar**: tipis, 10 px (jangan sebesar default Windows).
- **Track**: transparan (atau warna `--page` sangat gelap di tema gelap) — JANGAN diberi warna emas.
- **Thumb**:
  - Tema gelap: emas redup — `var(--workspace-action)` dengan opacity ~65% (atau campuran dengan `--border`), radius penuh (pill).
  - Tema terang: emas yang lebih gelap (`--workspace-action` tema terang, `#F0BE1A` dengan opacity ~75%) agar terbaca di track putih.
  - Hover pada thumb: opacity penuh 100% (emas solid), transisi 150 ms.
  - Active/drag: gunakan `--workspace-action-active`.
- **Radius**: thumb rounded penuh; beri sedikit inset (border transparan di sekeliling thumb via `background-clip: padding-box`) supaya terlihat ramping di dalam track.
- Jangan ubah warna scrollbar kontrol form bawaan OS yang tidak bisa distyling (cukup yang bisa dijangkau CSS).

Catatan: karena `scrollbar-gutter: stable` dari Pekerjaan 2 sudah memesan ruang, pastikan lebar gutter dan lebar scrollbar yang distyling selaras agar tidak ada celah/geser sisa.

## Definition of done

- `npm run build` lolos.
- Tombol search di navbar berwarna emas dengan ikon gelap, konsisten dengan tombol aksi utama lain; kontrol kanan berbentuk chip dengan hover jelas dan state aktif emas yang konsisten.
- Berpindah antar halaman (Dashboard ↔ Journal ↔ Watchlist dst.) tidak lagi menggeser konten/navbar sedikit pun, di kedua tema.
- Semua scrollbar (window dan internal panel) ber-thumb emas redup dengan track gelap/transparan, tipis, rounded; hover membuat thumb emas solid; tampil konsisten di Chrome/Edge dan Firefox, di kedua tema.
- Ringkas di akhir: file dan selector yang diubah.
