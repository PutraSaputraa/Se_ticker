import assert from 'node:assert/strict';
import { test } from 'node:test';
import { growthCriteria, growthCheck, growthStatus } from '../src/growthFilters.js';
import { finvizUrl } from '../src/screenerFilters.js';
import { fetchGrowthInputs, growthValues } from '../netlify/functions/shared/growth.js';
import { runScan, scanMode } from '../netlify/functions/shared/scanCore.js';

const point = (date, value, currency = 'USD') => ({ date, value, currency });
const estimate = (period, base, avg) => ({ period, earningsEstimate: { yearAgoEps: { raw: base }, avg: { raw: avg } } });

test('Growth preset applies all six strict thresholds and only classifies provable matches', () => {
  assert.deepEqual(growthCriteria.map(rule => rule.threshold), [20, 15, 15, 20, 15, 15]);
  const row = Object.fromEntries(growthCriteria.map(rule => [rule.key, rule.threshold + 1]));
  assert.equal(growthStatus(row, growthCriteria), 'pass');
  for (const rule of growthCriteria) {
    assert.equal(growthCheck({ [rule.key]: rule.threshold + Number.EPSILON * 100 }, rule), 'fail');
    assert.equal(growthCheck({ [rule.key]: null }, rule), 'missing');
  }
  assert.equal(growthStatus({ ...row, eps5Y: null }, growthCriteria), 'missing');
  assert.equal(growthStatus({ ...row, eps5Y: null, salesTTM: 15 }, growthCriteria), 'fail');
  for (const passed of [true, false]) {
    assert.equal(growthStatus({ ...row, salesTTM: null, salesTTMComparison: { passed, threshold: 15 } }, growthCriteria), passed ? 'pass' : 'fail');
    assert.equal(growthStatus({ ...row, salesTTM: null, salesTTMComparison: { passed, threshold: 10 } }, growthCriteria), 'missing');
  }
  const selected = Object.fromEntries(growthCriteria.map(rule => [rule.finviz, 'o' + rule.threshold]));
  assert.equal(new URL(finvizUrl(selected, 'fundamental', '', '', false, '')).searchParams.get('f').split(',').length, 6);
});

test('Growth uses comparable fiscal endpoints, matching analyst periods and two full years of quarterly sales', () => {
  const dates = ['2024-03-31', '2024-06-30', '2024-09-30', '2024-12-31', '2025-03-31', '2025-06-30', '2025-09-30', '2025-12-31'];
  const statements = {
    annualEps: [point('2020-12-31', 1), point('2022-12-31', 4), point('2025-12-31', 32)],
    quarterlyRevenue: dates.map((date, i) => point(date, i < 4 ? 100 : 125 + i - 4)),
  };
  const input = { estimates: [estimate('0q', 1, 99), estimate('0y', 4, 5), estimate('+1y', 5, 7)] };
  const result = growthValues(statements, input);
  const { salesQuarter, ...other } = result;
  assert.ok(Math.abs(salesQuarter - 28) < 1e-10);
  assert.deepEqual(other, { epsThisYear: 25, eps3Y: 100, eps5Y: 100, salesTTM: 26.5, epsNextYear: 40 });
  assert.equal(growthValues({ ...statements, quarterlyRevenue: statements.quarterlyRevenue.slice(1) }).salesTTM, null);
  const broken = [...statements.quarterlyRevenue];
  broken[1] = point('2024-06-30', 100, 'EUR');
  assert.equal(growthValues({ quarterlyRevenue: broken }).salesTTM, null);
  assert.equal(growthValues({ annualEps: [point('2020-12-31', 2, 'JPY'), point('2025-12-31', 32)] }).eps5Y, null);
  assert.equal(growthValues(null, { estimates: [estimate('0y', 0, 2)] }).epsThisYear, null);
  assert.equal(growthValues({ quarterlyRevenue: [point('2025-12-31', 100)], annualRevenue: [point('2024-12-31', 800), point('2025-12-31', 960)] }).salesTTM, 20);
  assert.equal(growthValues(null, { metrics: { epsGrowth5Y: 0 } }).eps5Y, 0);
  assert.equal(growthValues(null, { estimates: [{ period: '+5y', growth: { raw: 0.52 } }] }).eps5Y, null);
  assert.equal(growthValues(null, { estimates: [{ period: '-5y', growth: { raw: 0.25 } }] }).eps5Y, 25);
});

