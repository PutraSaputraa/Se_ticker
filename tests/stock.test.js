import assert from 'node:assert/strict';
import { test } from 'node:test';
import stock from '../netlify/functions/stock.js';

test('detail dan grafik memakai sesi lengkap sebelumnya saat sesi terbaru belum punya harga tutup', async (t) => {
  const chartRequests = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    if (!url.pathname.includes('/chart/')) return new Response(null, { status: 503 });

    chartRequests.push(url.searchParams.get('range'));
    return Response.json({ chart: { result: [{
      meta: { symbol: 'NVDA', currency: 'USD', exchangeTimezoneName: 'America/New_York' },
      timestamp: ['2024-01-02', '2024-01-03', '2024-01-04'].map((date) => Date.parse(`${date}T14:30:00Z`) / 1000),
      indicators: { quote: [{
        open: [100, 105, 109],
        high: [105, 111, 112],
        low: [98, 104, 107],
        close: [104, 109, null],
        volume: [1000, 1100, 1200],
      }] },
    }] } });
  });

  const response = await stock(new Request('http://localhost/stock?symbol=NVDA'));
  assert.equal(response.status, 200);
  const detail = await response.json();
  assert.equal(detail.date, '2024-01-03');
  assert.equal(detail.close, 109);
  assert.equal(detail.buyTrigger.previousClose, 104);
  assert.deepEqual(detail.priceHistory.map(({ date }) => date), ['2024-01-02', '2024-01-03']);
  assert.deepEqual(detail.recentBars.map(({ previousClose }) => previousClose), [104, null]);
  assert.deepEqual(chartRequests, ['1y']);
});

test('tabel harian memakai penutupan sesi sebelumnya di luar tujuh baris dan saat akhir pekan', async (t) => {
  const dates = [
    '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05',
    '2024-01-08', '2024-01-09', '2024-01-10', '2024-01-11',
  ];
  const close = [100, 102, null, 99, 101, 101, 107, 106];
  t.mock.method(globalThis, 'fetch', async (input) => {
    if (!new URL(input).pathname.includes('/chart/')) return new Response(null, { status: 503 });
    return Response.json({ chart: { result: [{
      meta: { symbol: 'NVDA', currency: 'USD', exchangeTimezoneName: 'America/New_York' },
      timestamp: dates.map((date) => Date.parse(`${date}T14:30:00Z`) / 1000),
      indicators: { quote: [{
        open: close.map(() => 103),
        high: close.map(() => 108),
        low: close.map(() => 98),
        close,
        volume: close.map(() => 1_000),
      }] },
    }] } });
  });

  const response = await stock(new Request('http://localhost/stock?symbol=NVDA'));
  assert.equal(response.status, 200);
  const { recentBars } = await response.json();
  assert.deepEqual(recentBars.map(({ date }) => date), dates.slice(1).reverse());
  assert.deepEqual(recentBars.map(({ previousClose }) => previousClose), [107, 101, 101, 99, null, 102, 100]);
});

test('tutup minggu lalu memakai sesi terakhir minggu bursa dan menangani data yang belum tersedia', async (t) => {
  let now;
  t.mock.method(Date, 'now', () => now);
  const dates = [
    '2024-03-22', '2024-03-26', '2024-03-28', '2024-03-29',
    '2024-04-01', '2024-04-02', '2024-04-04', '2024-04-12',
  ];
  const close = [100, 101, 104, null, 105, 107, 108, null];
  t.mock.method(globalThis, 'fetch', async (input) => {
    if (!new URL(input).pathname.includes('/chart/')) return new Response(null, { status: 503 });
    return Response.json({ chart: { result: [{
      meta: { symbol: 'NVDA', currency: 'USD', exchangeTimezoneName: 'America/New_York' },
      timestamp: dates.map((date) => Date.parse(`${date}T14:30:00Z`) / 1000),
      indicators: { quote: [{
        open: close.map(() => 103),
        high: close.map(() => 109),
        low: close.map(() => 99),
        close,
        volume: close.map(() => 1_000),
      }] },
    }] } });
  });

  const thursdayClose = { date: '2024-03-28', close: 104 };
  const cases = [
    ['2024-04-01T01:00:00Z', '2024-03-28', { date: '2024-03-22', close: 100 }],
    ['2024-04-01T12:00:00Z', '2024-03-28', thursdayClose],
    ['2024-04-03T12:00:00Z', '2024-04-02', thursdayClose],
    ['2024-04-16T12:00:00Z', '2024-04-04', null],
    ['2024-04-23T12:00:00Z', '2024-04-04', null],
  ];
  for (const [time, latestDate, expected] of cases) {
    now = Date.parse(time);
    const response = await stock(new Request('http://localhost/stock?symbol=NVDA'));
    assert.equal(response.status, 200, time);
    const detail = await response.json();
    assert.equal(detail.date, latestDate, time);
    assert.deepEqual(detail.previousWeekClose, expected, time);
  }
});

test('ticker yang tidak ditemukan memakai kode yang bisa dibedakan dari sesi tidak lengkap', async (t) => {
  const fetchChart = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }));
  const response = await stock(new Request('http://localhost/stock?symbol=HUMA.JK'));
  assert.equal(response.status, 404);
  assert.equal((await response.json()).code, 'TICKER_NOT_FOUND');
  assert.equal(fetchChart.mock.callCount(), 1);
});
