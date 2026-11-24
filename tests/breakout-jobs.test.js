import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { setEnvironmentContext } from '@netlify/blobs';
import breakoutStart from '../netlify/functions/breakout-start.js';
import breakoutScan from '../netlify/functions/breakout-scan.js';
import breakoutStatus from '../netlify/functions/breakout-status.js';
import breakoutStop from '../netlify/functions/breakout-stop.js';
import breakoutWorker from '../netlify/functions/breakout-scan-background.js';
import { runScan } from '../netlify/functions/shared/scanCore.js';
import { cryptoUniverse } from '../netlify/functions/shared/universe.js';

const functionsUrl = 'https://test.example/.netlify/functions/';
setEnvironmentContext({
  siteID: 'test-site',
  token: 'test-token',
  edgeURL: 'https://cached-blobs.example',
  uncachedEdgeURL: 'https://strong-blobs.example',
});
process.env.KENARI_API_KEY = 'test-key';

function mockJobStore(t, otherFetch) {
  const blobs = new Map();
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(input);
    if (!url.hostname.endsWith('-blobs.example')) return otherFetch(url, init);

    const key = url.pathname.split('/').at(-1);
    const stored = blobs.get(key);
    if (init.method.toUpperCase() === 'GET') {
      assert.equal(url.hostname, 'strong-blobs.example');
      return stored ? Response.json(stored.data, { headers: { etag: stored.etag } }) : new Response(null, { status: 404 });
    }

    assert.equal(init.method.toUpperCase(), 'PUT');
    const expectedEtag = new Headers(init.headers).get('if-match');
    if (expectedEtag && expectedEtag !== stored?.etag) return new Response(null, { status: 412 });
    const etag = `"${crypto.randomUUID()}"`;
    blobs.set(key, { data: JSON.parse(init.body), etag });
    return new Response(null, { headers: { etag } });
  });
}

function startResearch() {
  return breakoutStart(new Request(`${functionsUrl}breakout-start?mode=research&region=auto`, { method: 'POST' }));
}

function readJob(jobId) {
  return breakoutStatus(new Request(`${functionsUrl}breakout-status?jobId=${jobId}`));
}

function stopJob(jobId) {
  return breakoutStop(new Request(`${functionsUrl}breakout-stop?jobId=${jobId}`, { method: 'POST' }));
}

function flatHistory(symbol, count = 45) {
  return Response.json({ chart: { result: [{
    meta: { symbol, exchangeTimezoneName: 'UTC' },
    timestamp: Array.from({ length: count }, (_, index) => Date.UTC(2026, 0, index + 1, 12) / 1000),
    indicators: { quote: [{
      open: Array(count).fill(100), high: Array(count).fill(101),
      low: Array(count).fill(99), close: Array(count).fill(100), volume: Array(count).fill(1000),
    }] },
  }] } });
}

test('all-exchanges jobs process 1,000 unique stocks and count checked stocks without signals', async (t) => {
  let workerBody;
  const symbols = [];
  mockJobStore(t, (url, init) => {
    if (url.pathname.endsWith('/breakout-scan-background')) {
      workerBody = init.body;
      return new Response(null, { status: 202 });
    }
    const symbol = decodeURIComponent(url.pathname.split('/').at(-1));
    symbols.push(symbol);
    if (symbol === 'BBCA.JK' || symbol === 'AAPL') return flatHistory(symbol);
    if (symbol === 'BBRI.JK') return flatHistory(symbol, 2);
    return new Response(null, { status: 404 });
  });

  const start = await breakoutStart(new Request(`${functionsUrl}breakout-start?mode=scan&region=auto`, { method: 'POST' }));
  const { jobId, progress, waitMs } = await start.json();
  assert.ok(waitMs < 15 * 60_000);
  assert.deepEqual(progress, { total: 1000, processed: 0, checked: 0, failed: 0 });
  assert.deepEqual(await (await readJob(jobId)).json(), { status: 'pending', progress });

  await breakoutWorker(new Request(`${functionsUrl}breakout-scan-background`, { method: 'POST', body: workerBody }));
  const finished = await (await readJob(jobId)).json();
  assert.equal(finished.status, 'done');
  assert.deepEqual(finished.progress, { total: 1000, processed: 1000, checked: 2, failed: 998 });
  assert.deepEqual([finished.result.scanned, finished.result.checked, finished.result.failed], [1000, 2, 998]);
  assert.deepEqual(finished.result.results, []);
  assert.equal(symbols.length, 1000);
  assert.equal(new Set(symbols).size, 1000);
  assert.ok(cryptoUniverse.symbols.every(symbol => !symbols.includes(symbol)));
  assert.equal((await (await stopJob(jobId)).json()).status, 'done');
});

