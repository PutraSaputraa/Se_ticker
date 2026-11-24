import { sma } from './minervini.js';

const fastPeriod = 50;
const slowPeriod = 200;
const chartLookback = 60;

function emaSeries(closes, period) {
  const weight = 2 / (period + 1);
  const values = Array(period - 1).fill(null);
  let previous = sma(closes, period - 1, period);
  values.push(previous);
  for (let index = period; index < closes.length; index += 1) {
    previous += (closes[index] - previous) * weight;
    values.push(previous);
  }
  return values;
}

function averageOrder(fast, slow) {
  const difference = fast - slow;
  // Treat rounding noise from summing up to 200 prices as equality.
  const tolerance = Number.EPSILON * slowPeriod * Math.max(fast, slow);
  return Math.abs(difference) <= tolerance ? 0 : Math.sign(difference);
}

export function findMovingAverageCrosses(sessions, end, { includeCandles = false } = {}) {
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
  const fastEmas = emaSeries(closes, fastPeriod);
  const slowEmas = emaSeries(closes, slowPeriod);
  const averages = [
    {
      method: 'SMA',
      fastAt: index => sma(closes, index, fastPeriod),
      slowAt: index => sma(closes, index, slowPeriod),
    },
    { method: 'EMA', fastAt: index => fastEmas[index], slowAt: index => slowEmas[index] },
  ];

  return averages.flatMap(({ method, fastAt, slowAt }) => {
    const fast = fastAt(last);
    const slow = slowAt(last);
    const previous = averageOrder(fastAt(last - 1), slowAt(last - 1));
    const current = averageOrder(fast, slow);
    let signal;
    if (previous <= 0 && current > 0) signal = 'golden';
    else if (previous >= 0 && current < 0) signal = 'death';
    else return [];

    const result = { method, signal, fast, slow };
    if (includeCandles) {
      const first = last - chartLookback + 1;
      result.candles = sessions.slice(end - chartLookback + 1, end + 1).map((bar, offset) => ({
        ...bar,
        fast: fastAt(first + offset),
        slow: slowAt(first + offset),
      }));
    }
    return [result];
  });
}
