import { useEffect, useRef, useState } from 'react';

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

function formatChange(changePct) {
  if (!Number.isFinite(changePct)) return '—';
  return `${changePct >= 0 ? '+' : ''}${changePct.toLocaleString('id-ID')}%`;
}

function formatRatio(volumeRatio) {
  if (!Number.isFinite(volumeRatio)) return '—';
  return `${volumeRatio.toLocaleString('id-ID', { maximumFractionDigits: 1 })}×`;
}

function cleanSymbol(symbol, region) {
  return region === 'auto' || region === 'jp' || region === 'hk' || region === 'ks' || region === 'kq' || region === 'ss' || region === 'sz'
    ? symbol.replace(/\.(JK|T|HK|KS|KQ|SS|SZ)$/, '')
    : symbol;
}

function ScanRow({ pick, index, inWatchlist, disabled, onAdd, formatPrice, region }) {
  return (
    <li className="breakout-item">
      <span className="breakout-rank" aria-hidden="true">{index + 1}</span>
      <div className="breakout-info">
        <div className="breakout-head">
          <span className="symbol-badge symbol-badge--light">{cleanSymbol(pick.symbol, region)}</span>
          {pick.universe && <span className="breakout-universe">{pick.universe}</span>}
          {pick.name && <span className="breakout-name">{pick.name}</span>}
        </div>
        {pick.aiNote && <p className="breakout-note">{pick.aiNote}</p>}
      </div>
      <div className="breakout-stats">
        <span className="breakout-close">{formatPrice(pick.close, pick.currency)}</span>
        <span className={Number.isFinite(pick.changePct) && pick.changePct >= 0 ? 'trend--up' : 'trend--down'}>
          {formatChange(pick.changePct)}
        </span>
        <span className="breakout-volume">Vol {formatRatio(pick.volumeRatio)}</span>
        {Number.isFinite(pick.breakoutPct) && (
          <span className="breakout-level">+{pick.breakoutPct.toLocaleString('id-ID')}% di atas res.</span>
        )}
      </div>
      <button
        type="button"
        className={`breakout-add${inWatchlist ? ' breakout-add--added' : ''}`}
        disabled={disabled || inWatchlist}
        onClick={() => onAdd(pick.symbol)}
        aria-label={inWatchlist ? `${pick.symbol} sudah dipantau` : `Pantau ${pick.symbol}`}
      >
        {inWatchlist ? '✓' : '+'}
      </button>
    </li>
  );
}

function ResearchRow({ pick, index, inWatchlist, disabled, onAdd }) {
  return (
    <li className="breakout-item breakout-item--research">
      <span className="breakout-rank" aria-hidden="true">{index + 1}</span>
      <div className="breakout-info">
        <div className="breakout-head">
          <span className="symbol-badge symbol-badge--light">{pick.symbol}</span>
          {pick.name && <span className="breakout-name">{pick.name}</span>}
        </div>
        {pick.note && <p className="breakout-note">{pick.note}</p>}
        {(pick.catalyst || pick.level) && (
          <p className="breakout-meta">
            {pick.level && <span><strong>Level:</strong> {pick.level}</span>}
            {pick.catalyst && <span><strong>Katalis:</strong> {pick.catalyst}</span>}
          </p>
        )}
      </div>
      <button
        type="button"
        className={`breakout-add${inWatchlist ? ' breakout-add--added' : ''}`}
        disabled={disabled || inWatchlist}
        onClick={() => onAdd(pick.symbol)}
        aria-label={inWatchlist ? `${pick.symbol} sudah dipantau` : `Pantau ${pick.symbol}`}
      >
        {inWatchlist ? '✓' : '+'}
      </button>
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
  const results = state.status === 'success' ? state.data.results : [];
  const ai = state.status === 'success' ? state.data.ai : null;
  const isResearch = (state.mode ?? mode) === 'research';
  const loading = state.status === 'loading';

  return (
    <section className="breakout-scanner" aria-labelledby="breakout-scanner-title">
      <div className="breakout-scanner-head">
        <div>
          <h2 id="breakout-scanner-title">Breakout hari ini</h2>
          <p>
            {state.status === 'success'
              ? isResearch
                ? `Riset AI · ${state.data.universe} · ${results.length} kandidat.`
                : `Sesi ${formatDate(state.data.date)} · ${state.data.scanned} saham ${state.data.universe} dipindai.`
              : 'Pindai base breakout (resistance 50 hari + konsolidasi ketat + volume).'}
          </p>
        </div>
        <button
          type="button"
          className="scan-button"
          disabled={loading}
          onClick={() => run()}
        >
          {loading ? 'Memindai…' : state.status === 'success' ? 'Pindai ulang' : 'Cari breakout'}
        </button>
      </div>

      <div className="breakout-controls">
        <div className="candle-timeframe" role="group" aria-label="Mode pencarian">
          <button
            type="button"
            className={`candle-timeframe-btn${mode === 'scan' ? ' candle-timeframe-btn--active' : ''}`}
            disabled={loading}
            onClick={() => changeMode('scan')}
            aria-pressed={mode === 'scan'}
          >
            Scan Matematis
          </button>
          <button
            type="button"
            className={`candle-timeframe-btn${mode === 'research' ? ' candle-timeframe-btn--active' : ''}`}
            disabled={loading}
            onClick={() => changeMode('research')}
            aria-pressed={mode === 'research'}
          >
            Riset AI
          </button>
        </div>
        <label className="breakout-region">
          <span>Bursa</span>
          <select value={region} onChange={(event) => changeRegion(event.target.value)} disabled={loading}>
            {regions.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {loading && (
        <div className="status-card" role="status">
          <span className="spinner" aria-hidden="true" />
          <div>
            <p className="status-title">{isResearch ? 'AI sedang riset…' : 'Memindai pasar…'}</p>
            <p>
              {isResearch
                ? 'Kenari mencari info terbaru dari internet untuk kandidat breakout.'
                : 'Memeriksa resistance 50 hari, konsolidasi, dan volume tiap saham.'}
            </p>
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div className="status-card status-card--error" role="alert">
          <span className="status-mark" aria-hidden="true">!</span>
          <div>
            <p className="status-title">Pemindaian gagal</p>
            <p>{state.message}</p>
          </div>
        </div>
      )}

      {state.status === 'success' && (
        <>
          {results.length === 0 ? (
            <p className="breakout-empty">
              {isResearch
                ? 'Riset AI belum menemukan kandidat dengan sumber yang cukup.'
                : 'Tidak ada saham yang memenuhi syarat base breakout pada sesi ini.'}
            </p>
          ) : (
            <ul className="breakout-list">
              {results.map((pick, index) => isResearch ? (
                <ResearchRow
                  key={`${pick.symbol}-${index}`}
                  pick={pick}
                  index={index}
                  inWatchlist={watched.has(pick.symbol)}
                  disabled={disabled}
                  onAdd={onAdd}
                />
              ) : (
                <ScanRow
                  key={pick.symbol}
                  pick={pick}
                  index={index}
                  inWatchlist={watched.has(pick.symbol)}
                  disabled={disabled}
                  onAdd={onAdd}
                  formatPrice={formatPrice}
                  region={region}
                />
              ))}
            </ul>
          )}
          {ai?.summary && (
            <p className="breakout-summary">
              <strong>Ringkasan AI:</strong> {ai.summary}
            </p>
          )}
          {ai?.error && !ai?.summary && (
            <p className="breakout-summary breakout-summary--muted">{ai.error}</p>
          )}
        </>
      )}
    </section>
  );
}
