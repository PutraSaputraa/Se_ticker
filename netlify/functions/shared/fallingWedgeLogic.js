import { completedMarketWeekFriday, dayMilliseconds, volumeLookback } from './sessionLogic.js';

const patternWindows = [120, 90, 60, 45, 30, 20];
const pivotRadius = 2;

function validDailyBar(bar) {
  return [bar?.open, bar?.high, bar?.low, bar?.close].every(Number.isFinite)
    && bar.low > 0 && bar.open >= bar.low && bar.open <= bar.high && bar.close >= bar.low && bar.close <= bar.high;
}

function validVolume(volume) {
  return Number.isSafeInteger(volume) && volume >= 0;
}

// Yahoo equity scan universes trade in Monday–Friday market weeks. Resample the
// same daily bars so the 1D breakout and 1W close share an exchange-local clock.
export function latestCompletedWedgeWeek(sessions, completedIndex, marketDay) {
  const friday = completedMarketWeekFriday(marketDay, sessions[completedIndex]?.date);
  if (!friday) return null;
  const start = new Date(Date.parse(friday + 'T00:00:00Z') - 4 * dayMilliseconds).toISOString().slice(0, 10);
  const endIndex = sessions.findLastIndex(({ date }) => date >= start && date <= friday);
  // If the final reported bar is incomplete, an earlier bar cannot replace it.
  if (endIndex < 0 || endIndex > completedIndex || !validDailyBar(sessions[endIndex])) return null;
  const startIndex = sessions.findIndex(({ date }) => date >= start);
  const { date, close } = sessions[endIndex];
  return { startIndex, endIndex, date, close };
}

export function cryptoWedgeWeek(days, endIndex) {
  const startIndex = endIndex - 6;
  if (startIndex < 0 || !days.slice(startIndex, endIndex + 1).every(validDailyBar)) return null;
  const { date, close } = days[endIndex];
  return { startIndex, endIndex, date, close };
}

function pivots(bars, field, direction) {
  const points = [];
  for (let index = pivotRadius; index < bars.length - pivotRadius; index += 1) {
    const price = bars[index][field];
    const before = bars.slice(index - pivotRadius, index);
    const after = bars.slice(index + 1, index + 1 + pivotRadius);
    // Ties select the last bar of a plateau.
    if (before.every(bar => direction * price >= direction * bar[field])
      && after.every(bar => direction * price > direction * bar[field])) points.push({ index, price });
  }
  return points;
}

function medianTrueRange(bars) {
  const ranges = bars.map(({ high, low }, index) => {
    const previous = bars[index - 1]?.close;
    return previous == null ? high - low : Math.max(high, previous) - Math.min(low, previous);
  }).sort((a, b) => a - b);
  const middle = Math.floor(ranges.length / 2);
  return (ranges[middle] + ranges[Math.floor((ranges.length - 1) / 2)]) / 2;
}

function descendingLines(bars, field, direction, tolerance, epsilon, acceptsEnd) {
  const points = pivots(bars, field, direction);
  const minSpan = Math.floor(bars.length / 3);
  const lines = [];
  for (let first = 0; first < points.length - 1; first += 1) {
    const left = points[first];
    for (let second = first + 1; second < points.length; second += 1) {
      const right = points[second];
      const span = right.index - left.index;
      if (span < minSpan || right.price >= left.price) continue;
      const slope = (right.price - left.price) / span;
      const start = left.price - slope * left.index;
      const end = start + slope * bars.length;
      if (end <= 0 || (acceptsEnd && !acceptsEnd(end))) continue;

      // Contacts must describe the outer boundary. Admit small wick overshoots
      // relative to normal volatility, while keeping formation closes inside.
      const envelope = bars.every((bar, index) => {
        const price = start + slope * index;
        return direction * (bar.close - price) <= epsilon
          && direction * (bar[field] - price) <= tolerance;
      });
      if (!envelope) continue;

      const contacts = points.filter(point => Math.abs(point.price - (start + slope * point.index)) <= tolerance).length;
      lines.push({ start, end, slope, contacts, span });
    }
  }
  return lines.sort((a, b) => b.contacts - a.contacts || b.span - a.span);
}

function findPattern(bars, breakoutClose, weeklyClose) {
  if (!bars.every(validDailyBar)) return null;
  const scale = bars.at(-1).close;
  const epsilon = scale * Number.EPSILON * 32;
  const tolerance = medianTrueRange(bars) * 0.6 + epsilon;
  const resistanceLines = descendingLines(bars, 'high', 1, tolerance, epsilon,
    price => Math.min(breakoutClose, weeklyClose) > price + epsilon);
  if (!resistanceLines.length) return null;
  const supportLines = descendingLines(bars, 'low', -1, tolerance, epsilon);

  for (const resistance of resistanceLines) {
    const support = supportLines.find(line => {
      const originalGap = resistance.start - line.start;
      const remainingGap = resistance.end - line.end;
      return resistance.slope < line.slope && remainingGap > epsilon && remainingGap < originalGap - epsilon;
    });
    if (support) return { resistance, support };
  }
  return null;
}

// Find a high-volume first daily close above a falling wedge during the last
// finished week. The weekly close must hold the resistance level at breakout.
export function findFallingWedge(sessions, week) {
  return evaluateFallingWedge(sessions, week)?.wedge ?? null;
}

export function evaluateFallingWedge(sessions, week) {
  if (!week) return null;
  const shortestWindow = patternWindows.at(-1);
  let checked = false;
  for (let index = week.endIndex; index >= Math.max(week.startIndex, volumeLookback, shortestWindow); index -= 1) {
    const breakout = sessions[index];
    const baseline = sessions.slice(index - volumeLookback, index);
    if (!validDailyBar(breakout) || !validVolume(breakout.volume) || !baseline.every(bar => validVolume(bar.volume))) continue;
    const averageVolume = baseline.reduce((sum, bar) => sum + bar.volume, 0) / volumeLookback;
    if (averageVolume <= 0 || !sessions.slice(index - shortestWindow, index).every(validDailyBar)) continue;
    checked = true;
    if (breakout.volume <= averageVolume) continue;

    for (const duration of patternWindows) {
      if (index < duration) continue;
      const startIndex = index - duration;
      const pattern = findPattern(sessions.slice(startIndex, index), breakout.close, week.close);
      if (!pattern) continue;
      const { resistance, support } = pattern;
      const startGap = resistance.start - support.start;
      const endGap = resistance.end - support.end;
      const wedge = {
        date: breakout.date,
        close: breakout.close,
        volume: breakout.volume,
        averageVolume,
        volumeRatio: breakout.volume / averageVolume,
        duration,
        resistance,
        support,
        contractionPct: (1 - endGap / startGap) * 100,
        confirmation: { date: week.date, close: week.close },
        candles: sessions.slice(startIndex, week.endIndex + 1).filter(validDailyBar),
      };
      return { wedge };
    }
  }
  return checked ? { wedge: null } : null;
}
