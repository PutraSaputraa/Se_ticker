import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CandlestickChart from '../CandlestickChart.jsx';
import MinerviniPanel from '../components/MinerviniPanel.jsx';
import TableScroll from '../components/TableScroll.jsx';
import {
  formatCompactNumber,
  formatDate,
  formatPct,
  formatPrice,
  formatVolume,
} from '../format.js';
import { suggestTickerAlternatives } from '../tickers.js';
import { addSymbol, removeSymbol } from '../watchlist.js';
import '../styles/stock.css';

const serviceError = 'Layanan harga tidak dapat diakses. Coba lagi.';
const defaultRange = '3m';

const breakoutStatusMeta = {
  breakout: { label: 'Sedang breakout', className: 'status--breakout' },
  'menembus-tanpa-base': { label: 'Menembus resistance', className: 'status--near' },
  mendekati: { label: 'Mendekati breakout', className: 'status--near' },
  menunggu: { label: 'Menunggu breakout', className: 'status--wait' },
};

const trends = {
  1: { label: 'Naik', className: 'up' },
  0: { label: 'Tetap', className: 'flat' },
  '-1': { label: 'Turun', className: 'down' },
};

function StatusBadge({ status }) {
  const meta = breakoutStatusMeta[status] ?? breakoutStatusMeta.menunggu;
  return <span className={`detail-status ${meta.className}`}>{meta.label}</span>;
}

function TradingLevel({ label, value, hint, tone }) {
  return (
    <div className={`stock-level${tone ? ` stock-level--${tone}` : ''}`}>
      <dt>{label}</dt>
      <dd>
        <strong>{value}</strong>
        {hint && <small>{hint}</small>}
      </dd>
    </div>
  );
}

