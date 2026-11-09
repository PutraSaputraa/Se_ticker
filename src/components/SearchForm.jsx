import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const markets = {
  auto: { label: 'Otomatis' },
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
  const symbol = ticker.trim().toUpperCase();
  if (!symbol || symbol.includes('.') || market === 'us') return symbol;
  const { suffix, digits } = markets[market] ?? {};
  if (suffix) {
    const code = /^\d+$/.test(symbol) ? symbol.padStart(digits ?? 0, '0') : symbol;
    return `${code}${suffix}`;
  }
  if (/^\d{3,4}$/.test(symbol)) return `${symbol}.T`;
  // Mode auto: anggap kode Indonesia (4 huruf) kecuali jelas ticker AS umum.
  if (/^[A-Z]{4}$/.test(symbol) && !usCommon.has(symbol)) return `${symbol}.JK`;
  return symbol;
}

export default function SearchForm({ initialTicker = '', initialMarket = 'auto', autoSearch = false }) {
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
      onSubmit={(event) => {
        event.preventDefault();
        go();
      }}
    >
      <div className="ticker-row">
        <div className="market-field">
          <label htmlFor="market">Bursa</label>
          <select id="market" value={market} onChange={(event) => setMarket(event.target.value)}>
            {Object.entries(markets).map(([value, { label }]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="ticker-field">
          <label htmlFor="ticker">Kode ticker</label>
          <div className="input-wrap">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <circle cx="10.8" cy="10.8" r="5.8" />
              <path d="m15.1 15.1 4.3 4.3" />
            </svg>
            <input
              id="ticker"
              name="ticker"
              type="text"
              value={ticker}
              onChange={(event) => setTicker(event.target.value)}
              placeholder="Mis. NVDA atau BBCA"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
        <button type="submit" className="check-button">
          Cek
          <svg aria-hidden="true" viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 10h11m-4-4 4 4-4 4" />
          </svg>
        </button>
      </div>
      <p className="hint">
        <span>NVDA, MSFT, AAPL (pilih AS)</span>
        <span>BBCA → BBCA.JK (Indonesia)</span>
        <span>7203 → 7203.T (Jepang)</span>
        <span>0700 (Hong Kong)</span>
      </p>
    </form>
  );
}
