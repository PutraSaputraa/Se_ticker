import { useEffect, useMemo, useRef, useState } from 'react';
import {
  consolidationCoverage,
  consolidationPrice,
  consolidationSessionDate,
  consolidationTimeframes,
  countFormat,
  getConsolidationPosition,
  locationBounds,
  locationLabels,
  positionFormat,
  selectConsolidationCandidates,
  validCount,
} from '../consolidationView.js';
import useTranslation from '../useTranslation.js';
import { hasWatchlistCategory, watchlistCategories } from '../watchlist.js';
import ConsolidationAnalysis from './ConsolidationAnalysis.jsx';
import {
  ConsolidationHelp, ConsolidationZones, LocationBadge, SessionTime,
  consolidationDuration, consolidationExplanation, pricePositionText,
} from './ConsolidationInfo.jsx';
import ScannerWatchAction from './ScannerWatchAction.jsx';
import TickerLink from './TickerLink.jsx';
import WorkspaceIcon from './WorkspaceIcon.jsx';
import '../styles/consolidation.css';

const noResults = [];
const watchCategory = 'consolidation';
const locationFilters = ['all', 'support', 'middle', 'resistance'];
const trackBoundaries = {
  '--support-side': locationBounds.support + '%',
  '--resistance-side': locationBounds.resistance + '%',
};
const sortOptions = {
  default: 'Urutan hasil scan',
  support: 'Terdekat sisi support',
  resistance: 'Terdekat sisi resistance',
  longest: 'Durasi terpanjang',
  shortest: 'Durasi terpendek',
  supportReactions: 'Reaksi support terbanyak',
  resistanceReactions: 'Reaksi resistance terbanyak',
  ticker: 'Ticker A–Z',
};

function ConsolidationSummary({ result, picks, stale, titleRef }) {
  const { t } = useTranslation();
  const { timeframe, universe, scanned, checked, referenceSessions } = result;
  const coverage = consolidationCoverage(scanned, checked);
  const sessions = useMemo(() => {
    const dates = Array.isArray(referenceSessions) ? referenceSessions : picks.map(pick => pick?.date);
    return [...new Set(dates.filter(date => consolidationSessionDate(date, timeframe)))];
  }, [referenceSessions, picks, timeframe]);

  return (
    <>
      <header className="consolidation-section-heading consolidation-summary-heading">
        <div className="section-accent">
          <h2 id="research-results-title" ref={titleRef} tabIndex={-1}>{t('Konsolidasi aktif')}</h2>
          <p className="consolidation-muted">{[t(consolidationTimeframes[timeframe]), t(universe)].filter(Boolean).join(' · ')}</p>
        </div>
        <ConsolidationHelp label="Istilah konsolidasi" topics={['consolidation', 'close', 'duration', 'reactions']} />
      </header>
      {stale && <p className="consolidation-stale">{t('Menampilkan hasil pemindaian sebelumnya untuk pilihan ini.')}</p>}
      <dl className="consolidation-summary">
        <div className="consolidation-summary-primary">
          <dt>{t('Kandidat konsolidasi')}</dt>
          <dd>{countFormat.format(picks.length)}</dd>
        </div>
        <div>
          <dt>{t('Aset dalam cakupan')}</dt>
          <dd>{validCount(scanned) ? countFormat.format(scanned) : t('Tidak tersedia')}</dd>
        </div>
        <div>
          <dt>{t('Aset diperiksa')}</dt>
          <dd>{validCount(checked) ? countFormat.format(checked) : t('Tidak tersedia')}</dd>
        </div>
        <div>
          <dt>{t(Array.isArray(referenceSessions) ? 'Sesi acuan' : 'Sesi pada kandidat')}</dt>
          <dd className="consolidation-summary-date">
            {sessions.length === 1 ? <SessionTime date={sessions[0]} timeframe={timeframe} />
              : t(sessions.length ? 'Berbeda antar aset' : 'Tidak tersedia')}
          </dd>
        </div>
      </dl>
      <div className="consolidation-coverage">
        {coverage ? <>
          <p>{t('Cakupan pemindaian {0}%', positionFormat.format(coverage.pct))}</p>
          <div className="consolidation-coverage-track" aria-hidden="true">
            <span style={{ inlineSize: coverage.pct + '%' }} />
          </div>
          {coverage.unavailable > 0 && <p className="consolidation-muted">
            {t(coverage.unavailable === 1
              ? '1 aset belum dapat diperiksa. Rincian statusnya belum tersedia.'
              : '{0} aset belum dapat diperiksa. Rincian status tiap aset belum tersedia.', countFormat.format(coverage.unavailable))}
          </p>}
        </> : <p className="consolidation-muted">{t('Cakupan pemindaian belum tersedia.')}</p>}
        <p className="consolidation-muted">{t('Pemindai mencari penutupan di dalam rentang dan reaksi di kedua zona.')}</p>
      </div>
    </>
  );
}

