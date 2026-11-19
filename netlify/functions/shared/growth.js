import { dayMilliseconds } from './sessionLogic.js';
import { salesTTMThreshold } from '../../../src/growthFilters.js';

const yahooHeaders = { 'User-Agent': 'Mozilla/5.0' };
let sessionPromise;
let sessionUntil = 0;
const metricCache = new Map();
let retryMetricsAfter = 0;

// Anonymous session for the same public analyst estimates shown on Yahoo Finance.
async function openSession(signal) {
  const start = await fetch('https://fc.yahoo.com/', { headers: yahooHeaders, signal });
  const cookie = start.headers.getSetCookie().map(item => item.split(';')[0]).join('; ');
  await start.body?.cancel();
  if (!cookie) return null;
  const response = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { ...yahooHeaders, Cookie: cookie }, signal,
  });
  if (!response.ok) return null;
  const crumb = (await response.text()).trim();
  return crumb && !/[<>\s]/.test(crumb) ? { cookie, crumb } : null;
}

async function publicSession(signal) {
  if (!sessionPromise || Date.now() >= sessionUntil) {
    sessionUntil = Date.now() + 15 * 60_000;
    sessionPromise = openSession(signal).catch(() => null);
  }
  const pending = sessionPromise;
  const session = await pending;
  if (!session) {
    if (sessionPromise === pending) sessionUntil = Math.min(sessionUntil, Date.now() + 30_000);
    return null;
  }
  return session;
}

async function analystData(symbol) {
  const signal = AbortSignal.timeout(8000);
  const session = await publicSession(signal);
  if (!session) return null;
  const params = new URLSearchParams({ modules: 'price,earningsTrend', crumb: session.crumb });
  const response = await fetch('https://query1.finance.yahoo.com/v10/finance/quoteSummary/' + encodeURIComponent(symbol) + '?' + params, {
    headers: { ...yahooHeaders, Cookie: session.cookie }, signal,
  });
  if (response.status === 401) sessionUntil = 0;
  if (!response.ok) return null;
  const json = await response.json();
  return json.quoteSummary?.result?.[0] ?? null;
}

// The public screener can confirm a threshold even when the statement feed
// omits earlier quarters. Absence from either response supplies no evidence.
export async function fillSalesComparisons(rows) {
  const missing = rows.filter(row => !Number.isFinite(row.salesTTM));
  if (!missing.length) return;
  const signal = AbortSignal.timeout(8000);
  const session = await publicSession(signal);
  if (!session) return;
  const field = 'totalrevenues1yrgrowth.lasttwelvemonths';
  const threshold = salesTTMThreshold;
  const tickers = { operator: 'or', operands: missing.map(row => ({ operator: 'eq', operands: ['ticker', row.symbol] })) };
  async function group(test) {
    const query = { operator: 'and', operands: [tickers, test] };
    const url = new URL('https://query1.finance.yahoo.com/v1/finance/screener');
    url.searchParams.set('crumb', session.crumb);
    const response = await fetch(url, {
      method: 'POST', signal, headers: { ...yahooHeaders, Cookie: session.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ size: missing.length, offset: 0, sortField: 'ticker', sortType: 'ASC', quoteType: 'EQUITY', query }),
    });
    if (!response.ok) return new Set();
    const json = await response.json();
    return new Set(json.finance?.result?.[0]?.quotes?.map(quote => quote.symbol));
  }
  const comparison = operator => ({ operator, operands: [field, threshold] });
  const [above, belowOrEqual] = await Promise.all([
    group(comparison('gt')).catch(() => new Set()),
    group({ operator: 'or', operands: [comparison('lt'), comparison('eq')] }).catch(() => new Set()),
  ]);
  for (const row of missing) {
    if (above.has(row.symbol) !== belowOrEqual.has(row.symbol)) {
      row.salesTTMComparison = { threshold, passed: above.has(row.symbol) };
    }
  }
}

