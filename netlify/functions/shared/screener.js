import { sma } from './minervini.js';
import { dayMilliseconds } from './sessionLogic.js';

function change(value, reference) {
  return Number.isFinite(value) && Number.isFinite(reference) && reference > 0
    ? 100 * ((value - reference) / reference) : null;
}

// Wilder smoothing starts after fourteen consecutive price differences.
function rsi14(closes) {
  let count = 0;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < closes.length; i += 1) {
    if (!Number.isFinite(closes[i]) || !Number.isFinite(closes[i - 1])) {
      count = 0;
      gain = 0;
      loss = 0;
      continue;
    }
    const difference = closes[i] - closes[i - 1];
    count += 1;
    gain = count > 14 ? (13 * gain + Math.max(0, difference)) / 14 : gain + Math.max(0, difference) / 14;
    loss = count > 14 ? (13 * loss + Math.max(0, -difference)) / 14 : loss + Math.max(0, -difference) / 14;
  }
  if (count < 14 || gain + loss === 0) return null;
  return 100 * gain / (gain + loss);
}

function annualChange(points = []) {
  const latest = points.at(-1);
  if (!latest) return null;
  const previous = points.findLast(point => {
    const days = (Date.parse(latest.date) - Date.parse(point.date)) / dayMilliseconds;
    return days >= 350 && days <= 380 && latest.currency === point.currency;
  });
  return change(latest.value, previous?.value);
}

export function screenerRow({ symbol, name, currency, sessions, index }, statements) {
  const { date, close, open, volume } = sessions[index];
  const closes = sessions.slice(0, index + 1).map(bar => bar.close);
  const previous = closes[index - 1];
  const volumeAverage = sma(sessions.map(bar => bar.volume), index - 1, 50);
  const revenue = statements?.annualRevenue?.at(-1);
  const income = statements?.annualIncome?.find(point => point.date === revenue?.date && point.currency === revenue.currency);
  return {
    symbol, name, currency, date, close,
    changePct: change(close, previous),
    openChange: change(close, open),
    gap: change(open, previous),
    weekReturn: change(close, closes[index - 5]),
    monthReturn: change(close, closes[index - 20]),
    sma20: change(close, sma(closes, index, 20)),
    sma50: change(close, sma(closes, index, 50)),
    sma200: change(close, sma(closes, index, 200)),
    rsi: rsi14(closes),
    volumeRatio: Number.isFinite(volume) && volumeAverage > 0 ? volume / volumeAverage : null,
    quarterEps: statements?.quarterlyEps?.at(-1)?.value ?? null,
    epsGrowth: annualChange(statements?.quarterlyEps),
    revenueGrowth: annualChange(statements?.quarterlyRevenue),
    annualRevenueGrowth: annualChange(statements?.annualRevenue),
    annualEpsGrowth: annualChange(statements?.annualEps),
    netMargin: revenue?.value > 0 && income ? 100 * income.value / revenue.value : null,
  };
}