test('Growth scan returns the whole universe, uses one anonymous session and needs no price quotes', async t => {
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input);
    if (url.host === 'fc.yahoo.com') return new Response(null, { status: 404, headers: { 'Set-Cookie': 'session=test; Secure' } });
    if (url.pathname.endsWith('getcrumb')) return new Response('test-session');
    if (url.pathname.endsWith('/screener')) {
      const condition = JSON.parse(options.body).query.operands[1];
      const symbols = condition.operator === 'gt' ? ['AAPL', 'TSLA'] : ['AMD', 'TSLA'];
      return Response.json({ finance: { result: [{ quotes: symbols.map(symbol => ({ symbol })) }] } });
    }
    if (url.pathname.includes('quoteSummary')) return Response.json({ quoteSummary: { result: [{
      price: { shortName: 'Test' }, earningsTrend: { trend: [estimate('+1y', 2, 3)] },
    }] } });
    return new Response(null, { status: 503 });
  });
  const result = await runScan(scanMode('growth'), 'us');
  assert.equal(result.results.length, result.scanned);
  assert.equal(result.results.length, 30);
  assert.equal(result.results[0].epsNextYear, 50);
  assert.equal(result.results[0].eps5Y, null);
  assert.deepEqual(result.results.find(row => row.symbol === 'AAPL').salesTTMComparison, { passed: true, threshold: 15 });
  assert.deepEqual(result.results.find(row => row.symbol === 'AMD').salesTTMComparison, { passed: false, threshold: 15 });
  assert.equal(result.results.find(row => row.symbol === 'TSLA').salesTTMComparison, undefined);
  assert.equal(result.results.find(row => row.symbol === 'MSFT').salesTTMComparison, undefined);
  const calls = globalThis.fetch.mock.calls.map(call => new URL(call.arguments[0]));
  assert.equal(calls.filter(url => url.host === 'fc.yahoo.com').length, 1);
  assert.equal(calls.some(url => url.pathname.includes('/chart/')), false);
});

test('optional historical data can complete all six checks without exposing the service key to the browser', async t => {
  const previousKey = process.env.FINNHUB_API_KEY;
  process.env.FINNHUB_API_KEY = 'test-only';
  t.after(() => {
    if (previousKey === undefined) delete process.env.FINNHUB_API_KEY;
    else process.env.FINNHUB_API_KEY = previousKey;
  });
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input);
    if (url.hostname === 'finnhub.io') {
      assert.equal(options.headers['X-Finnhub-Token'], 'test-only');
      assert.equal(url.searchParams.get('symbol'), 'FIXTURE');
      return Response.json({ symbol: 'FIXTURE', metric: {
        epsGrowth3Y: 23, epsGrowth5Y: 19, revenueGrowthQuarterlyYoy: 24, revenueGrowthTTMYoy: 16,
      } });
    }
    if (url.hostname === 'fc.yahoo.com') return new Response(null, { headers: { 'Set-Cookie': 'session=test' } });
    if (url.pathname.endsWith('getcrumb')) return new Response('test-session');
    return Response.json({ quoteSummary: { result: [{ earningsTrend: { trend: [estimate('0y', 4, 5), estimate('+1y', 5, 6)] } }] } });
  });
  const values = growthValues(null, await fetchGrowthInputs('FIXTURE'));
  assert.equal(growthStatus(values, growthCriteria), 'pass');
  assert.equal(Object.values(values).every(Number.isFinite), true);
  await fetchGrowthInputs('FIXTURE');
  assert.equal(globalThis.fetch.mock.calls.filter(call => new URL(call.arguments[0]).hostname === 'finnhub.io').length, 1);
});
