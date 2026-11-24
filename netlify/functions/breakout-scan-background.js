import { runScan } from './shared/scanCore.js';
import { scanJobs, scanJobDurationMs, scanTimeoutMessage } from './shared/scanJobs.js';

const progressIntervalMs = 2_000;

// Worker background: menjalankan scan/riset yang berat (Yahoo + Kenari) tanpa
// dibatasi timeout function sinkron, lalu menulis hasilnya ke Netlify Blobs
// untuk diambil frontend lewat breakout-status.
export default async function breakoutScanBackground(request) {
  const payload = await request.json().catch(() => null);
  const jobId = payload?.jobId;
  if (typeof jobId !== 'string' || !jobId) return;

  const store = scanJobs();
  const pending = await store.getWithMetadata(jobId, { type: 'json' });
  if (pending?.data?.status !== 'pending') return;

  const job = { ...pending.data, status: 'running', startedAt: Date.now() };
  const { modified } = await store.setJSON(jobId, job, { onlyIfMatch: pending.etag });
  if (!modified) return;

  const deadlineAt = job.deadlineAt ?? job.startedAt + scanJobDurationMs;
  const remainingMs = deadlineAt - Date.now();
  const deadline = remainingMs > 0 ? AbortSignal.timeout(remainingMs) : AbortSignal.abort();
  const stop = new AbortController();
  const signal = AbortSignal.any([deadline, stop.signal]);
  let progress = job.progress;
  let publishing;

  async function publishProgress() {
    const current = await store.getWithMetadata(jobId, { type: 'json' });
    if (current?.data?.status !== 'running') {
      stop.abort();
      return;
    }
    if (progress && progress.processed !== current.data.progress?.processed) {
      await store.setJSON(jobId, { ...current.data, progress }, { onlyIfMatch: current.etag });
    }
  }

  const timer = setInterval(() => {
    if (publishing) return;
    publishing = publishProgress()
      .catch(error => console.warn('Gagal memperbarui progres pemindaian', jobId, error.message))
      .finally(() => { publishing = null; });
  }, progressIntervalMs);

  let outcome;
  try {
    const result = await runScan(job.mode, job.region, job.language, {
      signal,
      onProgress: progress ? next => { progress = next; } : undefined,
    });
    outcome = { status: 'done', result };
  } catch (error) {
    if (stop.signal.aborted) {
      outcome = { status: 'cancelled' };
    } else if (deadline.aborted) {
      outcome = { status: 'error', error: scanTimeoutMessage };
    } else {
      console.error('Job breakout gagal', jobId, error.message);
      outcome = { status: 'error', error: 'Pemindaian gagal di server. Coba lagi.' };
    }
  } finally {
    clearInterval(timer);
    await publishing;
  }

  // A stop accepted before this write must win against a late result.
  while (true) {
    const current = await store.getWithMetadata(jobId, { type: 'json' });
    const status = current?.data?.status;
    if (status !== 'running' && status !== 'stopping') return;
    const finalOutcome = status === 'stopping' ? { status: 'cancelled' } : outcome;
    const finished = { ...current.data, ...finalOutcome, progress, finishedAt: Date.now() };
    const { modified: saved } = await store.setJSON(jobId, finished, { onlyIfMatch: current.etag });
    if (saved) return;
  }
}

export const config = {
  background: true,
};
