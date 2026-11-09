import { runScan } from './shared/scanCore.js';

const scanError = 'Pemindaian breakout gagal. Coba lagi nanti.';

// Endpoint sinkron lama — dipertahankan untuk kompatibilitas, tapi berisiko
// timeout di Netlify untuk mode 'research' atau region 'auto' yang berat.
// Alur utama sekarang: breakout-start (mulai job) + breakout-status (poll).
export default async function breakoutScan(request) {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Gunakan metode GET.' }, {
      status: 405,
      headers: { Allow: 'GET' },
    });
  }

  try {
    const params = new URL(request.url).searchParams;
    const mode = params.get('mode') === 'research' ? 'research' : 'scan';
    const region = params.get('region') ?? 'auto';
    const result = await runScan(mode, region);
    return Response.json(result);
  } catch {
    return Response.json({ error: scanError }, { status: 502 });
  }
}
