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
  assert.deepEqual(chartRequests, ['1y']);
});

test('ticker yang tidak ditemukan memakai kode yang bisa dibedakan dari sesi tidak lengkap', async (t) => {
  const fetchChart = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }));
  const response = await stock(new Request('http://localhost/stock?symbol=HUMA.JK'));
  assert.equal(response.status, 404);
  assert.equal((await response.json()).code, 'TICKER_NOT_FOUND');
  assert.equal(fetchChart.mock.callCount(), 1);
});
