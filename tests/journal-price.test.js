import assert from 'node:assert/strict';
import { test } from 'node:test';
import price from '../netlify/functions/price.js';

const date = '2024-01-03';

function quote(currency) {
  return Response.json({ chart: { result: [{
    meta: { currency, exchangeTimezoneName: 'UTC' },
    timestamp: [Date.parse(`${date}T12:00:00Z`) / 1000],
    indicators: { quote: [{ close: [125] }] },
  }] } });
}

function journalPrice(symbol, fallback) {
  const params = new URLSearchParams({ mode: 'journal', symbol, fallback, date });
  return price(new Request(`http://localhost/price?${params}`));
}

test('jurnal menyimpan ticker AS jika ticker tebakan tidak terdaftar', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    const symbol = url.pathname.split('/').at(-1);
    calls.push(symbol);
    return symbol === 'ABBV' ? quote('USD') : new Response(null, { status: 404 });
  });

  const response = await journalPrice('ABBV.JK', 'ABBV');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { symbol: 'ABBV', date, price: 125, currency: 'USD', timestamp: null });
  assert.deepEqual(calls, ['ABBV.JK', 'ABBV.JK', 'ABBV']);
});

test('jurnal tetap memilih ticker Indonesia jika kode yang sama ada di AS', async (t) => {
  const lookup = t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(new URL(url).pathname.split('/').at(-1), 'BBCA.JK');
    return quote('IDR');
  });

  const response = await journalPrice('BBCA.JK', 'BBCA');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).symbol, 'BBCA.JK');
  assert.equal(lookup.mock.callCount(), 1);
});

test('jurnal tidak berpindah bursa jika ticker terdaftar tetapi tanggalnya tidak ada', async (t) => {
  const lookup = t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    assert.equal(url.pathname.split('/').at(-1), 'BBCA.JK');
    return url.searchParams.has('range') ? quote('IDR') : new Response(null, { status: 404 });
  });

  const response = await journalPrice('BBCA.JK', 'BBCA');
  assert.equal(response.status, 404);
  assert.equal(lookup.mock.callCount(), 2);
});
