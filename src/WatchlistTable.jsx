import { getLocale } from './i18n.js';
import useTranslation from './useTranslation.js';
import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import WorkspaceIcon from './components/WorkspaceIcon.jsx';
import TableScroll from './components/TableScroll.jsx';
import TickerLink from './components/TickerLink.jsx';
import UpdatedValue from './components/UpdatedValue.jsx';
import { formatDateCompact, formatVolume } from './format.js';
import { getStage2Score } from './stage2Score.js';
import { strongWatchStage2, watchPriceStatus, watchVolumePass } from './watchlistSignals.js';

// Skor Trend Template Minervini per simbol (analyze.js tanpa RS agar cepat).
function useTrendScores(symbolsKey) {
  const [scores, setScores] = useState({});
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    const gen = generation.current;
    const list = symbolsKey ? symbolsKey.split('\n') : [];

    async function load(symbol) {
      try {
        const response = await fetch(
          `/.netlify/functions/analyze?${new URLSearchParams({ symbol, rs: 'false' })}`,
        );
        const payload = await response.json().catch(() => null);
        if (gen !== generation.current) return;
        if (response.ok && payload?.trendTemplate) {
          const { passed, total } = payload.trendTemplate;
          setScores((s) => ({
            ...s,
            [symbol]: { passed, total },
          }));
        } else {
          setScores((s) => ({ ...s, [symbol]: null }));
        }
      } catch {
        if (gen === generation.current) setScores((s) => ({ ...s, [symbol]: null }));
      }
    }

    (async () => {
      for (const symbol of list) {
        if (gen !== generation.current) return;
        // eslint-disable-next-line no-await-in-loop
        await load(symbol);
      }
    })();

    return () => { generation.current += 1; };
  }, [symbolsKey]);

  return scores;
}

// Baris data yang diambil per simbol, berurutan agar tidak memicu rate limit.
function useWatchlistData(symbolsKey) {
  const [rows, setRows] = useState({});
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    const gen = generation.current;
    const controllers = new Map();
    const list = symbolsKey ? symbolsKey.split('\n') : [];

    setRows((previous) => {
      const next = {};
      for (const symbol of list) {
        next[symbol] = previous[symbol] ?? { status: 'loading' };
      }
      return next;
    });

    async function load(symbol) {
      const controller = new AbortController();
      controllers.set(symbol, controller);
      setRows((r) => (gen === generation.current && r[symbol]?.status !== 'success' ? { ...r, [symbol]: { status: 'loading' } } : r));
      try {
        const response = await fetch(
          `/.netlify/functions/price?${new URLSearchParams({ symbol })}`,
          { signal: controller.signal },
        );
        const payload = await response.json().catch(() => null);
        if (gen !== generation.current) return;
        if (!response.ok || !payload) {
          setRows((r) => ({
            ...r,
            [symbol]: { status: 'error', message: payload?.error || 'Gagal memuat.' },
          }));
          return;
        }
        setRows((r) => ({ ...r, [symbol]: { status: 'success', quote: payload } }));
      } catch {
        if (gen === generation.current && !controller.signal.aborted) {
          setRows((r) => ({ ...r, [symbol]: { status: 'error', message: 'Layanan tidak dapat diakses.' } }));
        }
      }
    }

    (async () => {
      for (const symbol of list) {
        if (gen !== generation.current) return;
        await load(symbol);
      }
    })();

    return () => {
      generation.current += 1;
      controllers.forEach((c) => c.abort());
    };
  }, [symbolsKey]);

  return rows;
}

function TrendScoreBadge({ score }) {
  const { t } = useTranslation();
  if (score === undefined) return <QuoteSkeleton label="Memuat skor Stage 2…" />;
  const display = getStage2Score(score?.passed, score?.total);
  if (!display) return <span className="research-cell-note">{t("Belum tersedia")}</span>;

  return (
    <span className={`research-badge research-badge--${display.tone}`}
      title={t("{0} dari {1} kriteria Stage 2 lolos", score.passed, score.total)}>
      {score.passed}/{score.total}
    </span>
  );
}

function CheckBadgeMini({ passed }) {
  const { t } = useTranslation();
  return (
    <span className={`research-cell-note${passed === true ? ' research-cell-note--support' : ''}`}>
      {passed == null ? t("Ambang belum tersedia") : passed ? t("Memenuhi ambang") : t("Di bawah ambang")}
    </span>
  );
}