function RangePosition({ position }) {
  const { t } = useTranslation();
  const hasTrack = position.pct != null;
  const hasMarker = hasTrack && position.location !== 'outside';
  return (
    <div className="consolidation-range">
      <div className="consolidation-range-heading">
        <span>{t('Posisi harga')}</span>
        <strong>{pricePositionText(position, t)}</strong>
        <ConsolidationHelp label="Posisi harga" topics={['support', 'resistance', 'position']} />
      </div>
      {hasTrack && <div aria-hidden="true">
        <div className="consolidation-track" style={trackBoundaries}>
          {hasMarker && <span className="consolidation-marker" data-location={position.location}
            style={{ '--range-position': position.pct + '%' }} />}
        </div>
        <div className="consolidation-track-labels"><span>{t('Support')}</span><span>{t('Resistance')}</span></div>
      </div>}
    </div>
  );
}

function ConsolidationCard({ row, timeframe, watchlistEntry, saving, disabled, onAdd, onInspect }) {
  const { t } = useTranslation();
  const { pick, position } = row;
  const { symbol } = pick;

  return (
    <li className="consolidation-card">
      <div className="consolidation-card-heading">
        <div>
          <TickerLink symbol={symbol} />
          {pick.name && <p className="research-company">{pick.name}</p>}
          {pick.universe && <p className="consolidation-muted">{t(pick.universe)}</p>}
        </div>
        <ScannerWatchAction symbol={symbol} entry={watchlistEntry} category={watchCategory}
          disabled={disabled} saving={saving} onAdd={onAdd} />
      </div>
      <div className="consolidation-price">
        <span>{t('Harga tutup acuan')}</span>
        <strong>{consolidationPrice(pick.close, pick.currency)}</strong>
        <LocationBadge location={position.location} />
      </div>
      <ConsolidationZones pick={pick} />
      <RangePosition position={position} />
      <div className="consolidation-card-footer">
        <p className="consolidation-explanation">{consolidationExplanation(position, t)}</p>
        <dl className="consolidation-card-dates">
          <div><dt>{t('Sesi acuan')}</dt><dd><SessionTime date={pick.date} timeframe={timeframe} compact /></dd></div>
          <div><dt>{t('Durasi rentang')}</dt><dd>{consolidationDuration(pick, timeframe, t)}</dd></div>
        </dl>
        <button type="button" className="research-watch consolidation-inspect" aria-haspopup="dialog"
          aria-label={t('Lihat analisis {0}', symbol)} onClick={event => onInspect({ row, trigger: event.currentTarget })}>
          {t('Lihat analisis')} <WorkspaceIcon name="arrow" size={16} />
        </button>
      </div>
    </li>
  );
}

