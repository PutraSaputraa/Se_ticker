import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setEnvironmentContext } from '@netlify/blobs';
import journalScreenshot from '../netlify/functions/journal-screenshot.js';
import watchlistImage from '../netlify/functions/watchlist-image.js';
import { maxImageBytes } from '../src/imageFile.js';

const projectId = 'test-seticker';
process.env.VITE_FIREBASE_PROJECT_ID = projectId;
process.env.VITE_FIREBASE_API_KEY = 'test-key';
process.env.NETLIFY_DEV = 'false';

setEnvironmentContext({
  siteID: 'test-site',
  token: 'test-blobs-token',
  edgeURL: 'https://cached-blobs.example',
  uncachedEdgeURL: 'https://strong-blobs.example',
});

function token(uid, project = projectId) {
  const claims = { sub: uid, aud: project, iss: `https://securetoken.google.com/${project}` };
  return `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fixture`;
}

const ownerToken = token('owner');
const otherToken = token('other');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X0xQAAAAASUVORK5CYII=',
  'base64',
);

function requestImage(handler, path) {
  return (method, idToken, body, contentType = 'image/png') => {
    const headers = idToken ? { Authorization: `Bearer ${idToken}` } : {};
    if (body) headers['Content-Type'] = contentType;
    return handler(new Request(`https://test.example/.netlify/functions/${path}&uid=owner`, { method, headers, body }));
  };
}

const request = requestImage(journalScreenshot, 'journal-screenshot?tradeId=trade-1');
const requestWatchlist = requestImage(watchlistImage, 'watchlist-image?imageId=trade-1');

test('gambar jurnal dan pantauan memakai UID Firebase serta penyimpanan terpisah', async (t) => {
  const blobs = new Map();
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(input);
    if (url.hostname === 'identitytoolkit.googleapis.com') {
      assert.equal(url.pathname, '/v1/accounts:lookup');
      assert.equal(url.searchParams.get('key'), 'test-key');
      const { idToken } = JSON.parse(init.body);
      if (idToken === ownerToken) return Response.json({ users: [{ localId: 'owner' }] });
      if (idToken === otherToken) return Response.json({ users: [{ localId: 'other' }] });
      return Response.json({ error: { message: 'INVALID_ID_TOKEN' } }, { status: 400 });
    }

    const key = decodeURIComponent(url.pathname);
    const requestHeaders = new Headers(init.headers);
    if (init.method.toUpperCase() === 'GET') {
      assert.equal(url.hostname, 'strong-blobs.example');
      const stored = blobs.get(key);
      return stored ? new Response(stored.body, { headers: stored.headers }) : new Response(null, { status: 404 });
    }
    if (init.method.toUpperCase() === 'DELETE') {
      blobs.delete(key);
      return new Response(null, { status: 204 });
    }

    assert.equal(init.method.toUpperCase(), 'PUT');
    assert.equal(requestHeaders.get('if-none-match'), '*');
    if (blobs.has(key)) return new Response(null, { status: 412 });
    const metadata = requestHeaders.get('netlify-blobs-metadata') ?? requestHeaders.get('x-amz-meta-user');
    assert.ok(metadata);
    blobs.set(key, {
      body: init.body,
      headers: {
        'netlify-blobs-metadata': metadata,
        etag: '"test-image"',
      },
    });
    return new Response(null, { headers: { etag: '"test-image"' } });
  });

  assert.equal((await request('PUT', undefined, png)).status, 401);
  assert.equal((await request('PUT', token('owner', 'other-project'), png)).status, 401);
  assert.equal((await request('PUT', ownerToken + 'invalid', png)).status, 401);
  assert.equal((await request('PUT', ownerToken, png, 'image/svg+xml')).status, 415);
  assert.equal((await request('PUT', ownerToken, Buffer.from('not an image'))).status, 415);
  assert.equal((await request('PUT', ownerToken, new Uint8Array(maxImageBytes + 1))).status, 413);
  assert.equal(blobs.size, 0);
  assert.equal((await request('PUT', ownerToken, png)).status, 201);
  assert.equal((await request('PUT', ownerToken, png)).status, 409);
  assert.equal((await requestWatchlist('PUT', ownerToken, png)).status, 201);
  assert.equal(blobs.size, 2);
  assert.equal((await requestWatchlist('GET')).status, 401);
  assert.equal((await requestWatchlist('GET', otherToken)).status, 404);
  assert.equal((await requestWatchlist('DELETE', otherToken)).status, 204);
  const image = await requestWatchlist('GET', ownerToken);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  assert.equal((await request('GET')).status, 401);
  assert.equal((await request('GET', otherToken)).status, 404);
  assert.equal((await request('DELETE', otherToken)).status, 204);
  const response = await request('GET', ownerToken);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  assert.equal((await request('DELETE', ownerToken)).status, 204);
  assert.equal((await request('GET', ownerToken)).status, 404);
  assert.equal((await requestWatchlist('GET', ownerToken)).status, 200);
  assert.equal((await requestWatchlist('DELETE', ownerToken)).status, 204);
  assert.equal((await requestWatchlist('GET', ownerToken)).status, 404);
});
