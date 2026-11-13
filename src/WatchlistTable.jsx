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
      aria-label={`Price to watch untuk ${symbol}`}
    />
  );
}

function WatchlistRow({ entry, row, formatPrice, onOpen, onRemove, onSetWatchPrice, disabled, trendScore }) {
  const { symbol, priceToWatch } = entry;
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

  if (row?.status !== 'success') {
    return (
      <tr>
        <th scope="row"><TickerLink symbol={symbol} /></th>
        <td><TrendScoreBadge score={trendScore} /></td>
        <td colSpan={5} className={row?.status === 'error' ? 'research-quote-error' : 'research-cell-note'}>
          {row?.status === 'error' ? row.message : 'Memuat harga dan volume…'}
        </td>
        <td className="num">{removeButton}</td>
      </tr>
    );
  }

  const { quote } = row;
  const up = quote.close >= quote.open;
  const volumePass = quote.buyTrigger?.volumeChecks?.[0]?.meetsThreshold ?? null;
  const decimals = quote.currency === 'JPY' || quote.currency === 'IDR' ? 0 : 2;
  const breakout = breakoutStatus(quote, priceToWatch);

  return (
    <tr className="watchlist-row" onClick={(event) => {
      if (!event.target.closest('a, button, input')) onOpen(symbol);
    }}>
      <th scope="row" className="research-instrument">
        <TickerLink symbol={symbol} />
        {quote.name && quote.name !== symbol && <span className="research-cell-note">{quote.name}</span>}
      </th>
      <td><TrendScoreBadge score={trendScore} /></td>
      <td className={`num ${up ? 'trend--up' : 'trend--down'}`}>
        {formatPrice(quote.close, quote.currency)}
        {quote.date && <time className="research-cell-note" dateTime={quote.date}>{formatDateCompact(quote.date)}</time>}
      </td>
      <td className="num">
        <PriceToWatchInput
          symbol={symbol}
          value={priceToWatch}
          decimals={decimals}
          onSetWatchPrice={onSetWatchPrice}
          disabled={disabled}
        />
      </td>
      <td className="num">
        {Number.isFinite(quote.volume) ? quote.volume.toLocaleString('id-ID') : 'Belum tersedia'}
        <CheckBadgeMini passed={volumePass} />
      </td>
      <td className="num">{formatVolume(quote.buyTrigger?.averageVolume)}</td>
      <td><BreakoutBadge state={breakout.state} /></td>
      <td className="num">{removeButton}</td>
    </tr>
  );
}

const stateRank = { breakout: 0, near: 1, none: 2 };

export default function WatchlistTable({ entries, formatPrice, onOpen, onRemove, onSetWatchPrice, disabled }) {
  const symbolsKey = entries.map((entry) => entry.symbol).join('\n');
  const rows = useWatchlistData(symbolsKey);
  const trendScores = useTrendScores(symbolsKey);

  const ordered = [...entries].sort((a, b) => {
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
            <th scope="col" title="Jumlah kriteria Trend Template Minervini yang lolos">Stage 2</th>
            <th scope="col" className="num">Harga tutup</th>
            <th scope="col" className="num">Harga pantauan</th>
            <th scope="col" className="num">Volume (lembar)</th>
            <th scope="col" className="num" title="Rata-rata volume yang dipakai untuk menghitung ambang breakout">
              Rata-rata volume 50 sesi
            </th>
            <th scope="col">Status</th>
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
              disabled={disabled}
              trendScore={trendScores[entry.symbol]}
            />
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
