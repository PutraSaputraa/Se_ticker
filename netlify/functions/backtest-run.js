import { latestCompletedIndex, readSessions } from './shared/sessionLogic.js';
import { runBacktest, backtestDefaults } from './shared/backtest.js';
import { getUniverse, universeRegions } from './shared/universe.js';

const fetchTimeoutMs = 8_000;
const fetchConcurrency = 4;
const maxSymbols = 12; // batasi agar respons tidak terlalu lama

function errorResponse(error, status) {
  return Response.json({ error }, { status });
}

async function fetchSessions(symbol) {
  const query = new URLSearchParams({ range: '2y', interval: '1d' });
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
  if (sessions.length < 60) return null;
  return { sessions, name: result.meta?.longName ?? result.meta?.shortName ?? symbol };
}

function combineTrades(perSymbol) {
  const all = perSymbol.flatMap((entry) =>
    entry.result.trades.map((trade) => ({ ...trade, symbol: entry.symbol })),
  );
  // Urutkan berdasarkan tanggal exit untuk kurva gabungan.
  all.sort((a, b) => a.exitDate.localeCompare(b.exitDate));

  let equity = backtestDefaults.initialEquity;
  const curve = all.map((trade) => {
    const tradeReturn = (backtestDefaults.riskPerTrade / 100) * (trade.returnPct / backtestDefaults.stopPct);
    equity *= (1 + tradeReturn);
    return { date: trade.exitDate, equity: Math.round(equity * 100) / 100 };
  });

  const wins = all.filter((t) => t.returnPct > 0);
  const losses = all.filter((t) => t.returnPct <= 0);
  const avg = (arr) => (arr.length ? arr.reduce((s, t) => s + t.returnPct, 0) / arr.length : 0);
  const winRate = all.length ? (wins.length / all.length) * 100 : 0;
  const avgWin = avg(wins);
  const avgLoss = Math.abs(avg(losses));
  const pw = all.length ? wins.length / all.length : 0;
  const pl = 1 - pw;
  const expectancyRatio = pl * avgLoss > 0 ? (pw * avgWin) / (pl * avgLoss) : null;
  const netExpectancy = all.length ? (pw * avgWin) - (pl * avgLoss) : null;

  let peak = backtestDefaults.initialEquity;
  let maxDrawdown = 0;
  for (const point of curve) {
    peak = Math.max(peak, point.equity);
    maxDrawdown = Math.max(maxDrawdown, ((peak - point.equity) / peak) * 100);
  }

  return {
    trades: all,
    curve,
    stats: {
      totalTrades: all.length,
      wins: wins.length,
      losses: losses.length,
      winRate: Math.round(winRate * 100) / 100,
      avgWin: Math.round(avgWin * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100,
      expectancyRatio: expectancyRatio === null ? null : Math.round(expectancyRatio * 100) / 100,
      netExpectancy: netExpectancy === null ? null : Math.round(netExpectancy * 100) / 100,
      totalReturn: Math.round(((equity - backtestDefaults.initialEquity) / backtestDefaults.initialEquity) * 10000) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      finalEquity: Math.round(equity * 100) / 100,
    },
  };
}

export default async function backtestRun(request) {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Gunakan metode GET.' }, {
      status: 405,
      headers: { Allow: 'GET' },
    });
  }

  try {
    const params = new URL(request.url).searchParams;
    const region = params.get('region') ?? 'auto';
    const custom = params.get('symbols');

    let symbols;
    let label;
    if (custom) {
      symbols = custom.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, maxSymbols);
      label = `${symbols.length} saham pilihan`;
    } else if (region === 'auto') {
      symbols = universeRegions.flatMap((r) => getUniverse(r).symbols).slice(0, maxSymbols);
      label = `Sampel ${maxSymbols} saham lintas bursa`;
    } else {
      const universe = getUniverse(region);
      symbols = universe.symbols.slice(0, maxSymbols);
      label = universe.name;
    }

    if (symbols.length === 0) {
      return errorResponse('Tidak ada simbol untuk diuji.', 400);
    }

    const perSymbol = [];
    let cursor = 0;
    async function worker() {
      while (cursor < symbols.length) {
        const symbol = symbols[cursor];
        cursor += 1;
        try {
          const data = await fetchSessions(symbol);
          if (!data) continue;
          const result = runBacktest(data.sessions);
          if (result.trades.length > 0) {
            perSymbol.push({
              symbol,
              name: data.name,
              trades: result.trades.length,
              winRate: result.stats.winRate,
              totalReturn: result.stats.totalReturn,
              result,
            });
          }
        } catch {
          // Abaikan simbol gagal.
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(fetchConcurrency, symbols.length) }, worker));

    const combined = combineTrades(perSymbol);

    return Response.json({
      label,
      symbolsTested: perSymbol.length,
      params: {
        stopPct: backtestDefaults.stopPct,
        targetR: backtestDefaults.targetR,
        maxHoldDays: backtestDefaults.maxHoldDays,
        riskPerTrade: backtestDefaults.riskPerTrade,
      },
      stats: combined.stats,
      curve: combined.curve,
      trades: combined.trades.slice(-30), // kirim 30 trade terakhir untuk tabel
      perSymbol: perSymbol
        .map(({ symbol, name, trades, winRate, totalReturn }) => ({ symbol, name, trades, winRate, totalReturn }))
        .sort((a, b) => b.totalReturn - a.totalReturn),
    });
  } catch {
    return errorResponse('Uji strategi gagal. Coba lagi nanti.', 502);
  }
}
