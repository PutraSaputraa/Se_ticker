import { useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import CandlestickChart from './CandlestickChart.jsx';
import WatchlistTable from './WatchlistTable.jsx';
import { addSymbol, removeSymbol, setPriceToWatch } from './watchlist.js';
import { clearLegacyData, mergeLegacyData, normalizeHistory, readLegacyData } from './accountData.js';
import { auth } from './firebase.js';
import useAccountData from './useAccountData.js';

const dateFormat = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const shortDateFormat = new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC' });
const volumeFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const serviceError = 'Layanan harga tidak dapat diakses. Coba lagi.';
const markets = {
  auto: { label: 'Otomatis' },
  us: { label: 'AS' },
  id: { label: 'Indonesia', suffix: '.JK' },
  jp: { label: 'Jepang', suffix: '.T' },
  hk: { label: 'Hong Kong', suffix: '.HK', digits: 4 },
  ks: { label: 'Korea Selatan (KOSPI)', suffix: '.KS', digits: 6 },
  kq: { label: 'Korea Selatan (KOSDAQ)', suffix: '.KQ', digits: 6 },
  ss: { label: 'China (Shanghai)', suffix: '.SS', digits: 6 },
  sz: { label: 'China (Shenzhen)', suffix: '.SZ', digits: 6 },
};

function normalizeTicker(ticker, market = 'auto') {
  const symbol = ticker.trim().toUpperCase();
  if (!symbol || symbol.includes('.') || market === 'us') return symbol;
  const { suffix, digits } = markets[market] ?? {};
  if (suffix) {
    const code = /^\d+$/.test(symbol) ? symbol.padStart(digits ?? 0, '0') : symbol;
    return `${code}${suffix}`;
  }
  if (/^\d{3,4}$/.test(symbol)) return `${symbol}.T`;
  if (/^[A-Z]{2,5}$/.test(symbol) && symbol !== 'AAPL') return `${symbol}.JK`;
  return symbol;
}

function formatPrice(price, currency) {
  if (!Number.isFinite(price)) return 'Tidak tersedia';
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

function formatNumberRaw(price, currency) {
  const decimals = currency === 'JPY' || currency === 'IDR' ? 0 : 2;
  return price.toLocaleString('en-US', {
    useGrouping: false,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// Perkiraan sesi berikutnya: lewati akhir pekan (zona waktu UTC mendekati).
function nextSessionDate(date) {
  const d = new Date(`${date}T00:00:00Z`);
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return dateFormat.format(d);
}

function formatVolume(volume) {
  return volume == null ? 'Tidak tersedia' : `${volumeFormat.format(volume)} lembar`;
}

const trends = {
  1: { label: 'Naik', className: 'up' },
  0: { label: 'Tetap', className: 'flat' },
  '-1': { label: 'Turun', className: 'down' },
};

const checkStatuses = {
  true: { label: 'YES', className: 'pass' },
  false: { label: 'NO', className: 'below' },
  null: { label: 'Tidak tersedia', className: 'missing' },
};

function CheckBadge({ passed }) {
  const { label, className } = checkStatuses[passed];
  return <span className={`check-status check-status--${className}`}>{label}</span>;
}

function priceDecimals(currency) {
  return currency === 'JPY' || currency === 'IDR' ? 0 : 2;
}

function parseWatchPrice(input, decimals) {
  const text = input.trim();
  const pattern = decimals === 0 ? /^\d+$/ : /^\d+(?:[.,]\d{1,2})?$/;
  if (!pattern.test(text)) return null;
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function volumeDetail(check) {
  return check?.date
    ? `${formatDate(check.date)} · ${formatVolume(check.volume)}`
    : 'Data sesi belum tersedia.';
}

function spreadsheetRows(quote, watchPrice) {
  const { close, currency, buyTrigger } = quote;
  const [reference, previous] = buyTrigger?.volumeChecks ?? [];
  const closeLabel = formatPrice(close, currency);
  const displayedClose = Number(close.toLocaleString('en-US', {
    useGrouping: false,
    maximumFractionDigits: priceDecimals(currency),
  }));

  return [
    {
      column: 'N',
      label: 'Buy berdasarkan volume sesi acuan',
      detail: volumeDetail(reference),
      passed: reference?.meetsThreshold ?? null,
    },
    {
      column: 'M',
      label: 'Buy berdasarkan volume sesi sebelumnya',
      detail: volumeDetail(previous),
      passed: previous?.meetsThreshold ?? null,
    },
    {
      column: 'A',
      label: 'Buy berdasarkan price to watch',
      detail: `Harga pantauan di bawah Close ${closeLabel} memenuhi syarat.`,
      passed: watchPrice === null ? null : displayedClose > watchPrice,
    },
  ];
}

function SpreadsheetChecks({ quote }) {
  const [watchInput, setWatchInput] = useState('');
  const decimals = priceDecimals(quote.currency);
  const watchPrice = parseWatchPrice(watchInput, decimals);
  const minimumVolume = quote.buyTrigger?.minimumVolume;

  return (
    <section className="sheet-checks" aria-labelledby="sheet-checks-title">
      <h3 id="sheet-checks-title">Cek volume dan harga pantauan</h3>
      <p className="sheet-check-detail">
        {minimumVolume == null
          ? 'Ambang volume belum tersedia. Perlu riwayat volume 50 sesi.'
          : `Ambang volume ${formatVolume(minimumVolume)} dari 1,4 × rata-rata volume 50 sesi.`}
      </p>
      <ul>
        {spreadsheetRows(quote, watchPrice).map(({ column, label, detail, passed }) => (
          <li key={column}>
            <span className="sheet-column">{column}</span>
            <div>
              <strong>{label}</strong>
              <p className="sheet-check-detail">{detail}</p>
              {column === 'A' && (
                <div className="watch-field">
                  <label htmlFor="watch-price">Harga pantauan ({quote.currency})</label>
                  <input
                    id="watch-price"
                    type="text"
                    inputMode={decimals === 0 ? 'numeric' : 'decimal'}
                    autoComplete="off"
                    placeholder={decimals === 0 ? 'Mis. 5200' : 'Mis. 189,50'}
                    value={watchInput}
                    onChange={(event) => setWatchInput(event.target.value)}
                    aria-describedby="watch-hint"
                    aria-invalid={watchInput.trim() !== '' && watchPrice === null}
                  />
                  <p id="watch-hint" className="sheet-check-detail">
                    {decimals === 0
                      ? 'Masukkan angka bulat tanpa pemisah ribuan.'
                      : 'Gunakan maksimal dua angka desimal, tanpa pemisah ribuan.'}
                  </p>
                </div>
              )}
            </div>
            <CheckBadge passed={passed} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard tidak tersedia (mis. bukan HTTPS) — biarkan senyap.
    }
  }

  return (
    <button
      type="button"
      className={`copy-button${copied ? ' copy-button--copied' : ''}`}
      onClick={handleCopy}
      title={label}
      aria-label={label}
    >
      {copied ? '✓ Tersalin' : '⧉ Salin'}
    </button>
  );
}

function TriggerLevels({ buyTrigger, close, currency, referenceDate }) {
  const { level, sellLevel, trueRange } = buyTrigger ?? {};
  const sides = [
    { side: 'Long', label: 'Level Buy Trigger', price: level, passed: Number.isFinite(level) && level >= close },
    { side: 'Short', label: 'Level Sell Trigger', price: sellLevel, passed: Number.isFinite(sellLevel) && sellLevel <= close },
  ];

  return (
    <div className="trigger-levels">
      <div className="trigger-columns">
        {sides.map(({ side, label, price, passed }) => {
          const hasPrice = Number.isFinite(price);
          return (
            <section className="trigger-column" aria-label={side} key={side}>
              <h3 className="trigger-side">{side}</h3>
              <p className="trigger-label">{label}</p>
              <strong className={hasPrice ? 'trigger-price' : 'trigger-price trigger-price--missing'}>
                {hasPrice ? formatPrice(price, currency) : 'Tidak tersedia'}
              </strong>
              <div className="trigger-tools">
                <CheckBadge passed={passed} />
                {hasPrice && (
                  <CopyButton
                    text={formatNumberRaw(price, currency)}
                    label={`Salin ${label} ${formatPrice(price, currency)}`}
                  />
                )}
              </div>
            </section>
          );
        })}
      </div>
      <p className="trigger-note">
        {Number.isFinite(trueRange)
          ? `Trigger untuk sesi ${nextSessionDate(referenceDate)} · True Range ${formatPrice(trueRange, currency)}`
          : 'Harga tutup sesi sebelum acuan dibutuhkan.'}
      </p>
    </div>
  );
}

function QuoteCard({ quote, inWatchlist, onToggleWatchlist, watchlistDisabled }) {
  const { symbol, name, exchange, date, open, high, low, close, volume, currency, buyTrigger } = quote;
  const trend = trends[Math.sign(close - open)];
  const { previousClose, averageVolume } = buyTrigger ?? {};
  const previousDate = buyTrigger?.volumeChecks?.[1]?.date;

  return (
    <article className="quote-card">
      <div className="quote-highlight">
        <div className="quote-heading">
          <div>
            <span className="symbol-badge">{symbol}</span>
            {exchange && <span className="exchange-label">{exchange}</span>}
            <h2>{name}</h2>
          </div>
          <div className="quote-heading-side">
            <div className="quote-date">
              <span>Sesi acuan</span>
              <time dateTime={date}>{formatDate(date)}</time>
            </div>
            <button
              type="button"
              className={`watch-toggle${inWatchlist ? ' watch-toggle--active' : ''}`}
              onClick={() => onToggleWatchlist(symbol)}
              aria-pressed={inWatchlist}
              disabled={watchlistDisabled}
            >
              {inWatchlist ? '✓ Dipantau' : '+ Pantau'}
            </button>
          </div>
        </div>
        <TriggerLevels buyTrigger={buyTrigger} close={close} currency={currency} referenceDate={date} />
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
      <dl className="quote-details quote-history" aria-label="Riwayat sesi">
        <div>
          <dt>Rata-rata volume 50 sesi</dt>
          <dd>{formatVolume(averageVolume)}</dd>
        </div>
        <div>
          <dt>Close 2 sesi lalu</dt>
          <dd>
            {Number.isFinite(previousClose) ? formatPrice(previousClose, currency) : 'Tidak tersedia'}
            {previousDate && <time dateTime={previousDate}>{formatDate(previousDate)}</time>}
          </dd>
        </div>
      </dl>
      <SpreadsheetChecks quote={quote} />
      <CandlestickChart
        sessions={quote.priceHistory ?? []}
        referenceDate={date}
        buyLevel={buyTrigger?.level}
        sellLevel={buyTrigger?.sellLevel}
        averageVolume={averageVolume}
        formatPrice={(price) => formatPrice(price, currency)}
        formatDate={formatDate}
        formatVolume={formatVolume}
      />
    </article>
  );
}

export default function App({ user }) {
  const [ticker, setTicker] = useState('');
  const [market, setMarket] = useState('auto');
  const [result, setResult] = useState({ status: 'idle' });
  const account = useAccountData(user.uid);
  const { watchlist, history } = account;
  const [legacy, setLegacy] = useState(readLegacyData);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const activeSearch = useRef(null);
  const watchlistDisabled = !account.ready || account.pending;

  useEffect(() => () => activeSearch.current?.abort(), []);

  function toggleWatchlist(symbol) {
    const alreadyWatched = watchlist.some((entry) => entry.symbol === symbol);
    account.update((current) => ({
      ...current,
      watchlist: alreadyWatched ? removeSymbol(current.watchlist, symbol) : addSymbol(current.watchlist, symbol),
    }));
  }

  async function importLegacy() {
    if (await account.update((current) => mergeLegacyData(current, legacy))) {
      clearLegacyData();
      setLegacy({ watchlist: [], history: [] });
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError('');
    try {
      await signOut(auth);
    } catch {
      setSignOutError('Gagal keluar dari akun. Coba lagi.');
      setSigningOut(false);
    }
  }

  function openFromWatchlist(symbol) {
    setTicker(symbol);
    setMarket('auto');
    search(symbol);
  }

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
      account.update((current) => ({ ...current, history: normalizeHistory([symbol, ...current.history]) }));
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
          <div className="account-controls">
            <span className="account-email" title={user.email}>{user.email}</span>
            <button type="button" className="account-signout" disabled={signingOut} onClick={handleSignOut}>
              {signingOut ? 'Keluar…' : 'Keluar'}
            </button>
          </div>
        </div>
      </header>

      <main className="workspace">
        {(account.error || signOutError) && (
          <div className="account-message account-message--error" role="alert">
            <p>{signOutError || account.error}</p>
            {account.readError && <button type="button" className="text-button" onClick={account.retry}>Coba lagi</button>}
          </div>
        )}
        {(legacy.watchlist.length > 0 || legacy.history.length > 0) && (
          <div className="legacy-import">
            <p>Data lama di browser ini tersedia. Impor {legacy.watchlist.length} saham pantauan dan {legacy.history.length} riwayat pencarian ke akun {user.email}.</p>
            <button type="button" className="account-signout" disabled={watchlistDisabled} onClick={importLegacy}>Impor ke akun</button>
          </div>
        )}
        <div className="intro">
          <p className="eyebrow">Ringkasan pasar</p>
          <h1>Cek Buy Trigger</h1>
          <p>Lihat level Buy Trigger, OHLCV, dan cek dari spreadsheet.</p>
        </div>

        <div className="search-card">
          <form onSubmit={handleSubmit}>
            <div className="ticker-row">
              <div className="market-field">
                <label htmlFor="market">Bursa</label>
                <select id="market" value={market} onChange={(event) => setMarket(event.target.value)}>
                  {Object.entries(markets).map(([value, { label }]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
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
              <span>0700 (Hong Kong)</span>
              <span>005930 (KOSPI)</span>
              <span>600519 (Shanghai)</span>
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

        <div className="board">
          <section className="watchlist" aria-labelledby="watchlist-title">
            <div className="watchlist-head">
              <h2 id="watchlist-title">Daftar pantauan</h2>
              <p>Breakout ditampilkan terlebih dahulu.</p>
              <p role="status">{account.pending ? 'Menyimpan perubahan…' : account.error ? 'Sinkronisasi perlu dicoba lagi.' : account.ready ? 'Tersinkron dengan akunmu.' : 'Memuat daftar pantauan akun…'}</p>
            </div>
            {watchlist.length > 0 ? (
              <WatchlistTable
                entries={watchlist}
                formatPrice={formatPrice}
                disabled={watchlistDisabled}
                onOpen={openFromWatchlist}
                onRemove={(symbol) => account.update((current) => ({ ...current, watchlist: removeSymbol(current.watchlist, symbol) }))}
                onSetWatchPrice={(symbol, price) =>
                  account.update((current) => ({ ...current, watchlist: setPriceToWatch(current.watchlist, symbol, price) }))
                }
              />
            ) : (
              <p className="watchlist-empty">
                {account.ready ? 'Belum ada saham dipantau. Cek ticker lalu tekan "+ Pantau" untuk menambahkannya di sini.' : 'Daftar pantauan akan tampil setelah data akun berhasil dimuat.'}
              </p>
            )}
          </section>

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
            {result.status === 'success' && (
              <QuoteCard
                quote={result.quote}
                inWatchlist={watchlist.some((entry) => entry.symbol === result.quote.symbol)}
                onToggleWatchlist={toggleWatchlist}
                watchlistDisabled={watchlistDisabled}
              />
            )}
          </div>
        </div>

        <footer className="source">Data historis dari Yahoo Finance.</footer>
      </main>
    </>
  );
}
