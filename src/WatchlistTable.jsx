import { getLocale } from './i18n.js';
import useTranslation from './useTranslation.js';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import WorkspaceIcon from './components/WorkspaceIcon.jsx';
import TableScroll from './components/TableScroll.jsx';
import TickerLink from './components/TickerLink.jsx';
import UpdatedValue from './components/UpdatedValue.jsx';
import { formatDateCompact, formatVolume } from './format.js';
import { getStage2Score } from './stage2Score.js';

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
  if (score === undefined) return <span className="research-cell-note">{t("Memuatâ€¦")}</span>;
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

// Breakout: Close terbaru sudah di atas Price to Watch DAN volume (sesi acuan
// atau sesi sebelumnya) memenuhi ambang 1,4x rata-rata 50 sesi.
function breakoutStatus(quote, priceToWatch) {
  if (!Number.isFinite(priceToWatch)) return { state: 'none', priceAbove: null, volumeOk: null };
  const priceAbove = quote.close > priceToWatch;
  const volumeChecks = quote.buyTrigger?.volumeChecks ?? [];
  const volumeOk = volumeChecks.some((check) => check?.meetsThreshold === true)
    ? true
    : volumeChecks.every((check) => check?.meetsThreshold === false)
      ? false
      : null;

  if (priceAbove && volumeOk) return { state: 'breakout', priceAbove, volumeOk };
  if (priceAbove || volumeOk) return { state: 'near', priceAbove, volumeOk };
  return { state: 'none', priceAbove, volumeOk };
}

function BreakoutBadge({ state }) {
  const { t } = useTranslation();
  if (state === 'breakout') return <span className="research-badge research-badge--support">{t("Breakout")}</span>;
  if (state === 'near') return <span className="research-badge research-badge--warning">{t("Mendekati")}</span>;
  return <span className="research-badge">{t("Menunggu")}</span>;
}

function PriceToWatchInput({ symbol, value, decimals, onSetWatchPrice, disabled }) {
  const { t } = useTranslation();
  const [text, setText] = useState(value == null ? '' : String(value));

  useEffect(() => {
    setText(value == null ? '' : String(value));
  }, [value]);

  async function commit() {
    if (disabled) return;
    const trimmed = text.trim();
    if (!trimmed) {
      if (value !== null && !await onSetWatchPrice(symbol, null)) setText(String(value));
      return;
    }
    const pattern = decimals === 0 ? /^\d+$/ : /^\d+(?:[.,]\d{1,2})?$/;
    if (!pattern.test(trimmed)) {
      setText(value == null ? '' : String(value));
      return;
    }
    const parsed = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      setText(value == null ? '' : String(value));
      return;
    }
    if (parsed !== value && !await onSetWatchPrice(symbol, parsed)) {
      setText(value == null ? '' : String(value));
    }
  }

  return (
    <input
      className="ptw-input"
      type="text"
      inputMode={decimals === 0 ? 'numeric' : 'decimal'}
      placeholder={t("Isi harga")}
      value={text}
      disabled={disabled}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      aria-label={t("Harga pantauan untuk {0}", symbol)}
    />
  );
}

const priceDirections = {
  1: { icon: 'â†‘', label: 'Naik dibanding harga buka', className: 'trend--up' },
  0: { icon: '=', label: 'Sama dengan harga buka', className: '' },
  '-1': { icon: 'â†“', label: 'Turun dibanding harga buka', className: 'trend--down' },
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
              {value <= rating ? 'â˜…' : 'â˜†'}
            </span>
          </button>
        ))}
      </div>
      <div className="watchlist-rating-picker">
        <span aria-hidden="true">{rating ? 'â˜…' : 'â˜†'}</span>
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

