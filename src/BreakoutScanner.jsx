import { localizedNumberFormat } from './i18n.js';
import useTranslation from './useTranslation.js';
import { useEffect, useRef, useState } from 'react';
import { defaultBreakoutParams } from '../netlify/functions/shared/breakoutLogic.js';
import TableScroll from './components/TableScroll.jsx';
import TickerLink from './components/TickerLink.jsx';
import ResearchRequestStatus, { ResearchProgress } from './components/ResearchRequestStatus.jsx';
import UpdatedValue from './components/UpdatedValue.jsx';
import { formatDateCompact, formatPct } from './format.js';

const scanErrorMessage = 'Pemindaian breakout gagal. Coba lagi nanti.';
const { volumeMinRatio, volumeLookback } = defaultBreakoutParams;
const ratioFormat = localizedNumberFormat({ maximumFractionDigits: 2 });
const countFormat = localizedNumberFormat();

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
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={`research-watch${inWatchlist ? ' research-watch--added' : ''}`}
      disabled={disabled || inWatchlist}
      onClick={() => onAdd(symbol)}
      aria-label={inWatchlist ? t("{0} sudah dipantau", symbol) : t("Pantau {0}", symbol)}
    >
      {inWatchlist ? t("Dipantau") : t("Pantau")}
    </button>
  );
}

function ScanVolume({ ratio, scale }) {
  const { t } = useTranslation();
  if (!Number.isFinite(ratio) || ratio < 0) return <span className="scan-volume-empty">{t("Tidak tersedia")}</span>;

  return (
    <span className="scan-volume-reading">
      <strong>{ratioFormat.format(ratio)}×</strong>
      <span className="scan-volume-track" aria-hidden="true" style={{
        '--scan-volume-fill': `${ratio / scale * 100}%`,
        '--scan-volume-marker': `${volumeMinRatio / scale * 100}%`,
      }} />
    </span>
  );
}

function ScanChange({ value }) {
  const { t } = useTranslation();
  return (
    <span className={value > 0 ? 'trend--up' : value < 0 ? 'trend--down' : undefined}>
      <UpdatedValue value={value} format={formatPct} />
    </span>
  );
}

function ScanResistance({ pick, formatPrice }) {
  const { t } = useTranslation();
  return (
    <>
      {formatPrice(pick.resistance, pick.currency)}
      {Number.isFinite(pick.breakoutPct) && <span className="research-cell-note">{formatPct(pick.breakoutPct)} {t("di atas level")}</span>}
    </>
  );
}

