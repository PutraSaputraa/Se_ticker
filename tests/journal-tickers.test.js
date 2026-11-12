import assert from 'node:assert/strict';
import { test } from 'node:test';
import { suggestJournalTickers } from '../src/journalTickers.js';

test('saran ticker mencocokkan awalan dan menggabungkan kode tersimpan tanpa duplikat', () => {
  assert.deepEqual(suggestJournalTickers(' nv ', []), [{ symbol: 'NVDA', market: 'AS' }]);
  assert.deepEqual(suggestJournalTickers('nvd', ['NVDS', ' nvda ', 'NVDA']).map(({ symbol }) => symbol), ['NVDS', 'NVDA']);
  assert.equal(suggestJournalTickers('NVDA', ['NVDAW'])[0].symbol, 'NVDA');
});

test('saran ticker menghormati awalan bursa dan kripto', () => {
  assert.deepEqual(suggestJournalTickers('US: ABB', ['ABBV.JK', 'ABBV']).map(({ symbol }) => symbol), ['ABBV']);
  assert.deepEqual(suggestJournalTickers('US: 7203', []), []);
  assert.deepEqual(suggestJournalTickers('crypto: btc/', ['BTCW']).map(({ symbol }) => symbol), ['BTC-USD']);
  assert.deepEqual(suggestJournalTickers('US:', ['ABBV']), []);
});
