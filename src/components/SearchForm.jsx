import useTranslation from '../useTranslation.js';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { markets, normalizeTicker } from '../tickers.js';
import TickerField from './TickerField.jsx';
import WorkspaceIcon from './WorkspaceIcon.jsx';

export default function SearchForm({ initialTicker = '', knownSymbols, inputRef, onSelect }) {
  const { t } = useTranslation();
  const [ticker, setTicker] = useState(initialTicker);
  const [market, setMarket] = useState('auto');
  const marketId = useId();
  const navigate = useNavigate();

  function go(symbol) {
    if (!symbol) return;
    onSelect?.();
    navigate(`/stock/${encodeURIComponent(symbol)}`);
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
        <div className="market-field">
          <label htmlFor={marketId}>{t("Bursa")}</label>
          <select id={marketId} value={market} onChange={(event) => setMarket(event.target.value)}>
            {Object.entries(markets).map(([value, { label }]) => (
              <option key={value} value={value}>{t(label)}</option>
            ))}
          </select>
        </div>
        <TickerField
          inputRef={inputRef}
          className="ticker-field"
          icon={<WorkspaceIcon name="search" size={20} />}
          placeholder={market === 'crypto' ? t("Mis. BTC, ETH, atau SOL") : t("Mis. NVDA atau BBCA")}
          value={ticker}
          onChange={setTicker}
          onSelect={go}
          knownSymbols={knownSymbols}
          market={market}
        />
        <button type="submit" className="check-button">{t("Buka detail")}</button>
      </div>
    </form>
  );
}
