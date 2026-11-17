import { useEffect, useRef, useState } from 'react';
import TableScroll from './components/TableScroll.jsx';
import TickerLink from './components/TickerLink.jsx';
import ResearchRequestStatus, { ResearchProgress } from './components/ResearchRequestStatus.jsx';
import UpdatedValue from './components/UpdatedValue.jsx';
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

function waitForNextPoll(signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    function abort() {
      window.clearTimeout(pollTimer);
      reject(signal.reason);
    }
    const pollTimer = window.setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, 2000);
    signal.addEventListener('abort', abort, { once: true });
  });
}

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
            <th scope="col" className="num">Harga tutup</th>
            <th scope="col" className="num">Perubahan</th>
            <th scope="col" className="num">Resistance</th>
            <th scope="col" className="num scan-volume">Rasio volume</th>
            <th scope="col">Sesi</th>
            <th scope="col" className="num">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {results.map((pick) => (
            <tr key={pick.symbol}>
              <th scope="row" className="research-instrument">
                <TickerLink symbol={pick.symbol} />
                {pick.name && <span className="research-cell-note research-table-company">{pick.name}</span>}
                {pick.universe && <span className="research-cell-note">{pick.universe}</span>}
                {pick.aiNote && (
                  <details className="research-scan-details">
                    <summary>Catatan AI</summary>
                    <p className="research-scan-note">{pick.aiNote}</p>
                  </details>
                )}
              </th>
              <td className="num">
                <UpdatedValue as="strong" value={pick.close} format={(price) => formatPrice(price, pick.currency)} />
              </td>
              <td className={`num ${pick.changePct > 0 ? 'trend--up' : pick.changePct < 0 ? 'trend--down' : ''}`}>
                <UpdatedValue value={pick.changePct} format={formatPct} />
              </td>
              <td className="num">
                {formatPrice(pick.resistance, pick.currency)}
                {Number.isFinite(pick.breakoutPct) && <span className="research-cell-note">{formatPct(pick.breakoutPct)} di atas level</span>}
              </td>
              <td className="num scan-volume">
                {Number.isFinite(pick.volumeRatio)
                  ? `${pick.volumeRatio.toLocaleString('id-ID', { maximumFractionDigits: 1 })}×`
                  : 'Tidak tersedia'}
              </td>
              <td>{pick.date ? <time dateTime={pick.date}>{formatDateCompact(pick.date)}</time> : 'Tidak tersedia'}</td>
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
      <div className="research-brief-heading">
        <div>
          <TickerLink symbol={pick.symbol} />
          {pick.name && <p className="research-company">{pick.name}</p>}
        </div>
        <WatchAction symbol={pick.symbol} inWatchlist={inWatchlist} disabled={disabled} onAdd={onAdd} />
      </div>
      <dl className="research-brief-details">
        {pick.note && <div><dt>Analisis teknikal</dt><dd>{pick.note}</dd></div>}
        {pick.level && <div><dt>Level pantauan</dt><dd>{pick.level}</dd></div>}
        {pick.catalyst && <div><dt>Katalis</dt><dd>{pick.catalyst}</dd></div>}
      </dl>
    </li>
  );
}

export default function BreakoutScanner({ watchlist, onAdd, disabled, formatPrice, formatDate }) {
  const [mode, setMode] = useState('scan');      // 'scan' | 'research'
  const [region, setRegion] = useState('auto');
  const [request, setRequest] = useState({ status: 'idle' });
  const [lastResult, setLastResult] = useState(null);
  const activeScan = useRef(null);

  useEffect(() => () => {
    activeScan.current?.abort();
    activeScan.current = null;
  }, []);

  async function run(targetMode = mode, targetRegion = region) {
    if (loading || activeScan.current) return;

    const controller = new AbortController();
    const { signal } = controller;
    activeScan.current = controller;
    setRequest({ status: 'starting' });
    let deadline;

    try {
      // Mulai job di background untuk menghindari timeout function sinkron.
      const query = new URLSearchParams({ mode: targetMode, region: targetRegion });
      const startResponse = await fetch(`/.netlify/functions/breakout-start?${query}`, {
        method: 'POST',
        signal,
      });
      const startPayload = await startResponse.json().catch(() => null);
      signal.throwIfAborted();
      if (!startResponse.ok || !startPayload?.jobId) {
        setRequest({ status: 'error', message: startPayload?.error || scanErrorMessage });
        return;
      }

      const jobId = startPayload.jobId;
      const statusUrl = `/.netlify/functions/breakout-status?${new URLSearchParams({ jobId })}`;
      deadline = window.setTimeout(
        () => controller.abort(new DOMException('Pemindaian terlalu lama. Coba lagi.', 'TimeoutError')),
        startPayload.waitMs ?? 150_000,
      );

      while (true) {
        await waitForNextPoll(signal);
        signal.throwIfAborted();

        const statusResponse = await fetch(statusUrl, { signal, cache: 'no-store' });
        const statusPayload = await statusResponse.json().catch(() => null);
        signal.throwIfAborted();

        const status = statusPayload?.status;
        if (!statusResponse.ok || status === 'error') {
          setRequest({ status: 'error', message: statusPayload?.error || scanErrorMessage });
          return;
        }
        if (status === 'done') {
          const data = statusPayload.result;
          const error = !data ? scanErrorMessage : targetMode === 'research' && data.ai?.error;
          if (error) {
            setRequest({ status: 'error', message: error });
          } else {
            setLastResult({ mode: targetMode, data });
            setRequest({ status: 'success' });
          }
          return;
        }
        if (status === 'pending' || status === 'running') {
          setRequest((current) => current.status === status ? current : { status });
        }
      }
    } catch {
      if (activeScan.current === controller) {
        const message = signal.reason?.name === 'TimeoutError' ? signal.reason.message : scanErrorMessage;
        setRequest({ status: 'error', message });
      }
    } finally {
      window.clearTimeout(deadline);
      if (activeScan.current === controller) activeScan.current = null;
    }
  }

  function changeMode(next) {
    if (loading || activeScan.current || next === mode) return;
    setMode(next);
    if (request.status === 'success' || request.status === 'error') run(next, region);
  }

  function changeRegion(next) {
    if (loading || activeScan.current || next === region) return;
    setRegion(next);
    if (request.status === 'success' || request.status === 'error') run(mode, next);
  }

  const watched = new Set(watchlist.map((entry) => entry.symbol));
  const result = lastResult?.data;
  const results = result?.results ?? [];
  const ai = result?.ai;
  const isResearch = mode === 'research';
  const resultIsResearch = lastResult?.mode === 'research';
  const resultSummary = result && (resultIsResearch
    ? `${result.universe} · ${results.length} kandidat`
    : `${result.scanned} saham dipindai · ${result.universe} · ${results.length} memenuhi kriteria`);
  const finished = request.status === 'success';
  const resultTitle = resultIsResearch
    ? (finished ? 'Kandidat riset AI' : 'Hasil riset sebelumnya')
    : (finished ? 'Hasil scan matematis' : 'Hasil scan sebelumnya');
  const scanLabel = isResearch ? 'Riset' : 'Pemindaian';
  const phase = {
    starting: { action: 'Menyiapkan…', status: `${scanLabel} sedang disiapkan.` },
    pending: { action: 'Dalam antrean…', status: `${scanLabel} dalam antrean.` },
    running: { action: isResearch ? 'Meriset…' : 'Memindai…', status: `${scanLabel} sedang berjalan.` },
  }[request.status];
  const loading = Boolean(phase);
  const description = isResearch
    ? 'Kandidat disusun dari penelusuran web dan interpretasi AI.'
    : 'Pindai resistance 50 sesi, konsolidasi, dan volume dari data harga.';
  const actions = isResearch
    ? { idle: 'Mulai riset', success: 'Riset ulang' }
    : { idle: 'Jalankan scan', success: 'Pindai ulang' };
  const action = phase?.action ?? (request.status === 'error' ? 'Coba lagi' : actions[request.status]);
  const statusLabel = finished ? `${scanLabel} selesai. ${resultSummary}.` : phase?.status;

  return (
    <>
      <section className="research-panel recommend-panel research-config motion-enter" aria-labelledby="breakout-scanner-title">
        <header className="page-heading recommend-heading">
          <h1 id="breakout-scanner-title">Rekomendasi</h1>
          <p>{description}</p>
        </header>
        <form className="research-controls" onSubmit={(event) => { event.preventDefault(); run(); }}>
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
                  aria-disabled={loading}
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
          <button type="submit" className="scan-button" aria-disabled={loading}>
            {action}
            {loading && <ResearchProgress />}
          </button>
        </form>
        <p className="visually-hidden" role="status">{statusLabel}</p>

        {request.status === 'error' && (
          <ResearchRequestStatus title={`${scanLabel} gagal`} message={request.message} />
        )}
      </section>

      {result && (
        <section className="research-panel recommend-panel" aria-labelledby="research-results-title">
          <div className="research-panel-heading motion-enter motion-enter--after">
            <div>
              <h2 id="research-results-title">{resultTitle}</h2>
              <p><span className="motion-status" key={resultSummary}>{resultSummary}</span></p>
            </div>
            {result.date && (resultIsResearch || results.length > 0) && (
              <p className="research-result-date">
                {resultIsResearch ? 'Tanggal riset' : 'Sesi acuan'}{' '}
                <time dateTime={result.date}>{formatDate(result.date)}</time>
              </p>
            )}
          </div>
          {ai?.summary && (
            <div className="research-summary">
              <h3>{resultIsResearch ? 'Ringkasan riset' : 'Catatan AI atas hasil scan'}</h3>
              <p>{ai.summary}</p>
            </div>
          )}
          {results.length === 0 ? (
            <p className="research-empty">
              {resultIsResearch ? 'Belum ada kandidat dengan sumber yang cukup.' : 'Belum ada saham yang memenuhi kriteria scan pada sesi ini.'}
            </p>
          ) : resultIsResearch ? (
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
