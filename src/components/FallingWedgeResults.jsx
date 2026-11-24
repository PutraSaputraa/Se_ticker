import { useEffect, useId, useRef, useState } from 'react';
import { volumeLookback as dailyVolumeLookback } from '../../netlify/functions/shared/sessionLogic.js';
import CandlestickChart from '../CandlestickChart.jsx';
import { consolidationPrice, countFormat, validCount } from '../consolidationView.js';
import { formatDate, formatVolume } from '../format.js';
import { localizedNumberFormat } from '../i18n.js';
import useTranslation from '../useTranslation.js';
import { SessionTime } from './ConsolidationInfo.jsx';
import ScannerWatchAction from './ScannerWatchAction.jsx';
import TickerLink from './TickerLink.jsx';
import WorkspaceIcon from './WorkspaceIcon.jsx';
import '../styles/falling-wedge.css';

const ratioFormat = localizedNumberFormat({ maximumFractionDigits: 2 });

function relativeVolume(value, t) {
  if (!Number.isFinite(value)) return t('Tidak tersedia');
  const rounded = ratioFormat.format(value);
  return value > 1 && rounded === '1' ? t('Lebih dari 1×') : rounded + '×';
}

function WedgeFacts({ pick }) {
  const { t } = useTranslation();
  return (
    <dl className="consolidation-facts wedge-facts">
      <div><dt>{t('Breakout 1D')}</dt><dd><SessionTime date={pick.date} timeframe="daily" compact /></dd></div>
      <div><dt>{t('Resistance saat breakout')}</dt><dd>{consolidationPrice(pick.resistance?.end, pick.currency)}</dd></div>
      <div><dt>{t('Volume vs rata-rata')}</dt><dd>{relativeVolume(pick.volumeRatio, t)}</dd></div>
      <div><dt>{t('Tutup pekan 1W')}</dt><dd>{consolidationPrice(pick.confirmation?.close, pick.currency)}</dd></div>
      <div><dt>{t('Sesi konfirmasi')}</dt><dd><SessionTime date={pick.confirmation?.date} timeframe="daily" compact /></dd></div>
      <div><dt>{t('Penyempitan rentang')}</dt><dd>{Number.isFinite(pick.contractionPct) ? t('{0}%', ratioFormat.format(pick.contractionPct)) : t('Tidak tersedia')}</dd></div>
    </dl>
  );
}

function WedgeAnalysis({ pick, volumeLookback, isCrypto, onClose }) {
  const { t } = useTranslation();
  const dialog = useRef(null);
  const titleId = useId();
  const sessions = pick.candles;
  const displayVolume = value => formatVolume(value, { includeUnit: !isCrypto });
  const chartReady = Array.isArray(sessions) && Number.isInteger(pick.duration)
    && sessions[pick.duration]?.date === pick.date && sessions.at(-1)?.date === pick.confirmation?.date
    && sessions[pick.duration]?.close === pick.close && sessions.at(-1)?.close === pick.confirmation?.close
    && sessions.every(bar => bar?.date && [bar.open, bar.high, bar.low, bar.close].every(Number.isFinite));
  const trendLines = [
    { ...pick.resistance, kind: 'resistance', label: 'Resistance menurun', from: 0, to: pick.duration },
    { ...pick.support, kind: 'support', label: 'Support menurun', from: 0, to: pick.duration },
  ];

  useEffect(() => {
    if (!dialog.current.open) dialog.current.showModal();
  }, []);

  return (
    <dialog ref={dialog} className="consolidation-analysis wedge-analysis" aria-labelledby={titleId} onClose={onClose}>
      <header className="consolidation-analysis-heading">
        <div>
          <h2 id={titleId}>{t('Falling Wedge pada {0}', pick.symbol)}</h2>
          {pick.name && <p className="research-company">{pick.name}</p>}
        </div>
        <button type="button" className="research-watch" autoFocus onClick={() => dialog.current.close()}>{t('Tutup')}</button>
      </header>
      <div className="consolidation-analysis-body">
        {chartReady ? (
          <CandlestickChart sessions={sessions} referenceDate={pick.date} referenceLabel="Breakout 1D" highlightHistoricalReference
            averageVolume={pick.averageVolume} trendLines={trendLines} formatDate={formatDate}
            formatPrice={price => consolidationPrice(price, pick.currency)} formatVolume={displayVolume} />
        ) : <p className="research-empty">{t('Riwayat harga belum tersedia.')}</p>}
        <section className="consolidation-analysis-facts" aria-label={t('Rincian breakout')}>
          <h3>{t('Rincian breakout')}</h3>
          <WedgeFacts pick={pick} />
          <dl className="consolidation-facts wedge-evidence">
            <div><dt>{t('Volume breakout')}</dt><dd>{displayVolume(pick.volume)}</dd></div>
            <div><dt>{t('Volume rata-rata {0} sesi', volumeLookback)}</dt><dd>{displayVolume(pick.averageVolume)}</dd></div>
            {validCount(pick.duration) && <div><dt>{t('Durasi pola')}</dt><dd>{t('{0} sesi', countFormat.format(pick.duration))}</dd></div>}
          </dl>
          <p className="consolidation-muted">{t('Garis resistance dan support sama-sama menurun. Resistance turun lebih curam sehingga jarak antar garis menyempit.')}</p>
          <p className="consolidation-muted">{t('Konfirmasi 1W memakai penutupan pekan terakhir yang sudah selesai. Harga tutup pekan harus berada di atas resistance saat breakout 1D.')}</p>
        </section>
      </div>
    </dialog>
  );
}

