import { useNavigate } from 'react-router-dom';
import WatchlistTable from '../WatchlistTable.jsx';
import { formatPrice } from '../format.js';
import { removeSymbol, setPriceToWatch } from '../watchlist.js';

export default function WatchlistPage({ account }) {
  const navigate = useNavigate();
  const { watchlist } = account;
  const watchlistDisabled = !account.ready || account.pending;

  return (
    <section className="watchlist watchlist-page" aria-labelledby="watchlist-title">
      <div className="watchlist-head">
        <h2 id="watchlist-title">Daftar pantauan</h2>
        <p>Breakout ditampilkan terlebih dahulu.</p>
        <p role="status">
          {account.pending
            ? 'Menyimpan perubahan…'
            : account.error
              ? 'Sinkronisasi perlu dicoba lagi.'
              : account.ready
                ? 'Tersinkron dengan akunmu.'
                : 'Memuat daftar pantauan akun…'}
        </p>
      </div>
      {watchlist.length > 0 ? (
        <WatchlistTable
          entries={watchlist}
          formatPrice={formatPrice}
          disabled={watchlistDisabled}
          onOpen={(symbol) => navigate(`/stock/${encodeURIComponent(symbol)}`)}
          onRemove={(symbol) =>
            account.update((current) => ({ ...current, watchlist: removeSymbol(current.watchlist, symbol) }))
          }
          onSetWatchPrice={(symbol, price) =>
            account.update((current) => ({ ...current, watchlist: setPriceToWatch(current.watchlist, symbol, price) }))
          }
        />
      ) : (
        <p className="watchlist-empty">
          {account.ready
            ? 'Belum ada saham dipantau. Buka detail saham lalu tekan "+ Pantau".'
            : 'Daftar pantauan akan tampil setelah data akun berhasil dimuat.'}
        </p>
      )}
    </section>
  );
}
