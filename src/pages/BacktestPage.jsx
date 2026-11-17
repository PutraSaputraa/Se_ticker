import { useState } from 'react';
import TableScroll from '../components/TableScroll.jsx';
import TickerLink from '../components/TickerLink.jsx';
import ResearchRequestStatus from '../components/ResearchRequestStatus.jsx';
import { formatPct } from '../format.js';
import '../styles/research.css';

const regions = [
  { value: 'auto', label: 'Sampel lintas bursa' },
  { value: 'us', label: 'AS' },
  { value: 'jp', label: 'Jepang' },
  { value: 'hk', label: 'Hong Kong' },
  { value: 'ks', label: 'KOSPI' },
  { value: 'ss', label: 'Shanghai' },
];

const exitLabels = {
  stop: 'Stop loss',
  target: 'Target tercapai',
  trailing: 'Trailing stop',
  timeout: 'Batas masa posisi',
  eod: 'Akhir data',
};

const formatIndex = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const tradeDateFormat = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC',
});

function formatTradeDate(date) {
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) ? tradeDateFormat.format(timestamp) : date;
}

function Stat({ label, value, tone, headline }) {
  return (
    <div className={headline ? 'backtest-stat--headline' : undefined}>
      <dt>{label}</dt>
      <dd className={tone}>{value}</dd>
    </div>
  );
}

function BacktestSummary({ data }) {
  const { label, symbolsTested, params, stats } = data;
  const returnTone = stats.totalReturn > 0 ? 'trend--up' : stats.totalReturn < 0 ? 'trend--down' : undefined;

  return (
    <section className="research-panel backtest-panel" aria-labelledby="backtest-results-title">
      <div className="research-panel-heading">
        <div>
          <h2 id="backtest-results-title">Ringkasan simulasi</h2>
          <p>{label} · {symbolsTested} saham menghasilkan transaksi</p>
        </div>
      </div>
      {stats.totalTrades > 0 ? (
        <dl className="research-metrics" aria-label="Metrik simulasi">
          <Stat headline label="Return simulasi" value={formatPct(stats.totalReturn)} tone={returnTone} />
          <Stat headline label="Drawdown maksimum" value={`${formatIndex.format(Math.abs(stats.maxDrawdown))}%`} tone={Math.abs(stats.maxDrawdown) > 0 ? 'trend--down' : undefined} />
          <Stat label="Win rate" value={formatPct(stats.winRate).replace(/^\+/, '')} />
          <Stat label="Expectancy per transaksi" value={stats.netExpectancy == null ? '–' : formatPct(stats.netExpectancy)} />
          <Stat label="Transaksi" value={stats.totalTrades} />
          <Stat label="Rata-rata untung" value={formatPct(stats.avgWin)} />
          <Stat label="Rata-rata rugi" value={formatPct(-Math.abs(stats.avgLoss))} />
          <Stat label="Rasio expectancy" value={stats.expectancyRatio == null ? '–' : `${formatIndex.format(stats.expectancyRatio)}×`} />
        </dl>
      ) : (
        <div className="research-empty">
          <h3>Belum ada transaksi dalam sampel ini</h3>
          <p>Performa belum dapat dinilai. Uji bursa atau daftar ticker lain.</p>
        </div>
      )}
      <div className="backtest-assumptions">
        <h3 id="backtest-assumptions-title">Asumsi eksekusi</h3>
        <dl className="research-assumptions" aria-labelledby="backtest-assumptions-title">
          <div><dt>Stop loss</dt><dd>{params.stopPct}%</dd></div>
          <div><dt>Target</dt><dd>{params.targetR}R</dd></div>
          {params.maxHoldDays != null && <div><dt>Masa posisi</dt><dd>{params.maxHoldDays} sesi</dd></div>}
          {params.riskPerTrade != null && <div><dt>Risiko per posisi</dt><dd>{formatIndex.format(params.riskPerTrade)}% ekuitas</dd></div>}
        </dl>
      </div>
    </section>
  );
}

