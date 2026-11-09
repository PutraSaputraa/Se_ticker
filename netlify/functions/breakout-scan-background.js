import { getStore } from '@netlify/blobs';
import { runScan } from './shared/scanCore.js';

const jobs = () => getStore('breakout-jobs');

// Worker background: menjalankan scan/riset yang berat (Yahoo + Kenari) tanpa
// dibatasi timeout function sinkron, lalu menulis hasilnya ke Netlify Blobs
// untuk diambil frontend lewat breakout-status.
export default async function breakoutScanBackground(request) {
  let payload = {};
  try {
    payload = await request.json().catch(() => ({}));
  } catch {
    payload = {};
  }
  const { jobId, mode = 'scan', region = 'auto' } = payload;
  if (!jobId) return;

  try {
    await jobs().setJSON(jobId, { status: 'running', mode, region, startedAt: Date.now() });
    const result = await runScan(mode, region);
    await jobs().setJSON(jobId, {
      status: 'done',
      mode,
      region,
      finishedAt: Date.now(),
      result,
    });
  } catch (error) {
    await jobs().setJSON(jobId, {
      status: 'error',
      mode,
      region,
      finishedAt: Date.now(),
      error: 'Pemindaian gagal di server. Coba lagi.',
    });
  }
}

export const config = {
  background: true,
};
