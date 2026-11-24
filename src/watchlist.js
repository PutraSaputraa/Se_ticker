import { imageIdPattern } from './imageFile.js';

const storageKey = 'cek-saham:watchlist';
export const maxWatchlistNotesLength = 2000;
export const watchlistCategories = {
  consolidation: 'Konsolidasi',
  'falling-wedge': 'Falling Wedge',
  'golden-cross': 'Golden Cross',
  'death-cross': 'Death Cross',
  quantitative: 'Kuantitatif',
};
const categoryIds = Object.keys(watchlistCategories);

function normalizeRating(rating) {
  return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
}

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
    const rating = normalizeRating(entry.rating);
    const notes = typeof entry.notes === 'string' ? entry.notes.slice(0, maxWatchlistNotesLength).trim() : '';
    const imageId = typeof entry.imageId === 'string' && imageIdPattern.test(entry.imageId) ? entry.imageId : null;
    const categories = Array.isArray(entry.categories) ? categoryIds.filter(category => entry.categories.includes(category)) : [];
    return {
      symbol, priceToWatch,
      ...(rating !== null && { rating }),
      ...(notes && { notes }),
      ...(imageId && { imageId }),
      ...(categories.length > 0 && { categories }),
    };
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

export function hasWatchlistCategory(entry, category) {
  return entry?.categories?.includes(category) ?? false;
}

export function addSymbol(list, symbol, category) {
  const entry = list.find((item) => item.symbol === symbol);
  const validCategory = categoryIds.includes(category);
  if (!entry) {
    return [...list, { symbol, priceToWatch: null, ...(validCategory && { categories: [category] }) }];
  }
  if (!validCategory || hasWatchlistCategory(entry, category)) return list;
  return setWatchlistCategories(list, symbol, [], [category]);
}

export function removeSymbol(list, symbol) {
  return list.filter((entry) => entry.symbol !== symbol);
}

export function setPriceToWatch(list, symbol, priceToWatch) {
  return list.map((entry) =>
    entry.symbol === symbol ? { ...entry, priceToWatch } : entry,
  );
}

export function setWatchlistRating(list, symbol, value) {
  const rating = normalizeRating(value);
  if (rating === null) return list;
  return list.map((entry) =>
    entry.symbol === symbol ? { ...entry, rating } : entry,
  );
}

export function setWatchlistCategories(list, symbol, previous, selected) {
  // Apply the editor's changes to the latest entry, which may include categories from another device.
  const added = selected.filter(category => !previous.includes(category));
  const removed = previous.filter(category => !selected.includes(category));
  return list.map((entry) => {
    if (entry.symbol !== symbol) return entry;
    const retained = (entry.categories ?? []).filter(category => !removed.includes(category));
    return normalizeEntry({ ...entry, categories: [...retained, ...added] });
  });
}

export function setWatchlistNotes(list, symbol, notes) {
  return list.map((entry) => entry.symbol === symbol ? normalizeEntry({ ...entry, notes }) : entry);
}

export function setWatchlistImage(list, symbol, imageId) {
  return list.map((entry) => entry.symbol === symbol ? normalizeEntry({ ...entry, imageId }) : entry);
}