test('a stopped queued job never starts downloading prices', async (t) => {
  let workerBody;
  let priceRequests = 0;
  mockJobStore(t, (url, init) => {
    if (url.pathname.endsWith('/breakout-scan-background')) {
      workerBody = init.body;
      return new Response(null, { status: 202 });
    }
    priceRequests += 1;
    return new Response(null, { status: 404 });
  });

  const start = await breakoutStart(new Request(`${functionsUrl}breakout-start?mode=scan&region=us`, { method: 'POST' }));
  const { jobId, progress } = await start.json();
  assert.deepEqual(await (await stopJob(jobId)).json(), { status: 'cancelled', progress });
  await breakoutWorker(new Request(`${functionsUrl}breakout-scan-background`, { method: 'POST', body: workerBody }));
  assert.deepEqual(await (await readJob(jobId)).json(), { status: 'cancelled', progress });
  assert.equal(priceRequests, 0);
});

test('stopping a running scan aborts active requests and preserves actual progress', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const inFlight = Promise.withResolvers();
  let workerBody;
  let priceRequests = 0;
  let abortedRequests = 0;
  mockJobStore(t, (url, init) => {
    if (url.pathname.endsWith('/breakout-scan-background')) {
      workerBody = init.body;
      return new Response(null, { status: 202 });
    }
    priceRequests += 1;
    if (priceRequests === 1) return flatHistory('AAPL');
    if (priceRequests === 2) return new Response(null, { status: 404 });
    if (priceRequests === 6) inFlight.resolve();
    return new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => {
        abortedRequests += 1;
        reject(init.signal.reason);
      }, { once: true });
    });
  });

  const start = await breakoutStart(new Request(`${functionsUrl}breakout-start?mode=scan&region=us`, { method: 'POST' }));
  const { jobId, progress: initialProgress } = await start.json();
  const worker = breakoutWorker(new Request(`${functionsUrl}breakout-scan-background`, { method: 'POST', body: workerBody }));
  await inFlight.promise;
  t.mock.timers.tick(2000);
  await setImmediate();

  const progress = { total: initialProgress.total, processed: 2, checked: 1, failed: 1 };
  assert.deepEqual(await (await readJob(jobId)).json(), { status: 'running', progress });
  assert.deepEqual(await (await stopJob(jobId)).json(), { status: 'stopping', progress });
  t.mock.timers.tick(2000);
  await worker;
  assert.deepEqual(await (await readJob(jobId)).json(), { status: 'cancelled', progress });
  assert.equal(abortedRequests, 4);
  assert.equal(priceRequests, 6);
});

