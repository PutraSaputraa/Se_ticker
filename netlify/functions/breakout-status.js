import { jobHeaders, publicScanJob, scanJobs } from './shared/scanJobs.js';

// Endpoint polling ringan: mengembalikan status job dan hasilnya bila selesai.
export default async function breakoutStatus(request) {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Gunakan metode GET.' }, {
      status: 405,
      headers: { Allow: 'GET' },
    });
  }

  try {
    const jobId = new URL(request.url).searchParams.get('jobId');
    if (!jobId) {
      return Response.json({ error: 'Parameter jobId wajib diisi.' }, { status: 400 });
    }

    const job = await scanJobs().get(jobId, { type: 'json' });
    if (!job) {
      return Response.json({ error: 'Job tidak ditemukan atau sudah kedaluwarsa.' }, { status: 404, headers: jobHeaders });
    }
    return Response.json(publicScanJob(job), { headers: jobHeaders });
  } catch {
    return Response.json({ error: 'Gagal membaca status pemindaian.' }, { status: 500 });
  }
}
