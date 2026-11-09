// Daftar saham LQ45 (periode peninjauan terakhir; diperbarui manual).
// Dipakai breakout-scan.js sebagai universe pemindaian harian.
//
// Sumber: pengumuman BEI tentang perubahan konstituen indeks LQ45.
// Simpan tanpa sufiks .JK — ditambahkan saat fetch ke Yahoo Finance.

export const universes = {
  // 'auto' untuk saat ini memetakan ke LQ45: universe Indonesia paling likuid
  // yang sudah cocok dengan rumus Buy Trigger berbasis sesi harian.
  auto: {
    label: 'Otomatis',
    name: 'LQ45',
    symbols: [
      'ACES', 'ADRO', 'AMRT', 'ANTM', 'ASII',
      'BBCA', 'BBNI', 'BBRI', 'BMRI', 'BRIS',
      'BTPS', 'BYAN', 'CPIN', 'CTRA', 'GOTO',
      'GGRM', 'ICBP', 'INCO', 'INDF', 'INDY',
      'INKP', 'INTP', 'ITMG', 'JPFA', 'KLBF',
      'MAPI', 'MBMA', 'MDKA', 'MEDC', 'MIKA',
      'MYOR', 'PGAS', 'PNLF', 'PTBA', 'PWON',
      'SCMA', 'SIDO', 'SMGR', 'SMRA', 'SRTG',
      'TINS', 'TKIM', 'TLKM', 'TOWR', 'UNTR',
    ],
  },
};

export function getUniverse(region) {
  return universes[region] ?? universes.auto;
}

