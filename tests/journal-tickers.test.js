import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeTicker, suggestTickerAlternatives, suggestTickers } from '../src/tickers.js';

test('saran ticker mencocokkan awalan dan menggabungkan kode tersimpan tanpa duplikat', () => {
  assert.deepEqual(suggestTickers(' nv '), [{ symbol: 'NVDA', market: 'AS' }]);
  assert.deepEqual(suggestTickers('nvd', ['NVDS', ' nvda ', 'NVDA']).map(({ symbol }) => symbol), ['NVDS', 'NVDA']);
  assert.equal(suggestTickers('NVDA', ['NVDAW'])[0].symbol, 'NVDA');
});

test('saran ticker menghormati awalan bursa dan kripto', () => {
  assert.deepEqual(suggestTickers('US: ABB', ['ABBV.JK', 'ABBV']).map(({ symbol }) => symbol), ['ABBV']);
  assert.deepEqual(suggestTickers('US: 7203'), []);
  assert.deepEqual(suggestTickers('crypto: btc/', ['BTCW']).map(({ symbol }) => symbol), ['BTC-USD']);
  assert.deepEqual(suggestTickers('US:', ['ABBV']), []);
});

test('Cari menyaring saran sesuai bursa dan menerima kode Hong Kong tanpa nol awal', () => {
  assert.deepEqual(suggestTickers('hum', [], 'id'), [{ symbol: 'HUMI.JK', market: 'Indonesia' }]);
  assert.deepEqual(suggestTickers('hum', [], 'us'), [{ symbol: 'HUMA', market: 'AS' }]);
  assert.deepEqual(suggestTickers('US: HUM', [], 'id'), [{ symbol: 'HUMA', market: 'AS' }]);
  assert.deepEqual(suggestTickers('700', [], 'hk'), [{ symbol: '0700.HK', market: 'Hong Kong' }]);
  assert.deepEqual(suggestTickers('07', [], 'hk'), [{ symbol: '0700.HK', market: 'Hong Kong' }]);
});

test('ticker eksplisit dipertahankan dan koreksi lintas bursa ditawarkan sebagai pilihan', () => {
  assert.equal(normalizeTicker('HUMA'), 'HUMA');
  assert.equal(normalizeTicker('HUMA', 'id'), 'HUMA.JK');
  assert.equal(normalizeTicker('HUMA.JK', 'us'), 'HUMA.JK');
  assert.deepEqual(suggestTickerAlternatives('HUMA.JK'), [
    { symbol: 'HUMA', market: 'AS' },
    { symbol: 'HUMI.JK', market: 'Indonesia' },
  ]);
});
