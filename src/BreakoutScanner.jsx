import { localizedNumberFormat } from './i18n.js';
import useTranslation from './useTranslation.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { defaultBreakoutParams } from '../netlify/functions/shared/breakoutLogic.js';
import { volumeLookback as wedgeVolumeLookback } from '../netlify/functions/shared/sessionLogic.js';
import ConsolidationResults from './components/ConsolidationResults.jsx';
import FallingWedgeResults from './components/FallingWedgeResults.jsx';
import GoldenCrossResults, { goldenCrossTimeframes } from './components/GoldenCrossResults.jsx';
import WatchAction from './components/ScannerWatchAction.jsx';
import TableScroll from './components/TableScroll.jsx';
import TickerLink from './components/TickerLink.jsx';
import ResearchRequestStatus, { ResearchProgress } from './components/ResearchRequestStatus.jsx';
import UpdatedValue from './components/UpdatedValue.jsx';
import { formatDateCompact, formatPct } from './format.js';
import { consolidationTimeframes } from './consolidationView.js';

import { requestScanResult } from './scanRequest.js';
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

const marketsWithCrypto = [
  { value: 'auto', label: 'Semua bursa saham' },
  { value: 'crypto', label: 'Kripto' },
  ...regions.slice(1),
];

const cryptoModes = new Set(['consolidation', 'falling-wedge', 'golden-cross']);
const cryptoCloseLabels = {
  daily: 'Candle harian kripto tutup pukul 00.00 UTC.',
  weekly: 'Candle mingguan kripto tutup Senin pukul 00.00 UTC.',
  monthly: 'Candle bulanan kripto tutup pada awal bulan berikutnya pukul 00.00 UTC.',
};

const modeDescriptions = {
  scan: 'Pindai resistance 50 sesi, konsolidasi, dan volume dari data harga.',
  consolidation: 'Cari aset yang masih bergerak di antara zona support dan resistance.',
  'falling-wedge': 'Cari pola Falling Wedge harian dengan breakout bervolume dan konfirmasi penutupan pekan.',
  'golden-cross': 'Cari Golden Cross dan Death Cross SMA serta EMA 50/200 pada candle yang sudah tutup.',
};

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

