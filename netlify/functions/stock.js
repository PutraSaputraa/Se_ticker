import {
  calculateBuyTrigger,
  latestCompletedIndex,
  readSessions,
} from './shared/sessionLogic.js';
import { analyzeBaseBreakout } from './shared/breakoutLogic.js';

const symbolPattern = /^\^?[A-Z0-9]+(?:[.=-][A-Z0-9]+)*$/;

// Range grafik yang bisa dipilih user: jumlah sesi ke belakang + interval Yahoo.
const chartRanges = {
  '1m': { lookback: 22, interval: '1d', label: '1 bulan' },
  '2m': { lookback: 44, interval: '1d', label: '2 bulan' },
  '3m': { lookback: 66, interval: '1d', label: '3 bulan' },
  '6m': { lookback: 130, interval: '1d', label: '6 bulan' },
  '1y': { lookback: 52, interval: '1wk', range: '2y', label: '1 tahun' },
  '2y': { lookback: 104, interval: '1wk', range: '5y', label: '2 tahun' },
};
const defaultRangeKey = '3m';

function errorResponse(error, status, code) {
  return Response.json({ error, code }, { status });
}

// Ambil sesi harian penuh (untuk analisis trigger, resistance, volume).
async function fetchSessions(symbol, range, interval) {
  const query = new URLSearchParams({ range, interval });
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 404) return { notFound: true };
  if (!response.ok) return { failed: true };

  const data = await response.json().catch(() => null);
  const chart = data?.chart;
  if (chart?.error?.code === 'Not Found') return { notFound: true };
  if (!chart || chart.error) return { failed: true };

  const result = chart.result?.[0];
  const timestamps = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  if (!Array.isArray(timestamps) || timestamps.length === 0 || !quote) return { noData: true };

  const timeZone = result.meta?.exchangeTimezoneName || 'UTC';
  const marketDate = new Intl.DateTimeFormat('sv-SE', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const sessions = readSessions(timestamps, quote, marketDate);
  const index = latestCompletedIndex(sessions, result.meta, marketDate);
  if (index < 0) return { noData: true };

  return { result, sessions, index };
}

// Fundamental: EPS & Revenue tahunan + kuartalan (best effort dari Yahoo).
async function fetchFundamentals(symbol) {
  const url = `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?lang=en-US&region=US&padTimeSeries=true&type=quarterlyDilutedEPS,quarterlyTotalRevenue,annualDilutedEPS,annualTotalRevenue&merge=false&period1=1609459200&period2=4102444800`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    const series = data?.timeseries?.result;
    if (!Array.isArray(series)) return null;

    const collect = (key) => {
      const entry = series.find((item) => Array.isArray(item?.[key]) && item[key].length > 0);
      if (!entry) return [];
      return entry[key]
        .map((point) => ({
          date: point?.asOfDate ?? null,
          value: Number.isFinite(point?.reportedValue?.raw) ? point.reportedValue.raw : null,
        }))
        .filter((point) => point.date && point.value !== null);
    };

    const quarterlyEps = collect('quarterlyDilutedEPS');
    const quarterlyRevenue = collect('quarterlyTotalRevenue');
    const annualEps = collect('annualDilutedEPS');
    const annualRevenue = collect('annualTotalRevenue');
    if (!quarterlyEps.length && !annualRevenue.length) return null;

    return { quarterlyEps, quarterlyRevenue, annualEps, annualRevenue };
  } catch {
    return null;
  }
}

// Analisis turunan: status breakout, target, risiko, potensi.
function buildAnalysis(sessions, index, buyTrigger, base) {
  const session = sessions[index];
  const close = session.close;
  const level = buyTrigger?.level ?? null;
  const trueRange = buyTrigger?.trueRange ?? null;
  const resistance = base?.resistance ?? null;

  // Status breakout relatif ke resistance 50 hari (base) dan level trigger.
  let status = 'menunggu';
  if (base?.breaksResistance && base?.tight) status = 'breakout';
  else if (base?.breaksResistance) status = 'menembus-tanpa-base';
  else if (Number.isFinite(resistance) && Number.isFinite(close) && resistance > 0) {
    const gap = (resistance - close) / resistance;
    if (gap <= 0.03) status = 'mendekati';
  }

  // Target: proyeksi 2x TrueRange di atas level buy; fallback ke resistance+ATR.
  const target = Number.isFinite(level) && Number.isFinite(trueRange)
    ? level + 2 * trueRange
    : null;

  // Risiko: jarak close ke level sell trigger (stop), dalam % dari close.
  const stop = buyTrigger?.sellLevel ?? null;
  const riskPct = Number.isFinite(close) && Number.isFinite(stop) && close > 0
    ? Math.round(((close - stop) / close) * 10000) / 100
    : null;

  // Potensi: jarak close ke target, dalam %.
  const potentialPct = Number.isFinite(close) && Number.isFinite(target) && close > 0
    ? Math.round(((target - close) / close) * 10000) / 100
    : null;

  return {
    status,
    target: target === null ? null : Math.round(target * 100) / 100,
    stop: stop === null ? null : Math.round(stop * 100) / 100,
    riskPct,
    potentialPct,
    resistance50: resistance,
    baseTightPct: base?.tightPct ?? null,
    breakoutVolumeRatio: base?.volumeRatio ?? null,
  };
}