export default function ConsolidationResults({ result, stale, watched, disabled, onAdd }) {
  const { t } = useTranslation();
  const picks = Array.isArray(result.results) ? result.results : noResults;
  const [location, setLocation] = useState('all');
  const [sort, setSort] = useState('default');
  const [selection, setSelection] = useState(null);
  const [watchRequest, setWatchRequest] = useState(null);
  const adding = useRef(false);
  const title = useRef(null);
  const resetTarget = useRef(null);
  const candidates = useMemo(() => picks
    .filter(pick => typeof pick?.symbol === 'string' && pick.symbol.trim())
    .map(pick => ({ pick, position: getConsolidationPosition(pick) })), [picks]);
  const hasOutside = candidates.some(({ position }) => position.location === 'outside');
  const activeLocation = hasOutside || location !== 'outside' ? location : 'all';
  const visible = useMemo(() => selectConsolidationCandidates(candidates, activeLocation, sort), [candidates, activeLocation, sort]);
  const canReset = activeLocation !== 'all' || sort !== 'default';
  const isWatching = symbol => hasWatchlistCategory(watched.get(symbol), watchCategory);
  const syncing = watchRequest?.status === 'saved' && !isWatching(watchRequest.symbol);

  useEffect(() => {
    if (activeLocation !== location) setLocation(activeLocation);
  }, [location, activeLocation]);

  useEffect(() => {
    if (watchRequest?.status !== 'saved') return;
    const timer = window.setTimeout(() => setWatchRequest(null), 3500);
    return () => window.clearTimeout(timer);
  }, [watchRequest]);

  async function addWatch(symbol) {
    if (disabled || adding.current || isWatching(symbol) || (syncing && watchRequest.symbol === symbol)) return;
    adding.current = true;
    setWatchRequest({ symbol, status: 'pending' });
    try {
      const saved = await onAdd(symbol, watchCategory);
      setWatchRequest({ symbol, status: saved ? 'saved' : 'error' });
    } catch {
      setWatchRequest({ symbol, status: 'error' });
    } finally {
      adding.current = false;
    }
  }

  function closeAnalysis() {
    const source = selection?.trigger;
    setSelection(null);
    (source?.isConnected ? source : title.current)?.focus({ preventScroll: true });
  }

  return (
    <section className="research-panel recommend-panel consolidation-results" aria-labelledby="research-results-title">
      <ConsolidationSummary result={result} picks={picks} stale={stale} titleRef={title} />
      {candidates.length > 0 && (
        <div className="consolidation-filters">
          <div className="consolidation-filter-options" role="group" aria-label={t('Filter posisi harga')}>
            {[...locationFilters, ...(hasOutside ? ['outside'] : [])].map((value) => (
              <button key={value} ref={value === 'all' ? resetTarget : undefined} type="button"
                aria-pressed={activeLocation === value} onClick={() => setLocation(value)}>
                {t(value === 'all' ? 'Semua kandidat' : locationLabels[value])}
              </button>
            ))}
          </div>
          <label>{t('Urutkan')}<select value={sort} onChange={event => setSort(event.target.value)}>
            {Object.entries(sortOptions).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
          </select></label>
          <div className="consolidation-filter-summary">
            <p role="status">{t(picks.length === 1 ? '{0} dari 1 kandidat ditampilkan' : '{0} dari {1} kandidat ditampilkan',
              countFormat.format(visible.length), countFormat.format(picks.length))}</p>
            {canReset && <button className="text-button" type="button" onClick={() => {
              setLocation('all');
              setSort('default');
              resetTarget.current?.focus({ preventScroll: true });
            }}>{t('Reset filter')}</button>}
          </div>
        </div>
      )}
      {watchRequest && watchRequest.status !== 'pending' && (
        <p className="research-sync consolidation-watch-feedback" data-state={watchRequest.status} role={watchRequest.status === 'error' ? 'alert' : 'status'}>
          {t(watchRequest.status === 'saved' ? '{0} ditambahkan ke kategori {1}.' : '{0} gagal ditambahkan ke kategori {1}. Coba lagi.',
            watchRequest.symbol, t(watchlistCategories[watchCategory]))}
        </p>
      )}
      {picks.length > candidates.length && <p className="consolidation-muted">
        {t('{0} hasil belum memiliki kode ticker yang dapat ditampilkan.', countFormat.format(picks.length - candidates.length))}
      </p>}
      {visible.length > 0 ? (
        <ul className="consolidation-list" role="list" aria-label={t('Kandidat konsolidasi')}>
          {visible.map((row) => (
            <ConsolidationCard key={row.pick.symbol} row={row} timeframe={result.timeframe}
              watchlistEntry={watched.get(row.pick.symbol)} disabled={disabled}
              saving={watchRequest?.symbol === row.pick.symbol && (watchRequest.status === 'pending' || syncing)}
              onAdd={addWatch} onInspect={setSelection} />
          ))}
        </ul>
      ) : <p className="research-empty">
        {t(candidates.length ? 'Tidak ada kandidat yang cocok dengan filter posisi ini.'
          : picks.length ? 'Data kandidat yang bisa ditampilkan belum tersedia.'
            : 'Belum ada konsolidasi aktif pada timeframe ini.')}
      </p>}
      {selection && <ConsolidationAnalysis row={selection.row} timeframe={result.timeframe} onClose={closeAnalysis} />}
    </section>
  );
}
