const symbolPattern = /^\^?[A-Z0-9]+(?:[.=-][A-Z0-9]+)*$/;
const dayMilliseconds = 86_400_000;
const pastDateError = 'Pilih tanggal sebelum hari ini di zona waktu bursa.';

function errorResponse(error, status) {
  return Response.json({ error }, { status });
}

export default async function price(request) {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Gunakan metode GET.' }, {
      status: 405,
      headers: { Allow: 'GET' },
    });
  }

  const params = new URL(request.url).searchParams;
  const symbol = params.get('symbol')?.trim().toUpperCase() ?? '';
  const requestedDate = params.get('date');

  if (symbol.length > 32 || !symbolPattern.test(symbol)) {
    return errorResponse('Kode ticker kosong atau formatnya tidak valid.', 404);
  }

  let period = { range: '5d' };
  if (requestedDate) {
    const dateStart = Date.parse(`${requestedDate}T00:00:00Z`);
    if (!Number.isFinite(dateStart) || new Date(dateStart).toISOString().slice(0, 10) !== requestedDate) {
      return errorResponse('Tanggal tidak valid. Gunakan format YYYY-MM-DD.', 400);
    }
    if (dateStart - dayMilliseconds > Date.now()) {
      return errorResponse(pastDateError, 400);
    }

    // Beri ruang di kedua sisi karena batas hari UTC dan bursa bisa berbeda.
    period = {
      period1: (dateStart - dayMilliseconds) / 1000,
      period2: (dateStart + 2 * dayMilliseconds) / 1000,
    };
  }

  const notFound = requestedDate
    ? `Ticker ${symbol} atau data untuk tanggal yang dipilih tidak ditemukan di Yahoo Finance.`
    : `Ticker ${symbol} tidak ditemukan di Yahoo Finance.`;
  const noData = requestedDate
    ? `Data perdagangan untuk ${symbol} pada tanggal yang dipilih belum tersedia atau tidak lengkap.`
    : `Data sesi sebelumnya untuk ${symbol} belum tersedia atau tidak lengkap.`;
  const query = new URLSearchParams({ ...period, interval: '1d' });
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8_000),
    });

    if (response.status === 404) return errorResponse(notFound, 404);
    if (!response.ok) {
      return errorResponse('Yahoo Finance gagal menyediakan data. Coba lagi nanti.', 502);
    }

    const data = await response.json();
    const chart = data?.chart;
    if (chart?.error?.code === 'Not Found') return errorResponse(notFound, 404);
    if (!chart || chart.error) {
      return errorResponse('Respons dari Yahoo Finance tidak dapat diproses.', 502);
    }

    const result = chart.result?.[0];
    const timestamps = result?.timestamp;
    const quote = result?.indicators?.quote?.[0];
    if (!Array.isArray(timestamps) || timestamps.length === 0 || !quote) {
      return errorResponse(noData, 404);
    }

    const meta = result.meta;
    const timeZone = meta?.exchangeTimezoneName;
    if (requestedDate && !timeZone) {
      return errorResponse('Yahoo Finance tidak memberikan zona waktu bursa untuk ticker ini.', 502);
    }

    const marketDate = new Intl.DateTimeFormat('sv-SE', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    if (requestedDate && requestedDate >= marketDate.format(Date.now())) {
      return errorResponse(pastDateError, 400);
    }

    // Tanpa tanggal, lewati bar terbaru karena sesi mungkin masih berlangsung.
    const index = requestedDate
      ? timestamps.findIndex((timestamp) => (
        Number.isFinite(timestamp) && marketDate.format(timestamp * 1000) === requestedDate
      ))
      : timestamps.length - 2;
    if (index < 0) return errorResponse(noData, 404);

    const timestamp = timestamps[index];
    const open = quote.open?.[index];
    const high = quote.high?.[index];
    const low = quote.low?.[index];
    const close = quote.close?.[index];
    if (![timestamp, open, high, low, close].every(Number.isFinite)) {
      return errorResponse(noData, 404);
    }

    if (typeof meta?.currency !== 'string' || !meta.currency.trim()) {
      return errorResponse('Yahoo Finance tidak memberikan mata uang untuk ticker ini.', 502);
    }

    const name = [meta.longName, meta.shortName, symbol].find(
      (value) => typeof value === 'string' && value.trim(),
    );

    return Response.json({
      symbol: typeof meta.symbol === 'string' && meta.symbol.trim() ? meta.symbol : symbol,
      name,
      date: marketDate.format(timestamp * 1000),
      open,
      high,
      low,
      close,
      currency: meta.currency,
    });
  } catch (error) {
    if (error.name === 'TimeoutError') {
      return errorResponse('Yahoo Finance terlalu lama merespons. Coba lagi.', 502);
    }

    return errorResponse('Gagal mengambil data harga dari Yahoo Finance. Coba lagi nanti.', 502);
  }
}
