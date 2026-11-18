import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterLocalRows, finvizFields, finvizUrl } from '../src/screenerFilters.js';
import { screenerRow } from '../netlify/functions/shared/screener.js';
import { runScan } from '../netlify/functions/shared/scanCore.js';

test('Finviz combines supported selections across all five groups and excludes editor commands', () => {
  const categories = Object.fromEntries(['descriptive', 'fundamental', 'technical', 'news', 'etf'].map(group =>
    [group, finvizFields.filter(field => field.category === group).length]));
  assert.deepEqual(categories, { descriptive: 23, fundamental: 37, technical: 20, news: 2, etf: 1 });
  for (const field of finvizFields) {
    assert.equal(new Set(field.options.map(([code]) => code)).size, field.options.length, field.key);
  }
  const url = new URL(finvizUrl({ ta_sma50: 'pa', news_date: 'today', fa_pe: 'frange', ta_rsi: 'wrong' },
    'all', 'msft, AAPL msft', 'price', true, 'ta_newhigh'));
  assert.deepEqual([...url.searchParams.get('f').split(',')].sort(), ['news_date_today', 'ta_sma50_pa']);
  assert.equal(url.searchParams.get('t'), 'MSFT,AAPL');
  assert.equal(url.searchParams.get('o'), '-price');
});

test('native filters use AND, strict thresholds and separate missing data from nonmatches', () => {
  const rows = [
    { symbol: 'TEST-A', sma50: 1, netMargin: 8 }, { symbol: 'TEST-B', sma50: 0, netMargin: 8 },
    { symbol: 'TEST-C', sma50: 1, netMargin: null }, { symbol: 'OTHER', sma50: -1, netMargin: null },
  ];
  assert.deepEqual(filterLocalRows(rows, { sma50: 'gt0', netMargin: 'gt0' }, 'test'), { matches: [rows[0]], missing: 1 });
  assert.equal(filterLocalRows(rows, {}, '').matches.length, rows.length);
});

test('native metrics use the closed session and comparable fiscal periods', () => {
  const sessions = Array.from({ length: 202 }, (_, i) => ({ date: '2024-05-01', close: i + 1, open: i + 1, volume: 10 }));
  const points = [
    { date: '2023-03-31', value: 100, currency: 'USD' }, { date: '2024-03-31', value: 125, currency: 'USD' },
  ];
  const evaluated = { symbol: 'TEST', currency: 'USD', sessions, index: 199 };
  const row = screenerRow(evaluated, { quarterlyRevenue: points, annualRevenue: points,
    annualIncome: [{ date: '2024-03-31', value: 25, currency: 'USD' }] });
  assert.equal(row.close, 200);
  assert.equal(row.rsi, 100);
  assert.equal(row.volumeRatio, 1);
  assert.equal(row.sma50, 100 * ((200 - 175.5) / 175.5));
  assert.equal(row.revenueGrowth, 25);
  assert.equal(row.netMargin, 20);
  assert.equal(row.epsGrowth, null);
  assert.equal(screenerRow({ ...evaluated, index: 49 }, null).sma200, null);
});

test('screener returns available non-breakout stocks beyond the breakout top ten', async t => {
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    if (!url.pathname.includes('/chart/')) return new Response(null, { status: 503 });
    return Response.json({ chart: { result: [{ meta: { symbol: url.pathname.split('/').at(-1), currency: 'USD' },
      timestamp: [1704204000], indicators: { quote: [{ open: [10], high: [10], low: [10], close: [10], volume: [4] }] } }] } });
  });
  const data = await runScan('screener', 'us');
  assert.equal(data.results.length, 30);
  assert.equal(data.results[0].changePct, null);
  assert.equal(data.results[0].quarterEps, null);
});
