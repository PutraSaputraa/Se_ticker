import { Link } from 'react-router-dom';
import SearchForm from '../components/SearchForm.jsx';
import WorkspaceIcon from '../components/WorkspaceIcon.jsx';

export default function HomePage({ account }) {
  const { history, ready, readError } = account;
  return (
    <div className="search-page">
      <header className="page-heading">
        <h1>Cari saham</h1>
        <p>Buka grafik, level trading, dan analisis dari sesi perdagangan terakhir yang sudah tutup.</p>
      </header>
      <div className="search-layout">
        <section className="search-panel" aria-label="Pencarian ticker">
          <SearchForm />
          <nav className="search-shortcuts" aria-label="Pintasan riset">
            <Link to="/watchlist"><WorkspaceIcon name="watch" size={17} /> Buka pantauan</Link>
            <Link to="/rekomendasi"><WorkspaceIcon name="scan" size={17} /> Cari kandidat</Link>
          </nav>
        </section>
        <section className="search-history" aria-labelledby="history-label">
          <h2 id="history-label">Pencarian terakhir</h2>
          {history.length > 0 ? (
            <ul>
              {history.map((symbol) => (
                <li key={symbol}>
                  <Link to={`/stock/${encodeURIComponent(symbol)}`}>
                    <span className="symbol-badge">{symbol}</span>
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
