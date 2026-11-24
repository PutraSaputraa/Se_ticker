import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addSymbol,
  hasWatchlistCategory,
  normalizeWatchlist,
  removeSymbol,
  setPriceToWatch,
  setWatchlistCategories,
  setWatchlistImage,
  setWatchlistNotes,
  setWatchlistRating,
} from '../src/watchlist.js';
import { strongWatchStage2, watchPriceStatus, watchVolumePass } from '../src/watchlistSignals.js';

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

test('catatan dan gambar tetap tersimpan saat harga atau bintang ticker berubah', () => {
  const initial = normalizeWatchlist(['NVDA', {
    symbol: 'BBCA.JK', priceToWatch: 9000, rating: 2, categories: ['consolidation'],
  }]);
  const noted = setWatchlistNotes(initial, 'BBCA.JK', '  Pantau volume\nDekat resistance  ');
  const attached = setWatchlistImage(noted, 'BBCA.JK', 'image-1');
  const repriced = setPriceToWatch(attached, 'BBCA.JK', 9200);
  const updated = normalizeWatchlist(setWatchlistRating(repriced, 'BBCA.JK', 5));
  assert.deepEqual(updated, [
    { symbol: 'NVDA', priceToWatch: null },
    {
      symbol: 'BBCA.JK', priceToWatch: 9200, rating: 5, notes: 'Pantau volume\nDekat resistance',
      imageId: 'image-1', categories: ['consolidation'],
    },
  ]);
  const withoutImage = setWatchlistImage(updated, 'BBCA.JK', null);
  assert.equal(withoutImage[1].imageId, undefined);
  assert.equal(withoutImage[1].notes, updated[1].notes);
  const withoutNote = setWatchlistNotes(updated, 'BBCA.JK', ' ');
  assert.equal(withoutNote[1].notes, undefined);
  assert.equal(withoutNote[1].imageId, 'image-1');
  const removed = removeSymbol(updated, 'BBCA.JK');
  assert.deepEqual(setWatchlistNotes(removed, 'BBCA.JK', 'Catatan terlambat'), removed);
  assert.deepEqual(setWatchlistImage(removed, 'BBCA.JK', 'image-2'), removed);
});

test('watchlist keeps supported categories and adds scan categories to the same ticker', () => {
  const initial = normalizeWatchlist([
    { symbol: 'AAPL', rating: 5, categories: ['golden-cross', 'custom', 'golden-cross'] },
    { symbol: 'NVDA', categories: 'falling-wedge' },
  ]);
  assert.deepEqual(initial, [
    { symbol: 'AAPL', priceToWatch: null, rating: 5, categories: ['golden-cross'] },
    { symbol: 'NVDA', priceToWatch: null },
  ]);
  const watched = addSymbol(addSymbol(initial, 'AAPL', 'quantitative'), 'QCOM', 'quantitative');
  assert.deepEqual(watched, [
    { ...initial[0], categories: ['golden-cross', 'quantitative'] }, initial[1],
    { symbol: 'QCOM', priceToWatch: null, categories: ['quantitative'] },
  ]);
  assert.equal(hasWatchlistCategory(watched[0], 'golden-cross'), true);
  assert.equal(hasWatchlistCategory(watched[1], 'quantitative'), false);
  assert.equal(addSymbol(watched, 'AAPL', 'quantitative'), watched);
  assert.equal(addSymbol(watched, 'AAPL'), watched);
});

test('manual category edits preserve categories added after opening the editor', () => {
  const initial = [{ symbol: 'AAPL', priceToWatch: 120, categories: ['consolidation', 'golden-cross'] }];
  const latest = addSymbol(initial, 'AAPL', 'falling-wedge');
  const edited = setWatchlistCategories(latest, 'AAPL', initial[0].categories, ['golden-cross', 'death-cross', 'quantitative']);
  assert.deepEqual(edited, [{
    symbol: 'AAPL', priceToWatch: 120, categories: ['falling-wedge', 'golden-cross', 'death-cross', 'quantitative'],
  }]);
  assert.deepEqual(setWatchlistCategories(edited, 'AAPL', edited[0].categories, []), [{ symbol: 'AAPL', priceToWatch: 120 }]);
  assert.deepEqual(setWatchlistCategories([], 'AAPL', [], ['golden-cross']), []);
});

test('watchlist volume uses either verified session and leaves unavailable data unclassified', () => {
  const quote = (first, previous) => ({ close: 120, buyTrigger: { volumeChecks: [
    { meetsThreshold: first }, { meetsThreshold: previous },
  ] } });
  assert.equal(watchVolumePass(quote(false, true)), true);
  assert.equal(watchVolumePass(quote(false, false)), false);
  assert.equal(watchVolumePass(quote(false, null)), null);
  assert.equal(watchVolumePass({ close: 120 }), null);
  assert.equal(watchPriceStatus(quote(false, true), null, true), 'none');
  assert.equal(watchPriceStatus(quote(false, true), 120, true), 'near');
  assert.equal(watchPriceStatus(quote(false, true), 119, true), 'breakout');
  assert.equal(watchPriceStatus(quote(false, false), 119, false), 'near');
});

test('the strong Stage 2 filter requires seven or eight verified criteria out of eight', () => {
  assert.equal(strongWatchStage2({ passed: 7, total: 8 }), true);
  assert.equal(strongWatchStage2({ passed: 8, total: 8 }), true);
  assert.equal(strongWatchStage2({ passed: 6, total: 8 }), false);
  assert.equal(strongWatchStage2({ passed: 7, total: 7 }), false);
  assert.equal(strongWatchStage2({ passed: 9, total: 8 }), false);
  assert.equal(strongWatchStage2(undefined), false);
});