async function basicFinancials(symbol) {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return null;
  const cached = metricCache.get(symbol);
  if (cached?.until > Date.now()) return cached.metrics;
  if (Date.now() < retryMetricsAfter) return null;
  const query = new URLSearchParams({ symbol, metric: 'all' });
  const response = await fetch('https://finnhub.io/api/v1/stock/metric?' + query, {
    headers: { 'X-Finnhub-Token': token }, signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    if (response.status === 429) {
      const seconds = Number(response.headers.get('Retry-After')) || 60;
      retryMetricsAfter = Date.now() + Math.max(1, seconds) * 1000;
    }
    return null;
  }
  const json = await response.json();
  const metrics = json.symbol?.toUpperCase() === symbol.toUpperCase() ? json.metric ?? null : null;
  metricCache.set(symbol, { metrics, until: Date.now() + 3_600_000 });
  return metrics;
}

function pastFiveYears(estimates) {
  const historical = estimates.find(item => item.period === '-5y')?.growth?.raw;
  return Number.isFinite(historical) ? 100 * historical : null;
}

export async function fetchGrowthInputs(symbol) {
  const [data, metrics] = await Promise.all([
    analystData(symbol).catch(() => null), basicFinancials(symbol).catch(() => null),
  ]);
  return { estimates: data?.earningsTrend?.trend ?? [], name: data?.price?.longName ?? data?.price?.shortName, metrics };
}

function yearsApart(current, prior, years) {
  const days = (Date.parse(current.date) - Date.parse(prior.date)) / dayMilliseconds;
  return Math.abs(days - 365.25 * years) <= 16 && current.currency && current.currency === prior.currency;
}

function percent(current, base) {
  return Number.isFinite(current) && Number.isFinite(base) && base > 0 ? 100 * ((current - base) / base) : null;
}

function annualized(points, years) {
  const current = points.at(-1);
  if (!current || current.value < 0) return null;
  const prior = points.findLast(point => yearsApart(current, point, years));
  return prior?.value > 0 ? 100 * (Math.pow(current.value / prior.value, 1 / years) - 1) : null;
}

function salesTTM(statements) {
  const quarters = statements?.quarterlyRevenue ?? [];
  const latest = quarters.at(-1);
  if (!latest) return null;
  const eight = quarters.slice(-8);
  if (eight.length === 8 && eight.every((q, i) => {
    const days = i && (Date.parse(q.date) - Date.parse(eight[i - 1].date)) / dayMilliseconds;
    return q.currency && q.currency === latest.currency && (i === 0 || (days >= 75 && days <= 105));
  })) {
    const sum = points => points.reduce((total, q) => total + q.value, 0);
    return percent(sum(eight.slice(4)), sum(eight.slice(0, 4)));
  }
  // At fiscal year-end the annual report covers exactly the latest four quarters.
  const annual = statements?.annualRevenue ?? [];
  const year = annual.find(point => point.date === latest.date && point.currency === latest.currency);
  const base = year && annual.find(point => yearsApart(year, point, 1));
  return percent(year?.value, base?.value);
}

export function growthValues(statements, { estimates = [], metrics } = {}) {
  function forecast(period) {
    const entry = estimates.find(item => item.period === period)?.earningsEstimate;
    return percent(entry?.avg?.raw, entry?.yearAgoEps?.raw);
  }
  function reported(key, fallback) {
    return Number.isFinite(metrics?.[key]) ? metrics[key] : fallback;
  }
  const annual = statements?.annualEps ?? [];
  const quarters = statements?.quarterlyRevenue ?? [];
  const latest = quarters.at(-1);
  const previous = latest && quarters.find(point => yearsApart(latest, point, 1));
  return {
    epsThisYear: forecast('0y'),
    eps3Y: reported('epsGrowth3Y', annualized(annual, 3)),
    eps5Y: reported('epsGrowth5Y', annualized(annual, 5) ?? pastFiveYears(estimates)),
    salesQuarter: reported('revenueGrowthQuarterlyYoy', percent(latest?.value, previous?.value)),
    salesTTM: reported('revenueGrowthTTMYoy', salesTTM(statements)),
    epsNextYear: forecast('+1y'),
  };
}
