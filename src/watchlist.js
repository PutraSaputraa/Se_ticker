const storageKey = 'cek-saham:watchlist';

export function readWatchlist() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    if (Array.isArray(saved)) {
      return [...new Set(saved.filter((s) => typeof s === 'string' && s.trim()))];
    }
  } catch {
    // Penyimpanan browser mungkin diblokir — daftar pantauan dikosongkan.
  }
  return [];
}

export function saveWatchlist(list) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(list));
  } catch {
    // Abaikan — watchlist tetap jalan di memori meski penyimpanan gagal.
  }
}

export function addSymbol(list, symbol) {
  return list.includes(symbol) ? list : [...list, symbol];
}

export function removeSymbol(list, symbol) {
  return list.filter((s) => s !== symbol);
}