test('riset menunggu konfirmasi worker dan menampilkan hasil terbaru untuk semua bursa', async (t) => {
  const dispatched = Promise.withResolvers();
  const accepted = Promise.withResolvers();
  let searchCalls = 0;
  let kenariCalls = 0;
  mockJobStore(t, (url, init) => {
    if (url.pathname.endsWith('/breakout-scan-background')) {
      dispatched.resolve(init.body);
      return accepted.promise;
    }
    assert.equal(url.hostname, 'kenari.id');
    const request = JSON.parse(init.body);
    if (url.pathname === '/v1/web/search') {
      searchCalls += 1;
      assert.match(request.query, /LQ45.*NASDAQ.*Nikkei.*Shanghai.*Shenzhen/);
      return Response.json({ results: [{ title: 'Data bursa', content: 'BBCA.JK', url: 'https://test.example/source' }] });
    }
    assert.equal(url.pathname, '/v1/chat/completions');
    kenariCalls += 1;
    assert.equal(request.tools, undefined);
    assert.match(request.messages[1].content, /Indonesia .*Jepang.*Shanghai.*Shenzhen/);
    assert.match(request.messages[1].content, /https:\/\/test\.example\/source/);
    return Response.json({ choices: [{ message: {
      content: JSON.stringify({ picks: [{ symbol: 'BBCA.JK' }], summary: 'Satu kandidat.' }),
    } }] });
  });

  let responded = false;
  const starting = startResearch().then((response) => {
    responded = true;
    return response;
  });
  const body = await dispatched.promise;
  await setImmediate();
  assert.equal(responded, false);
  accepted.resolve(new Response(null, { status: 202 }));

  const start = await starting;
  assert.equal(start.status, 202);
  const { jobId, waitMs } = await start.json();
  assert.ok(waitMs > 120_000);
  assert.deepEqual(await (await readJob(jobId)).json(), { status: 'pending' });

  const invokeWorker = () => breakoutWorker(new Request(`${functionsUrl}breakout-scan-background`, { method: 'POST', body }));
  await Promise.all([invokeWorker(), invokeWorker()]);
  assert.equal(searchCalls, 1);
  assert.equal(kenariCalls, 1);
  const status = await readJob(jobId);
  assert.equal(status.headers.get('Cache-Control'), 'no-store');
  const job = await status.json();
  assert.equal(job.status, 'done');
  assert.equal(job.result.universe, '8 bursa');
  assert.equal(job.result.results[0].symbol, 'BBCA.JK');
  assert.equal(job.result.language, 'id');
});

test('pilihan English diteruskan dari job ke prompt AI dan hasil riset', async (t) => {
  let body;
  mockJobStore(t, (url, init) => {
    if (url.pathname.endsWith('/breakout-scan-background')) {
      body = init.body;
      return new Response(null, { status: 202 });
    }
    if (url.pathname === '/v1/web/search') {
      return Response.json({ results: [{ title: 'Test source', content: 'DEMO', url: 'https://test.example/source' }] });
    }
    assert.match(JSON.parse(init.body).messages[1].content, /in English/);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ picks: [{ symbol: 'DEMO' }], summary: 'A test candidate.' }) } }] });
  });
  const started = await breakoutStart(new Request(`${functionsUrl}breakout-start?mode=research&region=us&lang=en`, { method: 'POST' }));
  const { jobId } = await started.json();
  await breakoutWorker(new Request(`${functionsUrl}breakout-scan-background`, { method: 'POST', body }));
  const { result } = await (await readJob(jobId)).json();
  assert.equal(result.language, 'en');
  assert.equal(result.ai.summary, 'A test candidate.');
});

test('penolakan worker mengembalikan error saat memulai job', async (t) => {
  let jobId;
  mockJobStore(t, (_url, init) => {
    ({ jobId } = JSON.parse(init.body));
    return new Response(null, { status: 404 });
  });
  t.mock.method(console, 'warn', () => {});

  const start = await startResearch();
  assert.equal(start.status, 502);
  const { error } = await start.json();
  assert.deepEqual(await (await readJob(jobId)).json(), { status: 'error', error });
});

test('riset menampilkan kegagalan Kenari dan memerlukan sumber web untuk kandidat', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', () => new Response(null, { status: 429 }));
  const limited = await runScan('research', 'us');
  assert.match(limited.ai.error, /Batas pemakaian Kenari/);

  fetch.mock.mockImplementation(() => Response.json({ results: [] }));
  const withoutSources = await runScan('research', 'us');
  assert.equal(withoutSources.ai.error, null);
  assert.match(withoutSources.ai.summary, /belum menemukan sumber/);
  assert.deepEqual(withoutSources.results, []);
  assert.equal(fetch.mock.callCount(), 2);
});

