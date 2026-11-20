# Prompt untuk Codex — Perbaikan Tombol Aksi (Emas Mewah)

Copy-paste teks di bawah garis ini ke Codex:

---

Lanjutan pekerjaan rebrand di repo **Cek Saham**. Tombol aksi utama (yang memakai `--workspace-action` / `--workspace-on-action`, contoh: "Search stocks", "Run scan", "Add funds", "Add setup", "View details") sekarang terlihat flat dan kusam — mustard gelap tanpa dimensi. Perbaiki HANYA styling tombol aksi utama ini. Jangan ubah markup/JSX atau logic, jangan install dependency, jangan sentuh komponen lain kecuali mereka berbagi kelas tombol yang sama.

## Masalah

1. Di tema terang, `--workspace-action: #C79400` terlalu gelap/keruh — kehilangan kesan emas.
2. Tombol flat satu warna: tanpa gradien, tanpa highlight, tanpa shadow — terlihat seperti kotak mati.

## Perbaikan

### 1. Nilai warna baru

**Tema terang** (`:root`):
- `--workspace-action: #F0BE1A` (emas terang, bukan `#C79400`)
- `--workspace-action-hover: #FFCE2E`
- `--workspace-action-active: #D9A90E`
- `--workspace-on-action: #14161A` (teks HITAM di atas emas — bukan putih; hitam di atas emas terang kontrasnya cukup dan memberi kesan "gold")
- `--action-text: #8A6800` tetap (hanya untuk teks tautan, bukan tombol)
- `--workspace-action-soft: #FDF3D3` tetap

**Tema gelap** (`:root[data-theme="dark"]`):
- `--workspace-action: #F5C518` tetap
- `--workspace-on-action: #0C0E11` tetap (teks gelap di atas emas)
- hover/active tetap mengikuti yang sudah ada

### 2. Dimensi visual pada tombol

Terapkan pada selector tombol aksi utama (temukan dulu selector-nya — kemungkinan di `src/App.css` atau file styles yang memakai `--workspace-action` sebagai background):

- **Gradien tipis**, arah atas-terang ke bawah-gelap, menggunakan token hover/active agar tetap konsisten:
  - terang: `linear-gradient(180deg, var(--workspace-action-hover), var(--workspace-action))`
  - gelap: sama polanya dengan nilai gelap
- **Inset highlight** 1px di tepi atas: `box-shadow: inset 0 1px 0 rgba(255,255,255,0.35)` (tema terang) / `rgba(255,255,255,0.18)` (tema gelap).
- **Drop shadow lembut**: `0 1px 2px rgba(0,0,0,0.14)` (terang) / `0 1px 3px rgba(0,0,0,0.5)` (gelap), digabung dengan inset di atas.
- **Hover**: `transform: translateY(-1px)` dan shadow membesar sedikit (`0 2px 6px ...`); background tetap gradien namun bergeser ke arah terang.
- **Active/pressed**: `translateY(0)`, shadow mengecil, warna ke `--workspace-action-active`.
- **Focus**: tetap gunakan cincin fokus yang ada (jangan dihapus), pastikan terlihat di atas emas — gunakan outline gelap untuk tema terang bila cincin putih tidak terbaca.
- **Transisi**: 150 ms untuk background/transform/box-shadow, hormati `prefers-reduced-motion`.
- **Radius**: ikuti aturan kontrol 9 px dari DESIGN.md (jangan diubah jika sudah benar).
- Teks tombol: pakai `--workspace-on-action`, font-weight minimal 600 agar terbaca tegas di atas emas.

### 3. Konsistensi

Pastikan SELURUH tombol yang memakai aksi utama di semua halaman (Dashboard, Watchlist, Scanner/Recommend, Journal, Stock detail, Auth, dialog) mendapat perlakuan yang sama — jika ada yang override warna sendiri, arahkan ke token. Jangan mengubah tombol sekunder/outline (mis. "Withdraw funds", "View chart") — mereka tetap netral.

## Definition of done

- `npm run build` lolos tanpa error.
- Kedua tema: tombol aksi utama terlihat emas terang dengan gradien halus, highlight atas, dan shadow lembut; hover/active terasa responsif; teks hitam terbaca jelas.
- Tidak ada tombol aksi yang masih memakai `#C79400` atau mustard gelap.
- Ringkas di akhir: selector/file yang diubah dan screenshot singkat (atau deskripsi) hasil di kedua tema.
