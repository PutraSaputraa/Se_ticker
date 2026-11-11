import { getStore } from '@netlify/blobs';
import { scanWaitMs } from './shared/scanCore.js';

const dispatchError = 'Pekerja pemindaian belum bisa dimulai. Coba lagi.';

// Memulai job breakout scan/riset secara background dan langsung mengembalikan
// jobId. Frontend kemudian mem-poll breakout-status dengan jobId itu.
export default async function breakoutStart(request) {
  if (request.method !== 'POST' && request.method !== 'GET') {
    return Response.json({ error: 'Gunakan metode POST atau GET.' }, {
      status: 405,
      headers: { Allow: 'GET, POST' },
    });
  }

  try {
    const params = new URL(request.url).searchParams;
    const mode = params.get('mode') === 'research' ? 'research' : 'scan';
    const region = params.get('region') ?? 'auto';

    const jobId = crypto.randomUUID();
    const store = getStore('breakout-jobs');
    const job = { status: 'pending', mode, region, createdAt: Date.now() };
    const { etag } = await store.setJSON(jobId, job);

    try {
      const worker = await fetch(new URL('/.netlify/functions/breakout-scan-background', request.url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
        signal: AbortSignal.timeout(8_000),
      });
      if (worker.status !== 202) throw new Error(`Worker returned HTTP ${worker.status}`);
    } catch (error) {
      console.warn('Gagal mengirim job breakout', jobId, error.message);
      if (etag) {
        await store.setJSON(jobId, { ...job, status: 'error', error: dispatchError }, { onlyIfMatch: etag })
          .catch(() => {});
      }
      return Response.json({ error: dispatchError }, { status: 502 });
    }

    return Response.json({ jobId, status: 'pending', waitMs: scanWaitMs(mode, region) }, {
      status: 202,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Gagal membuat job breakout', error.message);
    return Response.json({ error: 'Gagal memulai pemindaian. Coba lagi.' }, { status: 500 });
  }
}