test('job konsolidasi bulanan menilai bulan terakhir yang selesai di bursa', async (t) => {
  // July has started in Shenzhen while the browser/server UTC date is still June.
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-06-30T16:30:00Z') });
  let body;
  const priceRequests = [];
  const cycle = [76, 81, 83, 77, 69, 73];
  const closes = Array.from({ length: 22 }, (_, index) => cycle[index % cycle.length]);
  closes.push(93, 94);
  const timestamps = closes.map((_, index) => Date.UTC(2024, 8 + index, 0, 16) / 1000);
  // Yahoo may append a second bar for the current month.
  timestamps[timestamps.length - 1] = timestamps.at(-2) + 600;
  mockJobStore(t, (url, init) => {
    if (url.pathname.endsWith('/breakout-scan-background')) {
      body = init.body;
      return new Response(null, { status: 202 });
    }
    priceRequests.push(url);
    if (url.pathname.endsWith('/300750.SZ')) {
      return Response.json({ chart: { result: [{
        meta: { symbol: '300750.SZ', exchangeTimezoneName: 'Asia/Shanghai', currency: 'CNY' },
        timestamp: [Date.UTC(2026, 4, 1) / 1000],
        indicators: { quote: [{ open: [79], high: [82], low: [78], close: [80] }] },
      }] } });
    }
    if (!url.pathname.endsWith('/000333.SZ')) return new Response(null, { status: 404 });
    return Response.json({ chart: { result: [{
      meta: { symbol: '000333.SZ', exchangeTimezoneName: 'Asia/Shanghai', currency: 'CNY' },
      timestamp: timestamps,
      indicators: { quote: [{
        open: closes,
        high: closes.map(value => value + 1),
        low: closes.map(value => value - 1),
        close: closes,
      }] },
    }] } });
  });

  const request = new Request(`${functionsUrl}breakout-start?mode=consolidation-monthly&region=sz&lang=en`, { method: 'POST' });
  const started = await breakoutStart(request);
  assert.equal(started.status, 202);
  const { jobId } = await started.json();
  await breakoutWorker(new Request(`${functionsUrl}breakout-scan-background`, { method: 'POST', body }));
  const { status, result } = await (await readJob(jobId)).json();
  assert.equal(status, 'done');
  assert.equal(result.timeframe, 'monthly');
  assert.equal(result.language, 'en');
  assert.equal(result.checked, 1);
  assert.equal(result.scanned, priceRequests.length);
  assert.equal(result.failed, result.scanned - 1);
  assert.deepEqual(result.referenceSessions, ['2026-06']);
  assert.equal(result.ai, undefined);
  assert.ok(priceRequests.every(url => url.hostname === 'query1.finance.yahoo.com'
    && url.searchParams.get('interval') === '1mo' && url.searchParams.get('range') === '5y'));
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].date, '2026-06');
  assert.equal(result.results[0].close, 77);
  assert.equal(result.results[0].closes.length, result.results[0].duration);
  assert.deepEqual(result.results[0].closes.at(-1), ['2026-06', 77]);
  assert.deepEqual(result.results[0].closes.map(([, close]) => close), closes.slice(0, 22).slice(-result.results[0].duration));
});

test('job falling wedge preserves the third method and reports missing market data', async (t) => {
  let workerBody;
  let quoteRequests = 0;
  mockJobStore(t, (url, init) => {
    if (url.pathname.endsWith('/breakout-scan-background')) {
      workerBody = init.body;
      return new Response(null, { status: 202 });
    }
    assert.equal(url.hostname, 'query1.finance.yahoo.com');
    assert.equal(url.searchParams.get('interval'), '1d');
    quoteRequests += 1;
    return new Response(null, { status: 404 });
  });

  const started = await breakoutStart(new Request(
    `${functionsUrl}breakout-start?mode=falling-wedge&region=sz&lang=en`, { method: 'POST' },
  ));
  assert.equal(started.status, 202);
  const { jobId } = await started.json();
  await breakoutWorker(new Request(`${functionsUrl}breakout-scan-background`, { method: 'POST', body: workerBody }));
  const { status, result } = await (await readJob(jobId)).json();
  assert.equal(status, 'done');
  assert.deepEqual(result, {
    mode: 'falling-wedge', language: 'en', region: 'sz', universe: 'China (Shenzhen)',
    timeframe: 'daily', confirmationTimeframe: 'weekly', volumeLookback: 50,
    scanned: quoteRequests, checked: 0, failed: quoteRequests, referenceSessions: [], results: [],
  });
  assert.ok(quoteRequests > 0);
});

