import BreakoutScanner from '../BreakoutScanner.jsx';
import { formatDate, formatPrice } from '../format.js';
import { addSymbol } from '../watchlist.js';

export default function RecommendPage({ account }) {
  const { watchlist } = account;
  const watchlistDisabled = !account.ready || account.pending;

  return (
    <div className="recommend-page">
      <div className="intro">
        <p className="eyebrow">Rekomendasi</p>
        <h1>Breakout & riset AI</h1>
        <p>Scan matematis base breakout (resistance 50 hari + konsolidasi + volume) atau riset AI lintas bursa.</p>
      </div>
      <BreakoutScanner
        watchlist={watchlist}
        disabled={watchlistDisabled}
        formatPrice={formatPrice}
        formatDate={formatDate}
        onAdd={(symbol) =>
          account.update((current) => ({ ...current, watchlist: addSymbol(current.watchlist, symbol) }))
        }
      />
    </div>
  );
}
