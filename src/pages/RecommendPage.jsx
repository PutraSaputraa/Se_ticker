import BreakoutScanner from '../BreakoutScanner.jsx';
import { formatDate, formatPrice } from '../format.js';
import { addSymbol } from '../watchlist.js';
import '../styles/research.css';

export default function RecommendPage({ account }) {
  const { watchlist } = account;
  const watchlistDisabled = !account.ready || account.pending;

  return (
    <div className="research-workspace recommend-page">
      <header className="page-heading">
        <h1>Rekomendasi</h1>
        <p>Temukan saham dari pemindaian teknikal atau telusuri kandidat melalui riset AI.</p>
      </header>
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
