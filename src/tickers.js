import { universes } from '../netlify/functions/shared/universe.js';

export const markets = {
  auto: { label: 'Otomatis' },
  crypto: { label: 'Kripto' },
  us: { label: 'AS' },
  id: { label: 'Indonesia', suffix: '.JK' },
  jp: { label: 'Jepang', suffix: '.T' },
  hk: { label: 'Hong Kong', suffix: '.HK', digits: 4 },
  ks: { label: 'Korea Selatan (KOSPI)', suffix: '.KS', digits: 6 },
  kq: { label: 'Korea Selatan (KOSDAQ)', suffix: '.KQ', digits: 6 },
  ss: { label: 'China (Shanghai)', suffix: '.SS', digits: 6 },
  sz: { label: 'China (Shenzhen)', suffix: '.SZ', digits: 6 },
};

const catalog = new Map();
for (const [market, { symbols }] of Object.entries(universes)) {
  for (const symbol of symbols) catalog.set(symbol, market === 'auto' ? 'id' : market);
}
for (const symbol of [
  'GOOG', 'HUMA', 'SPY', 'QQQ', 'DIA', 'IWM', 'VTI', 'VOO', 'BRK', 'JPM', 'V', 'MA', 'XOM', 'WMT',
]) catalog.set(symbol, 'us');
catalog.set('HUMI.JK', 'id');
for (const symbol of ['BTC-USD', 'ETH-USD', 'SOL-USD']) catalog.set(symbol, 'crypto');

const symbolPattern = /^\^?[A-Z0-9]+(?:[.=-][A-Z0-9]+)*$/;
const cryptoPattern = /-(?:USD|USDT|USDC|EUR|GBP|JPY|IDR|BTC|ETH)$/;
const marketPrefix = /^(US|CRYPTO):\s*/;
const marketsBySuffix = new Map(Object.entries(markets)
  .filter(([, { suffix }]) => suffix)
  .map(([market, { suffix }]) => [suffix, market]));

function tickerMarket(symbol) {
  if (catalog.has(symbol)) return catalog.get(symbol);
  if (cryptoPattern.test(symbol)) return 'crypto';
  const suffix = /\.[A-Z]+$/.exec(symbol)?.[0];
  return marketsBySuffix.get(suffix) ?? (/^[A-Z][A-Z0-9]*(?:-[A-Z]|\.[AB])?$/.test(symbol) ? 'us' : null);
}

export function normalizeTicker(ticker, market = 'auto') {
  const input = ticker.trim().toUpperCase();
  const prefix = marketPrefix.exec(input);
  const symbol = prefix ? input.slice(prefix[0].length) : input;
  const selectedMarket = prefix ? prefix[1].toLowerCase() : market;
  if (!symbol || symbol.includes('.') || selectedMarket === 'us') return symbol;
  if (selectedMarket === 'crypto') {
    return /^[A-Z0-9]+$/.test(symbol) ? `${symbol}-USD` : symbol.replace(/\s*\/\s*/, '-');
  }
  const { suffix, digits } = markets[selectedMarket] ?? {};
  if (suffix) {
    const code = /^\d+$/.test(symbol) ? symbol.padStart(digits ?? 0, '0') : symbol;
    return `${code}${suffix}`;
  }
  if (/^\d{3,4}$/.test(symbol)) return `${symbol}.T`;
  if (/^[A-Z]{4}$/.test(symbol) && catalog.get(symbol) !== 'us') return `${symbol}.JK`;
  return symbol;
}

export function accountTickerSymbols({ history, watchlist, journal }) {
  return [...history, ...watchlist.map(({ symbol }) => symbol), ...journal.map(({ pair }) => pair)];
}

export function suggestTickers(input, knownSymbols = [], market = 'auto') {
  const normalized = input.trim().toUpperCase();
  const prefix = marketPrefix.exec(normalized);
  const query = normalized.slice(prefix?.[0].length ?? 0).replace(/\s*\/\s*/, '-');
  if (!query) return [];

  const selectedMarket = prefix ? prefix[1].toLowerCase() : market;
  const { digits } = markets[selectedMarket] ?? {};
  const matchWithoutLeadingZeros = digits && /^[1-9]\d*$/.test(query);
  const exact = selectedMarket === 'auto' ? query : normalizeTicker(query, selectedMarket);
  const known = knownSymbols.map((symbol) => symbol.trim().toUpperCase());
  const matches = [];
  for (const symbol of new Set([...known, ...catalog.keys()])) {
    const matchesQuery = symbol.startsWith(query)
      || (matchWithoutLeadingZeros && symbol.replace(/^0+/, '').startsWith(query));
    if (!matchesQuery || symbol.length > 32 || !symbolPattern.test(symbol)) continue;
    const region = tickerMarket(symbol);
    if (selectedMarket !== 'auto' && region !== selectedMarket) continue;
    matches.push({ symbol, market: markets[region]?.label ?? '' });
  }

  return matches
    .sort((a, b) => Number(b.symbol === exact) - Number(a.symbol === exact))
    .slice(0, 6);
}

export function suggestTickerAlternatives(symbol) {
  const market = tickerMarket(symbol);
  const suffix = markets[market]?.suffix;
  const code = suffix ? symbol.slice(0, -suffix.length) : symbol;
  const sameCode = [];
  const nearCode = [];

  for (const [candidate, region] of catalog) {
    if (candidate === symbol) continue;
    const candidateSuffix = markets[region].suffix;
    const candidateCode = candidateSuffix ? candidate.slice(0, -candidateSuffix.length) : candidate;
    const option = { symbol: candidate, market: markets[region].label };
    if (candidateCode === code) {
      sameCode.push(option);
    } else if (market === region && code.length >= 4 && candidateCode.length === code.length
      && [...code].filter((character, index) => character !== candidateCode[index]).length === 1) {
      nearCode.push(option);
    }
  }

  return [...sameCode, ...nearCode].slice(0, 3);
}
