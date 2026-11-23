import { sma } from './minervini.js';

const fastPeriod = 50;
const slowPeriod = 200;

function latestEmas(closes, period) {
  const weight = 2 / (period + 1);
  let previous = sma(closes, period - 1, period);
  for (let index = period; index < closes.length - 1; index += 1) {
    previous += (closes[index] - previous) * weight;
  }
  return [previous, previous + (closes.at(-1) - previous) * weight];
}

function averageOrder(fast, slow) {
  const difference = fast - slow;
  // Treat rounding noise from summing up to 200 prices as equality.
  const tolerance = Number.EPSILON * slowPeriod * Math.max(fast, slow);
  return Math.abs(difference) <= tolerance ? 0 : Math.sign(difference);
}

export function findMovingAverageCrosses(sessions, end) {
  // Both the latest and preceding candles need a valid 200-period average.
  let start = end;
  while (start >= 0) {
    const close = sessions[start]?.close;
    if (!Number.isFinite(close) || close <= 0) break;
    start -= 1;
  }
  if (end - start <= slowPeriod) return null;

  const closes = sessions.slice(start + 1, end + 1).map(({ close }) => close);
  const last = closes.length - 1;
  const averages = [
    {
      method: 'SMA',
      fast: [sma(closes, last - 1, fastPeriod), sma(closes, last, fastPeriod)],
      slow: [sma(closes, last - 1, slowPeriod), sma(closes, last, slowPeriod)],
    },
    { method: 'EMA', fast: latestEmas(closes, fastPeriod), slow: latestEmas(closes, slowPeriod) },
  ];

  return averages.flatMap(({ method, fast: [previousFast, fast], slow: [previousSlow, slow] }) => {
    const previous = averageOrder(previousFast, previousSlow);
    const current = averageOrder(fast, slow);
    if (previous <= 0 && current > 0) return [{ method, signal: 'golden', fast, slow }];
    if (previous >= 0 && current < 0) return [{ method, signal: 'death', fast, slow }];
    return [];
  });
}
