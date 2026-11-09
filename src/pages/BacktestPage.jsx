import { useState } from 'react';
import { formatPct } from '../format.js';

const regions = [
  { value: 'auto', label: 'Sampel lintas bursa' },
  { value: 'us', label: 'AS' },
  { value: 'jp', label: 'Jepang' },
  { value: 'hk', label: 'Hong Kong' },
  { value: 'ks', label: 'KOSPI' },
  { value: 'ss', label: 'Shanghai' },
];

function StatCard({ label, value, tone }) {
  return (
    <div className={`metric-card${tone ? ` metric-card--${tone}` : ''}`}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
    </div>
  );
}

function EquityCurve({ curve }) {
  if (!curve || curve.length < 2) return null;
  const values = curve.map((p) => p.equity);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = 100 / (curve.length - 1);
  const points = curve.map((p, i) => `${i * step},${100 - ((p.equity - min) / span) * 100}`).join(' ');
  const up = values.at(-1) >= values[0];

  return (
    <div className="equity-curve">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Kurva ekuitas">
        <path className="equity-grid" d="M0 0H100 M0 50H100 M0 100H100" vectorEffect="non-scaling-stroke" />
        <polyline
          className={`equity-line ${up ? 'equity-line--up' : 'equity-line--down'}`}
          points={points}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

export default function BacktestPage() {
  const [mode, setMode] = useState('region');
  const [region, setRegion] = useState('us');
  const [symbolsInput, setSymbolsInput] = useState('');
  const [state, setState] = useState({ status: 'idle' });

  async function run() {
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

  const data = state.status === 'success' ? state.data : null;
  const stats = data?.stats;

  return (
    <div className="backtest-page">
      <div className="intro">
        <p className="eyebrow">Uji Strategi</p>
        <h1>Backtest breakout Minervini</h1>
        <p>
          Jalankan aturan Trend Template + VCP + Pivot ke data historis 2 tahun untuk melihat
          win rate, expectancy, dan kurva ekuitas. Entry di harga open setelah sinyal
          terkonfirmasi (menghindari look-ahead bias).
        </p>
      </div>

      <div className="backtest-controls">
        <div className="candle-timeframe" role="group" aria-label="Sumber saham">
          <button
            type="button"
            className={`candle-timeframe-btn${mode === 'region' ? ' candle-timeframe-btn--active' : ''}`}
            onClick={() => setMode('region')}
            aria-pressed={mode === 'region'}
          >
            Per bursa
          </button>
          <button
            type="button"
            className={`candle-timeframe-btn${mode === 'custom' ? ' candle-timeframe-btn--active' : ''}`}
            onClick={() => setMode('custom')}
            aria-pressed={mode === 'custom'}
          >
            Saham pilihan
          </button>
        </div>

        {mode === 'region' ? (
          <select className="backtest-select" value={region} onChange={(e) => setRegion(e.target.value)}>
            {regions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        ) : (
          <input
            className="backtest-input"
            type="text"
            value={symbolsInput}
            onChange={(e) => setSymbolsInput(e.target.value)}
            placeholder="NVDA, AAPL, MSFT, BBCA.JK"
            aria-label="Daftar simbol dipisah koma"
          />
        )}

        <button type="button" className="scan-button" disabled={state.status === 'loading'} onClick={run}>
          {state.status === 'loading' ? 'Menguji…' : 'Jalankan backtest'}
        </button>
      </div>

      {state.status === 'loading' && (
        <div className="status-card">
          <span className="spinner" aria-hidden="true" />
          <div>
            <p className="status-title">Menguji strategi…</p>
            <p>Menjalankan aturan ke data historis tiap saham dan menghitung statistik.</p>
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div className="status-card status-card--error">
          <span className="status-mark" aria-hidden="true">!</span>
          <div>
            <p className="status-title">Gagal</p>
            <p>{state.message}</p>
          </div>
        </div>
      )}

      {data && (
        <div className="backtest-results">
          <p className="backtest-label">
            {data.label} · {data.symbolsTested} saham menghasilkan sinyal ·
            stop {data.params.stopPct}% · target {data.params.targetR}R
          </p>

          <div className="detail-metrics">
            <StatCard label="Total trade" value={stats.totalTrades} />
            <StatCard label="Win rate" value={formatPct(stats.winRate)} tone={stats.winRate >= 50 ? 'gain' : 'risk'} />
            <StatCard label="Avg win" value={formatPct(stats.avgWin)} tone="gain" />
            <StatCard label="Avg loss" value={formatPct(-Math.abs(stats.avgLoss))} tone="risk" />
            <StatCard label="Expectancy ratio" value={stats.expectancyRatio == null ? '—' : `${stats.expectancyRatio}`} tone={stats.expectancyRatio >= 1 ? 'gain' : 'risk'} />
            <StatCard label="Net expectancy / trade" value={stats.netExpectancy == null ? '—' : formatPct(stats.netExpectancy)} tone={stats.netExpectancy > 0 ? 'gain' : 'risk'} />
            <StatCard label="Total return" value={formatPct(stats.totalReturn)} tone={stats.totalReturn >= 0 ? 'gain' : 'risk'} />
            <StatCard label="Max drawdown" value={formatPct(-Math.abs(stats.maxDrawdown))} tone="risk" />
          </div>

          {data.curve?.length > 1 && (
            <section className="backtest-section">
              <h3>Kurva ekuitas</h3>
              <EquityCurve curve={data.curve} />
            </section>
          )}

          {data.perSymbol?.length > 0 && (
            <section className="backtest-section">
              <h3>Performa per saham</h3>
              <table className="fund-table">
                <thead>
                  <tr><th>Simbol</th><th>Nama</th><th className="num">Trade</th><th className="num">Win rate</th><th className="num">Return</th></tr>
                </thead>
                <tbody>
                  {data.perSymbol.map((row) => (
                    <tr key={row.symbol}>
                      <td><span className="symbol-badge symbol-badge--light">{row.symbol}</span></td>
                      <td className="backtest-name">{row.name}</td>
                      <td className="num">{row.trades}</td>
                      <td className={`num ${row.winRate >= 50 ? 'trend--up' : 'trend--down'}`}>{formatPct(row.winRate)}</td>
                      <td className={`num ${row.totalReturn >= 0 ? 'trend--up' : 'trend--down'}`}>{formatPct(row.totalReturn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {data.trades?.length > 0 && (
            <section className="backtest-section">
              <h3>Trade terakhir</h3>
              <table className="fund-table">
                <thead>
                  <tr>
                    <th>Simbol</th><th>Entry</th><th>Exit</th>
                    <th className="num">Return</th><th className="num">R</th><th>Alasan</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.trades].reverse().map((trade, i) => (
                    <tr key={`${trade.symbol}-${trade.entryDate}-${i}`}>
                      <td><span className="symbol-badge symbol-badge--light">{trade.symbol}</span></td>
                      <td>{trade.entryDate}</td>
                      <td>{trade.exitDate}</td>
                      <td className={`num ${trade.returnPct >= 0 ? 'trend--up' : 'trend--down'}`}>{formatPct(trade.returnPct)}</td>
                      <td className="num">{trade.rMultiple}R</td>
                      <td>{trade.exitReason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {stats.totalTrades === 0 && (
            <p className="breakout-empty">
              Tidak ada sinyal breakout yang terbentuk dalam 2 tahun terakhir untuk sampel ini.
              Coba saham lain atau longgarkan parameter.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