test('job konsolidasi mingguan menggabungkan sesi dan baru menilai breakout setelah pekan tutup', async (t) => {
  const dayMs = 86_400_000;
  const fridayEnd = Date.parse('2026-11-20T07:00:00Z');
  const fridayOpen = Date.parse('2026-11-20T01:30:00Z');
  t.mock.timers.enable({ apis: ['Date'], now: fridayEnd - 60_000 });
  const cycle = [76, 81, 83, 77, 69, 73];
  const bar = (time, close, wick) => ({ timestamp: time / 1000, open: close, high: close + wick, low: close - wick, close });
  const bars = Array.from({ length: 30 }, (_, index) => {
    const friday = fridayOpen - (30 - index) * 7 * dayMs;
    const close = cycle[index % cycle.length];
    return [bar(friday - 3 * dayMs, close, 2), bar(friday, close, 1)];
  }).flat();
  bars.push(bar(fridayOpen - 3 * dayMs, 75, 1), bar(fridayOpen, 95, 1));
  const quotes = Object.fromEntries(['open', 'high', 'low', 'close'].map(key => [key, bars.map(row => row[key])]));
  let body;
  const requests = [];
  mockJobStore(t, (url, init) => {
    if (url.pathname.endsWith('/breakout-scan-background')) {
      body = init.body;
      return new Response(null, { status: 202 });
    }
    requests.push(url);
    if (!url.pathname.endsWith('/000333.SZ')) return new Response(null, { status: 404 });
    return Response.json({ chart: { result: [{
      meta: {
        symbol: '000333.SZ', currency: 'CNY', exchangeTimezoneName: 'Asia/Shanghai',
        currentTradingPeriod: { regular: { end: fridayEnd / 1000 } },
        regularMarketTime: Math.min(fridayEnd, Date.now()) / 1000,
      },
      timestamp: bars.map(row => row.timestamp), indicators: { quote: [quotes] },
    }] } });
  });

  const started = await breakoutStart(new Request(
    `${functionsUrl}breakout-start?mode=consolidation-weekly&region=sz`, { method: 'POST' },
  ));
  assert.equal(started.status, 202);
  const { jobId } = await started.json();
  await breakoutWorker(new Request(`${functionsUrl}breakout-scan-background`, { method: 'POST', body }));
  const { status, result } = await (await readJob(jobId)).json();
  assert.equal(status, 'done');
  assert.equal(result.mode, 'consolidation-weekly');
  assert.equal(result.timeframe, 'weekly');
  assert.equal(result.checked, 1);
  assert.deepEqual(result.referenceSessions, ['2026-11-13']);
  assert.equal(result.results.length, 1);
  const [pick] = result.results;
  assert.equal(pick.resistance.high, 85);
  assert.equal(pick.support.low, 67);
  assert.equal(pick.closes.length, pick.duration);
  assert.deepEqual(pick.closes.at(-1), ['2026-11-13', 73]);

  t.mock.timers.setTime(fridayEnd + 60_000);
  const closed = await runScan('consolidation-weekly', 'sz');
  assert.deepEqual(closed.referenceSessions, ['2026-11-20']);
  assert.deepEqual(closed.results, []);
  assert.ok(requests.every(url => url.hostname === 'query1.finance.yahoo.com'
    && url.searchParams.get('interval') === '1d' && url.searchParams.get('range') === '1y'));
});

