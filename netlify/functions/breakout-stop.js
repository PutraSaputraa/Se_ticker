import { jobHeaders, publicScanJob, scanJobs } from './shared/scanJobs.js';

export default async function breakoutStop(request) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Gunakan metode POST.' }, {
      status: 405,
      headers: { ...jobHeaders, Allow: 'POST' },
    });
  }

  const jobId = new URL(request.url).searchParams.get('jobId');
  if (!jobId) return Response.json({ error: 'Parameter jobId wajib diisi.' }, { status: 400, headers: jobHeaders });

  try {
    const store = scanJobs();
    while (true) {
      const current = await store.getWithMetadata(jobId, { type: 'json' });
      if (!current) {
        return Response.json({ error: 'Job tidak ditemukan atau sudah kedaluwarsa.' }, { status: 404, headers: jobHeaders });
      }
      const { data, etag } = current;
      const job = publicScanJob(data);
      if (job.status !== 'pending' && job.status !== 'running') {
        return Response.json({ status: job.status, progress: job.progress }, { headers: jobHeaders });
      }
      const updated = job.status === 'pending'
        ? { ...data, status: 'cancelled', finishedAt: Date.now() }
        : { ...data, status: 'stopping' };
      const { modified } = await store.setJSON(jobId, updated, { onlyIfMatch: etag });
      if (modified) return Response.json(publicScanJob(updated), { headers: jobHeaders });
    }
  } catch {
    return Response.json({ error: 'Gagal menghentikan pemindaian. Coba lagi.' }, { status: 500, headers: jobHeaders });
  }
}
