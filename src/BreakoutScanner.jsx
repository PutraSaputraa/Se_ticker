import { useEffect, useRef, useState } from 'react';

const scanErrorMessage = 'Pemindaian breakout gagal. Coba lagi nanti.';

function formatChange(changePct) {
  if (!Number.isFinite(changePct)) return '—';
  const sign = changePct >= 0 ? '+' : '';
  return `${sign}${changePct.toLocaleString('id-ID')}%`;
}

function formatRatio(volumeRatio) {
  if (!Number.isFinite(volumeRatio)) return '—';
  return `${volumeRatio.toLocaleString('id-ID', { maximumFractionDigits: 1 })}×`;
}

function formatScanDate(date, formatDate) {
  try {
    return formatDate(date);
  } catch {
    return date;
  }
}

function BreakoutRow({ pick, index, inWatchlist, disabled, onAdd, formatPrice }) {
  return (
    <li className="breakout-item">
      <span className="breakout-rank" aria-hidden="true">{index + 1}</span>
      <div className="breakout-info">
        <div className="breakout-head">
          <span className="symbol-badge symbol-badge--light">{pick.symbol.replace(/\.JK$/, '')}</span>
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
  const [state, setState] = useState({ status: 'idle' });
  const activeScan = useRef(null);

  useEffect(() => () => activeScan.current?.abort(), []);

  async function scan() {
    activeScan.current?.abort();
    const controller = new AbortController();
    activeScan.current = controller;
    setState({ status: 'loading' });

    try {
      const response = await fetch('/.netlify/functions/breakout-scan', {
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (controller.signal.aborted) return;

      if (!response.ok || !payload) {
        setState({ status: 'error', message: payload?.error || scanErrorMessage });
        return;
      }
      setState({ status: 'success', data: payload });
    } catch {
      if (!controller.signal.aborted) {
        setState({ status: 'error', message: scanErrorMessage });
      }
    }
  }

  const watched = new Set(watchlist.map((entry) => entry.symbol));
  const results = state.status === 'success' ? state.data.results : [];

  return (
    <section className="breakout-scanner" aria-labelledby="breakout-scanner-title">
      <div className="breakout-scanner-head">
        <div>
          <h2 id="breakout-scanner-title">Breakout hari ini</h2>
          <p>
            {state.status === 'success'
              ? `Sesi ${formatScanDate(state.data.date, formatDate)} · ${state.data.scanned} saham ${state.data.universe} dipindai.`
              : 'Pindai saham LQ45 dengan Buy Trigger dan volume.'}
          </p>
        </div>
        <button
          type="button"
          className="scan-button"
          disabled={state.status === 'loading'}
          onClick={scan}
        >
          {state.status === 'loading' ? 'Memindai…' : state.status === 'success' ? 'Pindai ulang' : 'Cari breakout'}
        </button>
      </div>

      {state.status === 'loading' && (
        <div className="status-card">
          <span className="spinner" aria-hidden="true" />
          <div>
            <p className="status-title">Memindai pasar…</p>
            <p>Memeriksa level Buy Trigger dan volume setiap saham, lalu menyusun ringkasan AI.</p>
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div className="status-card status-card--error">
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
              Tidak ada saham yang memenuhi syarat breakout pada sesi ini — harga sudah menembus
              level Buy Trigger dengan volume di atas ambang.
            </p>
          ) : (
            <>
              <ul className="breakout-list">
                {results.map((pick, index) => (
                  <BreakoutRow
                    key={pick.symbol}
                    pick={pick}
                    index={index}
                    inWatchlist={watched.has(pick.symbol)}
                    disabled={disabled}
                    onAdd={onAdd}
                    formatPrice={formatPrice}
                  />
                ))}
              </ul>
              {state.data.ai?.summary && (
                <p className="breakout-summary">
                  <strong>Ringkasan AI:</strong> {state.data.ai.summary}
                </p>
              )}
              {state.data.ai?.error && !state.data.ai?.summary && (
                <p className="breakout-summary breakout-summary--muted">{state.data.ai.error}</p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