function FundamentalsTable({ fundamentals }) {
  const { quarterlyEps = [], annualRevenue = [] } = fundamentals ?? {};
  if (!quarterlyEps.length && !annualRevenue.length) {
    return (
      <section className="stock-data-section" aria-labelledby="fundamentals-title">
        <h2 id="fundamentals-title">Fundamental</h2>
        <p className="stock-muted">Data EPS dan pendapatan belum tersedia.</p>
      </section>
    );
  }

  const latestQ = quarterlyEps.slice(-4);
  const latestAnnualRev = annualRevenue.slice(-3);

  // EPS growth Q-to-Q (kuartal terhadap kuartal sebelumnya).
  const epsGrowth = latestQ.map((point, idx) => {
    if (idx === 0) return null;
    const prev = latestQ[idx - 1].value;
    return prev !== 0 ? ((point.value - prev) / Math.abs(prev)) * 100 : null;
  });
  // Revenue growth tahunan (tahun terhadap tahun sebelumnya).
  const revGrowth = latestAnnualRev.map((point, idx) => {
    if (idx === 0) return null;
    const prev = latestAnnualRev[idx - 1].value;
    return prev !== 0 ? ((point.value - prev) / Math.abs(prev)) * 100 : null;
  });

  return (
    <section className="stock-data-section" aria-labelledby="fundamentals-title">
      <h2 id="fundamentals-title">Fundamental</h2>
      <div className="stock-fundamentals-grid">
        {latestQ.length > 0 && (
          <div>
            <h3>EPS kuartalan</h3>
            <TableScroll className="stock-table-scroll" label="Tabel EPS kuartalan">
              <table className="fund-table">
              <thead>
                <tr><th>Kuartal</th><th className="num">EPS</th><th className="num">Perubahan QoQ</th></tr>
              </thead>
              <tbody>
                {latestQ.map((point, idx) => (
                  <tr key={point.date}>
                    <td>{point.date}</td>
                    <td className="num">{point.value.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
                    <td className={`num ${epsGrowth[idx] != null && epsGrowth[idx] >= 0 ? 'trend--up' : 'trend--down'}`}>
                      {epsGrowth[idx] == null ? '–' : formatPct(epsGrowth[idx])}
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </TableScroll>
          </div>
        )}
        {latestAnnualRev.length > 0 && (
          <div>
            <h3>Pendapatan tahunan</h3>
            <TableScroll className="stock-table-scroll" label="Tabel pendapatan tahunan">
              <table className="fund-table">
              <thead>
                <tr><th>Tahun</th><th className="num">Pendapatan</th><th className="num">Perubahan YoY</th></tr>
              </thead>
              <tbody>
                {latestAnnualRev.map((point, idx) => (
                  <tr key={point.date}>
                    <td>{point.date?.slice(0, 4)}</td>
                    <td className="num">{formatCompactNumber(point.value)}</td>
                    <td className={`num ${revGrowth[idx] != null && revGrowth[idx] >= 0 ? 'trend--up' : 'trend--down'}`}>
                      {revGrowth[idx] == null ? '–' : formatPct(revGrowth[idx])}
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </TableScroll>
          </div>
        )}
      </div>
    </section>
  );
}

export default function StockDetailPage({ account }) {
  const { symbol = '' } = useParams();
  return <StockDetail key={symbol} symbol={symbol.trim().toUpperCase()} account={account} />;
}

function StockDetail({ symbol, account }) {
  const [range, setRange] = useState(defaultRange);
  const [result, setResult] = useState({ status: 'loading' });
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [chartData, setChartData] = useState({ status: 'idle' });
  const [chartAttempt, setChartAttempt] = useState(0);
  const [minervini, setMinervini] = useState({ status: 'loading' });

  const { watchlist } = account;
  const watchlistDisabled = !account.ready || account.pending;
  const inWatchlist = watchlist.some((entry) => entry.symbol === symbol);
  const quote = result.status === 'success' ? result.quote : null;

  useEffect(() => {
    const controller = new AbortController();
    setResult({ status: 'loading' });

    (async () => {
      try {
        const params = new URLSearchParams({ symbol, range: defaultRange });
        const response = await fetch(`/.netlify/functions/stock?${params}`, { signal: controller.signal });
        const payload = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!response.ok || !payload) {
          setResult({
            status: 'error',
            message: payload?.error || serviceError,
            notFound: payload?.code === 'TICKER_NOT_FOUND',
            retryable: response.status >= 500 || !payload,
          });
          return;
        }
        setResult({ status: 'success', quote: payload });
        account.update((current) => ({
          ...current,
          history: [symbol, ...current.history.filter((item) => item !== symbol)].slice(0, 5),
        }));
      } catch {
        if (!controller.signal.aborted) {
          setResult({ status: 'error', message: serviceError, retryable: true });
        }
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, detailAttempt]);

  // Detail sudah berisi grafik untuk rentang awal.
  useEffect(() => {
    if (!quote || range === defaultRange) return;
    const controller = new AbortController();
    setChartData((previous) => ({ ...previous, status: 'loading' }));

    (async () => {
      try {
        const params = new URLSearchParams({ symbol, range });
        const response = await fetch(`/.netlify/functions/stock?${params}`, { signal: controller.signal });
        const payload = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!response.ok || !payload) {
          setChartData((previous) => ({ ...previous, status: 'error', message: payload?.error || serviceError }));
          return;
        }
        setChartData({
          status: 'success',
          snapshot: {
            range: payload.range ?? range,
            priceHistory: payload.priceHistory,
            availableRanges: payload.availableRanges,
          },
        });
      } catch {
        if (!controller.signal.aborted) {
          setChartData((previous) => ({ ...previous, status: 'error', message: serviceError }));
        }
      }
    })();

    return () => controller.abort();
  }, [quote, symbol, range, chartAttempt]);

  function toggleWatchlist() {
    account.update((current) => ({
      ...current,
      watchlist: inWatchlist
        ? removeSymbol(current.watchlist, symbol)
        : addSymbol(current.watchlist, symbol),
    }));
  }

  useEffect(() => {
    if (!quote) return;
    const controller = new AbortController();
    (async () => {
      try {
        const params = new URLSearchParams({ symbol, rs: 'false' });
        const response = await fetch(`/.netlify/functions/analyze?${params}`, { signal: controller.signal });
        const payload = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!response.ok || !payload) {
          setMinervini({ status: 'error', message: payload?.error });
          return;
        }
        setMinervini({ status: 'success', data: payload });
      } catch {
        if (!controller.signal.aborted) setMinervini({ status: 'error' });
      }
    })();
    return () => controller.abort();
  }, [quote, symbol]);

  const currency = quote?.currency;
  const trend = quote ? trends[Math.sign(quote.close - quote.open)] : null;
  const changeFromOpen = quote?.open > 0 ? (quote.close / quote.open - 1) * 100 : null;
  const analysis = quote?.analysis ?? {};
  const buyTrigger = quote?.buyTrigger ?? {};
  const chartSnapshot = range === defaultRange ? null : chartData.snapshot;
  const alternatives = result.notFound ? suggestTickerAlternatives(symbol) : [];
  const searchUrl = result.status === 'error' ? `/?${new URLSearchParams({ ticker: symbol })}` : '/';

  return (
    <div className="stock-detail">
      <nav className="stock-breadcrumb" aria-label="Jalur halaman">
        <Link to={searchUrl}>← Cari saham</Link>
      </nav>

      {result.status === 'loading' && (
        <div className="status-card" role="status">
          <span className="spinner" aria-hidden="true" />
          <div>
            <p className="status-title">Memuat {symbol}…</p>
            <p>Mengambil data detail dari Yahoo Finance.</p>
          </div>
        </div>
      )}

      {result.status === 'error' && (
        <div className="status-card status-card--error">
          <span className="status-mark" aria-hidden="true">!</span>
          <div>
            <div role="alert">
              <p className="status-title">Gagal memuat</p>
              <p>{result.message}</p>
            </div>
            {alternatives.length > 0 && (
              <ul className="stock-ticker-alternatives" aria-label="Ticker serupa">
                {alternatives.map(({ symbol: candidate, market }) => (
                  <li key={candidate}>
                    <Link to={`/stock/${encodeURIComponent(candidate)}`}>{candidate} · {market}</Link>
                  </li>
                ))}
              </ul>
            )}
            {result.retryable && (
              <button className="text-button" type="button" onClick={() => setDetailAttempt((attempt) => attempt + 1)}>
                Coba lagi
              </button>
            )}
          </div>
        </div>
      )}

      {quote && (
        <article className="stock-detail-card">
          <header className="stock-identity">
            <div className="stock-identity-info">
              <div className="stock-instrument">
                <span className="symbol-badge">{quote.symbol}</span>
                {quote.exchange && <span>{quote.exchange}</span>}
                <span>{currency}</span>
              </div>
              <h1>{quote.name}</h1>
              <p className="stock-muted">Sesi acuan · <time dateTime={quote.date}>{formatDate(quote.date)}</time></p>
            </div>
            <div className="stock-quote-actions">
              <div className="stock-quote-price">
                <span>Harga penutupan</span>
                <strong>{formatPrice(quote.close, currency)}</strong>
                {changeFromOpen != null && trend && (
                  <span className={`trend--${trend.className}`}>
                    {trend.label} {formatPct(changeFromOpen)} vs buka
                  </span>
                )}
              </div>
              <button
                type="button"
                className={`watch-toggle${inWatchlist ? ' watch-toggle--active' : ''}`}
                onClick={toggleWatchlist}
                aria-pressed={inWatchlist}
                disabled={watchlistDisabled}
              >
                {inWatchlist ? '✓ Dipantau' : '+ Pantau'}
              </button>
            </div>
          </header>

          <section className="stock-plan" aria-labelledby="stock-plan-title">
            <div className="stock-section-heading">
              <h2 id="stock-plan-title">Rencana trading</h2>
              <StatusBadge status={analysis.status} />
            </div>
            <dl className="stock-levels">
              <TradingLevel label="Buy trigger" value={formatPrice(buyTrigger.level, currency)} />
              <TradingLevel
                label="Stop loss"
                value={formatPrice(analysis.stop, currency)}
                hint={analysis.riskPct != null ? `Risiko ${formatPct(-Math.abs(analysis.riskPct))}` : undefined}
                tone="risk"
              />
              <TradingLevel
                label="Target"
                value={formatPrice(analysis.target, currency)}
                hint={analysis.potentialPct != null ? `Potensi ${formatPct(analysis.potentialPct)}` : undefined}
                tone="gain"
              />
              <TradingLevel
                label="Resistance 50 hari"
                value={formatPrice(analysis.resistance50, currency)}
                hint={analysis.baseTightPct != null ? `Konsolidasi ${analysis.baseTightPct.toLocaleString('id-ID')}%` : undefined}
              />
            </dl>
          </section>

          <CandlestickChart
            sessions={chartSnapshot?.priceHistory ?? quote.priceHistory ?? []}
            referenceDate={quote.date}
            buyLevel={buyTrigger.level}
            sellLevel={buyTrigger.sellLevel}
            averageVolume={buyTrigger.averageVolume}
            formatPrice={(price) => formatPrice(price, currency)}
            formatDate={formatDate}
            formatVolume={formatVolume}
            timeframe={chartSnapshot?.range ?? quote.range ?? defaultRange}
            selectedRange={range}
            onTimeframeChange={setRange}
            ranges={chartSnapshot?.availableRanges ?? quote.availableRanges}
            loading={range !== defaultRange && chartData.status === 'loading'}
            error={range !== defaultRange && chartData.status === 'error' ? chartData.message : null}
            onRetry={() => setChartAttempt((attempt) => attempt + 1)}
          />

          <section className="stock-data-section stock-session" aria-labelledby="stock-session-title">
            <h2 id="stock-session-title">Rincian sesi acuan</h2>
            <dl className="stock-session-values" aria-label="Harga dan volume saham">
              <div><dt>Buka</dt><dd>{formatPrice(quote.open, currency)}</dd></div>
              <div><dt>Tertinggi</dt><dd>{formatPrice(quote.high, currency)}</dd></div>
              <div><dt>Terendah</dt><dd>{formatPrice(quote.low, currency)}</dd></div>
              <div><dt>Tutup</dt><dd>{formatPrice(quote.close, currency)}</dd></div>
              <div><dt>Volume</dt><dd>{formatVolume(quote.volume)}</dd></div>
              <div><dt>Rata-rata volume 50 sesi</dt><dd>{formatVolume(buyTrigger.averageVolume)}</dd></div>
            </dl>
          </section>

          {minervini.status === 'success' && (
            <MinerviniPanel
              analysis={{ ...minervini.data, close: quote.close, stop: analysis.stop }}
              currency={currency}
            />
          )}
          {minervini.status === 'loading' && (
            <section className="stock-data-section" aria-labelledby="minervini-title">
              <h2 id="minervini-title">Analisis Minervini</h2>
              <p className="stock-muted" role="status">Memuat analisis tren dan pivot…</p>
            </section>
          )}
          {minervini.status === 'error' && (
            <section className="stock-data-section" aria-labelledby="minervini-title">
              <h2 id="minervini-title">Analisis Minervini</h2>
              <p className="stock-muted" role="alert">{minervini.message || 'Analisis Minervini gagal dimuat.'}</p>
            </section>
          )}

          <section className="stock-data-section" aria-labelledby="daily-title">
            <h2 id="daily-title">Harga harian (OHLCV)</h2>
            {quote.recentBars?.length ? (
              <TableScroll className="stock-table-scroll" label="Tabel harga harian">
                <table className="fund-table stock-ohlcv-table">
                  <thead>
                    <tr>
                      <th>Tanggal</th><th className="num">Buka</th><th className="num">Tertinggi</th>
                      <th className="num">Terendah</th><th className="num">Tutup</th><th className="num">Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.recentBars.map((bar) => (
                      <tr key={bar.date}>
                        <td><time dateTime={bar.date}>{formatDate(bar.date)}</time></td>
                        <td className="num">{formatPrice(bar.open, currency)}</td>
                        <td className="num">{formatPrice(bar.high, currency)}</td>
                        <td className="num">{formatPrice(bar.low, currency)}</td>
                        <td className="num">{formatPrice(bar.close, currency)}</td>
                        <td className="num" title={formatVolume(bar.volume)}>{formatCompactNumber(bar.volume)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            ) : <p className="stock-muted">Riwayat harga harian belum tersedia.</p>}
          </section>

          <FundamentalsTable fundamentals={quote.fundamentals} />
        </article>
      )}
    </div>
  );
}
