import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeWatchlist, removeSymbol, setPriceToWatch, setWatchlistRating } from '../src/watchlist.js';

test('watchlist lama tetap tanpa rating dan hanya bintang bulat 1 sampai 5 dipertahankan', () => {
  const invalidRatings = [0, 6, '3', 3.5, null];
  const invalid = invalidRatings.map((rating, index) => ({ symbol: `INVALID${index}`, rating }));
  assert.deepEqual(normalizeWatchlist([
    'AAPL',
    { symbol: 'NVDA', priceToWatch: 140 },
    { symbol: 'BBCA.JK', priceToWatch: 9000, rating: 5 },
    ...invalid,
  ]), [
    { symbol: 'AAPL', priceToWatch: null },
    { symbol: 'NVDA', priceToWatch: 140 },
    { symbol: 'BBCA.JK', priceToWatch: 9000, rating: 5 },
    ...invalid.map(({ symbol }) => ({ symbol, priceToWatch: null })),
  ]);
});

test('rating dan harga pantauan bisa diubah sendiri, dan rating terlambat tidak memulihkan entri terhapus', () => {
  const initial = [{ symbol: 'AAPL', priceToWatch: 120 }, { symbol: 'NVDA', priceToWatch: null }];
  const rated = setWatchlistRating(initial, 'AAPL', 1);
  const repriced = setPriceToWatch(rated, 'AAPL', 115);
  const updated = setWatchlistRating(repriced, 'AAPL', 5);
  assert.deepEqual(normalizeWatchlist(updated), [
    { symbol: 'AAPL', priceToWatch: 115, rating: 5 },
    { symbol: 'NVDA', priceToWatch: null },
  ]);
  assert.equal(setWatchlistRating(updated, 'AAPL', 9), updated);
  const removed = removeSymbol(updated, 'AAPL');
  assert.deepEqual(setWatchlistRating(removed, 'AAPL', 5), removed);
});
