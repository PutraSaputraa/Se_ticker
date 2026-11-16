import { getStore } from '@netlify/blobs';
import { maxScreenshotBytes, screenshotContentTypes } from '../../src/journalScreenshotFile.js';

const methods = ['GET', 'PUT', 'DELETE'];
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
const jpegSignature = Buffer.from('ffd8ff', 'hex');

function errorResponse(status, error, extraHeaders) {
  return Response.json({ error }, { status, headers: { ...headers, ...extraHeaders } });
}

function firebaseConfig() {
  if (process.env.NETLIFY_DEV === 'true' && process.env.VITE_FIREBASE_USE_EMULATORS === 'true') {
    return {
      projectId: 'demo-seticker',
      apiKey: 'demo-api-key',
      origin: 'http://127.0.0.1:9099/identitytoolkit.googleapis.com',
    };
  }
  return {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID?.trim(),
    apiKey: process.env.VITE_FIREBASE_API_KEY?.trim(),
    origin: 'https://identitytoolkit.googleapis.com',
  };
}

async function verifyUser(idToken, { projectId, apiKey, origin }) {
  let claims;
  try {
    claims = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (claims?.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}` ||
    typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128) return null;

  // Firebase memverifikasi token sebelum UID dari respons digunakan untuk mengakses file.
  const url = new URL(`${origin}/v1/accounts:lookup`);
  url.searchParams.set('key', apiKey);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 400 || response.status === 401) return null;
  if (!response.ok) throw new Error('Verifikasi Firebase gagal.');
  const { users } = await response.json();
  const user = users?.[0];
  return user?.localId === claims.sub && !user.disabled ? user.localId : null;
}

function matchesImageFormat(bytes, type) {
  if (type === 'image/png') return bytes.subarray(0, 8).equals(pngSignature);
  if (type === 'image/jpeg') return bytes.subarray(0, 3).equals(jpegSignature);
  return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}

async function saveScreenshot(request, store, key) {
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!screenshotContentTypes.includes(contentType)) {
    return errorResponse(415, 'Pilih gambar dalam format PNG, JPG, atau WebP.');
  }
  const sizeMessage = `Ukuran gambar maksimal ${maxScreenshotBytes / 1_000_000} MB.`;
  if (Number(request.headers.get('content-length')) > maxScreenshotBytes) return errorResponse(413, sizeMessage);
  const body = await request.arrayBuffer();
  if (body.byteLength > maxScreenshotBytes) return errorResponse(413, sizeMessage);
  if (!matchesImageFormat(Buffer.from(body), contentType)) {
    return errorResponse(415, 'Isi file tidak cocok dengan format gambar yang dipilih.');
  }

  const saved = await store.set(key, body, { metadata: { contentType }, onlyIfNew: true });
  if (!saved.modified) return errorResponse(409, 'Screenshot untuk posisi ini sudah ada.');
  return new Response(null, { status: 201, headers });
}

export default async function journalScreenshot(request) {
  if (!methods.includes(request.method)) {
    return errorResponse(405, 'Metode tidak didukung.', { Allow: methods.join(', ') });
  }
  const idToken = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!idToken) return errorResponse(401, 'Silakan masuk untuk mengakses screenshot.');

  const tradeId = new URL(request.url).searchParams.get('tradeId');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(tradeId ?? '')) return errorResponse(400, 'ID posisi tidak valid.');
  const config = firebaseConfig();
  if (!config.apiKey || !config.projectId) return errorResponse(503, 'Layanan screenshot belum dikonfigurasi.');

  try {
    const uid = await verifyUser(idToken, config);
    if (!uid) return errorResponse(401, 'Sesi login tidak valid. Silakan masuk kembali.');
    const store = getStore({ name: 'journal-screenshots', consistency: 'strong' });
    const key = `users/${encodeURIComponent(uid)}/journal/${tradeId}/chart`;

    if (request.method === 'PUT') return await saveScreenshot(request, store, key);
    if (request.method === 'DELETE') {
      await store.delete(key);
      return new Response(null, { status: 204, headers });
    }

    const screenshot = await store.getWithMetadata(key, { type: 'arrayBuffer' });
    if (!screenshot) return errorResponse(404, 'Screenshot chart tidak ditemukan.');
    const { contentType } = screenshot.metadata;
    if (!screenshotContentTypes.includes(contentType)) {
      return errorResponse(415, 'Format screenshot yang tersimpan tidak didukung.');
    }
    return new Response(screenshot.data, {
      headers: { ...headers, 'Content-Type': contentType },
    });
  } catch {
    return errorResponse(503, 'Layanan screenshot sedang tidak tersedia. Coba lagi.');
  }
}
