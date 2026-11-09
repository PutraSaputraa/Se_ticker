import { getStore } from '@netlify/blobs';

const jobs = () => getStore('breakout-jobs');

// Memulai job breakout scan/riset secara background dan langsung mengembalikan
// jobId. Frontend kemudian mem-poll breakout-status dengan jobId itu.
//
// Pola ini menghindari timeout function sinkron Netlify (~10 detik plan gratis)
// karena pekerjaan berat (scan Yahoo + Kenari) berjalan di background function
// yang punya batas 15 menit.
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
    await jobs().setJSON(jobId, {
      status: 'pending',
      mode,
      region,
      createdAt: Date.now(),
    });

    // Picu background function tanpa menunggu hasilnya (fire-and-forget).
    const origin = new URL(request.url).origin;
    const workerUrl = `${origin}/.netlify/functions/breakout-scan-background`;
    fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, mode, region }),
    }).catch(() => {
      // Abaikan kegagalan pemicu; status tetap 'pending' dan akan kedaluwarsa.
    });

    return Response.json({ jobId, status: 'pending' }, { status: 202 });
  } catch {
    return Response.json({ error: 'Gagal memulai pemindaian. Coba lagi.' }, { status: 500 });
  }
}
