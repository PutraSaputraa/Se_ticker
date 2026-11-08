import { useEffect, useRef, useState } from 'react';

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

function PriceToWatchInput({ symbol, value, decimals, onSetWatchPrice }) {
  const [text, setText] = useState(value == null ? '' : String(value));

  useEffect(() => {
    setText(value == null ? '' : String(value));
  }, [value]);

  function commit() {
    const trimmed = text.trim();
    if (!trimmed) {
      onSetWatchPrice(symbol, null);
      return;
    }
    const pattern = decimals === 0 ? /^\d+$/ : /^\d+(?:[.,]\d{1,2})?$/;
    if (!pattern.test(trimmed)) {
      setText(value == null ? '' : String(value));
      return;
    }
    const parsed = Number(trimmed.replace(',', '.'));
    onSetWatchPrice(symbol, Number.isFinite(parsed) ? parsed : null);
  }

  return (
    <input
      className="ptw-input"
      type="text"
      inputMode={decimals === 0 ? 'numeric' : 'decimal'}
      placeholder="—"
      value={text}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      aria-label={`Price to watch untuk ${symbol}`}
    />
  );
}

function WatchlistRow({ entry, row, formatPrice, onOpen, onRemove, onSetWatchPrice }) {
  const { symbol, priceToWatch } = entry;

  if (!row || row.status === 'loading') {
    return (
      <tr>
        <td><span className="symbol-badge symbol-badge--light">{symbol}</span></td>
        <td colSpan={6} className="watchlist-note">Memuat…</td>
        <td className="watchlist-actions">
          <button type="button" className="watchlist-remove" title={`Hapus ${symbol}`} aria-label={`Hapus ${symbol} dari daftar`} onClick={() => onRemove(symbol)}>×</button>
        </td>
      </tr>
    );
  }

  if (row.status === 'error') {
    return (
      <tr>
        <td><span className="symbol-badge symbol-badge--light">{symbol}</span></td>
        <td colSpan={6} className="watchlist-note watchlist-note--error">{row.message}</td>
        <td className="watchlist-actions">
          <button type="button" className="watchlist-remove" title={`Hapus ${symbol}`} aria-label={`Hapus ${symbol} dari daftar`} onClick={() => onRemove(symbol)}>×</button>
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
      <td><span className="symbol-badge symbol-badge--light">{symbol}</span></td>
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
        />
      </td>
      <td><CheckBadgeMini passed={volumePass} /></td>
      <td><BreakoutBadge state={breakout.state} /></td>
      <td className="watchlist-actions">
        <button type="button" className="watchlist-remove" title={`Hapus ${symbol}`} aria-label={`Hapus ${symbol} dari daftar`}
          onClick={(e) => { e.stopPropagation(); onRemove(symbol); }}>×</button>
      </td>
    </tr>
  );
}

const stateRank = { breakout: 0, near: 1, none: 2 };

export default function WatchlistTable({ entries, formatPrice, onOpen, onRemove, onSetWatchPrice }) {
  const symbolsKey = entries.map((entry) => entry.symbol).join('\n');
  const rows = useWatchlistData(symbolsKey);

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
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
