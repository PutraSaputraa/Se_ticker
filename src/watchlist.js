const storageKey = 'cek-saham:watchlist';

// Setiap entri: { symbol, priceToWatch }. priceToWatch null berarti belum diisi.
function normalizeEntry(entry) {
  if (typeof entry === 'string') {
    // Format lama: daftar pantauan hanya berupa daftar simbol.
    const symbol = entry.trim();
    return symbol ? { symbol, priceToWatch: null } : null;
  }
  if (entry && typeof entry === 'object' && typeof entry.symbol === 'string') {
    const symbol = entry.symbol.trim();
    if (!symbol) return null;
    const priceToWatch = Number.isFinite(entry.priceToWatch) ? entry.priceToWatch : null;
    return { symbol, priceToWatch };
  }
  return null;
}

export function normalizeWatchlist(saved) {
  if (!Array.isArray(saved)) return [];
  const seen = new Set();
  const entries = [];
  for (const raw of saved) {
    const entry = normalizeEntry(raw);
    if (entry && !seen.has(entry.symbol)) {
      seen.add(entry.symbol);
      entries.push(entry);
    }
  }
  return entries;
}

export function readWatchlist() {
  try {
    return normalizeWatchlist(JSON.parse(localStorage.getItem(storageKey) ?? '[]'));
  } catch {
    // Penyimpanan browser mungkin diblokir — daftar pantauan dikosongkan.
  }
  return [];
}

export function clearLegacyWatchlist() {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Impor tetap aman diulang jika browser menolak penghapusan data lama.
  }
}

export function addSymbol(list, symbol) {
  return list.some((entry) => entry.symbol === symbol)
    ? list
    : [...list, { symbol, priceToWatch: null }];
}

export function removeSymbol(list, symbol) {
  return list.filter((entry) => entry.symbol !== symbol);
}

export function setPriceToWatch(list, symbol, priceToWatch) {
  return list.map((entry) =>
    entry.symbol === symbol ? { ...entry, priceToWatch } : entry,
  );
}
