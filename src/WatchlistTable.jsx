import { useEffect, useRef, useState } from 'react';

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
  if (score === undefined) return <span className="trend-score trend-score--loading">…</span>;
  if (score === null) return <span className="trend-score trend-score--na">—</span>;
  return (
    <span className={`trend-score ${score.eligible ? 'trend-score--pass' : 'trend-score--fail'}`}
      title={score.eligible ? 'Eligible (Stage 2 lengkap)' : 'Belum memenuhi seluruh kriteria Stage 2'}>
      {score.passed}/{score.total}
    </span>
  );
}

function CheckBadgeMini({ passed }) {
  if (passed == null) return <span className="check-status check-status--missing">—</span>;
  return (
    <span className={`check-status ${passed ? 'check-status--pass' : 'check-status--below'}`}>
      {passed ? 'YES' : 'NO'}
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
  if (state === 'breakout') return <span className="breakout-badge breakout-badge--on">BREAKOUT</span>;
  if (state === 'near') return <span className="breakout-badge breakout-badge--near">Dekat</span>;
  return <span className="breakout-badge breakout-badge--off">—</span>;
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
      placeholder="—"
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
  const symbolLink = (
    <a
      className="symbol-badge symbol-badge--light symbol-badge--link"
      href={`/stock/${encodeURIComponent(symbol)}`}
      onClick={(e) => e.stopPropagation()}
      title={`Buka detail ${symbol}`}
    >
      {symbol}
    </a>
  );

  if (!row || row.status === 'loading') {
    return (
      <tr>
        <td>{symbolLink}</td>
        <td colSpan={8} className="watchlist-note">Memuat…</td>
        <td className="watchlist-actions">
          <button type="button" className="watchlist-remove" disabled={disabled} title={`Hapus ${symbol}`} aria-label={`Hapus ${symbol} dari daftar`} onClick={() => onRemove(symbol)}>×</button>
        </td>
      </tr>
    );
  }

  if (row.status === 'error') {
    return (
      <tr>
        <td>{symbolLink}</td>
        <td colSpan={8} className="watchlist-note watchlist-note--error">{row.message}</td>
        <td className="watchlist-actions">
          <button type="button" className="watchlist-remove" disabled={disabled} title={`Hapus ${symbol}`} aria-label={`Hapus ${symbol} dari daftar`} onClick={() => onRemove(symbol)}>×</button>
        </td>
      </tr>
    );
  }

  const { quote } = row;
  const up = quote.close >= quote.open;
  const volumePass = quote.buyTrigger?.volumeChecks?.[0]?.meetsThreshold ?? null;
  const decimals = quote.currency === 'JPY' || quote.currency === 'IDR' ? 0 : 2;
  const breakout = breakoutStatus(quote, priceToWatch);

  return (
    <tr className="watchlist-row" onClick={() => onOpen(symbol)} tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(symbol); } }}
      aria-label={`Buka detail ${symbol}`}>
      <td>{symbolLink}</td>
      <td><TrendScoreBadge score={trendScore} /></td>
      <td className="watchlist-name">{quote.name}</td>
      <td className={`num ${up ? 'trend--up' : 'trend--down'}`}>{formatPrice(quote.close, quote.currency)}</td>
      <td className="num">{formatPrice(quote.buyTrigger?.level, quote.currency)}</td>
      <td className="num">{formatPrice(quote.buyTrigger?.sellLevel, quote.currency)}</td>
      <td className="num">
        <PriceToWatchInput
          symbol={symbol}
          value={priceToWatch}
          decimals={decimals}
          onSetWatchPrice={onSetWatchPrice}
          disabled={disabled}
        />
      </td>
      <td><CheckBadgeMini passed={volumePass} /></td>
      <td><BreakoutBadge state={breakout.state} /></td>
      <td className="watchlist-actions">
        <button type="button" className="watchlist-remove" disabled={disabled} title={`Hapus ${symbol}`} aria-label={`Hapus ${symbol} dari daftar`}
          onClick={(e) => { e.stopPropagation(); onRemove(symbol); }}>×</button>
      </td>
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
    <div className="watchlist-table-wrap">
      <table className="watchlist-table">
        <thead>
          <tr>
            <th>Simbol</th>
            <th title="Trend Template Minervini (Stage 2)">Stage 2</th>
            <th>Nama</th>
            <th className="num">Close</th>
            <th className="num">Buy Trigger</th>
            <th className="num">Sell Trigger</th>
            <th className="num">Price to Watch</th>
            <th>Volume</th>
            <th>Status</th>
            <th aria-label="Aksi" />
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
    </div>
  );
}
