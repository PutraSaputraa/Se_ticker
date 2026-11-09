import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import CandlestickChart from '../CandlestickChart.jsx';
import MinerviniPanel from '../components/MinerviniPanel.jsx';
import {
  formatCompactNumber,
  formatDate,
  formatPct,
  formatPrice,
  formatVolume,
  priceDecimals,
} from '../format.js';
import { addSymbol, removeSymbol } from '../watchlist.js';

const serviceError = 'Layanan harga tidak dapat diakses. Coba lagi.';

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

function parseWatchPrice(input, decimals) {
  const text = input.trim();
  const pattern = decimals === 0 ? /^\d+$/ : /^\d+(?:[.,]\d{1,2})?$/;
  if (!pattern.test(text)) return null;
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function StatusBadge({ status }) {
  const meta = breakoutStatusMeta[status] ?? breakoutStatusMeta.menunggu;
  return <span className={`detail-status ${meta.className}`}>{meta.label}</span>;
}

function MetricCard({ label, value, hint, tone }) {
  return (
    <div className={`metric-card${tone ? ` metric-card--${tone}` : ''}`}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      {hint && <span className="metric-hint">{hint}</span>}
    </div>
  );
}

function FundamentalsTable({ fundamentals, currency }) {
  if (!fundamentals) return null;
  const { quarterlyEps = [], quarterlyRevenue = [], annualEps = [], annualRevenue = [] } = fundamentals;
  if (!quarterlyEps.length && !annualRevenue.length) return null;

  const latestQ = quarterlyEps.slice(-4);
  const latestRev = quarterlyRevenue.slice(-4);
  const latestAnnualEps = annualEps.slice(-3);
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
    <section className="fundamentals" aria-labelledby="fundamentals-title">
      <h3 id="fundamentals-title">Fundamental</h3>
      <div className="fundamentals-grid">
        {latestQ.length > 0 && (
          <div className="fund-block">
            <h4>EPS kuartalan</h4>
            <table className="fund-table">
              <thead>
                <tr><th>Kuartal</th><th className="num">EPS</th><th className="num">Growth Q-to-Q</th></tr>
              </thead>
              <tbody>
                {latestQ.map((point, idx) => (
                  <tr key={point.date}>
                    <td>{point.date}</td>
                    <td className="num">{point.value.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
                    <td className={`num ${epsGrowth[idx] != null && epsGrowth[idx] >= 0 ? 'trend--up' : 'trend--down'}`}>
                      {epsGrowth[idx] == null ? '—' : formatPct(epsGrowth[idx])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {latestAnnualRev.length > 0 && (
          <div className="fund-block">
            <h4>Revenue tahunan</h4>
            <table className="fund-table">
              <thead>
                <tr><th>Tahun</th><th className="num">Revenue</th><th className="num">Growth</th></tr>
              </thead>
              <tbody>
                {latestAnnualRev.map((point, idx) => (
                  <tr key={point.date}>
                    <td>{point.date?.slice(0, 4)}</td>
                    <td className="num">{formatCompactNumber(point.value)}</td>
                    <td className={`num ${revGrowth[idx] != null && revGrowth[idx] >= 0 ? 'trend--up' : 'trend--down'}`}>
                      {revGrowth[idx] == null ? '—' : formatPct(revGrowth[idx])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

export default function StockDetailPage({ account }) {
  const { symbol } = useParams();
  const decoded = decodeURIComponent(symbol ?? '');
  const [range, setRange] = useState('3m');
  const [result, setResult] = useState({ status: 'idle' });
  const [chartData, setChartData] = useState({ status: 'idle' });
  const activeSearch = useRef(null);
  const activeChart = useRef(null);
  const [watchInput, setWatchInput] = useState('');

  const { watchlist } = account;
  const watchlistDisabled = !account.ready || account.pending;
  const inWatchlist = watchlist.some((entry) => entry.symbol === decoded);

  useEffect(() => () => {
    activeSearch.current?.abort();
    activeChart.current?.abort();
  }, []);

  // Fetch DETAIL saham — hanya saat symbol berubah (tidak tergantung range).
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    activeSearch.current?.abort();
    activeSearch.current = controller;
    setResult({ status: 'loading', symbol: decoded });

    (async () => {
      try {
        // Detail memakai range default; chart dimuat terpisah di bawah.
        const params = new URLSearchParams({ symbol: decoded, range: '3m' });
        const response = await fetch(`/.netlify/functions/stock?${params}`, { signal: controller.signal });
        const payload = await response.json().catch(() => null);
        if (cancelled || controller.signal.aborted) return;
        if (!response.ok || !payload) {
          setResult({ status: 'error', message: payload?.error || serviceError });
          return;
        }
        setResult({ status: 'success', quote: payload });
        account.update((current) => ({
          ...current,
          history: [decoded, ...current.history.filter((item) => item !== decoded)].slice(0, 5),
        }));
      } catch {
        if (!cancelled && !controller.signal.aborted) {
          setResult({ status: 'error', message: serviceError });
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decoded]);

  // Fetch CHART saja — setiap range berubah, tanpa menyentuh detail.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    activeChart.current?.abort();
    activeChart.current = controller;
    setChartData({ status: 'loading' });

    (async () => {
      try {
        const params = new URLSearchParams({ symbol: decoded, range });
        const response = await fetch(`/.netlify/functions/stock?${params}`, { signal: controller.signal });
        const payload = await response.json().catch(() => null);
        if (cancelled || controller.signal.aborted) return;
        if (!response.ok || !payload) {
          setChartData({ status: 'error' });
          return;
        }
        setChartData({
          status: 'success',
          priceHistory: payload.priceHistory,
          availableRanges: payload.availableRanges,
        });
      } catch {
        if (!cancelled && !controller.signal.aborted) {
          setChartData({ status: 'error' });
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decoded, range]);

  function toggleWatchlist() {
    account.update((current) => ({
      ...current,
      watchlist: inWatchlist
        ? removeSymbol(current.watchlist, decoded)
        : addSymbol(current.watchlist, decoded),
    }));
  }

  // Analisis Minervini terpisah (Trend Template, VCP, Pivot, RS) — endpoint analyze.js.
  const [minervini, setMinervini] = useState({ status: 'idle' });
  useEffect(() => {
    let cancelled = false;
    setMinervini({ status: 'loading' });
    (async () => {
      try {
        const response = await fetch(`/.netlify/functions/analyze?${new URLSearchParams({ symbol: decoded, rs: 'false' })}`);
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok || !payload) {
          setMinervini({ status: 'error' });
          return;
        }
        setMinervini({ status: 'success', data: payload });
      } catch {
        if (!cancelled) setMinervini({ status: 'error' });
      }
    })();
    return () => { cancelled = true; };
  }, [decoded]);

  const quote = result.status === 'success' ? result.quote : null;
  const currency = quote?.currency;
  const decimals = quote ? priceDecimals(currency) : 0;
  const watchPrice = quote ? parseWatchPrice(watchInput, decimals) : null;
  const trend = quote ? trends[Math.sign(quote.close - quote.open)] : null;
  const analysis = quote?.analysis ?? {};
  const buyTrigger = quote?.buyTrigger ?? {};
  const statusMeta = breakoutStatusMeta[analysis.status] ?? breakoutStatusMeta.menunggu;

  return (
    <div className="stock-detail">
      <nav className="breadcrumb" aria-label="Navigasi">
        <a href="/">← Cari saham</a>
      </nav>

      {result.status === 'loading' && (
        <div className="status-card">
          <span className="spinner" aria-hidden="true" />
          <div>
            <p className="status-title">Memuat {decoded}…</p>
            <p>Mengambil data detail dari Yahoo Finance.</p>
          </div>
        </div>
      )}

      {result.status === 'error' && (
        <div className="status-card status-card--error">
          <span className="status-mark" aria-hidden="true">!</span>
          <div>
            <p className="status-title">Gagal memuat</p>
            <p>{result.message}</p>
          </div>
        </div>
      )}

      {quote && (
        <article className="quote-card stock-detail-card">
          <div className="quote-heading">
            <div>
              <span className="symbol-badge">{quote.symbol}</span>
              {quote.exchange && <span className="exchange-label">{quote.exchange}</span>}
              <h2>{quote.name}</h2>
              <StatusBadge status={analysis.status} />
            </div>
            <div className="quote-heading-side">
              <div className="quote-date">
                <span>Sesi acuan</span>
                <time dateTime={quote.date}>{formatDate(quote.date)}</time>
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
          </div>

          <div className="detail-metrics">
            <MetricCard
              label="Buy Trigger"
              value={formatPrice(buyTrigger.level, currency)}
              hint="Level entry"
            />
            <MetricCard
              label="Stop Loss"
              value={formatPrice(analysis.stop, currency)}
              hint={analysis.riskPct != null ? `Risiko ${formatPct(-Math.abs(analysis.riskPct))}` : 'Jarak ke stop'}
              tone="risk"
            />
            <MetricCard
              label="Target"
              value={formatPrice(analysis.target, currency)}
              hint={analysis.potentialPct != null ? `Potensi ${formatPct(analysis.potentialPct)}` : 'Proyeksi'}
              tone="gain"
            />
            <MetricCard
              label="Resistance 50 hari"
              value={formatPrice(analysis.resistance50, currency)}
              hint={analysis.baseTightPct != null ? `Konsolidasi ${analysis.baseTightPct}%` : 'Base'}
            />
          </div>

          {minervini.status === 'success' && (
            <MinerviniPanel
              analysis={{ ...minervini.data, close: quote.close, stop: analysis.stop }}
              currency={currency}
            />
          )}

          <div className="quote-layout">
            <div className="quote-panel">
              <dl className="quote-details" aria-label="OHLCV sesi acuan">
                <div><dt>Buka</dt><dd>{formatPrice(quote.open, currency)}</dd></div>
                <div><dt>Tertinggi</dt><dd>{formatPrice(quote.high, currency)}</dd></div>
                <div><dt>Terendah</dt><dd>{formatPrice(quote.low, currency)}</dd></div>
                <div>
                  <dt>Tutup</dt>
                  <dd className={`trend trend--${trend.className}`}>
                    {formatPrice(quote.close, currency)}
                    <span className="trend-label">{trend.label}</span>
                  </dd>
                </div>
                <div><dt>Volume</dt><dd>{formatVolume(quote.volume)}</dd></div>
              </dl>

              <section className="detail-section" aria-labelledby="daily-title">
                <h3 id="daily-title">Harga harian (OHLCV)</h3>
                <table className="fund-table">
                  <thead>
                    <tr>
                      <th>Tanggal</th><th className="num">Open</th><th className="num">High</th>
                      <th className="num">Low</th><th className="num">Close</th><th className="num">Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(quote.recentBars ?? []).map((bar) => (
                      <tr key={bar.date}>
                        <td>{formatDate(bar.date)}</td>
                        <td className="num">{formatPrice(bar.open, currency)}</td>
                        <td className="num">{formatPrice(bar.high, currency)}</td>
                        <td className="num">{formatPrice(bar.low, currency)}</td>
                        <td className="num">{formatPrice(bar.close, currency)}</td>
                        <td className="num">{formatCompactNumber(bar.volume)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <FundamentalsTable fundamentals={quote.fundamentals} currency={currency} />
            </div>

            <div className="chart-area">
              {chartData.status === 'loading' && (
                <div className="chart-loading" aria-live="polite">
                  <span className="spinner" aria-hidden="true" />
                </div>
              )}
              <CandlestickChart
                sessions={chartData.status === 'success' ? chartData.priceHistory : (quote.priceHistory ?? [])}
                referenceDate={quote.date}
                buyLevel={buyTrigger.level}
                sellLevel={buyTrigger.sellLevel}
                averageVolume={buyTrigger.averageVolume}
                formatPrice={(price) => formatPrice(price, currency)}
                formatDate={formatDate}
                formatVolume={formatVolume}
                timeframe={range}
                onTimeframeChange={setRange}
                ranges={quote.availableRanges}
              />
            </div>
          </div>
        </article>
      )}
    </div>
  );
}
