import { useState } from 'react';
import TableScroll from '../components/TableScroll.jsx';
import TickerLink from '../components/TickerLink.jsx';
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
const formatExitDate = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC',
});

function Stat({ label, value, tone }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={tone}>{value}</dd>
    </div>
  );
}

function EquityCurve({ curve }) {
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
    ? [0, 0.5, 1].map((offset) => formatExitDate.format(first + duration * offset))
    : [1, curve.length > 2 ? Math.ceil(curve.length / 2) : null, curve.length];

  return (
    <figure className="research-equity" aria-label={`Kurva ekuitas simulasi, dari ${formatIndex.format(values[0])} ke ${formatIndex.format(values.at(-1))}`}>
      <figcaption>Indeks ekuitas · Basis awal 100</figcaption>
      <div className="research-equity-grid">
        <div className="research-equity-y" aria-hidden="true">
          {ticks.map((tick) => <span key={tick}>{formatIndex.format(tick)}</span>)}
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path className="research-equity-gridline" d="M0 0H100 M0 50H100 M0 100H100" vectorEffect="non-scaling-stroke" />
          <line className="research-equity-baseline" x1="0" x2="100" y1={y(100)} y2={y(100)} vectorEffect="non-scaling-stroke" />
          <polyline className="research-equity-line" points={points} vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="research-equity-x">
          {xLabels.map((label, index) => <span key={index}>{label}</span>)}
        </div>
        <p className="research-equity-caption">{dateAxis ? 'Tanggal keluar posisi' : 'Urutan penutupan transaksi'}</p>
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
  const hasTrades = stats?.totalTrades > 0;

  return (
    <div className="research-workspace backtest-page">
      <header className="page-heading">
        <h1>Uji strategi</h1>
        <p>Simulasikan aturan breakout Minervini pada dua tahun data historis untuk menilai performa pada sampel tersebut.</p>
      </header>

      <section className="research-panel" aria-labelledby="backtest-controls-title">
        <div className="research-panel-heading">
          <div>
            <h2 id="backtest-controls-title">Sampel pengujian</h2>
            <p>Trend Template, VCP, dan pivot menentukan sinyal long. Posisi dibuka pada harga pembukaan sesi berikutnya.</p>
          </div>
        </div>
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
            <label className="research-field research-field--tickers">
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
            {loading ? 'Menguji…' : 'Jalankan backtest'}
          </button>
          {mode === 'custom' && <p className="research-form-help" id="backtest-ticker-help">Pisahkan kode dengan koma. Kolom kosong memakai sampel bursa terakhir.</p>}
        </form>
      </section>

      {loading && (
        <div className="status-card" role="status">
          <span className="spinner" aria-hidden="true" />
          <div>
            <p className="status-title">Menguji strategi…</p>
            <p>Menjalankan aturan pada data historis tiap saham dan menghitung statistik.</p>
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div className="status-card status-card--error" role="alert">
          <span className="status-mark" aria-hidden="true">!</span>
          <div>
            <p className="status-title">Uji strategi gagal</p>
            <p>{state.message}</p>
          </div>
        </div>
      )}

      {data && (
        <>
          <section className="research-panel" aria-labelledby="backtest-results-title">
            <div className="research-panel-heading">
              <div>
                <h2 id="backtest-results-title">Ringkasan simulasi</h2>
                <p>{data.label} · {data.symbolsTested} saham menghasilkan transaksi</p>
              </div>
            </div>
            <dl className="research-assumptions" aria-label="Asumsi eksekusi">
              <div><dt>Stop loss</dt><dd>{data.params.stopPct}%</dd></div>
              <div><dt>Target</dt><dd>{data.params.targetR}R</dd></div>
              {data.params.maxHoldDays != null && <div><dt>Masa posisi</dt><dd>{data.params.maxHoldDays} sesi</dd></div>}
              {data.params.riskPerTrade != null && <div><dt>Risiko per posisi</dt><dd>{formatIndex.format(data.params.riskPerTrade)}% ekuitas</dd></div>}
            </dl>
            <dl className="research-metrics">
              <Stat label="Transaksi" value={stats.totalTrades} />
              <Stat label="Win rate" value={hasTrades ? formatPct(stats.winRate).replace(/^\+/, '') : '–'} />
              <Stat label="Return simulasi" value={hasTrades ? formatPct(stats.totalReturn) : '–'} tone={stats.totalReturn > 0 ? 'trend--up' : stats.totalReturn < 0 ? 'trend--down' : undefined} />
              <Stat label="Drawdown maksimum" value={hasTrades ? `${formatIndex.format(Math.abs(stats.maxDrawdown))}%` : '–'} />
              <Stat label="Rata-rata untung" value={hasTrades ? formatPct(stats.avgWin) : '–'} />
              <Stat label="Rata-rata rugi" value={hasTrades ? formatPct(-Math.abs(stats.avgLoss)) : '–'} />
              <Stat label="Rasio expectancy" value={stats.expectancyRatio == null ? '–' : `${formatIndex.format(stats.expectancyRatio)}×`} />
              <Stat label="Expectancy per transaksi" value={stats.netExpectancy == null ? '–' : formatPct(stats.netExpectancy)} />
            </dl>
            {!hasTrades && (
              <div className="research-empty">
                <h3>Belum ada transaksi dalam sampel ini</h3>
                <p>Performa belum dapat dinilai. Uji bursa atau daftar ticker lain.</p>
              </div>
            )}
          </section>

          {data.curve?.length > 1 && (
            <section className="research-panel" aria-labelledby="equity-title">
              <div className="research-panel-heading">
                <div>
                  <h2 id="equity-title">Kurva ekuitas</h2>
                  <p>Ekuitas simulasi dihitung ulang setiap kali posisi ditutup.</p>
                </div>
              </div>
              <EquityCurve curve={data.curve} />
            </section>
          )}

          {data.perSymbol?.length > 0 && (
            <section className="research-panel" aria-labelledby="backtest-by-symbol">
              <div className="research-panel-heading"><h2 id="backtest-by-symbol">Performa per saham</h2></div>
              <TableScroll className="research-table-scroll" label="Tabel performa per saham">
                <table className="fund-table research-table">
                  <thead>
                    <tr>
                      <th scope="col">Saham</th>
                      <th scope="col" className="num">Transaksi</th>
                      <th scope="col" className="num">Win rate</th>
                      <th scope="col" className="num">Return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perSymbol.map((row) => (
                      <tr key={row.symbol}>
                        <th scope="row" className="research-instrument">
                          <TickerLink symbol={row.symbol} />
                          {row.name && <span className="research-cell-note">{row.name}</span>}
                        </th>
                        <td className="num">{row.trades}</td>
                        <td className="num">{formatPct(row.winRate).replace(/^\+/, '')}</td>
                        <td className={`num ${row.totalReturn > 0 ? 'trend--up' : row.totalReturn < 0 ? 'trend--down' : ''}`}>{formatPct(row.totalReturn)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </section>
          )}

          {data.trades?.length > 0 && (
            <section className="research-panel" aria-labelledby="backtest-trades">
              <div className="research-panel-heading">
                <div>
                  <h2 id="backtest-trades">Transaksi terakhir</h2>
                  <p>{data.trades.length} dari {stats.totalTrades} transaksi, diurutkan dari penutupan terbaru.</p>
                </div>
              </div>
              <TableScroll className="research-table-scroll" label="Tabel transaksi terakhir">
                <table className="fund-table research-table">
                  <thead>
                    <tr>
                      <th scope="col">Saham</th>
                      <th scope="col">Tanggal masuk</th>
                      <th scope="col">Tanggal keluar</th>
                      <th scope="col" className="num">Return</th>
                      <th scope="col" className="num">Kelipatan risiko</th>
                      <th scope="col">Alasan keluar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.trades].reverse().map((trade, index) => (
                      <tr key={`${trade.symbol}-${trade.entryDate}-${index}`}>
                        <th scope="row"><TickerLink symbol={trade.symbol} /></th>
                        <td><time dateTime={trade.entryDate}>{trade.entryDate}</time></td>
                        <td><time dateTime={trade.exitDate}>{trade.exitDate}</time></td>
                        <td className={`num ${trade.returnPct > 0 ? 'trend--up' : trade.returnPct < 0 ? 'trend--down' : ''}`}>{formatPct(trade.returnPct)}</td>
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
