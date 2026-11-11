import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { setEnvironmentContext } from '@netlify/blobs';
import breakoutStart from '../netlify/functions/breakout-start.js';
import breakoutStatus from '../netlify/functions/breakout-status.js';
import breakoutWorker from '../netlify/functions/breakout-scan-background.js';
import { runScan } from '../netlify/functions/shared/scanCore.js';

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
