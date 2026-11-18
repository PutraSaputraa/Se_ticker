import useTranslation from '../useTranslation.js';
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
  const { t } = useTranslation();
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
      aria-label={t("Cari ticker saham")}
      onSubmit={(event) => {
        event.preventDefault();
        go(normalizeTicker(ticker, market));
      }}
    >
      <div className="ticker-row">
        <TickerField
          className="ticker-field"
          icon={<WorkspaceIcon name="search" size={20} />}
          placeholder={market === 'crypto' ? t("Mis. BTC, ETH, atau SOL") : t("Mis. NVDA atau BBCA")}
          value={ticker}
          onChange={setTicker}
          onSelect={go}
          knownSymbols={knownSymbols}
          market={market}
        />
        <div className="market-field">
          <label htmlFor="market">{t("Bursa")}</label>
          <select id="market" value={market} onChange={(event) => setMarket(event.target.value)}>
            {Object.entries(markets).map(([value, { label }]) => (
              <option key={value} value={value}>{t(label)}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="check-button">{t("Buka detail")}</button>
      </div>
      <div className="ticker-examples">
        <p>{t("Contoh format ticker")}</p>
        <ul>{tickerExamples.map(([symbol, label]) => (
          <li key={symbol}><Link to={`/stock/${encodeURIComponent(symbol)}`} title={t(label)}>{symbol}</Link></li>
        ))}</ul>
      </div>
    </form>
  );
}
