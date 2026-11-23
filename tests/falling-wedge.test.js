import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findFallingWedge, latestCompletedWedgeWeek } from '../netlify/functions/shared/fallingWedgeLogic.js';
import { runScan } from '../netlify/functions/shared/scanCore.js';

const breakoutDate = '2026-11-18';
const friday = '2026-11-20';

function fixture({ upperSlope = -0.55, lowerSlope = -0.16, volume = 1500, closeAtBreakout, weeklyClose } = {}) {
  const sessions = [];
  const day = new Date('2026-08-24T00:00:00Z');
  let breakoutIndex = 0;
  let level = 0;
  while (day.toISOString().slice(0, 10) <= friday) {
    if (day.getUTCDay() > 0 && day.getUTCDay() < 6) {
      const date = day.toISOString().slice(0, 10);
      const index = sessions.length;
      const upper = 148 + index * upperSlope;
      const lower = 100 + index * lowerSlope;
      const width = upper - lower;
      const wave = (1 + Math.cos(index * Math.PI / 5)) / 2;
      const center = lower + 0.6 + (width - 1.2) * wave;
      if (date < breakoutDate) {
        const close = Math.min(upper, Math.max(lower, center));
        sessions.push({ date, open: close - 0.3, high: close + 0.6, low: close - 0.6, close, volume: 1000 });
      } else {
        if (date === breakoutDate) {
          breakoutIndex = index;
          level = upper;
        }
        const close = date === breakoutDate ? closeAtBreakout ?? level + 3
          : date === friday ? weeklyClose ?? level + 4 : level + 4;
        sessions.push({
          date, open: close - 0.3, high: close + 1.5, low: close - 0.6, close,
          volume: date === breakoutDate ? volume : 1000,
        });
      }
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  const endIndex = sessions.length - 1;
  return { sessions, level, breakoutIndex, week: latestCompletedWedgeWeek(sessions, endIndex, friday) };
}

test('accepts converging lower highs and lower lows with a volume breakout and a finished weekly confirmation', () => {
  const { sessions, week, breakoutIndex, level } = fixture();
  const result = findFallingWedge(sessions, week);
  assert.ok(result);
  assert.equal(result.date, breakoutDate);
  assert.equal(result.close, sessions[breakoutIndex].close);
  assert.ok(result.resistance.slope < result.support.slope && result.support.slope < 0);
  assert.ok(Math.abs(result.resistance.end - level) < 1e-10);
  assert.ok(result.contractionPct > 0 && result.contractionPct < 100);
  assert.equal(result.volumeRatio, 1.5);
  assert.equal(result.averageVolume, 1000);
  assert.deepEqual(result.confirmation, { date: friday, close: week.close });
  assert.equal(result.candles[result.duration].date, breakoutDate);
  assert.equal(result.candles.at(-1).date, friday);
});

test('rejects parallel and widening ranges and support that does not descend', () => {
  for (const slopes of [
    { upperSlope: -0.25, lowerSlope: -0.25 },
    { upperSlope: -0.2, lowerSlope: -0.4 },
    { upperSlope: -0.55, lowerSlope: 0.05 },
  ]) {
    const { sessions, week } = fixture(slopes);
    assert.equal(findFallingWedge(sessions, week), null);
  }
});

test('requires a close above resistance, strictly above-average volume, and a week that holds the breakout level', () => {
  const { level } = fixture();
  for (const options of [{ volume: 1000 }, { volume: null }, { closeAtBreakout: level }, { weeklyClose: level - 0.5 }]) {
    const { sessions, week } = fixture(options);
    assert.equal(findFallingWedge(sessions, week), null);
  }
  const { sessions, week, breakoutIndex } = fixture({ volume: 1001 });
  assert.ok(findFallingWedge(sessions, week));
  sessions[breakoutIndex - 12].volume = null;
  assert.equal(findFallingWedge(sessions, week), null);
});

test('uses exchange-local completed weeks, including holidays and incomplete Friday data', () => {
  const { sessions, breakoutIndex, week } = fixture();
  const unfinishedFriday = latestCompletedWedgeWeek(sessions, sessions.length - 2, friday);
  assert.equal(unfinishedFriday.date, '2026-11-13');
  assert.equal(findFallingWedge(sessions, unfinishedFriday), null);
  assert.equal(latestCompletedWedgeWeek(sessions, breakoutIndex, breakoutDate).date, '2026-11-13');
  assert.equal(latestCompletedWedgeWeek(sessions, sessions.length - 1, '2026-11-23').date, friday);
  assert.equal(findFallingWedge(sessions, week).date, breakoutDate);

  const holiday = sessions.slice(0, -1);
  assert.equal(latestCompletedWedgeWeek(holiday, holiday.length - 1, '2026-11-21').date, '2026-11-19');
  const incomplete = [...holiday, { ...sessions.at(-1), close: null }];
  assert.equal(latestCompletedWedgeWeek(incomplete, incomplete.length - 2, '2026-11-21'), null);
  assert.equal(latestCompletedWedgeWeek(sessions, sessions.length - 1, '2026-11-30'), null);
});

test('scan retrieves daily quotes and reports only the completed reference week per market', async t => {
  // The exchange closes at 21:00 UTC, so Friday's reported candle is still open.
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-20T18:00:00Z') });
  const { sessions } = fixture();
  const requests = [];
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    assert.equal(url.hostname, 'query1.finance.yahoo.com');
    assert.equal(url.searchParams.get('interval'), '1d');
    assert.equal(url.searchParams.get('range'), '1y');
    requests.push(url);
    if (!url.pathname.endsWith('/INTC')) return new Response(null, { status: 404 });
    const regularEnd = Date.parse('2026-11-20T21:00:00Z') / 1000;
    return Response.json({ chart: { result: [{
      meta: {
        symbol: 'INTC', longName: 'Intel Corporation', currency: 'USD', exchangeTimezoneName: 'America/New_York',
        currentTradingPeriod: { regular: { end: regularEnd } }, regularMarketTime: regularEnd,
      },
      timestamp: sessions.map(({ date }) => Date.parse(date + 'T14:30:00Z') / 1000),
      indicators: { quote: [Object.fromEntries(['open', 'high', 'low', 'close', 'volume'].map(key => [key, sessions.map(bar => bar[key])]))] },
    }] } });
  });

  const liveFriday = await runScan('falling-wedge', 'us');
  assert.equal(liveFriday.checked, 1);
  assert.equal(liveFriday.scanned, requests.length);
  assert.deepEqual(liveFriday.referenceSessions, ['2026-11-13']);
  assert.deepEqual(liveFriday.results, []);

  t.mock.timers.setTime(Date.parse('2026-11-20T21:01:00Z'));
  const confirmed = await runScan('falling-wedge', 'us');
  assert.equal(confirmed.timeframe, 'daily');
  assert.equal(confirmed.confirmationTimeframe, 'weekly');
  assert.equal(confirmed.volumeLookback, 50);
  assert.deepEqual(confirmed.referenceSessions, [friday]);
  assert.deepEqual(confirmed.results.map(({ symbol, date, confirmation }) => [symbol, date, confirmation.date]), [['INTC', breakoutDate, friday]]);
  assert.equal(confirmed.ai, undefined);
});
