import {
  calculateBuyTrigger,
  dayMilliseconds,
  latestCompletedIndex,
  readSessions,
} from './shared/sessionLogic.js';

const symbolPattern = /^\^?[A-Z0-9]+(?:[.=-][A-Z0-9]+)*$/;
const historyDays = 180;
const pastDateError = 'Pilih tanggal sebelum hari ini di zona waktu bursa.';

// Konfigurasi per timeframe grafik: berapa sesi ke belakang diambil dan
// interval Yahoo yang dipakai. Lookback diperbesar agar grafik bisa lebar.
const chartConfigs = {
  '1d': { lookback: 60, interval: '1d', range: '6mo' },
  '1wk': { lookback: 52, interval: '1wk', range: '5y' },
};
const defaultChartConfig = chartConfigs['1d'];

function errorResponse(error, status) {
  return Response.json({ error }, { status });
}

function journalQuote(symbol, requestedDate, result, marketDate) {
  const today = marketDate.format(Date.now());
  if (requestedDate && requestedDate > today) {
    return errorResponse('Tanggal masuk belum tiba di zona waktu bursa.', 400);
  }

  const meta = result.meta;
  const currency = typeof meta.currency === 'string' ? meta.currency.trim() : '';
  if (!currency) {
    return errorResponse('Yahoo Finance tidak memberikan mata uang untuk ticker ini.', 502);
  }

  let price;
  let date;
  let timestamp = null;
  if (requestedDate && requestedDate < today) {
    const quote = result.indicators?.quote?.[0];
    const sessions = Array.isArray(result.timestamp) && quote
      ? readSessions(result.timestamp, quote, marketDate)
      : [];
    price = sessions.find((session) => session.date === requestedDate)?.close;
    date = requestedDate;
  } else if (Number.isSafeInteger(meta.regularMarketTime) && meta.regularMarketTime > 0) {
    timestamp = meta.regularMarketTime;
    price = meta.regularMarketPrice;
    date = marketDate.format(timestamp * 1000);
  }

  if (!Number.isFinite(price) || price <= 0 || !date || date > today || (requestedDate && date !== requestedDate)) {
    const detail = requestedDate ? ` pada ${requestedDate}` : '';
    return errorResponse(`Harga ${symbol}${detail} belum tersedia. Periksa tanggal perdagangan atau coba lagi.`, 404);
  }

  return Response.json({ date, price, currency, timestamp }, { headers: { 'Cache-Control': 'no-store' } });
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
  const journal = params.get('mode') === 'journal';
  const chartParam = params.get('chart');
  const chartConfig = chartConfigs[chartParam] ?? defaultChartConfig;

  if (symbol.length > 32 || !symbolPattern.test(symbol)) {
    return errorResponse('Kode ticker kosong atau formatnya tidak valid.', 404);
  }

  let period = { range: journal ? '5d' : chartConfig.range };
  if (requestedDate) {
    const dateStart = Date.parse(`${requestedDate}T00:00:00Z`);
    if (!Number.isFinite(dateStart) || new Date(dateStart).toISOString().slice(0, 10) !== requestedDate) {
      return errorResponse('Tanggal tidak valid. Gunakan format YYYY-MM-DD.', 400);
    }
    if (dateStart - dayMilliseconds > Date.now()) {
      return errorResponse(pastDateError, 400);
    }

    // Jurnal cukup mengambil harga tanggal yang dipilih. Cek harga perlu riwayat untuk baseline.
    period = {
      period1: (dateStart - (journal ? 1 : historyDays) * dayMilliseconds) / 1000,
      period2: (dateStart + 2 * dayMilliseconds) / 1000,
    };
  }

  const notFound = requestedDate
    ? `Ticker ${symbol} atau data untuk tanggal yang dipilih tidak ditemukan di Yahoo Finance.`
    : `Ticker ${symbol} tidak ditemukan di Yahoo Finance.`;
  const noData = requestedDate
    ? `Data perdagangan untuk ${symbol} pada tanggal yang dipilih belum tersedia atau tidak lengkap.`
    : `Data sesi yang sudah tutup untuk ${symbol} belum tersedia atau tidak lengkap.`;
  const query = new URLSearchParams({ ...period, interval: journal ? '1d' : chartConfig.interval });
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
    if (!result || (!journal && (!Array.isArray(timestamps) || timestamps.length === 0 || !quote))) {
      return errorResponse(noData, 404);
    }

    const meta = result.meta;
    const timeZone = meta?.exchangeTimezoneName;
    if ((requestedDate || journal) && !timeZone) {
      return errorResponse('Yahoo Finance tidak memberikan zona waktu bursa untuk ticker ini.', 502);
    }

    const marketDate = new Intl.DateTimeFormat('sv-SE', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    if (journal) return journalQuote(symbol, requestedDate, result, marketDate);

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
      .slice(Math.max(0, index + 1 - chartConfig.lookback), index + 1)
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
