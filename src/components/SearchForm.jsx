import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import WorkspaceIcon from './WorkspaceIcon.jsx';

export const markets = {
  auto: { label: 'Otomatis' },
  crypto: { label: 'Crypto' },
  us: { label: 'AS' },
  id: { label: 'Indonesia', suffix: '.JK' },
  jp: { label: 'Jepang', suffix: '.T' },
  hk: { label: 'Hong Kong', suffix: '.HK', digits: 4 },
  ks: { label: 'Korea Selatan (KOSPI)', suffix: '.KS', digits: 6 },
  kq: { label: 'Korea Selatan (KOSDAQ)', suffix: '.KQ', digits: 6 },
  ss: { label: 'China (Shanghai)', suffix: '.SS', digits: 6 },
  sz: { label: 'China (Shenzhen)', suffix: '.SZ', digits: 6 },
};

// Daftar ticker AS yang umum agar tidak salah dikira kode Indonesia di mode auto.
const usCommon = new Set([
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'GOOG', 'AMZN', 'META', 'TSLA', 'AVGO', 'AMD',
  'NFLX', 'CRM', 'ADBE', 'INTC', 'QCOM', 'TXN', 'MU', 'PLTR', 'SMCI', 'COIN',
  'UBER', 'SHOP', 'SQ', 'SNOW', 'DDOG', 'NET', 'CRWD', 'PANW', 'ARM', 'MRVL', 'ON',
  'SPY', 'QQQ', 'DIA', 'IWM', 'VTI', 'VOO', 'BRK', 'JPM', 'V', 'MA', 'XOM', 'WMT',
]);

export function normalizeTicker(ticker, market = 'auto') {
  const input = ticker.trim().toUpperCase();
  const prefix = /^(US|CRYPTO):\s*/.exec(input);
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
  // Mode auto: anggap kode Indonesia (4 huruf) kecuali jelas ticker AS umum.
  if (/^[A-Z]{4}$/.test(symbol) && !usCommon.has(symbol)) return `${symbol}.JK`;
  return symbol;
}

const tickerExamples = [
  ['BBCA.JK', 'Indonesia'],
  ['NVDA', 'AS'],
  ['7203.T', 'Jepang'],
  ['0700.HK', 'Hong Kong'],
  ['BTC-USD', 'Crypto'],
];

export default function SearchForm({ initialTicker = '', initialMarket = 'auto' }) {
  const [ticker, setTicker] = useState(initialTicker);
  const [market, setMarket] = useState(initialMarket);
  const navigate = useNavigate();

  function go(rawSymbol) {
    const symbol = normalizeTicker(rawSymbol ?? ticker, market);
    if (symbol) navigate(`/stock/${encodeURIComponent(symbol)}`);
  }

  return (
    <form
      className="search-form"
      role="search"
      aria-label="Cari ticker saham"
      onSubmit={(event) => {
        event.preventDefault();
        go();
      }}
    >
      <div className="ticker-row">
        <div className="ticker-field">
          <label htmlFor="ticker">Kode ticker</label>
          <div className="input-wrap">
            <WorkspaceIcon name="search" size={20} />
            <input
              id="ticker"
              name="ticker"
              type="text"
              value={ticker}
              onChange={(event) => setTicker(event.target.value)}
              placeholder={market === 'crypto' ? 'Mis. BTC, ETH, atau SOL' : 'Mis. NVDA atau BBCA'}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </div>
        </div>
        <div className="market-field">
          <label htmlFor="market">Bursa</label>
          <select id="market" value={market} onChange={(event) => setMarket(event.target.value)}>
            {Object.entries(markets).map(([value, { label }]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="check-button">
          Buka detail
        </button>
      </div>
      <div className="ticker-examples">
        <p>Contoh format ticker</p>
        <ul>{tickerExamples.map(([symbol, label]) => (
          <li key={symbol}><Link to={`/stock/${encodeURIComponent(symbol)}`} title={label}>{symbol}</Link></li>
        ))}</ul>
      </div>
    </form>
  );
}
