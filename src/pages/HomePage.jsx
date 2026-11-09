import SearchForm from '../components/SearchForm.jsx';

export default function HomePage({ history }) {
  return (
    <>
      <div className="intro">
        <p className="eyebrow">Ringkasan pasar</p>
        <h1>Cek Buy Trigger</h1>
        <p>Masukkan kode ticker untuk melihat detail lengkap: level Buy Trigger, target, risiko, status breakout, OHLCV, dan grafik.</p>
      </div>

      <div className="search-card">
        <SearchForm />
        {history.length > 0 && (
          <section className="history" aria-labelledby="history-label">
            <h2 id="history-label">Pencarian terakhir</h2>
            <ul>
              {history.map((symbol) => (
                <li key={symbol}>
                  <a className="chip" href={`/stock/${encodeURIComponent(symbol)}`}>{symbol}</a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="home-cards">
        <a className="home-card" href="/rekomendasi">
          <h3>Rekomendasi breakout</h3>
          <p>Scan matematis base breakout & riset AI lintas bursa.</p>
        </a>
        <a className="home-card" href="/watchlist">
          <h3>Daftar pantauan</h3>
          <p>Saham yang kamu tandai untuk dipantau.</p>
        </a>
      </div>
    </>
  );
}
