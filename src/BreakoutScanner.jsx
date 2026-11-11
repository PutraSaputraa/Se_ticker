import { useEffect, useRef, useState } from 'react';
import TableScroll from './components/TableScroll.jsx';
import TickerLink from './components/TickerLink.jsx';
import { formatDateCompact, formatPct } from './format.js';

const scanErrorMessage = 'Pemindaian breakout gagal. Coba lagi nanti.';

const regions = [
  { value: 'auto', label: 'Semua bursa' },
  { value: 'us', label: 'AS' },
  { value: 'jp', label: 'Jepang' },
  { value: 'hk', label: 'Hong Kong' },
  { value: 'ks', label: 'KOSPI' },
  { value: 'kq', label: 'KOSDAQ' },
  { value: 'ss', label: 'Shanghai' },
  { value: 'sz', label: 'Shenzhen' },
];

function WatchAction({ symbol, inWatchlist, disabled, onAdd }) {
  return (
    <button
      type="button"
      className={`research-watch${inWatchlist ? ' research-watch--added' : ''}`}
      disabled={disabled || inWatchlist}
      onClick={() => onAdd(symbol)}
      aria-label={inWatchlist ? `${symbol} sudah dipantau` : `Pantau ${symbol}`}
    >
      {inWatchlist ? 'Dipantau' : 'Pantau'}
    </button>
  );
}

