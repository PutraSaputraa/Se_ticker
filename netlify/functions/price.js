const symbolPattern = /^\^?[A-Z0-9]+(?:[.=-][A-Z0-9]+)*$/;

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

  if (symbol.length > 32 || !symbolPattern.test(symbol)) {
    return errorResponse('Kode ticker kosong atau formatnya tidak valid.', 404);
  }

  const notFound = `Ticker ${symbol} tidak ditemukan di Yahoo Finance.`;
  const noData = `Data sesi sebelumnya untuk ${symbol} belum tersedia atau tidak lengkap.`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;

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
    if (!Array.isArray(timestamps) || timestamps.length < 2 || !quote) {
      return errorResponse(noData, 404);
    }

    // Lewati bar terbaru karena sesi perdagangan mungkin masih berlangsung.
    const index = timestamps.length - 2;
    const timestamp = timestamps[index];
    const open = quote.open?.[index];
    const high = quote.high?.[index];
    const low = quote.low?.[index];
    const close = quote.close?.[index];
    if (![timestamp, open, high, low, close].every(Number.isFinite)) {
      return errorResponse(noData, 404);
    }

    const meta = result.meta;
    if (typeof meta?.currency !== 'string' || !meta.currency.trim()) {
      return errorResponse('Yahoo Finance tidak memberikan mata uang untuk ticker ini.', 502);
    }

    // Format YYYY-MM-DD di zona waktu bursa.
    const date = new Intl.DateTimeFormat('sv-SE', {
      timeZone: meta.exchangeTimezoneName || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(timestamp * 1000);

    const name = [meta.longName, meta.shortName, symbol].find(
      (value) => typeof value === 'string' && value.trim(),
    );

    return Response.json({
      symbol: typeof meta.symbol === 'string' && meta.symbol.trim() ? meta.symbol : symbol,
      name,
      date,
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
