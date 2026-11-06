import { useEffect, useRef, useState } from 'react';
import './App.css';

const historyKey = 'cek-saham:recent';
const historyLimit = 5;
const dateFormat = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const volumeFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const serviceError = 'Layanan harga tidak dapat diakses. Coba lagi.';

function normalizeTicker(ticker, market = 'auto') {
  const symbol = ticker.trim().toUpperCase();
  if (!symbol || symbol.includes('.') || market === 'us') return symbol;
  if (market === 'id') return `${symbol}.JK`;
  if (market === 'jp' || /^\d{3,4}$/.test(symbol)) return `${symbol}.T`;
  if (/^[A-Z]{2,5}$/.test(symbol) && symbol !== 'AAPL') return `${symbol}.JK`;
  return symbol;
}

function readHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(historyKey) ?? '[]');
    if (Array.isArray(saved)) {
      const tickers = saved.filter((ticker) => typeof ticker === 'string' && ticker.trim());
      return [...new Set(tickers)].slice(0, historyLimit);
    }
  } catch {
    // Riwayat tersimpan mungkin rusak atau penyimpanan diblokir browser.
  }
  return [];
}

function formatPrice(price, currency) {
  const integer = { maximumFractionDigits: 0 };
  const decimal = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

  if (currency === 'JPY') return `¥${price.toLocaleString('id-ID', integer)}`;
  if (currency === 'IDR') return `Rp${price.toLocaleString('id-ID', integer)}`;
  if (currency === 'USD') return `$${price.toLocaleString('en-US', decimal)}`;
  return `${currency} ${price.toLocaleString('id-ID', decimal)}`;
}

function formatDate(date) {
  return dateFormat.format(new Date(`${date}T00:00:00Z`));
}

function formatVolume(volume) {
  return volume == null ? 'Tidak tersedia' : `${volumeFormat.format(volume)} lembar`;
}

const trends = {
  1: { label: 'Naik', className: 'up' },
  0: { label: 'Tetap', className: 'flat' },
  '-1': { label: 'Turun', className: 'down' },
};

const volumeStatuses = {
  true: { label: 'Memenuhi', className: 'pass' },
  false: { label: 'Di bawah ambang', className: 'below' },
  null: { label: 'Tidak tersedia', className: 'missing' },
};