test('Golden Cross jobs scan both averages on the last completed daily or weekly candle', async (t) => {
  const dayMs = 86_400_000;
  const fridayOpen = Date.parse('2026-11-20T01:30:00Z');
  const fridayEnd = Date.parse('2026-11-20T07:00:00Z');
  t.mock.timers.enable({ apis: ['Date'], now: fridayEnd - 60_000 });
  const timestamps = Array.from({ length: 205 }, (_, index) => (fridayOpen - (205 - index) * 7 * dayMs) / 1000);
  timestamps.push((fridayOpen - dayMs) / 1000, fridayOpen / 1000);
  const closes = [...Array(205).fill(100), 150, 150];
  const quote = {
    open: [...Array(205).fill(100), 130, 145], high: [...Array(205).fill(100), 160, 155],
    low: [...Array(205).fill(100), 125, 140], close: closes, volume: [...Array(205).fill(100), 400, 600],
  };
  let body;
  const ranges = new Set();
  mockJobStore(t, (url, init) => {
    if (url.pathname.endsWith('/breakout-scan-background')) {
      body = init.body;
      return new Response(null, { status: 202 });
    }
    assert.equal(url.hostname, 'query1.finance.yahoo.com');
    assert.equal(url.searchParams.get('interval'), '1d');
    ranges.add(url.searchParams.get('range'));
    if (!url.pathname.endsWith('/000333.SZ')) return new Response(null, { status: 404 });
    return Response.json({ chart: { result: [{
      meta: {
        symbol: '000333.SZ', currency: 'CNY', exchangeTimezoneName: 'Asia/Shanghai',
        currentTradingPeriod: { regular: { end: fridayEnd / 1000 } },
        regularMarketTime: Math.min(fridayEnd, Date.now()) / 1000,
      },
      timestamp: timestamps, indicators: { quote: [quote] },
    }] } });
  });

  async function runJob(timeframe) {
    const mode = `golden-cross-${timeframe}`;
    const started = await breakoutStart(new Request(`${functionsUrl}breakout-start?mode=${mode}&region=sz`, { method: 'POST' }));
    assert.equal(started.status, 202);
    const { jobId } = await started.json();
    await breakoutWorker(new Request(`${functionsUrl}breakout-scan-background`, { method: 'POST', body }));
    const { status, result } = await (await readJob(jobId)).json();
    assert.equal(status, 'done');
    assert.equal(result.mode, mode);
    assert.equal(result.timeframe, timeframe);
    assert.equal(result.checked, 1);
    assert.equal(result.region, 'sz');
    return result;
  }

  const signals = result => result.results.map(({ symbol, method, signal, date }) => [symbol, method, signal, date]);
  const daily = await runJob('daily');
  assert.deepEqual(signals(daily), [
    ['000333.SZ', 'SMA', 'golden', '2026-11-19'], ['000333.SZ', 'EMA', 'golden', '2026-11-19'],
  ]);
  for (const { candles, fast, slow } of daily.results) {
    assert.equal(candles.length, 60);
    assert.equal(candles[0].slow, null);
    assert.equal(candles.at(-2).fast, 100);
    assert.equal(candles.at(-2).slow, 100);
    assert.deepEqual(candles.at(-1), { date: '2026-11-19', open: 130, high: 160, low: 125, close: 150, volume: 400, fast, slow });
  }
  const openWeek = await runJob('weekly');
  assert.deepEqual(openWeek.referenceSessions, ['2026-11-13']);
  assert.deepEqual(openWeek.results, []);

  t.mock.timers.setTime(fridayEnd + 60_000);
  const weekly = await runJob('weekly');
  assert.deepEqual(signals(weekly), [
    ['000333.SZ', 'SMA', 'golden', '2026-11-20'], ['000333.SZ', 'EMA', 'golden', '2026-11-20'],
  ]);
  for (const { candles, fast, slow } of weekly.results) {
    assert.deepEqual(candles.at(-1), { date: '2026-11-20', open: 130, high: 160, low: 125, close: 150, volume: 1000, fast, slow });
  }
  assert.deepEqual((await runJob('daily')).results, []);
  assert.deepEqual(ranges, new Set(['5y', '10y']));
});

