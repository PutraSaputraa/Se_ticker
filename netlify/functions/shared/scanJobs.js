import { getStore } from '@netlify/blobs';

// Allow time to save an outcome before Netlify ends the background invocation.
export const scanJobDurationMs = 14 * 60_000;
export const scanTimeoutMessage = 'Pemindaian terlalu lama. Coba lagi.';
export const jobHeaders = { 'Cache-Control': 'no-store' };

export function scanJobs() {
  return getStore({ name: 'breakout-jobs', consistency: 'strong' });
}

export function publicScanJob(job) {
  const { status, progress } = job;
  if (status === 'done') return { status, progress, result: job.result };
  if (status === 'error') return { status, progress, error: job.error ?? 'Pemindaian gagal.' };
  if (job.deadlineAt && Date.now() > job.deadlineAt + 15_000) {
    if (status === 'stopping') return { status: 'cancelled', progress };
    if (status === 'pending' || status === 'running') {
      return { status: 'error', progress, error: scanTimeoutMessage };
    }
  }
  return { status, progress };
}