function ScanTable({ results, watched, disabled, onAdd, formatPrice }) {
  return (
    <TableScroll className="research-table-scroll" label="Tabel hasil scan matematis">
      <table className="fund-table research-table scan-table">
        <thead>
          <tr>
            <th scope="col">Saham</th>
            <th scope="col">Sesi</th>
            <th scope="col" className="num">Harga tutup</th>
            <th scope="col" className="num">Perubahan</th>
            <th scope="col" className="num">Resistance</th>
            <th scope="col" className="num">Rasio volume</th>
            <th scope="col" className="num">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {results.map((pick) => (
            <tr key={pick.symbol}>
              <th scope="row" className="research-instrument">
                <TickerLink symbol={pick.symbol} />
                {pick.name && <span className="research-cell-note">{pick.name}</span>}
                {pick.universe && <span className="research-cell-note">{pick.universe}</span>}
                {pick.aiNote && <p className="research-scan-note">{pick.aiNote}</p>}
              </th>
              <td>{pick.date ? <time dateTime={pick.date}>{formatDateCompact(pick.date)}</time> : 'Tidak tersedia'}</td>
              <td className="num">{formatPrice(pick.close, pick.currency)}</td>
              <td className={`num ${pick.changePct > 0 ? 'trend--up' : pick.changePct < 0 ? 'trend--down' : ''}`}>
                {formatPct(pick.changePct)}
              </td>
              <td className="num">
                {formatPrice(pick.resistance, pick.currency)}
                {Number.isFinite(pick.breakoutPct) && <span className="research-cell-note">{formatPct(pick.breakoutPct)} di atas level</span>}
              </td>
              <td className="num">
                {Number.isFinite(pick.volumeRatio)
                  ? `${pick.volumeRatio.toLocaleString('id-ID', { maximumFractionDigits: 1 })}×`
                  : 'Tidak tersedia'}
              </td>
              <td className="num"><WatchAction symbol={pick.symbol} inWatchlist={watched.has(pick.symbol)} disabled={disabled} onAdd={onAdd} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

function ResearchBrief({ pick, inWatchlist, disabled, onAdd }) {
  return (
    <li className="research-brief">
      <div>
        <TickerLink symbol={pick.symbol} />
        {pick.name && <p className="research-company">{pick.name}</p>}
      </div>
      <dl className="research-brief-details">
        {pick.note && <div><dt>Analisis teknikal</dt><dd>{pick.note}</dd></div>}
        {pick.level && <div><dt>Level pantauan</dt><dd>{pick.level}</dd></div>}
        {pick.catalyst && <div><dt>Katalis</dt><dd>{pick.catalyst}</dd></div>}
      </dl>
      <WatchAction symbol={pick.symbol} inWatchlist={inWatchlist} disabled={disabled} onAdd={onAdd} />
    </li>
  );
}

export default function BreakoutScanner({ watchlist, onAdd, disabled, formatPrice, formatDate }) {
  const [mode, setMode] = useState('scan');      // 'scan' | 'research'
  const [region, setRegion] = useState('auto');
  const [state, setState] = useState({ status: 'idle' });
  const activeScan = useRef(null);

  useEffect(() => () => activeScan.current?.abort(), []);

  async function run(targetMode = mode, targetRegion = region) {
    activeScan.current?.abort();
    const controller = new AbortController();
    activeScan.current = controller;
    setState({ status: 'loading', mode: targetMode });

    try {
      // 1. Mulai job di background (menghindari timeout function sinkron).
      const query = new URLSearchParams({ mode: targetMode, region: targetRegion });
      const startResponse = await fetch(`/.netlify/functions/breakout-start?${query}`, {
        method: 'POST',
        signal: controller.signal,
      });
      const startPayload = await startResponse.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (!startResponse.ok || !startPayload?.jobId) {
        setState({ status: 'error', message: startPayload?.error || scanErrorMessage });
        return;
      }

      const jobId = startPayload.jobId;
      const statusUrl = `/.netlify/functions/breakout-status?${new URLSearchParams({ jobId })}`;
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(startPayload.waitMs ?? 150_000)]);

      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        signal.throwIfAborted();

        const statusResponse = await fetch(statusUrl, { signal, cache: 'no-store' });
        const statusPayload = await statusResponse.json().catch(() => null);
        if (controller.signal.aborted) return;

        if (!statusResponse.ok) {
          setState({ status: 'error', message: statusPayload?.error || scanErrorMessage });
          return;
        }
        if (statusPayload?.status === 'done') {
          const result = statusPayload.result;
          const error = targetMode === 'research' && result.ai?.error;
          setState(error ? { status: 'error', message: error } : { status: 'success', mode: targetMode, data: result });
          return;
        }
        if (statusPayload?.status === 'error') {
          setState({ status: 'error', message: statusPayload.error || scanErrorMessage });
          return;
        }
        // pending / running → lanjut poll
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error.name === 'TimeoutError' ? 'Pemindaian terlalu lama. Coba lagi.' : scanErrorMessage;
        setState({ status: 'error', message });
      }
    }
  }

  function changeMode(next) {
    setMode(next);
    if (state.status === 'success' || state.status === 'error') run(next, region);
  }

  function changeRegion(next) {
    setRegion(next);
    if (state.status === 'success' || state.status === 'error') run(mode, next);
  }

  const watched = new Set(watchlist.map((entry) => entry.symbol));
  const result = state.status === 'success' ? state.data : null;
  const results = result?.results ?? [];
  const ai = result?.ai;
  const isResearch = (state.mode ?? mode) === 'research';
  const loading = state.status === 'loading';
  const description = isResearch
    ? 'Kandidat disusun dari penelusuran web dan interpretasi AI.'
    : 'Pindai resistance 50 sesi, konsolidasi, dan volume dari data harga.';
  const action = loading
    ? isResearch ? 'Meriset…' : 'Memindai…'
    : state.status === 'error' ? 'Coba lagi'
      : result ? isResearch ? 'Riset ulang' : 'Pindai ulang'
        : isResearch ? 'Mulai riset' : 'Jalankan scan';

  return (
    <>
      <section className="research-panel" aria-labelledby="breakout-scanner-title">
        <div className="research-panel-heading">
          <div>
            <h2 id="breakout-scanner-title">Pencarian kandidat</h2>
            <p>{description}</p>
          </div>
        </div>
        <form className="research-controls" onSubmit={(event) => { event.preventDefault(); if (!loading) run(); }}>
          <fieldset className="research-mode">
            <legend>Metode</legend>
            <div className="candle-timeframe">
              {[
                { value: 'scan', label: 'Scan matematis' },
                { value: 'research', label: 'Riset AI' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`candle-timeframe-btn${mode === value ? ' candle-timeframe-btn--active' : ''}`}
                  disabled={loading}
                  onClick={() => changeMode(value)}
                  aria-pressed={mode === value}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="research-field">
            Bursa
            <select value={region} onChange={(event) => changeRegion(event.target.value)} disabled={loading}>
              {regions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button type="submit" className="scan-button" disabled={loading}>{action}</button>
        </form>
      </section>

      {loading && (
        <div className="status-card" role="status">
          <span className="spinner" aria-hidden="true" />
          <div>
            <p className="status-title">{isResearch ? 'Menelusuri kandidat…' : 'Memindai data harga…'}</p>
            <p>{isResearch ? 'Kenari mencari dan menilai sumber web.' : 'Memeriksa resistance, konsolidasi, dan volume tiap saham.'}</p>
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div className="status-card status-card--error" role="alert">
          <span className="status-mark" aria-hidden="true">!</span>
          <div>
            <p className="status-title">{isResearch ? 'Riset gagal' : 'Pemindaian gagal'}</p>
            <p>{state.message}</p>
          </div>
        </div>
      )}

      {result && (
        <section className="research-panel" aria-labelledby="research-results-title">
          <div className="research-panel-heading">
            <div>
              <h2 id="research-results-title">{isResearch ? 'Kandidat riset AI' : 'Hasil scan matematis'}</h2>
              <p>
                {isResearch
                  ? `${result.universe} · ${results.length} kandidat`
                  : `${result.scanned} saham dipindai · ${result.universe} · ${results.length} memenuhi kriteria`}
              </p>
            </div>
            {result.date && (isResearch || results.length > 0) && (
              <p className="research-result-date">
                {isResearch ? 'Tanggal riset' : 'Sesi acuan'}{' '}
                <time dateTime={result.date}>{formatDate(result.date)}</time>
              </p>
            )}
          </div>
          {ai?.summary && (
            <div className="research-summary">
              <h3>{isResearch ? 'Ringkasan riset' : 'Catatan AI atas hasil scan'}</h3>
              <p>{ai.summary}</p>
            </div>
          )}
          {results.length === 0 ? (
            <p className="research-empty">
              {isResearch ? 'Belum ada kandidat dengan sumber yang cukup.' : 'Belum ada saham yang memenuhi kriteria scan pada sesi ini.'}
            </p>
          ) : isResearch ? (
            <ul className="research-brief-list">
              {results.map((pick, index) => (
                <ResearchBrief
                  key={`${pick.symbol}-${index}`}
                  pick={pick}
                  inWatchlist={watched.has(pick.symbol)}
                  disabled={disabled}
                  onAdd={onAdd}
                />
              ))}
            </ul>
          ) : (
            <ScanTable results={results} watched={watched} disabled={disabled} onAdd={onAdd} formatPrice={formatPrice} />
          )}
          {ai?.error && !ai?.summary && <p className="research-empty" role="status">{ai.error}</p>}
        </section>
      )}
    </>
  );
}