function EquityCurve({ curve }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const values = curve.map(({ equity }) => equity);
  const high = Math.max(100, ...values);
  const low = Math.min(100, ...values);
  const padding = Math.max(high - low, 1) * 0.08;
  const top = high + padding;
  const bottom = low - padding;
  const y = (value) => 100 - ((value - bottom) / (top - bottom)) * 100;
  const timestamps = curve.map(({ date }) => Date.parse(`${date}T00:00:00Z`));
  const first = timestamps[0];
  const duration = timestamps.at(-1) - first;
  const dateAxis = timestamps.every(Number.isFinite) && duration > 0;
  const step = 100 / (curve.length - 1);
  const x = (index) => dateAxis ? ((timestamps[index] - first) / duration) * 100 : index * step;
  const points = curve.map(({ equity }, index) => `${x(index)},${y(equity)}`).join(' ');
  const ticks = [top, (top + bottom) / 2, bottom];
  const xLabels = dateAxis
    ? [0, 0.5, 1].map((offset) => tradeDateFormat.format(first + duration * offset))
    : [1, curve.length > 2 ? Math.ceil(curve.length / 2) : null, curve.length];

  const inspected = activeIndex ?? curve.length - 1;
  const valueLabel = dateAxis ? formatTradeDate(curve[inspected].date) : `Transaksi ${inspected + 1}`;

  function inspectPointer(event) {
    const { left, width } = event.currentTarget.getBoundingClientRect();
    if (width === 0) return;
    const position = (event.clientX - left) / width * 100;
    let nearest = 0;
    for (let index = 1; index < curve.length; index += 1) {
      if (Math.abs(x(index) - position) < Math.abs(x(nearest) - position)) nearest = index;
    }
    setActiveIndex(nearest);
  }

  function inspectKey(event) {
    if (event.key === 'Escape') setActiveIndex(null);
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    setActiveIndex(Math.max(0, Math.min(curve.length - 1, inspected + direction)));
  }

  return (
    <figure className="research-equity" aria-label={`Kurva ekuitas simulasi, dari ${formatIndex.format(values[0])} ke ${formatIndex.format(values.at(-1))}`}>
      <figcaption className="research-equity-legend">
        <span>Indeks ekuitas</span><span>Basis awal 100</span>
      </figcaption>
      <div className="research-equity-grid">
        <div className="research-equity-y" aria-hidden="true">
          {ticks.map((tick) => <span key={tick}>{formatIndex.format(tick)}</span>)}
        </div>
        <div className="research-equity-plot" tabIndex={0} role="group"
          aria-label="Kurva ekuitas. Gunakan panah kiri dan kanan untuk memeriksa titik."
          aria-describedby="equity-value"
          onPointerMove={(event) => { if (event.pointerType !== 'touch') inspectPointer(event); }}
          onPointerLeave={(event) => { if (event.pointerType !== 'touch') setActiveIndex(null); }}
          onClick={inspectPointer} onKeyDown={inspectKey} onBlur={() => setActiveIndex(null)}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polygon className="research-equity-area" points={`0,100 ${points} 100,100`} />
            <path className="research-equity-gridline" d="M0 0H100 M0 50H100 M0 100H100" vectorEffect="non-scaling-stroke" />
            <line className="research-equity-baseline" x1="0" x2="100" y1={y(100)} y2={y(100)} vectorEffect="non-scaling-stroke" />
            <polyline className="research-equity-line" points={points} vectorEffect="non-scaling-stroke" />
            {activeIndex !== null && (
              <line className="research-equity-crosshair" x1={x(inspected)} x2={x(inspected)} y1="0" y2="100" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
        </div>
        <div className="research-equity-x">
          {xLabels.map((label, index) => <span key={index}>{label}</span>)}
        </div>
        <p className="research-equity-caption">{dateAxis ? 'Tanggal keluar posisi' : 'Urutan penutupan transaksi'}</p>
      </div>
      <div id="equity-value" className="research-equity-readout" role={activeIndex === null ? undefined : 'tooltip'}>
        <span>{valueLabel}</span><strong>{formatIndex.format(curve[inspected].equity)}</strong>
      </div>
    </figure>
  );
}

export default function BacktestPage() {
  const [mode, setMode] = useState('region');
  const [region, setRegion] = useState('us');
  const [symbolsInput, setSymbolsInput] = useState('');
  const [state, setState] = useState({ status: 'idle' });

  async function run(event) {
    event.preventDefault();
    if (state.status === 'loading') return;
    setState({ status: 'loading' });
    try {
      const params = new URLSearchParams();
      if (mode === 'custom' && symbolsInput.trim()) {
        params.set('symbols', symbolsInput.trim());
      } else {
        params.set('region', region);
      }
      const response = await fetch(`/.netlify/functions/backtest-run?${params}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) {
        setState({ status: 'error', message: payload?.error || 'Uji strategi gagal.' });
        return;
      }
      setState({ status: 'success', data: payload });
    } catch {
      setState({ status: 'error', message: 'Uji strategi gagal. Coba lagi.' });
    }
  }

  const loading = state.status === 'loading';
  const data = state.status === 'success' ? state.data : null;
  const stats = data?.stats;

  return (
    <div className="research-workspace backtest-page">
      <section className="research-panel backtest-panel research-config" aria-labelledby="backtest-controls-title">
        <header className="page-heading backtest-heading">
          <h1 id="backtest-controls-title">Uji strategi</h1>
          <p>Simulasikan aturan breakout Minervini pada dua tahun data historis.</p>
        </header>
        <form className="research-controls" onSubmit={run}>
          <fieldset className="research-mode">
            <legend>Sumber saham</legend>
            <div className="candle-timeframe">
              {[
                { value: 'region', label: 'Per bursa' },
                { value: 'custom', label: 'Saham pilihan' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`candle-timeframe-btn${mode === value ? ' candle-timeframe-btn--active' : ''}`}
                  onClick={() => setMode(value)}
                  aria-pressed={mode === value}
                  disabled={loading}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          {mode === 'region' ? (
            <label className="research-field">
              Bursa
              <select value={region} disabled={loading} onChange={(event) => setRegion(event.target.value)}>
                {regions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          ) : (
            <label className="research-field">
              Kode ticker
              <input
                type="text"
                value={symbolsInput}
                onChange={(event) => setSymbolsInput(event.target.value)}
                placeholder="NVDA, AAPL, BBCA.JK"
                aria-describedby="backtest-ticker-help"
                disabled={loading}
              />
            </label>
          )}
          <button type="submit" className="scan-button" disabled={loading}>
            {loading ? 'Menguji…' : state.status === 'error' ? 'Coba lagi' : 'Jalankan backtest'}
          </button>
          {mode === 'custom' && <p className="research-form-help" id="backtest-ticker-help">Pisahkan kode dengan koma. Kolom kosong memakai sampel bursa terakhir.</p>}
        </form>
        <p className="research-form-help backtest-execution-note">Trend Template, VCP, dan pivot menentukan sinyal long. Posisi dibuka pada harga pembukaan sesi berikutnya.</p>

        {loading && (
          <ResearchRequestStatus loading title="Menguji strategi…"
            message="Menjalankan aturan pada data historis tiap saham dan menghitung statistik." />
        )}

        {state.status === 'error' && (
          <ResearchRequestStatus title="Uji strategi gagal" message={state.message} />
        )}
      </section>

      {data && (
        <>
          <div className="backtest-overview">
            <BacktestSummary data={data} />
            {data.curve?.length > 1 && (
              <section className="research-panel backtest-panel" aria-labelledby="equity-title">
                <div className="research-panel-heading">
                  <div>
                    <h2 id="equity-title">Kurva ekuitas</h2>
                    <p>Ekuitas simulasi dihitung ulang setiap kali posisi ditutup.</p>
                  </div>
                </div>
                <EquityCurve curve={data.curve} />
              </section>
            )}
          </div>

          {data.perSymbol?.length > 0 && (
            <section className="research-panel backtest-panel" aria-labelledby="backtest-by-symbol">
              <div className="research-panel-heading"><h2 id="backtest-by-symbol">Performa per saham</h2></div>
              <TableScroll className="research-table-scroll" label="Tabel performa per saham">
                <table className="fund-table research-table backtest-table">
                  <thead>
                    <tr>
                      <th scope="col">Saham</th>
                      <th scope="col" className="num">Return</th>
                      <th scope="col" className="num">Win rate</th>
                      <th scope="col" className="num">Transaksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perSymbol.map((row) => (
                      <tr key={row.symbol}>
                        <th scope="row" className="research-instrument">
                          <TickerLink symbol={row.symbol} />
                          {row.name && row.name !== row.symbol && <span className="research-cell-note research-table-company">{row.name}</span>}
                        </th>
                        <td className={`num ${row.totalReturn > 0 ? 'trend--up' : row.totalReturn < 0 ? 'trend--down' : ''}`}>{formatPct(row.totalReturn)}</td>
                        <td className="num">{formatPct(row.winRate).replace(/^\+/, '')}</td>
                        <td className="num">{row.trades}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </section>
          )}

          {data.trades?.length > 0 && (
            <section className="research-panel backtest-panel" aria-labelledby="backtest-trades">
              <div className="research-panel-heading">
                <div>
                  <h2 id="backtest-trades">Transaksi terakhir</h2>
                  <p>{data.trades.length} dari {stats.totalTrades} transaksi, diurutkan dari penutupan terbaru.</p>
                </div>
              </div>
              <TableScroll className="research-table-scroll" label="Tabel transaksi terakhir">
                <table className="fund-table research-table backtest-table">
                  <thead>
                    <tr>
                      <th scope="col">Saham</th>
                      <th scope="col" className="num">Return</th>
                      <th scope="col">Tanggal keluar</th>
                      <th scope="col">Tanggal masuk</th>
                      <th scope="col" className="num backtest-risk-heading">Kelipatan risiko</th>
                      <th scope="col">Alasan keluar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.trades].reverse().map((trade, index) => (
                      <tr key={`${trade.symbol}-${trade.entryDate}-${index}`}>
                        <th scope="row" className="research-instrument"><TickerLink symbol={trade.symbol} /></th>
                        <td className={`num ${trade.returnPct > 0 ? 'trend--up' : trade.returnPct < 0 ? 'trend--down' : ''}`}>{formatPct(trade.returnPct)}</td>
                        <td><time dateTime={trade.exitDate}>{formatTradeDate(trade.exitDate)}</time></td>
                        <td><time dateTime={trade.entryDate}>{formatTradeDate(trade.entryDate)}</time></td>
                        <td className="num">{formatIndex.format(trade.rMultiple)}R</td>
                        <td>{exitLabels[trade.exitReason] ?? trade.exitReason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </section>
          )}
        </>
      )}
    </div>
  );
}