test('crypto Golden Cross jobs use weekend closes and wait for Monday 00:00 UTC to complete the week', async (t) => {
  const dayMs = 86_400_000;
  const monday = Date.parse('2026-11-23T00:00:00Z');
  t.mock.timers.enable({ apis: ['Date'], now: monday - 60_000 });
  const historyLength = 205 * 7;
  const timestamps = Array.from({ length: historyLength + 1 }, (_, index) => (monday - (historyLength - index) * dayMs) / 1000);
  const requests = [];
  let workerBody;
  mockJobStore(t, (url, init) => {
    if (url.pathname.endsWith('/breakout-scan-background')) {
      workerBody = init.body;
      return new Response(null, { status: 202 });
    }
    const symbol = url.pathname.split('/').at(-1);
    requests.push(symbol);
    if (symbol !== 'BTC-USD' && symbol !== 'ETH-USD') return new Response(null, { status: 404 });
    const weekend = symbol === 'BTC-USD' ? [150, 150, 25] : [100, 50, 300];
    const close = [...Array(historyLength - 2).fill(100), ...weekend];
    return Response.json({ chart: { result: [{
      meta: { symbol, currency: 'USD', exchangeTimezoneName: 'UTC' },
      timestamp: timestamps, indicators: { quote: [{ close, high: close, low: close, open: close, volume: close.map(() => 20) }] },
    }] } });
  });

  const mode = 'golden-cross-weekly';
  const started = await breakoutStart(new Request(`${functionsUrl}breakout-start?mode=${mode}&region=crypto`, { method: 'POST' }));
  assert.equal(started.status, 202);
  const { jobId, waitMs } = await started.json();
  assert.equal(waitMs, 54_000);
  await breakoutWorker(new Request(`${functionsUrl}breakout-scan-background`, { method: 'POST', body: workerBody }));
  const { status, result } = await (await readJob(jobId)).json();
  assert.equal(status, 'done');
  assert.equal(result.mode, mode);
  assert.equal(result.region, 'crypto');
  assert.equal(result.universe, 'Kripto');
  assert.equal(result.checked, 2);
  assert.deepEqual(requests, cryptoUniverse.symbols);
  assert.deepEqual(result.referenceSessions, ['2026-11-15']);
  assert.deepEqual(result.results, []);

  const signals = payload => payload.results.map(({ symbol, method, signal, date }) => [symbol, method, signal, date]);
  assert.deepEqual(signals(await runScan('golden-cross-daily', 'crypto')), [
    ['BTC-USD', 'SMA', 'golden', '2026-11-21'], ['BTC-USD', 'EMA', 'golden', '2026-11-21'],
  ]);
  t.mock.timers.setTime(monday);
  const closedWeek = await runScan(mode, 'crypto');
  assert.deepEqual(closedWeek.referenceSessions, ['2026-11-22']);
  assert.deepEqual(signals(closedWeek), [
    ['BTC-USD', 'SMA', 'golden', '2026-11-22'], ['BTC-USD', 'EMA', 'golden', '2026-11-22'],
    ['ETH-USD', 'SMA', 'death', '2026-11-22'], ['ETH-USD', 'EMA', 'death', '2026-11-22'],
  ]);
  for (const { signal, candles, fast, slow } of closedWeek.results) {
    const isGolden = signal === 'golden';
    assert.deepEqual(candles.at(-1), {
      date: '2026-11-22', open: 100, high: isGolden ? 150 : 100, low: isGolden ? 100 : 50,
      close: isGolden ? 150 : 50, volume: 140, fast, slow,
    });
  }
  assert.deepEqual(signals(await runScan('golden-cross-daily', 'crypto')), [
    ['ETH-USD', 'SMA', 'death', '2026-11-22'], ['ETH-USD', 'EMA', 'death', '2026-11-22'],
  ]);
});

test('stock-only methods and the all-exchanges stock scope stay separate from crypto', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }));
  const query = 'mode=scan&region=crypto';
  const start = await breakoutStart(new Request(`${functionsUrl}breakout-start?${query}`, { method: 'POST' }));
  const sync = await breakoutScan(new Request(`${functionsUrl}breakout-scan?${query}`));
  assert.equal(start.status, 400);
  assert.equal(sync.status, 400);
  assert.equal(fetch.mock.callCount(), 0);

  await runScan('golden-cross-daily', 'auto');
  const requested = fetch.mock.calls.map(({ arguments: [url] }) => new URL(url).pathname.split('/').at(-1));
  assert.ok(requested.includes('BBCA.JK') && requested.includes('AAPL'));
  assert.ok(cryptoUniverse.symbols.every(symbol => !requested.includes(symbol)));
});