const statusLabels = {
  breakout: 'Breakout',
  near: 'Mendekati',
  none: 'Menunggu',
  unavailable: 'Belum tersedia',
};
const statusTones = { breakout: ' research-badge--support', near: ' research-badge--warning' };

function BreakoutBadge({ state }) {
  const { t } = useTranslation();
  return <span className={'research-badge' + (statusTones[state] ?? '')}>{t(statusLabels[state])}</span>;
}

function PriceToWatchInput({ symbol, value, decimals, onSetWatchPrice, disabled }) {
  const { t } = useTranslation();
  const [text, setText] = useState(value == null ? '' : String(value));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const errorId = useId();

  useEffect(() => {
    setText(value == null ? '' : String(value));
    setError(null);
  }, [value]);

  async function commit() {
    if (disabled || saving) return;
    const trimmed = text.trim();
    const pattern = decimals === 0 ? /^\d+$/ : /^\d+(?:[.,]\d{1,2})?$/;
    const parsed = trimmed ? Number(trimmed.replace(',', '.')) : null;
    if (trimmed && (!pattern.test(trimmed) || !Number.isFinite(parsed))) {
      setError(decimals === 0 ? 'Isi harga dengan angka bulat.' : 'Isi harga dengan maksimal dua angka desimal.');
      return;
    }
    if (parsed === value) {
      setText(value == null ? '' : String(value));
      setError(null);
      return;
    }
    setSaving(true);
    try {
      if (!await onSetWatchPrice(symbol, parsed)) {
        setError('Perubahan harga belum tersimpan.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="watchlist-price-editor" aria-busy={saving}>
      <input
        className="ptw-input"
        type="text"
        inputMode={decimals === 0 ? 'numeric' : 'decimal'}
        placeholder={t("Isi harga")}
        value={text}
        disabled={disabled || saving}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        aria-label={t("Harga pantauan untuk {0}", symbol)}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => { setText(event.target.value); setError(null); }}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            setText(value == null ? '' : String(value));
            setError(null);
          }
        }}
      />
      {error && <p id={errorId} role="alert">{t(error)}</p>}
    </div>
  );
}

const priceDirections = {
  1: { icon: '↑', label: 'Naik dibanding harga buka', className: 'trend--up' },
  0: { icon: '=', label: 'Sama dengan harga buka', className: '' },
  '-1': { icon: '↓', label: 'Turun dibanding harga buka', className: 'trend--down' },
};

const starValues = [1, 2, 3, 4, 5];

function WatchlistRating({ symbol, rating, onSetRating, disabled }) {
  const { t } = useTranslation();
  const label = `Beri bintang untuk ${symbol}`;
  function selectRating(value) {
    if (!disabled && value !== rating) onSetRating(symbol, value);
  }

  return (
    <div className="watchlist-rating">
      <div className="watchlist-rating-stars" role="group" aria-label={t(label)}>
        {starValues.map((value) => (
          <button
            key={value}
            type="button"
            aria-label={t("{0} bintang", value)}
            aria-pressed={value === rating}
            aria-disabled={disabled}
            title={t("Beri {0} bintang", value)}
            onClick={() => selectRating(value)}
          >
            <span aria-hidden="true" className={value <= rating ? 'watchlist-star-filled' : undefined}>
              {value <= rating ? '★' : '☆'}
            </span>
          </button>
        ))}
      </div>
      <div className="watchlist-rating-picker">
        <span aria-hidden="true">{rating ? '★' : '☆'}</span>
        <select aria-label={t(label)} value={rating ?? ''} disabled={disabled}
          onChange={(event) => selectRating(Number(event.target.value))}>
          <option value="" disabled>{t("Bintang")}</option>
          {starValues.map((value) => <option value={value} key={value}>{value} {t("bintang")}</option>)}
        </select>
      </div>
    </div>
  );
}

