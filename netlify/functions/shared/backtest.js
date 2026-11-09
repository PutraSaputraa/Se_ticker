// Backtest sederhana untuk strategi breakout Minervini.
//
// Simulasi long-only: entry saat sinyal breakout (trend eligible + VCP forming
// + harga menembus pivot dengan RVOL), exit saat stop-loss, target, atau
// trailing MA50. Menghindari look-ahead bias dengan mengeksekusi pada sesi
// SETELAH sinyal terkonfirmasi penutupan.
//
// Menghasilkan win rate, avg win/loss, expectancy (rasio & net), dan equity curve.

import { evaluateTrendTemplate, analyzeVCP, analyzePivot, minerviniDefaults } from './minervini.js';

export const backtestDefaults = {
  stopPct: 6,           // stop-loss 6% di bawah entry
  targetR: 3,           // target 3R
  trailingMa: 50,       // trailing exit penutupan di bawah MA50
  maxHoldDays: 40,      // keluar paksa bila terlalu lama
  rvolMin: 1.3,
  riskPerTrade: 1.0,    // % ekuitas per trade (untuk kurva ekuitas)
  initialEquity: 100,   // basis kurva (persen)
};

function smaAt(closes, end, period) {
  const start = end - period + 1;
  if (start < 0) return null;
  let sum = 0;
  for (let i = start; i <= end; i += 1) {
    if (!Number.isFinite(closes[i])) return null;
    sum += closes[i];
  }
  return sum / period;
}

// sessions: array OHLCV lama->baru. Mengembalikan daftar trade + statistik.
export function runBacktest(sessions, options = backtestDefaults) {
  const opt = { ...backtestDefaults, ...options };
  const closes = sessions.map((s) => s?.close);
  const trades = [];
  let i = minerviniDefaults.smaSlow + 5; // butuh data untuk MA200

  while (i < sessions.length - 1) {
    const trend = evaluateTrendTemplate(sessions, i, null);
    // Untuk backtest, syaratkan inti trend saja (tanpa RS eksternal): minimal 6/8.
    const trendOk = trend.passed >= 6;
    if (!trendOk) { i += 1; continue; }

    const vcp = analyzeVCP(sessions, i);
    const pivot = analyzePivot(sessions, i, vcp, { rvolMin: opt.rvolMin });
    if (!(vcp.forming && pivot.breakout)) { i += 1; continue; }

    // Sinyal terkonfirmasi penutupan sesi i → eksekusi di open sesi berikutnya.
    const entryIndex = i + 1;
    const entryBar = sessions[entryIndex];
    if (!Number.isFinite(entryBar?.open)) { i += 1; continue; }
    const entry = entryBar.open;
    const stop = entry * (1 - opt.stopPct / 100);
    const riskPerShare = entry - stop;
    const target = entry + opt.targetR * riskPerShare;

    // Simulasikan perjalanan posisi.
    let exit = null;
    let exitIndex = null;
    let exitReason = 'eod';
    for (let j = entryIndex; j < sessions.length; j += 1) {
      const bar = sessions[j];
      if (!Number.isFinite(bar?.low) || !Number.isFinite(bar?.high)) continue;

      if (bar.low <= stop) { exit = stop; exitIndex = j; exitReason = 'stop'; break; }
      if (bar.high >= target) { exit = target; exitIndex = j; exitReason = 'target'; break; }

      const maTrail = smaAt(closes, j, opt.trailingMa);
      if (Number.isFinite(maTrail) && bar.close < maTrail && j > entryIndex) {
        exit = bar.close; exitIndex = j; exitReason = 'trailing'; break;
      }
      if (j - entryIndex >= opt.maxHoldDays) { exit = bar.close; exitIndex = j; exitReason = 'timeout'; break; }
    }
    if (exit === null) {
      exit = sessions.at(-1).close;
      exitIndex = sessions.length - 1;
      exitReason = 'eod';
    }

    const returnPct = ((exit - entry) / entry) * 100;
    const rMultiple = riskPerShare > 0 ? (exit - entry) / riskPerShare : 0;
    trades.push({
      entryDate: sessions[entryIndex].date,
      exitDate: sessions[exitIndex].date,
      entry: Math.round(entry * 100) / 100,
      exit: Math.round(exit * 100) / 100,
      returnPct: Math.round(returnPct * 100) / 100,
      rMultiple: Math.round(rMultiple * 100) / 100,
      exitReason,
      holdDays: exitIndex - entryIndex,
    });

    // Lompat ke sesi setelah exit agar tidak tumpang tindih posisi.
    i = exitIndex + 1;
  }

  return summarizeTrades(trades, opt);
}

function summarizeTrades(trades, opt) {
  const wins = trades.filter((t) => t.returnPct > 0);
  const losses = trades.filter((t) => t.returnPct <= 0);
  const avg = (arr, key) => (arr.length ? arr.reduce((s, t) => s + t[key], 0) / arr.length : 0);

  const winRate = trades.length ? (wins.length / trades.length) * 100 : 0;
  const avgWin = avg(wins, 'returnPct');
  const avgLoss = Math.abs(avg(losses, 'returnPct'));
  const pw = trades.length ? wins.length / trades.length : 0;
  const pl = 1 - pw;
  const expectancyRatio = pl * avgLoss > 0 ? (pw * avgWin) / (pl * avgLoss) : null;
  const netExpectancy = trades.length ? (pw * avgWin) - (pl * avgLoss) : null;

  // Kurva ekuitas sederhana (compounding per trade, risiko tetap).
  let equity = opt.initialEquity;
  const curve = trades.map((t) => {
    const tradeReturn = (opt.riskPerTrade / 100) * (t.returnPct / Math.max(opt.stopPct, 0.01));
    equity *= (1 + tradeReturn);
    return { date: t.exitDate, equity: Math.round(equity * 100) / 100 };
  });

  // Drawdown maksimum dari kurva.
  let peak = opt.initialEquity;
  let maxDrawdown = 0;
  for (const point of curve) {
    peak = Math.max(peak, point.equity);
    const dd = ((peak - point.equity) / peak) * 100;
    maxDrawdown = Math.max(maxDrawdown, dd);
  }

  const totalReturn = ((equity - opt.initialEquity) / opt.initialEquity) * 100;

  return {
    trades,
    stats: {
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: Math.round(winRate * 100) / 100,
      avgWin: Math.round(avgWin * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100,
      expectancyRatio: expectancyRatio === null ? null : Math.round(expectancyRatio * 100) / 100,
      netExpectancy: netExpectancy === null ? null : Math.round(netExpectancy * 100) / 100,
      totalReturn: Math.round(totalReturn * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      finalEquity: Math.round(equity * 100) / 100,
    },
    curve,
  };
}
