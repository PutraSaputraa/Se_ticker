import { useEffect, useRef, useState } from 'react';
import TableScroll from './components/TableScroll.jsx';
import TickerLink from './components/TickerLink.jsx';
import { formatDateCompact, formatVolume } from './format.js';

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
          setScores((s) => ({
            ...s,
            [symbol]: { passed: payload.trendTemplate.passed, total: payload.trendTemplate.total, eligible: payload.trendTemplate.eligible },
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
      setRows((r) => (gen === generation.current ? { ...r, [symbol]: { status: 'loading' } } : r));
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
  if (score === undefined) return <span className="research-cell-note">Memuat…</span>;
  if (score === null) return <span className="research-cell-note">Belum tersedia</span>;
  return (
    <span className={`research-badge${score.eligible ? ' research-badge--positive' : ''}`}
      title={`${score.passed} dari ${score.total} kriteria Stage 2 lolos`}>
      {score.passed}/{score.total}
    </span>
  );
}

function CheckBadgeMini({ passed }) {
  return (
    <span className={`research-cell-note${passed === true ? ' research-cell-note--positive' : ''}`}>
      {passed == null ? 'Ambang belum tersedia' : passed ? 'Memenuhi ambang' : 'Di bawah ambang'}
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
  if (state === 'breakout') return <span className="research-badge research-badge--positive">Breakout</span>;
  if (state === 'near') return <span className="research-badge research-badge--warning">Mendekati</span>;
  return <span className="research-badge">Menunggu</span>;
}

function PriceToWatchInput({ symbol, value, decimals, onSetWatchPrice, disabled }) {
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
      placeholder="Isi harga"
      value={text}
      disabled={disabled}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      aria-label={`Harga pantauan untuk ${symbol}`}
    />
  );
}

const priceDirections = {
  1: { icon: '↑', label: 'Naik dibanding harga buka', className: 'trend--up' },
  0: { icon: '=', label: 'Sama dengan harga buka', className: '' },
  '-1': { icon: '↓', label: 'Turun dibanding harga buka', className: 'trend--down' },
};

const starValues = [1, 2, 3, 4, 5];

function WatchlistRating({ symbol, rating, onSetRating, disabled }) {
  return (
    <div className="watchlist-rating" role="group" aria-label={`Beri bintang untuk ${symbol}`}>
      {starValues.map((value) => (
        <button
          key={value}
          type="button"
          aria-label={`${value} bintang`}
          aria-pressed={value === rating}
          aria-disabled={disabled}
          title={`Beri ${value} bintang`}
          onClick={() => { if (!disabled && value !== rating) onSetRating(symbol, value); }}
        >
          <span aria-hidden="true" className={value <= rating ? 'watchlist-star-filled' : undefined}>
            {value <= rating ? '★' : '☆'}
          </span>
        </button>
      ))}
    </div>
  );
}

function WatchlistRow({ entry, row, formatPrice, onOpen, onRemove, onSetWatchPrice, onSetRating, onEditEntry, disabled, trendScore }) {
  const { symbol, priceToWatch, rating, notes, imageId } = entry;
  const quote = row?.quote;
  const instrument = (
    <th scope="row" className="research-instrument">
      <TickerLink symbol={symbol} />
      {quote?.name && quote.name !== symbol && <span className="research-cell-note research-table-company">{quote.name}</span>}
      <WatchlistRating symbol={symbol} rating={rating} onSetRating={onSetRating} disabled={disabled} />
    </th>
  );
  const removeButton = (
    <button
      type="button"
      className="research-remove"
      disabled={disabled}
      title={`Hapus ${symbol}`}
      aria-label={`Hapus ${symbol} dari daftar`}
      onClick={(event) => { event.stopPropagation(); onRemove(symbol); }}
    >
      Hapus
    </button>
  );
  const notesAction = notes ? 'Ubah catatan' : 'Tambah catatan';
  const imageAction = imageId ? 'Lihat gambar' : 'Unggah gambar';
  const details = (
    <>
      <td className="watchlist-notes">
        {notes && <p className="watchlist-note-preview">{notes}</p>}
        <button type="button" className="research-watch" disabled={disabled} aria-haspopup="dialog"
          aria-label={`${notesAction} ${symbol}`} onClick={() => onEditEntry(entry, 'notes')}>
          {notesAction}
        </button>
      </td>
      <td className="watchlist-image">
        <button type="button" className="research-watch" disabled={disabled} aria-haspopup="dialog"
          aria-label={`${imageAction} ${symbol}`} onClick={() => onEditEntry(entry, 'image')}>
          {imageAction}
        </button>
      </td>
    </>
  );

  if (row?.status !== 'success') {
    const error = row?.status === 'error';
    return (
      <tr>
        {instrument}
        <td colSpan={3} className="watchlist-quote-state">
          <span className={error ? 'research-quote-error' : 'research-cell-note'}>
            {error ? row.message : 'Memuat harga dan volume…'}
          </span>
        </td>
        <td className="watchlist-stage"><TrendScoreBadge score={trendScore} /></td>
        <td colSpan={2} />
        {details}
        <td className="num">{removeButton}</td>
      </tr>
    );
  }

  const direction = priceDirections[Math.sign(quote.close - quote.open)];
  const volumePass = quote.buyTrigger?.volumeChecks?.[0]?.meetsThreshold ?? null;
  const decimals = quote.currency === 'JPY' || quote.currency === 'IDR' ? 0 : 2;
  const breakout = breakoutStatus(quote, priceToWatch);

  return (
    <tr className="watchlist-row" onClick={(event) => {
      if (!event.target.closest('a, button, input, .watchlist-notes, .watchlist-image')) onOpen(symbol);
    }}>
      {instrument}
      <td className="num">
        <span className={`watchlist-close ${direction?.className ?? ''}`}>
          {direction && <span role="img" aria-label={direction.label} title={direction.label}>{direction.icon}</span>}
          {formatPrice(quote.close, quote.currency)}
        </span>
        {quote.date && <time className="research-cell-note" dateTime={quote.date}>{formatDateCompact(quote.date)}</time>}
      </td>
      <td><BreakoutBadge state={breakout.state} /></td>
      <td className="num">
        <PriceToWatchInput
          symbol={symbol}
          value={priceToWatch}
          decimals={decimals}
          onSetWatchPrice={onSetWatchPrice}
          disabled={disabled}
        />
      </td>
      <td className="watchlist-stage"><TrendScoreBadge score={trendScore} /></td>
      <td className="num">
        {Number.isFinite(quote.volume) ? quote.volume.toLocaleString('id-ID') : 'Belum tersedia'}
        <CheckBadgeMini passed={volumePass} />
      </td>
      <td className="num">{formatVolume(quote.buyTrigger?.averageVolume, { includeUnit: false })}</td>
      {details}
      <td className="num">{removeButton}</td>
    </tr>
  );
}

const stateRank = { breakout: 0, near: 1, none: 2 };

export default function WatchlistTable({ entries, formatPrice, onOpen, onRemove, onSetWatchPrice, onSetRating, onEditEntry, disabled }) {
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
    <TableScroll className="research-table-scroll" label="Tabel daftar pantauan">
      <table className="fund-table research-table watchlist-table">
        <thead>
          <tr>
            <th scope="col">Saham</th>
            <th scope="col" className="num">Harga tutup</th>
            <th scope="col">Status</th>
            <th scope="col" className="num">Harga pantauan</th>
            <th scope="col" className="watchlist-stage" title="Jumlah kriteria Trend Template Minervini yang lolos">Stage 2</th>
            <th scope="col" className="num">Volume (lembar)</th>
            <th scope="col" className="num" title="Rata-rata volume yang dipakai untuk menghitung ambang breakout">
              Rata-rata volume <span className="watchlist-header-note">50 sesi (lembar)</span>
            </th>
            <th scope="col">Catatan</th>
            <th scope="col">Gambar</th>
            <th scope="col" className="num">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((entry) => (
            <WatchlistRow
              key={entry.symbol}
              entry={entry}
              row={rows[entry.symbol]}
              formatPrice={formatPrice}
              onOpen={onOpen}
              onRemove={onRemove}
              onSetWatchPrice={onSetWatchPrice}
              onSetRating={onSetRating}
              onEditEntry={onEditEntry}
              disabled={disabled}
              trendScore={trendScores[entry.symbol]}
            />
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
