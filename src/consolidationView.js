import { consolidationPositionPct } from '../netlify/functions/shared/consolidationLogic.js';
import { formatDate, formatDateCompact, formatPrice, priceDecimals } from './format.js';
import { localizedDateFormat, localizedNumberFormat, t } from './i18n.js';

export const consolidationTimeframes = { daily: 'Harian', weekly: 'Mingguan', monthly: 'Bulanan' };
export const locationBounds = { support: 20, resistance: 80 };
export const locationLabels = {
  support: 'Dekat support',
  middle: 'Tengah rentang',
  resistance: 'Dekat resistance',
  outside: 'Di luar rentang',
  unavailable: 'Posisi harga belum tersedia',
};

export const countFormat = localizedNumberFormat();
export const positionFormat = localizedNumberFormat({ maximumFractionDigits: 2 });
const monthFormat = localizedDateFormat({ year: 'numeric', month: 'long', timeZone: 'UTC' });
const compactMonthFormat = localizedDateFormat({ year: 'numeric', month: 'short', timeZone: 'UTC' });

export function validCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validClose(value) {
  return Number.isFinite(value) && value > 0;
}

export function validConsolidationZone(zone) {
  return validClose(zone?.low) && validClose(zone.high) && zone.low <= zone.high;
}

export function getConsolidationPosition({ close, support, resistance }) {
  if (!validClose(close) || !validConsolidationZone(support) || !validConsolidationZone(resistance)
    || support.high >= resistance.low) return { location: 'unavailable', pct: null };

  const { low } = support;
  const { high } = resistance;
  const pct = consolidationPositionPct(close, low, high);
  if (!Number.isFinite(pct)) return { location: 'unavailable', pct: null };
  if (close < low || close > high) return { location: 'outside', pct, side: close < low ? 'below' : 'above' };
  const location = pct <= locationBounds.support ? 'support' : pct >= locationBounds.resistance ? 'resistance' : 'middle';
  return { location, pct };
}

const numericSort = {
  support: ({ position }) => position.pct == null ? null : Math.abs(position.pct),
  resistance: ({ position }) => position.pct == null ? null : Math.abs(100 - position.pct),
  longest: ({ pick }) => validCount(pick.duration) && pick.duration > 0 ? -pick.duration : null,
  shortest: ({ pick }) => validCount(pick.duration) && pick.duration > 0 ? pick.duration : null,
  supportReactions: ({ pick }) => validCount(pick.support?.touches) ? -pick.support.touches : null,
  resistanceReactions: ({ pick }) => validCount(pick.resistance?.touches) ? -pick.resistance.touches : null,
};

export function selectConsolidationCandidates(candidates, location, sort) {
  const visible = location === 'all' ? candidates : candidates.filter(candidate => candidate.position.location === location);
  if (sort === 'ticker') return [...visible].sort((a, b) => a.pick.symbol.localeCompare(b.pick.symbol));
  if (!Object.hasOwn(numericSort, sort)) return visible;
  const metric = numericSort[sort];
  return [...visible].sort((a, b) => {
    const left = metric(a);
    const right = metric(b);
    if (left == null) return right == null ? 0 : 1;
    return right == null ? -1 : left - right;
  });
}

export function consolidationCoverage(scanned, checked) {
  if (!validCount(scanned) || !validCount(checked) || scanned === 0 || checked > scanned) return null;
  return { pct: checked / scanned * 100, unavailable: scanned - checked };
}

export function consolidationSessionDate(value, timeframe) {
  const monthly = timeframe === 'monthly';
  if (typeof value !== 'string' || !(monthly ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/).test(value)) return null;
  const date = new Date((monthly ? value + '-01' : value) + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, value.length) === value ? date : null;
}

export function consolidationSessionLabel(value, timeframe, compact = false) {
  const date = consolidationSessionDate(value, timeframe);
  if (!date) return t('Tidak tersedia');
  if (timeframe === 'monthly') return (compact ? compactMonthFormat : monthFormat).format(date);
  return compact ? formatDateCompact(value) : formatDate(value);
}

export function readConsolidationCloses(pick, timeframe) {
  const { closes, duration, date, close } = pick;
  if (!Array.isArray(closes) || closes.length !== duration || closes.length < 2) return null;
  let previous = '';
  for (const point of closes) {
    if (!Array.isArray(point) || !consolidationSessionDate(point[0], timeframe) || point[0] <= previous
      || !validClose(point[1])) return null;
    previous = point[0];
  }
  const [lastDate, lastClose] = closes.at(-1);
  return lastDate === date && lastClose === close ? closes : null;
}

export function consolidationPrice(value, currency, digits) {
  return validClose(value) && typeof currency === 'string' && currency.trim()
    ? formatPrice(value, currency, digits) : t('Tidak tersedia');
}

export function consolidationZoneLabel(zone, currency) {
  if (!validConsolidationZone(zone)) return t('Tidak tersedia');
  let low = consolidationPrice(zone.low, currency);
  let high = consolidationPrice(zone.high, currency);
  if (low === high && zone.low !== zone.high && currency) {
    for (let digits = priceDecimals(currency) + 1; digits <= 6 && low === high; digits += 1) {
      low = consolidationPrice(zone.low, currency, digits);
      high = consolidationPrice(zone.high, currency, digits);
    }
  }
  return low === high ? low : low + ' – ' + high;
}
