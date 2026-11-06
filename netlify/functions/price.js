const symbolPattern = /^\^?[A-Z0-9]+(?:[.=-][A-Z0-9]+)*$/;
const dayMilliseconds = 86_400_000;
const historyDays = 180;
const volumeLookback = 50;
const chartLookback = 20;
const pastDateError = 'Pilih tanggal sebelum hari ini di zona waktu bursa.';

function errorResponse(error, status) {
  return Response.json({ error }, { status });
}

function readSessions(timestamps, quote, marketDate) {
  const sessions = new Map();

  for (const [index, timestamp] of timestamps.entries()) {
    if (!Number.isFinite(timestamp)) continue;
    const date = marketDate.format(timestamp * 1000);

    // Yahoo dapat menambahkan snapshot pada tanggal yang sudah punya bar harian.
    if (sessions.has(date)) continue;
    const volume = quote.volume?.[index];
    sessions.set(date, {
      date,
      open: quote.open?.[index],
      high: quote.high?.[index],
      low: quote.low?.[index],
      close: quote.close?.[index],
      volume: Number.isSafeInteger(volume) && volume >= 0 ? volume : null,
    });
  }

  return [...sessions.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function latestCompletedIndex(sessions, meta, marketDate) {
  const now = Date.now();
  const today = marketDate.format(now);
  const regularEnd = meta?.currentTradingPeriod?.regular?.end;
  const lastTrade = meta?.regularMarketTime;

  // Jadwal tutup dan waktu kuotasi harus mencakup akhir sesi hari ini.
  const todayClosed = Number.isFinite(regularEnd)
    && Number.isFinite(lastTrade)
    && now >= regularEnd * 1000
    && lastTrade >= regularEnd
    && marketDate.format(regularEnd * 1000) === today;

  return sessions.findLastIndex(({ date }) => date < today || (todayClosed && date === today));
}

function calculateBuyTrigger(sessions, index) {
  const session = sessions[index];
  const previous = sessions[index - 1];
  const previousClose = Number.isFinite(previous?.close) ? previous.close : null;
  const trueRange = previousClose === null
    ? null
    : Math.max(
      session.high - session.low,
      Math.abs(session.high - previousClose),
      Math.abs(session.low - previousClose),
    );
  const triggerDistance = trueRange === null ? null : 0.4 * trueRange;

  // Ambil 50 sesi yang mendahului kedua sesi yang diuji.
  const baselineEnd = index - 1;
  const baselineStart = baselineEnd - volumeLookback;
  const baseline = baselineStart >= 0 ? sessions.slice(baselineStart, baselineEnd) : [];
  const volumeSum = baseline.length === volumeLookback && baseline.every(({ volume }) => volume !== null)
    ? baseline.reduce((sum, { volume }) => sum + volume, 0)
    : null;
  const averageVolume = volumeSum === null ? null : volumeSum / volumeLookback;
  // Gunakan 14/10 agar ambang minimum lembar tidak bergeser karena pembulatan 1,4.
  const minimumVolume = volumeSum === null ? null : Math.ceil(volumeSum * 14 / (volumeLookback * 10));

  return {
    trueRange,
    level: triggerDistance === null ? null : session.close + triggerDistance,
    sellLevel: triggerDistance === null ? null : session.close - triggerDistance,
    previousClose,
    averageVolume,
    minimumVolume,
    volumeChecks: [session, previous].map((day) => {
      const volume = day?.volume ?? null;
      return {
        date: day?.date ?? null,
        volume,
        meetsThreshold: volume === null || minimumVolume === null ? null : volume >= minimumVolume,
      };
    }),
  };
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

  let period = { range: '6mo' };
  if (requestedDate) {
    const dateStart = Date.parse(`${requestedDate}T00:00:00Z`);
    if (!Number.isFinite(dateStart) || new Date(dateStart).toISOString().slice(0, 10) !== requestedDate) {
      return errorResponse('Tanggal tidak valid. Gunakan format YYYY-MM-DD.', 400);
    }
    if (dateStart - dayMilliseconds > Date.now()) {
      return errorResponse(pastDateError, 400);
    }

    // Ambil riwayat untuk baseline dan beri ruang untuk perbedaan zona waktu.
    period = {
      period1: (dateStart - historyDays * dayMilliseconds) / 1000,
      period2: (dateStart + 2 * dayMilliseconds) / 1000,
    };
  }

  const notFound = requestedDate
    ? `Ticker ${symbol} atau data untuk tanggal yang dipilih tidak ditemukan di Yahoo Finance.`
    : `Ticker ${symbol} tidak ditemukan di Yahoo Finance.`;
  const noData = requestedDate
    ? `Data perdagangan untuk ${symbol} pada tanggal yang dipilih belum tersedia atau tidak lengkap.`
    : `Data sesi yang sudah tutup untuk ${symbol} belum tersedia atau tidak lengkap.`;
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

    const sessions = readSessions(timestamps, quote, marketDate);
    const index = requestedDate
      ? sessions.findIndex(({ date }) => date === requestedDate)
      : latestCompletedIndex(sessions, meta, marketDate);
    if (index < 0) return errorResponse(noData, 404);

    const session = sessions[index];
    const { open, high, low, close } = session;
    if (![open, high, low, close].every(Number.isFinite)) {
      return errorResponse(noData, 404);
    }

    if (typeof meta?.currency !== 'string' || !meta.currency.trim()) {
      return errorResponse('Yahoo Finance tidak memberikan mata uang untuk ticker ini.', 502);
    }

    const name = [meta.longName, meta.shortName, symbol].find(
      (value) => typeof value === 'string' && value.trim(),
    );
    const exchange = [meta.fullExchangeName, meta.exchangeName].find(
      (value) => typeof value === 'string' && value.trim(),
    );
    const priceHistory = sessions
      .slice(Math.max(0, index + 1 - chartLookback), index + 1)
      .filter(({ open, high, low, close }) => [open, high, low, close].every(Number.isFinite)
        && high >= Math.max(open, close) && low <= Math.min(open, close))
      .map(({ date, open, high, low, close, volume }) => ({ date, open, high, low, close, volume }));

    return Response.json({
      symbol: typeof meta.symbol === 'string' && meta.symbol.trim() ? meta.symbol : symbol,
      name,
      exchange: exchange ?? null,
      ...session,
      currency: meta.currency,
      buyTrigger: calculateBuyTrigger(sessions, index),
      priceHistory,
    });
  } catch (error) {
    if (error.name === 'TimeoutError') {
      return errorResponse('Yahoo Finance terlalu lama merespons. Coba lagi.', 502);
    }

    return errorResponse('Gagal mengambil data harga dari Yahoo Finance. Coba lagi nanti.', 502);
  }
}
