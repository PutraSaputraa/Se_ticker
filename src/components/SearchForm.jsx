import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { markets, normalizeTicker } from '../tickers.js';
import TickerField from './TickerField.jsx';
import WorkspaceIcon from './WorkspaceIcon.jsx';

const tickerExamples = [
  ['BBCA.JK', 'Indonesia'],
  ['NVDA', 'AS'],
  ['7203.T', 'Jepang'],
  ['0700.HK', 'Hong Kong'],
  ['BTC-USD', 'Crypto'],
];

export default function SearchForm({ initialTicker = '', knownSymbols }) {
  const [ticker, setTicker] = useState(initialTicker);
  const [market, setMarket] = useState('auto');
  const navigate = useNavigate();

  function go(symbol) {
    if (symbol) navigate(`/stock/${encodeURIComponent(symbol)}`);
  }

  return (
    <form
      className="search-form"
      role="search"
      aria-label="Cari ticker saham"
      onSubmit={(event) => {
        event.preventDefault();
        go(normalizeTicker(ticker, market));
      }}
    >
      <div className="ticker-row">
        <TickerField
          className="ticker-field"
          icon={<WorkspaceIcon name="search" size={20} />}
          placeholder={market === 'crypto' ? 'Mis. BTC, ETH, atau SOL' : 'Mis. NVDA atau BBCA'}
          value={ticker}
          onChange={setTicker}
          onSelect={go}
          knownSymbols={knownSymbols}
          market={market}
        />
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