function WatchlistNotes({ entry, onEdit, disabled }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const preview = useRef(null);
  const { symbol, notes } = entry;

  useLayoutEffect(() => {
    const element = preview.current;
    if (!element || expanded) return;
    const measure = () => setOverflow(element.scrollHeight > element.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [notes, expanded]);

  if (!notes) {
    return (
      <button type="button" className="watchlist-note-add" disabled={disabled} aria-haspopup="dialog"
        aria-label={`${t('Tambah catatan')} ${symbol}`} onClick={(event) => onEdit(entry, 'notes', event.currentTarget)}>
        + {t('Tambah catatan')}
      </button>
    );
  }

  return (
    <>
      <p ref={preview} className={`watchlist-note-preview${expanded ? ' watchlist-note-preview--expanded' : ''}`}>{notes}</p>
      <div className="watchlist-note-actions">
        {overflow && (
          <button type="button" className="watchlist-note-expand" aria-expanded={expanded}
            aria-label={t(expanded ? 'Ringkas catatan {0}' : 'Baca seluruh catatan {0}', symbol)}
            onClick={() => setExpanded((value) => !value)}>
            {t(expanded ? 'Ringkas' : 'Selengkapnya')}
          </button>
        )}
        <button type="button" className="watchlist-note-edit" disabled={disabled} aria-haspopup="dialog"
          aria-label={`${t('Ubah catatan')} ${symbol}`} title={t('Ubah catatan')}
          onClick={(event) => onEdit(entry, 'notes', event.currentTarget)}>
          <WorkspaceIcon name="edit" size={16} />
        </button>
      </div>
    </>
  );
}

function QuoteSkeleton({ label }) {
  const { t } = useTranslation();
  return <><span className="watchlist-skeleton" aria-hidden="true" /><span className="visually-hidden">{t(label)}</span></>;
}

const WatchlistRow = memo(function WatchlistRow({
  entry, row, formatPrice, onRemove, onSetWatchPrice, onSetRating, onEditEntry, disabled, trendScore, state, volumePass, match,
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [visited, setVisited] = useState(false);
  const detailsId = useId();
  const { symbol, priceToWatch, rating, imageId } = entry;
  const quote = row?.status === 'success' ? row.quote : null;
  const direction = quote ? priceDirections[Math.sign(quote.close - quote.open)] : null;
  const decimals = quote ? (['JPY', 'IDR'].includes(quote.currency) ? 0 : 2) : (symbol.endsWith('.JK') ? 0 : 2);
  const checks = quote?.buyTrigger?.volumeChecks ?? [];
  const imageAction = imageId ? 'Lihat gambar' : 'Unggah gambar';

  return (
    <tbody className="watchlist-entry" data-watchlist-symbol={symbol}>
      <tr className="watchlist-row" data-match={match}>
        <th scope="row" className="research-instrument">
          <div className="watchlist-symbol">
            <TickerLink symbol={symbol} />
            {match && <span className="watchlist-match" title={t("Memenuhi beberapa kriteria penyaringan")}>
              <WorkspaceIcon name="check" size={15} /><span className="visually-hidden">{t("Memenuhi beberapa kriteria penyaringan")}</span>
            </span>}
          </div>
          {quote?.name && quote.name !== symbol && <span className="research-cell-note research-table-company">{quote.name}</span>}
        </th>
        <td className="num watchlist-quote-state">
          {quote ? <>
            <span className={`watchlist-close ${direction?.className ?? ''}`}>
              {direction && <span role="img" aria-label={t(direction.label)} title={t(direction.label)}>{direction.icon}</span>}
              <UpdatedValue value={quote.close} format={(price) => formatPrice(price, quote.currency)} />
            </span>
            {quote.date && <time className="research-cell-note" dateTime={quote.date}>{formatDateCompact(quote.date)}</time>}
          </> : row?.status === 'error'
            ? <span className="research-quote-error">{t(row.message)}</span>
            : <QuoteSkeleton label="Memuat harga dan volume…" />}
        </td>
        <td className="num"><PriceToWatchInput symbol={symbol} value={priceToWatch} decimals={decimals}
          onSetWatchPrice={onSetWatchPrice} disabled={disabled || !quote} /></td>
        <td>{state === 'loading' ? <QuoteSkeleton label="Memuat status harga pantauan…" /> : <BreakoutBadge state={state} />}</td>
        <td><WatchlistRating symbol={symbol} rating={rating} onSetRating={onSetRating} disabled={disabled} /></td>
        <td className="watchlist-stage"><TrendScoreBadge score={trendScore} /></td>
        <td className="num">
          {state === 'loading' ? <QuoteSkeleton label="Memuat harga dan volume…" /> : <>
            <span>{Number.isFinite(quote?.volume) ? quote.volume.toLocaleString(getLocale()) : t('Belum tersedia')}</span>
            <CheckBadgeMini passed={volumePass} />
          </>}
        </td>
        <td className="num watchlist-average-volume">
          {quote ? formatVolume(quote.buyTrigger?.averageVolume, { includeUnit: false })
            : state === 'loading' ? <QuoteSkeleton label="Memuat harga dan volume…" /> : t('Belum tersedia')}
        </td>
        <td><button type="button" className="research-watch watchlist-disclosure" aria-expanded={expanded}
          aria-controls={detailsId} aria-label={`${t('Rincian')} ${symbol}`} onClick={() => {
            setVisited(true);
            setExpanded((value) => !value);
          }}>
          <WorkspaceIcon name="chevron" size={14} /> <span>{t('Rincian')}</span>
        </button></td>
      </tr>
      <tr id={detailsId} aria-hidden={!expanded} hidden={!visited} className="watchlist-detail-row">
        <td colSpan={9}>
          {visited && <div className="watchlist-detail-reveal" data-expanded={expanded} inert={!expanded}>
            <div className="watchlist-detail-clip">
              <div className="watchlist-details">
                <section className="watchlist-volume-details">
                  <h3>{t('Pemeriksaan volume')}</h3>
                  {Number.isFinite(quote?.buyTrigger?.minimumVolume) && (
                    <p>{t('Ambang {0}', formatVolume(quote.buyTrigger.minimumVolume))} · {t('1,4× rata-rata 50 sesi')}</p>
                  )}
                  {checks.some((check) => check?.date) ? <ul>{checks.filter((check) => check?.date).map((check) => (
                    <li key={check.date}>
                      <time dateTime={check.date}>{formatDateCompact(check.date)}</time>
                      <span>{formatVolume(check.volume, { includeUnit: false })}</span>
                      <CheckBadgeMini passed={check.meetsThreshold} />
                    </li>
                  ))}</ul> : <p>{t('Belum tersedia')}</p>}
                </section>
                <section className="watchlist-notes">
                  <h3>{t('Catatan')}</h3>
                  <WatchlistNotes entry={entry} onEdit={onEditEntry} disabled={disabled} />
                </section>
                <div className="watchlist-detail-actions watchlist-image">
                  <button type="button" className="research-watch" disabled={disabled} aria-haspopup="dialog"
                    aria-label={`${t(imageAction)} ${symbol}`} onClick={(event) => onEditEntry(entry, 'image', event.currentTarget)}>{t(imageAction)}</button>
                  <button type="button" className="research-remove" disabled={disabled}
                    aria-label={t('Hapus {0} dari daftar', symbol)} onClick={() => onRemove(symbol)}>{t('Hapus')}</button>
                </div>
              </div>
            </div>
          </div>}
        </td>
      </tr>
    </tbody>
  );
});

const stateRank = { breakout: 0, near: 1, none: 2, unavailable: 3, loading: 3 };
const signalFilters = {
  stars: '5 bintang',
  stage: 'Stage 2 ≥ 7/8',
  volume: 'Lolos ambang volume',
};
const sortLabels = {
  rating: 'Bintang tertinggi',
  stage: 'Skor Stage 2 tertinggi',
  symbol: 'Ticker A–Z',
  volume: 'Volume tertinggi',
  status: 'Status harga pantauan',
};

export default function WatchlistTable({ entries, formatPrice, onRemove, onSetWatchPrice, onSetRating, onEditEntry, disabled }) {
  const { t } = useTranslation();
  const symbolsKey = useMemo(() => entries.map((entry) => entry.symbol).join('\n'), [entries]);
  const rows = useWatchlistData(symbolsKey);
  const trendScores = useTrendScores(symbolsKey);
  const [flags, setFlags] = useState([]);
  const [status, setStatus] = useState('all');
  const [sortBy, setSortBy] = useState('rating');
  const allButton = useRef(null);
  const filtered = flags.length > 0 || status !== 'all';

  const { ordered, pending } = useMemo(() => {
    const candidates = [];
    let pending = false;
    for (const entry of entries) {
      const row = rows[entry.symbol];
      const trend = trendScores[entry.symbol];
      const quote = row?.status === 'success' ? row.quote : null;
      const volumePass = watchVolumePass(quote);
      const state = quote ? watchPriceStatus(quote, entry.priceToWatch, volumePass)
        : row?.status === 'error' ? 'unavailable' : 'loading';
      const matches = { stars: entry.rating === 5, stage: strongWatchStage2(trend), volume: volumePass === true };
      const waitingFor = { stars: false, stage: trend === undefined, volume: state === 'loading' };
      if (flags.some((flag) => !matches[flag] && !waitingFor[flag])) continue;
      if (status !== 'all' && status !== state && state !== 'loading') continue;
      if (flags.some((flag) => waitingFor[flag]) || (status !== 'all' && state === 'loading')) {
        pending = true;
        continue;
      }
      candidates.push({
        entry, row, trend, state, volumePass,
        stage: getStage2Score(trend?.passed, trend?.total)?.ratio ?? -1,
        volume: Number.isFinite(quote?.volume) ? quote.volume : -1,
        match: Object.values(matches).filter(Boolean).length >= 2,
      });
    }

    const sorters = {
      symbol: (a, b) => a.entry.symbol.localeCompare(b.entry.symbol),
      stage: (a, b) => b.stage - a.stage,
      volume: (a, b) => b.volume - a.volume,
      status: (a, b) => stateRank[a.state] - stateRank[b.state],
    };
    const preferred = sorters[sortBy];
    const ordered = candidates.sort((a, b) => (preferred?.(a, b) || 0)
      || ((b.entry.rating ?? 0) - (a.entry.rating ?? 0))
      || stateRank[a.state] - stateRank[b.state]);
    return { ordered, pending };
  }, [entries, rows, trendScores, flags, status, sortBy]);

  function clearFilters() {
    setFlags([]);
    setStatus('all');
  }

  return (
    <>
      <div className="watchlist-filters">
        <div className="watchlist-filter-options" role="group" aria-label={t("Filter pantauan")}>
          <button ref={allButton} type="button" aria-pressed={!filtered} onClick={clearFilters}>{t("Semua saham")}</button>
          {Object.entries(signalFilters).map(([flag, label]) => (
            <button type="button" key={flag} aria-pressed={flags.includes(flag)} onClick={() => setFlags((current) => (
              current.includes(flag) ? current.filter((value) => value !== flag) : [...current, flag]
            ))}>{t(label)}</button>
          ))}
        </div>
        <div className="watchlist-selects">
          <label>{t("Status")}<select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">{t("Semua status")}</option>
            {Object.entries(statusLabels).map(([key, label]) => <option value={key} key={key}>{t(label)}</option>)}
          </select></label>
          <label>{t("Urutkan")}<select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            {Object.entries(sortLabels).map(([key, label]) => <option value={key} key={key}>{t(label)}</option>)}
          </select></label>
        </div>
        <div className="watchlist-filter-summary">
          <p role="status">{t("{0} dari {1} saham ditampilkan", ordered.length.toLocaleString(getLocale()), entries.length.toLocaleString(getLocale()))}
            {pending && ' · ' + t("Filter masih menunggu data.")}</p>
          {filtered && <button type="button" className="text-button" onClick={() => {
            clearFilters();
            allButton.current?.focus({ preventScroll: true });
          }}>{t("Reset filter")}</button>}
        </div>
      </div>
      {ordered.length > 0 ? (
        <TableScroll className="research-table-scroll watchlist-table-scroll" label={t("Tabel daftar pantauan")}>
          <table className="fund-table research-table watchlist-table">
            <thead>
              <tr>
                <th scope="col">{t("Saham")}</th>
                <th scope="col" className="num">{t("Harga tutup")}</th>
                <th scope="col" className="num">{t("Harga pantauan")}</th>
                <th scope="col">{t("Status")}</th>
                <th scope="col">{t("Bintang")}</th>
                <th scope="col" className="watchlist-stage">{t("Stage 2")}</th>
                <th scope="col" className="num">{t("Volume (lembar)")}</th>
                <th scope="col" className="num">{t("Rata-rata volume")}<span className="watchlist-header-note">{t('50 sesi (lembar)')}</span></th>
                <th scope="col">{t("Rincian")}</th>
              </tr>
            </thead>
            {ordered.map(({ entry, row, trend, state, volumePass, match }) => (
              <WatchlistRow
                key={entry.symbol}
                entry={entry}
                row={row}
                formatPrice={formatPrice}
                onRemove={onRemove}
                onSetWatchPrice={onSetWatchPrice}
                onSetRating={onSetRating}
                onEditEntry={onEditEntry}
                disabled={disabled}
                trendScore={trend}
                state={state}
                volumePass={volumePass}
                match={match}
              />
            ))}
          </table>
        </TableScroll>
      ) : (
        <div className="research-empty">
          <h3>{t(pending ? "Menunggu data untuk filter ini…" : "Tidak ada saham yang cocok dengan filter.")}</h3>
          {!pending && <p>{t("Ubah status atau kurangi kriteria penyaringan.")}</p>}
        </div>
      )}
    </>
  );
}