export default function BreakoutScanner({ watchlist, onAdd, disabled, formatPrice, formatDate }) {
  const { t, language } = useTranslation();
  const [mode, setMode] = useState('scan');
  const [stockRegion, setStockRegion] = useState('auto');
  const [scanCrypto, setScanCrypto] = useState(false);
  const [consolidationTimeframe, setConsolidationTimeframe] = useState('daily');
  const [crossTimeframe, setCrossTimeframe] = useState('daily');
  const [crossMethod, setCrossMethod] = useState('SMA');
  const [request, setRequest] = useState({ status: 'idle' });
  const [lastResult, setLastResult] = useState(null);
  const activeScan = useRef(null);
  const isConsolidation = mode === 'consolidation';
  const isWedge = mode === 'falling-wedge';
  const isCross = mode === 'golden-cross';
  const supportsCrypto = cryptoModes.has(mode);
  const region = supportsCrypto && scanCrypto ? 'crypto' : stockRegion;
  const timeframes = isCross ? goldenCrossTimeframes : consolidationTimeframes;
  const usesTimeframe = isConsolidation || isCross;
  const timeframe = isCross ? crossTimeframe : consolidationTimeframe;

  useEffect(() => () => {
    activeScan.current?.abort();
    activeScan.current = null;
  }, []);

  async function run(
    targetMode = mode,
    targetRegion = cryptoModes.has(targetMode) && scanCrypto ? 'crypto' : stockRegion,
    targetTimeframe = targetMode === 'golden-cross' ? crossTimeframe : consolidationTimeframe,
  ) {
    if (loading || activeScan.current) return;

    const controller = new AbortController();
    const { signal } = controller;
    activeScan.current = controller;
    setRequest({ status: 'starting' });
    try {
      const scanMode = targetMode === 'consolidation' || targetMode === 'golden-cross'
        ? `${targetMode}-${targetTimeframe}` : targetMode;
      const data = await requestScanResult(scanMode, targetRegion, language, controller, (status) => {
        setRequest(current => current.status === status ? current : { status });
      });
      if (targetMode === 'consolidation' && data.mode !== scanMode) {
        throw new Error('Pemindaian konsolidasi gagal. Coba lagi nanti.');
      }
      if (targetMode === 'consolidation' && (data.timeframe !== targetTimeframe || !Array.isArray(data.results)
        || (data.region != null && data.region !== targetRegion))) {
        throw new Error('Hasil pemindaian konsolidasi belum lengkap. Coba lagi.');
      }
      if (targetMode === 'falling-wedge' && (data.mode !== scanMode || data.timeframe !== 'daily'
        || data.confirmationTimeframe !== 'weekly' || !Array.isArray(data.results)
        || (data.region != null && data.region !== targetRegion))) {
        throw new Error('Hasil pemindaian Falling Wedge belum lengkap. Coba lagi.');
      }
      if (targetMode === 'golden-cross' && (data.mode !== scanMode || data.timeframe !== targetTimeframe
        || data.region !== targetRegion || !Array.isArray(data.results)
        || !Number.isSafeInteger(data.checked) || !Number.isSafeInteger(data.scanned))) {
        throw new Error('Hasil pemindaian Golden Cross belum lengkap. Coba lagi.');
      }
      setLastResult({
        mode: targetMode, region: targetRegion, timeframe: targetTimeframe,
        data: { ...data, language: data.language ?? language },
      });
      setRequest({ status: 'success' });
    } catch (error) {
      if (activeScan.current === controller) {
        const message = signal.reason?.name === 'TimeoutError' ? signal.reason.message : error.message;
        setRequest({ status: 'error', message });
      }
    } finally {
      if (activeScan.current === controller) activeScan.current = null;
    }
  }

  function changeMode(next) {
    if (loading || activeScan.current || next === mode) return;
    setMode(next);
    if (request.status === 'success' || request.status === 'error') run(next);
  }

  function changeRegion(next) {
    if (loading || activeScan.current || next === region) return;
    if (supportsCrypto) setScanCrypto(next === 'crypto');
    if (next !== 'crypto') setStockRegion(next);
    if (request.status === 'success' || request.status === 'error') run(mode, next);
  }

  function changeTimeframe(next) {
    if (loading || activeScan.current || next === timeframe) return;
    if (isCross) setCrossTimeframe(next);
    else setConsolidationTimeframe(next);
    if (request.status === 'success' || request.status === 'error') run(mode, region, next);
  }

  const watched = useMemo(() => new Set(watchlist.map((entry) => entry.symbol)), [watchlist]);
  const finished = request.status === 'success';
  const matchingRegion = lastResult?.region === region;
  const scopeMatches = usesTimeframe ? matchingRegion && lastResult?.timeframe === timeframe : !isWedge || matchingRegion;
  const result = lastResult?.mode === mode && scopeMatches ? lastResult.data : null;
  const results = Array.isArray(result?.results) ? result.results : [];
  const ai = result?.ai;
  const scopeCount = Number.isFinite(result?.scanned) && t('{0} saham dalam cakupan', countFormat.format(result.scanned));
  const scanScope = [t(result?.universe), scopeCount].filter(Boolean).join(' · ');
  const resultSummary = isConsolidation ? t(results.length === 1 ? '1 kandidat konsolidasi ditemukan' : '{0} kandidat konsolidasi ditemukan', countFormat.format(results.length))
    : isWedge ? t(results.length === 1 ? '1 Falling Wedge terkonfirmasi ditemukan' : '{0} Falling Wedge terkonfirmasi ditemukan', countFormat.format(results.length))
      : isCross ? t(results.length === 1 ? '1 sinyal ditemukan' : '{0} sinyal ditemukan', countFormat.format(results.length))
        : t('{0}{1} kandidat ditampilkan', scanScope ? `${scanScope} · ` : '', results.length);
  const resultTitle = finished ? 'Hasil scan matematis' : 'Hasil scan sebelumnya';
  const scanLabel = 'Pemindaian';
  const phase = {
    starting: { action: 'Menyiapkan…', status: `${scanLabel} sedang disiapkan.` },
    pending: { action: 'Dalam antrean…', status: `${scanLabel} dalam antrean.` },
    running: { action: 'Memindai…', status: `${scanLabel} sedang berjalan.` },
  }[request.status];
  const loading = Boolean(phase);
  const actions = { idle: 'Jalankan scan', success: 'Pindai ulang' };
  const action = phase?.action ?? (request.status === 'error' ? 'Coba lagi' : actions[request.status]);
  const statusLabel = finished ? `${scanLabel} selesai. ${resultSummary}.` : phase?.status;

  return (
    <>
      <section className="research-panel recommend-panel research-config motion-enter" aria-labelledby="breakout-scanner-title">
        <header className="page-heading recommend-heading section-accent">
          <h1 id="breakout-scanner-title">{t("Rekomendasi")}</h1>
          <p>{t(modeDescriptions[mode])}</p>
        </header>
        <form
          className={`research-controls${usesTimeframe ? ' research-controls--timeframe' : ''}`}
          onSubmit={(event) => { event.preventDefault(); run(); }}
        >
          <fieldset className="research-mode">
            <legend>{t("Metode")}</legend>
            <div className="candle-timeframe">
              {[
                { value: 'scan', label: 'Scan matematis' },
                { value: 'consolidation', label: 'Konsolidasi' },
                { value: 'falling-wedge', label: 'Falling Wedge Pattern' },
                { value: 'golden-cross', label: 'Golden Cross' },
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
          <label className="research-field">{t(supportsCrypto ? 'Pasar' : 'Bursa')}<select value={region} onChange={(event) => changeRegion(event.target.value)} disabled={loading}>
              {(supportsCrypto ? marketsWithCrypto : regions).map(({ value, label }) => <option key={value} value={value}>{t(label)}</option>)}
            </select>
          </label>
          {usesTimeframe && (
            <label className="research-field">
              {t("Timeframe")}
              <select value={timeframe} onChange={(event) => changeTimeframe(event.target.value)} disabled={loading}>
                {Object.entries(timeframes).map(([value, label]) => (
                  <option key={value} value={value}>{t(label)}</option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" className="scan-button" aria-disabled={loading}>
            {t(action)}
            {loading && <ResearchProgress />}
          </button>
          {isWedge && <p className="research-form-help">
            {t('Analisis 1D · Konfirmasi 1W')}{' · '}
            {t('Volume breakout di atas rata-rata {0} sesi sebelumnya.', countFormat.format(wedgeVolumeLookback))}
          </p>}
          {region === 'crypto' && <p className="research-form-help">
            {t(cryptoCloseLabels[isWedge ? 'weekly' : timeframe])}
          </p>}
        </form>
        {(usesTimeframe || isWedge) && loading ? (
          <p className="consolidation-scan-phase" role="status">{t(phase.status)} {t('Cakupan tersedia setelah pemindaian selesai.')}</p>
        ) : <p className="visually-hidden" role="status">{t(statusLabel)}</p>}

        {request.status === 'error' && (
          <ResearchRequestStatus title={t("{0} gagal", t(scanLabel))} message={t(request.message)} />
        )}
      </section>

      {result && isConsolidation && (
        <ConsolidationResults key={region + ':' + timeframe} result={result} stale={!finished} watched={watched} disabled={disabled} onAdd={onAdd} />
      )}
      {result && isWedge && (
        <FallingWedgeResults key={region} result={result} stale={!finished} watched={watched} disabled={disabled} onAdd={onAdd} />
      )}
      {result && isCross && (
        <GoldenCrossResults result={result} method={crossMethod} onMethodChange={setCrossMethod}
          stale={!finished} watched={watched} disabled={disabled} onAdd={onAdd} />
      )}
      {result && mode === 'scan' && (
        <section className="research-panel recommend-panel" aria-labelledby="research-results-title">
          <ScanResultHeading title={t(resultTitle)} results={results} scope={scanScope} formatDate={formatDate} />
          {ai?.summary && (
            <div className="research-summary">
              <h3>{t("Catatan AI atas hasil scan")}</h3>
              <p lang={result.language}>{t(ai.summary)}</p>
              {result.language !== language && (
                <p className="research-form-help">{t('Bahasa laporan {0}. Jalankan ulang untuk membuat laporan dalam bahasa pilihan.', result.language === 'en' ? 'English' : 'Bahasa Indonesia')}</p>
              )}
            </div>
          )}
          {results.length === 0 ? (
            <p className="research-empty">
              {t("Belum ada saham yang memenuhi kriteria scan pada sesi ini.")}
            </p>
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
