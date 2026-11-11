import { getStore } from '@netlify/blobs';
import { runScan } from './shared/scanCore.js';

// Worker background: menjalankan scan/riset yang berat (Yahoo + Kenari) tanpa
// dibatasi timeout function sinkron, lalu menulis hasilnya ke Netlify Blobs
// untuk diambil frontend lewat breakout-status.
export default async function breakoutScanBackground(request) {
  const payload = await request.json().catch(() => null);
  const jobId = payload?.jobId;
  if (typeof jobId !== 'string' || !jobId) return;

  const store = getStore({ name: 'breakout-jobs', consistency: 'strong' });
  const pending = await store.getWithMetadata(jobId, { type: 'json' });
  if (pending?.data?.status !== 'pending') return;

  const job = { ...pending.data, status: 'running', startedAt: Date.now() };
  const { modified } = await store.setJSON(jobId, job, { onlyIfMatch: pending.etag });
  if (!modified) return;

  try {
    const result = await runScan(job.mode, job.region);
    await store.setJSON(jobId, {
      ...job,
      status: 'done',
      finishedAt: Date.now(),
      result,
    });
  } catch (error) {
    console.error('Job breakout gagal', jobId, error.message);
    await store.setJSON(jobId, {
      ...job,
      status: 'error',
      finishedAt: Date.now(),
      error: 'Pemindaian gagal di server. Coba lagi.',
    });
  }
}

export const config = {
  background: true,
};