function VolumeChecks({ trigger }) {
  const { averageVolume, minimumVolume, volumeChecks } = trigger;

  return (
    <section className="volume-checks" aria-labelledby="volume-title">
      <h3 id="volume-title">Cek volume per sesi</h3>
      <p className="trigger-note">Ambang 1,4 × rata-rata volume dari 50 sesi sebelum kedua sesi yang dicek.</p>
      {minimumVolume === null ? (
        <p className="trigger-note">Riwayat volume 50 sesi belum lengkap.</p>
      ) : (
        <dl className="volume-baseline">
          <div>
            <dt>Rata-rata 50 sesi</dt>
            <dd>{formatVolume(averageVolume)}</dd>
          </div>
          <div>
            <dt>Ambang minimum</dt>
            <dd>{formatVolume(minimumVolume)}</dd>
          </div>
        </dl>
      )}
      <ul>
        {volumeChecks.map(({ date, volume, meetsThreshold }, index) => {
          const label = index === 0 ? 'Sesi acuan' : 'Sesi sebelum acuan';
          const status = volumeStatuses[meetsThreshold];
          return (
            <li key={label}>
              <div>
                <strong>{label}</strong>
                {date && <time dateTime={date}>{formatDate(date)}</time>}
              </div>
              <div className="volume-check-result">
                {volume !== null && <strong>{formatVolume(volume)}</strong>}
                <span className={`volume-status volume-status--${status.className}`}>{status.label}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function QuoteCard({ quote }) {
  const { symbol, name, exchange, date, open, high, low, close, volume, currency, buyTrigger } = quote;
  const trend = trends[Math.sign(close - open)];
  const level = buyTrigger?.level ?? null;

  return (
    <article className="quote-card">
      <div className="quote-highlight">
        <div className="quote-heading">
          <div>
            <span className="symbol-badge">{symbol}</span>
            {exchange && <span className="exchange-label">{exchange}</span>}
            <h2>{name}</h2>
          </div>
          <div className="quote-date">
            <span>Sesi acuan</span>
            <time dateTime={date}>{formatDate(date)}</time>
          </div>
        </div>
        <div className="featured-price">
          <p>Level Buy Trigger</p>
          {level === null ? (
            <>
              <strong className="featured-price-missing">Tidak tersedia</strong>
              <span>Harga tutup sesi sebelum acuan dibutuhkan.</span>
            </>
          ) : (
            <>
              <strong>{formatPrice(level, currency)}</strong>
              <span>Untuk sesi berikutnya · True Range {formatPrice(buyTrigger.trueRange, currency)}</span>
            </>
          )}
        </div>
      </div>
      <dl className="quote-details" aria-label="OHLCV sesi acuan">
        <div>
          <dt>Buka</dt>
          <dd>{formatPrice(open, currency)}</dd>
        </div>
        <div>
          <dt>Tertinggi</dt>
          <dd>{formatPrice(high, currency)}</dd>
        </div>
        <div>
          <dt>Terendah</dt>
          <dd>{formatPrice(low, currency)}</dd>
        </div>
        <div>
          <dt>Tutup</dt>
          <dd className={`trend trend--${trend.className}`}>
            {formatPrice(close, currency)}
            <span className="trend-label">{trend.label}</span>
          </dd>
        </div>
        <div>
          <dt>Volume</dt>
          <dd>{formatVolume(volume)}</dd>
        </div>
      </dl>
      {buyTrigger && <VolumeChecks trigger={buyTrigger} />}
    </article>
  );
}

export default function App() {
  const [ticker, setTicker] = useState('');
  const [market, setMarket] = useState('auto');
  const [history, setHistory] = useState(readHistory);
  const [result, setResult] = useState({ status: 'idle' });
  const activeSearch = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(historyKey, JSON.stringify(history));
    } catch {
      // Pencarian tetap berjalan jika penyimpanan browser tidak tersedia.
    }
  }, [history]);

  useEffect(() => () => activeSearch.current?.abort(), []);

  async function search(symbol) {
    activeSearch.current?.abort();

    if (!symbol) {
      setResult({ status: 'error', message: 'Masukkan kode ticker terlebih dahulu.' });
      return;
    }

    const controller = new AbortController();
    activeSearch.current = controller;
    setResult({ status: 'loading', symbol });

    try {
      const params = new URLSearchParams({ symbol });
      const response = await fetch(`/.netlify/functions/price?${params}`, {
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (controller.signal.aborted) return;

      if (!response.ok || !payload) {
        setResult({ status: 'error', message: payload?.error || serviceError });
        return;
      }

      setResult({ status: 'success', quote: payload });
      setHistory((previous) => [
        symbol,
        ...previous.filter((item) => item !== symbol),
      ].slice(0, historyLimit));
    } catch {
      if (!controller.signal.aborted) {
        setResult({ status: 'error', message: serviceError });
      }
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    search(normalizeTicker(ticker, market));
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m4 17 5.5-5.5 3.5 3.5 7-8m-5 0h5v5" />
              </svg>
            </span>
            Cek Saham
          </div>
          <span className="topbar-label">Data historis</span>
        </div>
      </header>

      <main className="workspace">
        <div className="intro">
          <p className="eyebrow">Ringkasan pasar</p>
          <h1>Cek Buy Trigger</h1>
          <p>Lihat level sesi berikutnya, OHLCV sesi acuan, dan dua cek volume.</p>
        </div>

        <div className="search-card">
          <form onSubmit={handleSubmit}>
            <div className="ticker-row">
              <div className="market-field">
                <label htmlFor="market">Bursa</label>
                <select id="market" value={market} onChange={(event) => setMarket(event.target.value)}>
                  <option value="auto">Otomatis</option>
                  <option value="us">AS</option>
                  <option value="id">Indonesia</option>
                  <option value="jp">Jepang</option>
                </select>
              </div>
              <div className="ticker-field">
                <label htmlFor="ticker">Kode ticker</label>
                <div className="input-wrap">
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                    <circle cx="10.8" cy="10.8" r="5.8" />
                    <path d="m15.1 15.1 4.3 4.3" />
                  </svg>
                  <input
                    id="ticker"
                    name="ticker"
                    type="text"
                    value={ticker}
                    onChange={(event) => setTicker(event.target.value)}
                    placeholder="Mis. NVDA atau BBCA"
                    aria-describedby="ticker-hint"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </div>
              <button type="submit" className="check-button">
                Cek
                <svg aria-hidden="true" viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10h11m-4-4 4 4-4 4" />
                </svg>
              </button>
            </div>
            <p id="ticker-hint" className="hint">
              <span>NVDA, MSFT, AAPL (pilih AS)</span>
              <span>BBCA → BBCA.JK (Indonesia)</span>
              <span>7203 → 7203.T (Jepang)</span>
            </p>
          </form>

          {history.length > 0 && (
            <section className="history" aria-labelledby="history-label">
              <h2 id="history-label">Pencarian terakhir</h2>
              <ul>
                {history.map((symbol) => (
                  <li key={symbol}>
                    <button
                      type="button"
                      className="chip"
                      onClick={() => {
                        setTicker(symbol);
                        setMarket(normalizeTicker(symbol) === symbol ? 'auto' : 'us');
                        search(symbol);
                      }}
                    >
                      {symbol}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="output" aria-live="polite">
          {result.status === 'idle' && (
            <div className="status-card">
              <span className="status-mark">
                <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <path d="M5 18v-5m5 5V8m5 10v-7m5 7V5" />
                </svg>
              </span>
              <div>
                <p className="status-title">Ringkasan sesi perdagangan</p>
                <p>Pilih bursa dan masukkan ticker untuk melihat level Buy Trigger.</p>
              </div>
            </div>
          )}
          {result.status === 'loading' && (
            <div className="status-card">
              <span className="spinner" aria-hidden="true" />
              <div>
                <p className="status-title">Memuat...</p>
                <p>Mengambil data {result.symbol} dari Yahoo Finance.</p>
              </div>
            </div>
          )}
          {result.status === 'error' && (
            <div className="status-card status-card--error">
              <span className="status-mark" aria-hidden="true">!</span>
              <div>
                <p className="status-title">Pencarian gagal</p>
                <p>{result.message}</p>
              </div>
            </div>
          )}
          {result.status === 'success' && <QuoteCard quote={result.quote} />}
        </div>

        <footer className="source">Data historis dari Yahoo Finance.</footer>
      </main>
    </>
  );
}
