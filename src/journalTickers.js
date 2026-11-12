import { universes } from '../netlify/functions/shared/universe.js';

const catalog = new Map();
for (const [region, { label, symbols }] of Object.entries(universes)) {
  for (const symbol of symbols) catalog.set(symbol, region === 'auto' ? 'Indonesia' : label);
}
for (const symbol of ['BTC-USD', 'ETH-USD', 'SOL-USD']) catalog.set(symbol, 'Kripto');

const symbolPattern = /^\^?[A-Z0-9]+(?:[.=-][A-Z0-9]+)*$/;
const cryptoPattern = /-(?:USD|USDT|USDC|EUR|GBP|JPY|IDR|BTC|ETH)$/;

export function suggestJournalTickers(input, knownSymbols) {
  const normalized = input.trim().toUpperCase();
  const prefix = /^(US|CRYPTO):\s*/.exec(normalized);
  const query = normalized.slice(prefix?.[0].length ?? 0).replace(/\s*\/\s*/, '-');
  if (!query) return [];

  const known = knownSymbols.map((symbol) => symbol.trim().toUpperCase());
  const candidates = new Set([...known, ...catalog.keys()]);
  const matches = [...candidates].filter((symbol) => {
    if (!symbol.startsWith(query) || symbol.length > 32 || !symbolPattern.test(symbol)) return false;
    if (prefix?.[1] === 'CRYPTO') return cryptoPattern.test(symbol);
    if (prefix?.[1] === 'US') return !cryptoPattern.test(symbol) && !/\.(?:T|[A-Z]{2,})$/.test(symbol);
    return true;
  });

  return matches
    .sort((a, b) => Number(b === query) - Number(a === query))
    .slice(0, 6)
    .map((symbol) => ({ symbol, market: catalog.get(symbol) ?? '' }));
}
