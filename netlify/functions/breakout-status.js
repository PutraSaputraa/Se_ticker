import { getStore } from '@netlify/blobs';

const jobs = () => getStore({ name: 'breakout-jobs', consistency: 'strong' });
const headers = { 'Cache-Control': 'no-store' };

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

    const job = await jobs().get(jobId, { type: 'json' });
    if (!job) {
      return Response.json({ error: 'Job tidak ditemukan atau sudah kedaluwarsa.' }, { status: 404, headers });
    }

    if (job.status === 'done') {
      return Response.json({ status: 'done', result: job.result }, { headers });
    }
    if (job.status === 'error') {
      return Response.json({ status: 'error', error: job.error ?? 'Pemindaian gagal.' }, { headers });
    }
    // pending / running
    return Response.json({ status: job.status }, { headers });
  } catch {
    return Response.json({ error: 'Gagal membaca status pemindaian.' }, { status: 500 });
  }
}