function WatchlistRow({ entry, row, formatPrice, onRemove, onSetWatchPrice, onSetRating, onEditEntry, disabled, trendScore }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const { symbol, priceToWatch, rating, imageId } = entry;
  const quote = row?.status === 'success' ? row.quote : null;
  const direction = quote ? priceDirections[Math.sign(quote.close - quote.open)] : null;
  const decimals = quote ? (['JPY', 'IDR'].includes(quote.currency) ? 0 : 2) : (symbol.endsWith('.JK') ? 0 : 2);
  const volumePass = quote?.buyTrigger?.volumeChecks?.[0]?.meetsThreshold ?? null;
  const imageAction = imageId ? 'Lihat gambar' : 'Unggah gambar';

  return (
    <tbody className="watchlist-entry" data-watchlist-symbol={symbol}>
      <tr className="watchlist-row">
        <th scope="row" className="research-instrument">
          <TickerLink symbol={symbol} />
          {quote?.name && quote.name !== symbol && <span className="research-cell-note research-table-company">{quote.name}</span>}
        </th>
        <td className="num watchlist-quote-state">
          {quote ? <>
            <span className={`watchlist-close ${direction?.className ?? ''}`}>
              {direction && <span role="img" aria-label={t(direction.label)} title={t(direction.label)}>{direction.icon}</span>}
              <UpdatedValue value={quote.close} format={(price) => formatPrice(price, quote.currency)} />
            </span>
            {quote.date && <time className="research-cell-note" dateTime={quote.date}>{formatDateCompact(quote.date)}</time>}
          </> : <span className={row?.status === 'error' ? 'research-quote-error' : 'research-cell-note'}>
            {row?.status === 'error' ? t(row.message) : t('Memuat harga dan volumeâ€¦')}
          </span>}
        </td>
        <td className="num"><PriceToWatchInput symbol={symbol} value={priceToWatch} decimals={decimals}
          onSetWatchPrice={onSetWatchPrice} disabled={disabled || !quote} /></td>
        <td>{quote ? <BreakoutBadge state={breakoutStatus(quote, priceToWatch).state} /> : <span className="research-cell-note">{t('Belum tersedia')}</span>}</td>
        <td><WatchlistRating symbol={symbol} rating={rating} onSetRating={onSetRating} disabled={disabled} /></td>
        <td className="watchlist-stage"><TrendScoreBadge score={trendScore} /></td>
        <td className="num">
          <span>{Number.isFinite(quote?.volume) ? quote.volume.toLocaleString(getLocale()) : t('Belum tersedia')}</span>
          <CheckBadgeMini passed={volumePass} />
        </td>
        <td className="num watchlist-average-volume">
          {quote ? formatVolume(quote.buyTrigger?.averageVolume, { includeUnit: false }) : t('Belum tersedia')}
        </td>
        <td><button type="button" className="research-watch watchlist-disclosure" aria-expanded={expanded}
          aria-controls={detailsId} aria-label={`${t('Rincian')} ${symbol}`} onClick={() => setExpanded((value) => !value)}>
          <WorkspaceIcon name="chevron" size={14} /> <span>{t('Rincian')}</span>
        </button></td>
      </tr>
      <tr id={detailsId} hidden={!expanded} className="watchlist-detail-row">
        <td colSpan={9}>
          <div className="watchlist-details">
            <section className="watchlist-notes"><h3>{t('Catatan')}</h3><WatchlistNotes entry={entry} onEdit={onEditEntry} disabled={disabled} /></section>
            <section className="watchlist-detail-actions watchlist-image">
              <button type="button" className="research-watch" disabled={disabled} aria-haspopup="dialog"
                aria-label={`${t(imageAction)} ${symbol}`} onClick={(event) => onEditEntry(entry, 'image', event.currentTarget)}>{t(imageAction)}</button>
              <button type="button" className="research-remove" disabled={disabled}
                aria-label={t('Hapus {0} dari daftar', symbol)} onClick={() => onRemove(symbol)}>{t('Hapus')}</button>
            </section>
          </div>
        </td>
      </tr>
    </tbody>
  );
}

const stateRank = { breakout: 0, near: 1, none: 2 };

export default function WatchlistTable({ entries, formatPrice, onRemove, onSetWatchPrice, onSetRating, onEditEntry, disabled }) {
  const { t } = useTranslation();
  const symbolsKey = entries.map((entry) => entry.symbol).join('\n');
  const rows = useWatchlistData(symbolsKey);
  const trendScores = useTrendScores(symbolsKey);

  const ordered = [...entries].sort((a, b) => {
    const byRating = (b.rating ?? 0) - (a.rating ?? 0);
    if (byRating !== 0) return byRating;
    const rowA = rows[a.symbol];
    const rowB = rows[b.symbol];
    const rankA = rowA?.status === 'success' ? stateRank[breakoutStatus(rowA.quote, a.priceToWatch).state] : 3;
    const rankB = rowB?.status === 'success' ? stateRank[breakoutStatus(rowB.quote, b.priceToWatch).state] : 3;
    return rankA - rankB;
  });

  return (
    <TableScroll className="research-table-scroll" label={t("Tabel daftar pantauan")}>
      <table className="fund-table research-table watchlist-table">
        <thead>
          <tr>
            <th scope="col">{t("Saham")}</th>
            <th scope="col" className="num">{t("Harga tutup")}</th>
            <th scope="col" className="num">{t("Harga pantauan")}</th>
            <th scope="col">{t("Status")}</th>
            <th scope="col">{t("Bintang")}</th>
            <th scope="col">{t("Stage 2")}</th>
            <th scope="col" className="num">{t("Volume (lembar)")}</th>
            <th scope="col" className="num">{t("Rata-rata volume")}<span className="watchlist-header-note">{t('50 sesi (lembar)')}</span></th>
            <th scope="col">{t("Rincian")}</th>
          </tr>
        </thead>
          {ordered.map((entry) => (
            <WatchlistRow
              key={entry.symbol}
              entry={entry}
              row={rows[entry.symbol]}
              formatPrice={formatPrice}
              onRemove={onRemove}
              onSetWatchPrice={onSetWatchPrice}
              onSetRating={onSetRating}
              onEditEntry={onEditEntry}
              disabled={disabled}
              trendScore={trendScores[entry.symbol]}
            />
          ))}
      </table>
    </TableScroll>
  );
}