export default function FallingWedgeResults({ result, stale, watched, disabled, onAdd }) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState(null);
  const title = useRef(null);
  const picks = result.results.filter(pick => typeof pick?.symbol === 'string' && pick.symbol.trim());
  const dates = Array.isArray(result.referenceSessions) ? result.referenceSessions : [];
  const volumeLookback = validCount(result.volumeLookback) && result.volumeLookback > 0 ? result.volumeLookback : dailyVolumeLookback;

  function closeAnalysis() {
    const source = selection?.trigger;
    setSelection(null);
    (source?.isConnected ? source : title.current)?.focus({ preventScroll: true });
  }

  return (
    <section className="research-panel recommend-panel consolidation-results wedge-results" aria-labelledby="wedge-results-title">
      <header className="consolidation-section-heading consolidation-summary-heading">
        <div className="section-accent">
          <h2 id="wedge-results-title" ref={title} tabIndex={-1}>{t('Falling Wedge terkonfirmasi')}</h2>
          <p className="consolidation-muted">{t('Analisis 1D · Konfirmasi 1W')}{result.universe ? ' · ' + t(result.universe) : ''}</p>
        </div>
      </header>
      {stale && <p className="consolidation-stale">{t('Menampilkan hasil pemindaian sebelumnya untuk pilihan ini.')}</p>}
      <dl className="consolidation-summary">
        <div className="consolidation-summary-primary"><dt>{t('Kandidat ditampilkan')}</dt><dd>{countFormat.format(picks.length)}</dd></div>
        <div><dt>{t('Aset dalam cakupan')}</dt><dd>{validCount(result.scanned) ? countFormat.format(result.scanned) : t('Tidak tersedia')}</dd></div>
        <div><dt>{t('Aset diperiksa')}</dt><dd>{validCount(result.checked) ? countFormat.format(result.checked) : t('Tidak tersedia')}</dd></div>
        <div><dt>{t('Pekan acuan (1W)')}</dt><dd className="consolidation-summary-date">
          {dates.length === 1 ? <SessionTime date={dates[0]} timeframe="daily" /> : t(dates.length ? 'Berbeda antar aset' : 'Tidak tersedia')}
        </dd></div>
      </dl>
      {picks.length ? (
        <ul className="consolidation-list" role="list" aria-label={t('Falling Wedge terkonfirmasi')}>
          {picks.map(pick => (
            <li className="consolidation-card wedge-card" key={pick.symbol}>
              <div className="consolidation-card-heading">
                <div>
                  <TickerLink symbol={pick.symbol} />
                  {pick.name && <p className="research-company">{pick.name}</p>}
                  {pick.universe && <p className="consolidation-muted">{t(pick.universe)}</p>}
                </div>
                <ScannerWatchAction symbol={pick.symbol} entry={watched.get(pick.symbol)} category="falling-wedge"
                  disabled={disabled} onAdd={onAdd} />
              </div>
              <div className="consolidation-price">
                <span>{t('Harga tutup breakout 1D')}</span>
                <strong>{consolidationPrice(pick.close, pick.currency)}</strong>
                <span className="consolidation-location wedge-confirmed">{t('Terkonfirmasi 1W')}</span>
              </div>
              <WedgeFacts pick={pick} />
              <button type="button" className="research-watch consolidation-inspect wedge-inspect"
                aria-haspopup="dialog" aria-label={t('Lihat pola {0}', pick.symbol)}
                onClick={event => setSelection({ pick, trigger: event.currentTarget })}>
                {t('Lihat pola')} <WorkspaceIcon name="arrow" size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="research-empty">{t(result.checked === 0
        ? 'Data harian dan penutupan pekan belum cukup untuk memeriksa pasar ini.'
        : 'Belum ada Falling Wedge yang terkonfirmasi pada pekan terakhir yang sudah selesai.')}</p>}
      {selection && <WedgeAnalysis pick={selection.pick} volumeLookback={volumeLookback} isCrypto={result.region === 'crypto'} onClose={closeAnalysis} />}
    </section>
  );
}
