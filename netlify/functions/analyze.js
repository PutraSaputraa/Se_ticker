import {
  latestCompletedIndex,
  readSessions,
} from './shared/sessionLogic.js';
import {
  analyzePivot,
  analyzeVCP,
  evaluateTrendTemplate,
  summarizeStatus,
} from './shared/minervini.js';
import { universeRegions, getUniverse } from './shared/universe.js';

const symbolPattern = /^\^?[A-Z0-9]+(?:[.=-][A-Z0-9]+)*$/;
const fetchTimeoutMs = 8_000;

function errorResponse(error, status) {
  return Response.json({ error }, { status });
}

async function fetchSessions(symbol, range, interval) {
  const query = new URLSearchParams({ range, interval });
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(fetchTimeoutMs),
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  const result = data?.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  if (!Array.isArray(timestamps) || timestamps.length === 0 || !quote) return null;

  const timeZone = result.meta?.exchangeTimezoneName || 'UTC';
  const marketDate = new Intl.DateTimeFormat('sv-SE', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const sessions = readSessions(timestamps, quote, marketDate);
  const index = latestCompletedIndex(sessions, result.meta, marketDate);
  if (index < 0) return null;

  return { result, sessions, index };
}

// Return 12 bulan (252 sesi) untuk perhitungan RS Rating.
function return12m(sessions, index, lookback = 252) {
  const end = sessions[index]?.close;
  const startIdx = Math.max(0, index - lookback);
  const start = sessions[startIdx]?.close;
  if (!Number.isFinite(end) || !Number.isFinite(start) || start <= 0) return null;
  return (end / start - 1) * 100;
}

// RS Rating = persentil return 12 bulan saham ini vs seluruh universe.
async function computeRsRating(symbol, selfSessions, selfIndex) {
  const selfReturn = return12m(selfSessions, selfIndex);
  if (selfReturn === null) return { rating: null, return12m: null };

  // Kumpulkan return 12 bulan semua saham di semua universe sebagai pembanding.
  const allSymbols = universeRegions.flatMap((region) => getUniverse(region).symbols);
  const returns = [];
  let cursor = 0;
  async function worker() {
    while (cursor < allSymbols.length) {
      const sym = allSymbols[cursor];
      cursor += 1;
      if (sym === symbol) continue;
      try {
        const data = await fetchSessions(sym, '1y', '1d');
        if (!data) continue;
        const r = return12m(data.sessions, data.index);
        if (r !== null) returns.push(r);
      } catch {
        // Abaikan simbol gagal.
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));

  if (returns.length === 0) return { rating: null, return12m: selfReturn };
  const below = returns.filter((r) => r <= selfReturn).length;
  const rating = Math.round((below / returns.length) * 100);
  return { rating, return12m: Math.round(selfReturn * 100) / 100, sample: returns.length };
}

export default async function analyze(request) {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Gunakan metode GET.' }, {
      status: 405,
      headers: { Allow: 'GET' },
    });
  }

  const params = new URL(request.url).searchParams;
  const symbol = params.get('symbol')?.trim().toUpperCase() ?? '';
  const includeRs = params.get('rs') !== 'false';

  if (symbol.length > 32 || !symbolPattern.test(symbol)) {
    return errorResponse('Kode ticker kosong atau formatnya tidak valid.', 404);
  }

  try {
    // Butuh ≥1 tahun untuk MA200 + 52w high/low.
    const data = await fetchSessions(symbol, '2y', '1d');
    if (!data) {
      return errorResponse(`Data untuk ${symbol} tidak ditemukan atau tidak lengkap.`, 404);
    }
    const { result, sessions, index } = data;
    const meta = result.meta;
    const session = sessions[index];
    if (![session.open, session.high, session.low, session.close].every(Number.isFinite)) {
      return errorResponse('Data sesi tidak lengkap.', 404);
    }

    // RS Rating (opsional karena butuh fetch banyak simbol).
    const rs = includeRs ? await computeRsRating(symbol, sessions, index) : { rating: null, return12m: null };

    const trend = evaluateTrendTemplate(sessions, index, rs.rating);
    const vcp = analyzeVCP(sessions, index);
    const pivot = analyzePivot(sessions, index, vcp);
    const status = summarizeStatus(trend, vcp, pivot);

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
      currency: meta.currency ?? null,
      date: session.date,
      close: session.close,
      status,
      trendTemplate: {
        passed: trend.passed,
        total: trend.total,
        eligible: trend.eligible,
        rules: trend.rules.map(({ key, label, passed }) => ({ key, label, passed })),
        values: trend.values,
      },
      vcp,
      pivot,
      rs,
    });
  } catch (error) {
    if (error.name === 'TimeoutError') {
      return errorResponse('Yahoo Finance terlalu lama merespons. Coba lagi.', 502);
    }
    return errorResponse('Gagal menganalisis saham. Coba lagi nanti.', 502);
  }
}
