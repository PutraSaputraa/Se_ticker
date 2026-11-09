import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { clearLegacyWatchlist, normalizeWatchlist, readWatchlist } from './watchlist.js';
import { journalCurrencies, normalizeJournal } from './journal.js';

const historyKey = 'cek-saham:recent';

export function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];
  const symbols = value.filter((symbol) => typeof symbol === 'string' && symbol.trim());
  return [...new Set(symbols)].slice(0, 5);
}

export function normalizeCapital(value) {
  const parsed = Number(String(value ?? '').replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function normalizeAccountData(value) {
  const currency = journalCurrencies.includes(value?.currency) ? value.currency : 'USD';
  return {
    watchlist: normalizeWatchlist(value?.watchlist),
    history: normalizeHistory(value?.history),
    journal: normalizeJournal(value?.journal),
    capital: normalizeCapital(value?.capital),
    currency,
  };
}

export function readLegacyData() {
  let history = [];
  try {
    history = normalizeHistory(JSON.parse(localStorage.getItem(historyKey) ?? '[]'));
  } catch {
    // Riwayat lokal mungkin rusak atau penyimpanan diblokir browser.
  }
  return { watchlist: readWatchlist(), history };
}

export function clearLegacyData() {
  clearLegacyWatchlist();
  try {
    localStorage.removeItem(historyKey);
  } catch {
    // Riwayat dideduplikasi ketika impor diulang.
  }
}

export function mergeLegacyData(current, legacy) {
  return {
    ...current,
    watchlist: normalizeWatchlist([...current.watchlist, ...legacy.watchlist]),
    history: normalizeHistory([...current.history, ...legacy.history]),
  };
}

// Baca versi terbaru di transaksi agar perubahan dari tab/perangkat lain ikut dipertahankan.
export function updateAccountData(database, uid, change) {
  const reference = doc(database, 'users', uid);
  return runTransaction(database, async (transaction) => {
    const snapshot = await transaction.get(reference);
    const current = normalizeAccountData(snapshot.data());
    const next = change(current);
    transaction.set(reference, { ...next, updatedAt: serverTimestamp() });
  });
}