test('crypto consolidation evaluates completed UTC days, weeks, and months', async (t) => {
  const dayMs = 86_400_000;
  const monday = Date.parse('2026-11-23T00:00:00Z');
  t.mock.timers.enable({ apis: ['Date'], now: monday - 60_000 });
  const cycle = [76, 81, 83, 77, 69, 73];
  const historyDays = 30 * 7;
  const daily = Array.from({ length: historyDays + 8 }, (_, index) => {
    const close = index < historyDays ? cycle[Math.floor(index / 7) % cycle.length]
      : index < historyDays + 6 ? 75 : 95;
    return { timestamp: (monday - (historyDays + 7 - index) * dayMs) / 1000, close, wick: index % 7 === 5 ? 2 : 1 };
  });
  const monthly = Array.from({ length: 31 }, (_, index) => ({
    timestamp: Date.UTC(2024, 4 + index, 1) / 1000, close: index < 30 ? cycle[index % cycle.length] : 95, wick: 2,
  }));
  let workerBody;
  mockJobStore(t, (url, init) => {
    if (url.pathname.endsWith('/breakout-scan-background')) {
      workerBody = init.body;
      return new Response(null, { status: 202 });
    }
    const symbol = url.pathname.split('/').at(-1);
    assert.ok(cryptoUniverse.symbols.includes(symbol));
    const interval = url.searchParams.get('interval');
    assert.equal(url.searchParams.get('range'), interval === '1mo' ? '5y' : '1y');
    const bars = symbol === 'BTC-USD' ? (interval === '1mo' ? monthly : daily)
      : symbol === 'ETH-USD' && interval === '1mo' ? monthly.slice(0, -2) : [];
    if (!bars.length) return new Response(null, { status: 404 });
    const closes = bars.map(bar => bar.close);
    return Response.json({ chart: { result: [{
      meta: { symbol, currency: 'USD', exchangeTimezoneName: 'UTC' },
      timestamp: bars.map(bar => bar.timestamp),
      indicators: { quote: [{ open: closes, close: closes, high: bars.map(bar => bar.close + bar.wick), low: bars.map(bar => bar.close - bar.wick) }] },
    }] } });
  });

  const started = await breakoutStart(new Request(`${functionsUrl}breakout-start?mode=consolidation-weekly&region=crypto`, { method: 'POST' }));
  assert.equal(started.status, 202);
  const { jobId } = await started.json();
  await breakoutWorker(new Request(`${functionsUrl}breakout-scan-background`, { method: 'POST', body: workerBody }));
  const { status, result } = await (await readJob(jobId)).json();
  assert.equal(status, 'done');
  assert.equal(result.region, 'crypto');
  assert.equal(result.universe, 'Kripto');
  assert.equal(result.timeframe, 'weekly');
  assert.equal(result.checked, 1);
  assert.deepEqual(result.referenceSessions, ['2026-11-15']);
  assert.deepEqual(result.results.map(({ symbol, closes }) => [symbol, closes.at(-1)]), [['BTC-USD', ['2026-11-15', 73]]]);

  const dailyResult = await runScan('consolidation-daily', 'crypto');
  assert.deepEqual(dailyResult.referenceSessions, ['2026-11-21']);
  const monthlyResult = await runScan('consolidation-monthly', 'crypto');
  assert.deepEqual(monthlyResult.referenceSessions, ['2026-10']);
  assert.equal(monthlyResult.checked, 1);
  assert.deepEqual(monthlyResult.results.map(({ symbol, closes }) => [symbol, closes.at(-1)]), [['BTC-USD', ['2026-10', 73]]]);

  t.mock.timers.setTime(monday);
  const closedWeek = await runScan('consolidation-weekly', 'crypto');
  assert.deepEqual(closedWeek.referenceSessions, ['2026-11-22']);
  assert.deepEqual(closedWeek.results, []);
});