function ScanTable({ results, watched, disabled, onAdd, formatPrice, volumeScale }) {
  const { t } = useTranslation();
  return (
    <TableScroll className="research-table-scroll" label={t("Tabel hasil scan matematis")}>
      <table className="fund-table research-table scan-table">
        <thead>
          <tr>
            <th scope="col">{t("Saham")}</th>
            <th scope="col" className="num">{t("Harga tutup")}</th>
            <th scope="col" className="num">{t("Perubahan")}</th>
            <th scope="col" className="num">{t("Resistance")}</th>
            <th scope="col" className="num scan-volume">{t("Rasio volume")}</th>
            <th scope="col">{t("Sesi")}</th>
            <th scope="col" className="num">{t("Aksi")}</th>
          </tr>
        </thead>
        <tbody>
          {results.map((pick) => (
            <tr key={pick.symbol}>
              <th scope="row" className="research-instrument">
                <TickerLink symbol={pick.symbol} />
                {pick.name && <span className="research-cell-note research-table-company">{pick.name}</span>}
                {pick.universe && <span className="research-cell-note">{t(pick.universe)}</span>}
                {pick.aiNote && (
                  <details className="research-scan-details">
                    <summary>{t("Catatan AI")}</summary>
                    <p className="research-scan-note">{pick.aiNote}</p>
                  </details>
                )}
              </th>
              <td className="num">
                <UpdatedValue as="strong" value={pick.close} format={(price) => formatPrice(price, pick.currency)} />
              </td>
              <td className="num"><ScanChange value={pick.changePct} /></td>
              <td className="num"><ScanResistance pick={pick} formatPrice={formatPrice} /></td>
              <td className="num scan-volume">
                <ScanVolume ratio={pick.volumeRatio} scale={volumeScale} />
              </td>
              <td>{pick.date ? <time dateTime={pick.date}>{formatDateCompact(pick.date)}</time> : t("Tidak tersedia")}</td>
              <td className="num"><WatchAction symbol={pick.symbol} inWatchlist={watched.has(pick.symbol)} disabled={disabled} onAdd={onAdd} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

function ScanListItem({ pick, inWatchlist, disabled, onAdd, formatPrice, formatDate, volumeScale }) {
  const { t } = useTranslation();
  return (
    <li className="scan-list-item">
      <div className="scan-item-heading">
        <div>
          <TickerLink symbol={pick.symbol} />
          {pick.name && <p className="research-company">{pick.name}</p>}
        </div>
        <div className="scan-item-price">
          <span>{t("Harga tutup")}</span>
          <UpdatedValue as="strong" value={pick.close} format={(price) => formatPrice(price, pick.currency)} />
        </div>
      </div>
      <dl className="scan-item-metrics">
        <div>
          <dt>{t("Perubahan")}</dt>
          <dd><ScanChange value={pick.changePct} /></dd>
        </div>
        <div>
          <dt>{t("Rasio volume")}</dt>
          <dd><ScanVolume ratio={pick.volumeRatio} scale={volumeScale} /></dd>
        </div>
      </dl>
      <details className="scan-item-details">
        <summary>{t("Rincian")}<span className="visually-hidden"> {pick.symbol}</span></summary>
        <dl className="scan-item-levels">
          <div>
            <dt>{t("Resistance")}</dt>
            <dd><ScanResistance pick={pick} formatPrice={formatPrice} /></dd>
          </div>
          <div>
            <dt>{t("Sesi")}</dt>
            <dd>{pick.date ? <time dateTime={pick.date}>{formatDate(pick.date)}</time> : t("Tidak tersedia")}</dd>
          </div>
          {pick.universe && <div><dt>{t("Cakupan")}</dt><dd>{t(pick.universe)}</dd></div>}
        </dl>
        {pick.aiNote && <p className="research-scan-note"><strong>{t("Catatan AI")}</strong><br />{pick.aiNote}</p>}
        <WatchAction symbol={pick.symbol} inWatchlist={inWatchlist} disabled={disabled} onAdd={onAdd} />
      </details>
    </li>
  );
}

function ScanResults({ results, watched, disabled, onAdd, formatPrice, formatDate }) {
  const { t } = useTranslation();
  const volumeScale = results.reduce((max, { volumeRatio }) => (
    Number.isFinite(volumeRatio) ? Math.max(max, volumeRatio) : max
  ), volumeMinRatio * 2);

  return (
    <>
      <p className="scan-volume-legend">
        <span aria-hidden="true" />
        <span>{t("Ambang volume")} <strong>{ratioFormat.format(volumeMinRatio)}×</strong> {t("rata-rata")} {volumeLookback} {t("sesi")}</span>
      </p>
      <div className="scan-table-layout">
        <ScanTable
          results={results}
          watched={watched}
          disabled={disabled}
          onAdd={onAdd}
          formatPrice={formatPrice}
          volumeScale={volumeScale}
        />
      </div>
      <ul className="scan-list" role="list" aria-label={t("Hasil scan matematis")}>
        {results.map((pick) => (
          <ScanListItem
            key={pick.symbol}
            pick={pick}
            inWatchlist={watched.has(pick.symbol)}
            disabled={disabled}
            onAdd={onAdd}
            formatPrice={formatPrice}
            formatDate={formatDate}
            volumeScale={volumeScale}
          />
        ))}
      </ul>
    </>
  );
}

function ScanResultHeading({ title, results, scope, formatDate }) {
  const { t } = useTranslation();
  const sessions = new Set(results.map(({ date }) => date || null));
  const singleSession = sessions.size === 1 ? sessions.values().next().value : null;

  return (
    <div className="research-panel-heading scan-results-heading motion-enter motion-enter--after">
      <div className="section-accent">
        <h2 id="research-results-title">{t(title)}</h2>
        {scope && <p>{scope}</p>}
      </div>
      <dl className="scan-overview">
        <div className="scan-overview-count">
          <dt>{t("Kandidat ditampilkan")}</dt>
          <dd><UpdatedValue value={results.length} format={countFormat.format} /></dd>
        </div>
        <div>
          <dt>{t("Sesi acuan")}</dt>
          <dd>
            {singleSession ? <time dateTime={singleSession}>{formatDate(singleSession)}</time>
              : sessions.size > 1 ? t("Lihat sesi per saham") : t("Tidak tersedia")}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function ResearchBrief({ pick, inWatchlist, disabled, onAdd }) {
  const { t } = useTranslation();
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
        {pick.note && <div><dt>{t("Analisis teknikal")}</dt><dd>{pick.note}</dd></div>}
        {pick.level && <div><dt>{t("Level pantauan")}</dt><dd>{pick.level}</dd></div>}
        {pick.catalyst && <div><dt>{t("Katalis")}</dt><dd>{pick.catalyst}</dd></div>}
      </dl>
    </li>
  );
}

export default function BreakoutScanner({ watchlist, onAdd, disabled, formatPrice, formatDate }) {
  const { t, language } = useTranslation();
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
      const query = new URLSearchParams({ mode: targetMode, region: targetRegion, lang: language });
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
            setLastResult({ mode: targetMode, data: { ...data, language: data.language ?? language } });
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
  const scanScope = [t(result?.universe),
    Number.isFinite(result?.scanned) && t('{0} saham dalam cakupan', countFormat.format(result.scanned)),
  ].filter(Boolean).join(' · ');
  const resultSummary = result && (resultIsResearch
    ? t('{0} · {1} kandidat', t(result.universe), results.length)
    : t('{0}{1} kandidat ditampilkan', scanScope ? `${scanScope} · ` : '', results.length));
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
        <header className="page-heading recommend-heading section-accent">
          <h1 id="breakout-scanner-title">{t("Rekomendasi")}</h1>
          <p>{t(description)}</p>
        </header>
        <form className="research-controls" onSubmit={(event) => { event.preventDefault(); run(); }}>
          <fieldset className="research-mode">
            <legend>{t("Metode")}</legend>
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
                  {t(label)}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="research-field">{t("Bursa")}<select value={region} onChange={(event) => changeRegion(event.target.value)} disabled={loading}>
              {regions.map(({ value, label }) => <option key={value} value={value}>{t(label)}</option>)}
            </select>
          </label>
          <button type="submit" className="scan-button" aria-disabled={loading}>
            {t(action)}
            {loading && <ResearchProgress />}
          </button>
        </form>
        <p className="visually-hidden" role="status">{t(statusLabel)}</p>

        {request.status === 'error' && (
          <ResearchRequestStatus title={t("{0} gagal", t(scanLabel))} message={t(request.message)} />
        )}
      </section>

      {result && (
        <section className="research-panel recommend-panel" aria-labelledby="research-results-title">
          {resultIsResearch ? (
            <div className="research-panel-heading motion-enter motion-enter--after">
              <div className="section-accent">
                <h2 id="research-results-title">{t(resultTitle)}</h2>
                <p><span className="motion-status" key={resultSummary}>{t(resultSummary)}</span></p>
              </div>
              {result.date && (
                <p className="research-result-date">{t("Tanggal riset")} <time dateTime={result.date}>{formatDate(result.date)}</time>
                </p>
              )}
            </div>
          ) : (
            <ScanResultHeading title={t(resultTitle)} results={results} scope={scanScope} formatDate={formatDate} />
          )}
          {ai?.summary && (
            <div className="research-summary">
              <h3>{resultIsResearch ? t("Ringkasan riset") : t("Catatan AI atas hasil scan")}</h3>
              <p lang={result.language}>{t(ai.summary)}</p>
              {result.language !== language && (
                <p className="research-form-help">{t('Bahasa laporan {0}. Jalankan ulang untuk membuat laporan dalam bahasa pilihan.', result.language === 'en' ? 'English' : 'Bahasa Indonesia')}</p>
              )}
            </div>
          )}
          {results.length === 0 ? (
            <p className="research-empty">
              {resultIsResearch ? t("Belum ada kandidat dengan sumber yang cukup.") : t("Belum ada saham yang memenuhi kriteria scan pada sesi ini.")}
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
            <ScanResults
              results={results}
              watched={watched}
              disabled={disabled}
              onAdd={onAdd}
              formatPrice={formatPrice}
              formatDate={formatDate}
            />
          )}
          {ai?.error && !ai?.summary && <p className="research-empty" role="status">{t(ai.error)}</p>}
        </section>
      )}
    </>
  );
}
