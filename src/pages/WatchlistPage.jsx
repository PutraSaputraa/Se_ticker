import { Link, useNavigate } from 'react-router-dom';
import WatchlistTable from '../WatchlistTable.jsx';
import { formatPrice } from '../format.js';
import { removeSymbol, setPriceToWatch } from '../watchlist.js';
import '../styles/research.css';

export default function WatchlistPage({ account }) {
  const navigate = useNavigate();
  const { watchlist } = account;
  const watchlistDisabled = !account.ready || account.pending;
  const sync = account.pending ? 'pending' : account.error ? 'error' : account.ready ? 'ready' : 'loading';
  const syncLabel = {
    pending: 'Menyimpan perubahan…',
    error: account.readError ? 'Gagal memuat data akun' : 'Gagal menyimpan perubahan',
    ready: 'Tersinkron dengan akun',
    loading: 'Memuat data akun…',
  }[sync];

  return (
    <div className="research-workspace watchlist-page">
      <header className="page-heading research-heading">
        <div>
          <h1>Pantauan saham</h1>
          <p>Bandingkan harga penutupan, level trigger, dan kriteria Stage 2.</p>
        </div>
        <Link className="scan-button" to="/">Cari saham</Link>
      </header>

      <section className="research-panel" aria-labelledby="watchlist-title">
        <div className="research-panel-heading">
          <div>
            <h2 id="watchlist-title">Daftar pantauan</h2>
            {watchlist.length > 0 && <p>{watchlist.length} saham · Breakout diurutkan pertama</p>}
          </div>
          <span className="research-sync" data-state={sync} role="status">{syncLabel}</span>
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
        ) : account.ready ? (
          <div className="research-empty">
            <h3>Belum ada saham dipantau</h3>
            <p>Cari ticker, buka detail saham, lalu pilih Pantau.</p>
          </div>
        ) : (
          <p className="research-empty">{account.readError
            ? 'Daftar pantauan tersedia setelah sinkronisasi berhasil.'
            : 'Mengambil daftar saham yang tersimpan di akunmu.'}</p>
        )}
      </section>
    </div>
  );
}
