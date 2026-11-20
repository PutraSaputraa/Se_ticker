const settings = {
  daily: { lookbacks: [40, 60, 90, 120, 150, 180], pivotRadius: 2 },
  monthly: { lookbacks: [12, 15, 18, 21, 24, 30], pivotRadius: 1 },
};

const minInsideRatio = 0.8;
const minTouches = 2;

function validPriceBar(bar) {
  return [bar?.high, bar?.low, bar?.close].every(Number.isFinite)
    && bar.low > 0 && bar.close >= bar.low && bar.close <= bar.high;
}

function typicalTrueRange(bars) {
  const ranges = bars.map(({ high, low }, index) => {
    const previousClose = bars[index - 1]?.close;
    return index === 0 ? high - low : Math.max(high, previousClose) - Math.min(low, previousClose);
  }).sort((a, b) => a - b);
  const middle = Math.floor(ranges.length / 2);
  return (ranges[middle] + ranges[Math.floor((ranges.length - 1) / 2)]) / 2;
}

function swingPoints(bars, radius) {
  const highs = [];
  const lows = [];
  for (let index = radius; index < bars.length - radius; index += 1) {
    const { high, low } = bars[index];
    const left = bars.slice(index - radius, index);
    const right = bars.slice(index + 1, index + 1 + radius);
    // For a flat peak or trough, count its last bar as the pivot.
    if (left.every(bar => high >= bar.high) && right.every(bar => high > bar.high)) {
      highs.push({ index, price: high });
    }
    if (left.every(bar => low <= bar.low) && right.every(bar => low < bar.low)) {
      lows.push({ index, price: low });
    }
  }
  return { highs, lows };
}

function priceZones(pivots, tolerance) {
  const byPrice = [...pivots].sort((a, b) => a.price - b.price);
  const zones = [];
  let end = 0;
  for (let start = 0; start <= byPrice.length - minTouches; start += 1) {
    const low = byPrice[start].price;
    if (low === byPrice[start - 1]?.price) continue;
    while (end < byPrice.length && byPrice[end].price <= low + tolerance) end += 1;
    if (end - start < minTouches) continue;
    zones.push({
      low,
      high: byPrice[end - 1].price,
      pivots: byPrice.slice(start, end).sort((a, b) => a.index - b.index),
    });
  }
  return zones;
}

function countReactions(pivots, bars, movedAway) {
  let count = 1;
  for (let index = 1; index < pivots.length; index += 1) {
    const between = bars.slice(pivots[index - 1].index + 1, pivots[index].index);
    if (between.some(({ close }) => movedAway(close))) count += 1;
  }
  return count;
}

export function findActiveConsolidation(sessions, index, timeframe) {
  const config = Object.hasOwn(settings, timeframe) ? settings[timeframe] : null;
  const latest = sessions[index];
  if (!config || !validPriceBar(latest)) return null;

  const longest = config.lookbacks.at(-1);
  // Leave the evaluation candle out of the zone calculation.
  const historyStart = Math.max(0, index - longest + 1 - config.pivotRadius);
  const history = sessions.slice(historyStart, index).filter(validPriceBar);
  const { highs, lows } = swingPoints(history, config.pivotRadius);
  let best = null;
  let bestScore = -Infinity;

  for (const duration of config.lookbacks) {
    if (history.length + 1 < duration) break;
    const start = history.length + 1 - duration;
    const bars = history.slice(start);
    const volatility = typicalTrueRange(bars);
    if (volatility <= 0) continue;

    const tolerance = volatility * 0.65;
    const supportZones = priceZones(lows.filter(pivot => pivot.index >= start), tolerance)
      .filter(zone => latest.close >= zone.low);
    const resistanceZones = priceZones(highs.filter(pivot => pivot.index >= start), tolerance)
      .filter(zone => latest.close <= zone.high);

    for (const support of supportZones) {
      for (const resistance of resistanceZones) {
        const gap = resistance.low - support.high;
        const width = resistance.high - support.low;
        if (gap <= 0 || width < volatility * 1.5) continue;

        const inside = bars.filter(({ close }) => close >= support.low && close <= resistance.high).length;
        const insideRatio = (inside + 1) / duration;
        if (insideRatio < minInsideRatio) continue;

        // A new touch requires a retreat into the range between pivots.
        const retreat = gap / 4;
        const supportTouches = countReactions(support.pivots, history, close => close >= support.high + retreat);
        const resistanceTouches = countReactions(resistance.pivots, history, close => close <= resistance.low - retreat);
        if (supportTouches < minTouches || resistanceTouches < minTouches) continue;

        const zoneWidth = (support.high - support.low) + (resistance.high - resistance.low);
        const score = insideRatio - 0.2 * (zoneWidth / width);
        if (score < bestScore) continue;

        bestScore = score;
        best = {
          support: { low: support.low, high: support.high, touches: supportTouches },
          resistance: { low: resistance.low, high: resistance.high, touches: resistanceTouches },
          duration,
          insideRatio,
          positionPct: ((latest.close - support.low) / width) * 100,
        };
      }
    }
  }

  return best;
}
