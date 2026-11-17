import { Link, useSearchParams } from 'react-router-dom';
import SearchForm from '../components/SearchForm.jsx';
import WorkspaceIcon from '../components/WorkspaceIcon.jsx';
import { accountTickerSymbols } from '../tickers.js';

export default function HomePage({ account }) {
  const { history, ready, readError } = account;
  const [params] = useSearchParams();
  const initialTicker = params.get('ticker') ?? '';
  return (
    <div className="search-page">
      <div className="search-layout">
        <section className="search-panel" aria-labelledby="search-title">
          <header className="page-heading search-heading">
            <span className="search-heading-icon"><WorkspaceIcon name="search" size={25} /></span>
            <div>
              <h1 id="search-title">Cari saham</h1>
              <p>Buka grafik, level trading, dan analisis dari sesi perdagangan terakhir yang sudah tutup.</p>
            </div>
          </header>
          <SearchForm key={initialTicker} initialTicker={initialTicker} knownSymbols={accountTickerSymbols(account)} />
          <nav className="search-shortcuts" aria-label="Pintasan riset">
            <Link to="/watchlist">
              <span className="search-shortcut-icon"><WorkspaceIcon name="watch" size={18} /></span>
              <span>Buka pantauan</span>
              <WorkspaceIcon name="arrow" size={16} />
            </Link>
            <Link to="/rekomendasi">
              <span className="search-shortcut-icon"><WorkspaceIcon name="scan" size={18} /></span>
              <span>Cari kandidat</span>
              <WorkspaceIcon name="arrow" size={16} />
            </Link>
          </nav>
        </section>
        <section className="search-history" aria-labelledby="history-label">
          <header><WorkspaceIcon name="history" size={20} /><h2 id="history-label">Pencarian terakhir</h2></header>
          {history.length > 0 ? (
            <ul>
              {history.map((symbol) => (
                <li key={symbol}>
                  <Link to={`/stock/${encodeURIComponent(symbol)}`}>
                    <span className="search-history-symbol">{symbol}</span>
                    <WorkspaceIcon name="arrow" size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p role="status">{readError
            ? 'Riwayat gagal dimuat.'
            : ready ? 'Cari ticker untuk mulai mengisi riwayat.' : 'Memuat riwayat akun…'}</p>}
        </section>
      </div>
    </div>
  );
}