export default async function stock(request) {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Gunakan metode GET.' }, {
      status: 405,
      headers: { Allow: 'GET' },
    });
  }

  const params = new URL(request.url).searchParams;
  const symbol = params.get('symbol')?.trim().toUpperCase() ?? '';
  const requestedRange = params.get('range');
  const rangeKey = Object.hasOwn(chartRanges, requestedRange) ? requestedRange : defaultRangeKey;
  const rangeCfg = chartRanges[rangeKey];

  if (symbol.length > 32 || !symbolPattern.test(symbol)) {
    return errorResponse('Kode ticker kosong atau formatnya tidak valid.', 404);
  }

  const notFound = `Ticker ${symbol} tidak ditemukan di Yahoo Finance.`;
  const noData = `Data sesi yang sudah tutup untuk ${symbol} belum tersedia.`;

  try {
    // Sesi harian 1 tahun untuk analisis trigger + resistance + volume.
    const daily = await fetchSessions(symbol, '1y', '1d');
    if (daily.notFound) return errorResponse(notFound, 404, 'TICKER_NOT_FOUND');
    if (daily.failed) return errorResponse('Yahoo Finance gagal menyediakan data. Coba lagi nanti.', 502);
    if (daily.noData) return errorResponse(noData, 404);

    const { result, sessions, index } = daily;
    const meta = result.meta;
    const session = sessions[index];
    if (typeof meta?.currency !== 'string' || !meta.currency.trim()) {
      return errorResponse('Yahoo Finance tidak memberikan mata uang untuk ticker ini.', 502);
    }

    const buyTrigger = calculateBuyTrigger(sessions, index);
    const base = analyzeBaseBreakout(sessions, index);
    const analysis = buildAnalysis(sessions, index, buyTrigger, base);

    // Grafik harian memakai data acuan yang sama. Grafik mingguan perlu data terpisah.
    let chartSessions = sessions;
    let chartIndex = index;
    if (rangeCfg.interval !== '1d') {
      const chartData = await fetchSessions(symbol, rangeCfg.range, rangeCfg.interval);
      if (!chartData.sessions) {
        return errorResponse(`Riwayat harga mingguan untuk ${symbol} belum tersedia.`, chartData.failed ? 502 : 404);
      }
      chartSessions = chartData.sessions;
      chartIndex = chartData.index;
    }
    const priceHistory = chartSessions
      .slice(Math.max(0, chartIndex + 1 - rangeCfg.lookback), chartIndex + 1)
      .filter(({ open, high, low, close }) => [open, high, low, close].every(Number.isFinite)
        && high >= Math.max(open, close) && low <= Math.min(open, close))
      .map(({ date, open, high, low, close, volume }) => ({ date, open, high, low, close, volume }));

    // OHLCV beberapa sesi terakhir untuk tabel harian.
    const recentBars = sessions
      .slice(Math.max(0, index - 6), index + 1)
      .reverse()
      .map(({ date, open, high, low, close, volume }) => ({ date, open, high, low, close, volume }));

    const fundamentals = await fetchFundamentals(symbol);

    const name = [meta.longName, meta.shortName, symbol].find(
      (value) => typeof value === 'string' && value.trim(),
    );
    const exchange = [meta.fullExchangeName, meta.exchangeName].find(
      (value) => typeof value === 'string' && value.trim(),
    );

    return Response.json({
      symbol: typeof meta.symbol === 'string' && meta.symbol.trim() ? meta.symbol : symbol,
      name,
      exchange: exchange ?? null,
      ...session,
      currency: meta.currency,
      buyTrigger,
      analysis,
      priceHistory,
      recentBars,
      range: rangeKey,
      rangeLabel: rangeCfg.label,
      availableRanges: Object.entries(chartRanges).map(([value, cfg]) => ({ value, label: cfg.label })),
      fundamentals,
    });
  } catch (error) {
    if (error.name === 'TimeoutError') {
      return errorResponse('Yahoo Finance terlalu lama merespons. Coba lagi.', 502);
    }
    return errorResponse('Gagal mengambil data dari Yahoo Finance. Coba lagi nanti.', 502);
  }
}
