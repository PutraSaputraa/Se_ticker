import { useEffect, useRef, useState } from 'react';

// Baris data yang diambil per simbol, berurutan agar tidak memicu rate limit.
function useWatchlistData(symbols, formatPrice) {
  const [rows, setRows] = useState({});
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    const gen = generation.current;
    const controllers = new Map();

    setRows((previous) => {
      const next = {};
      for (const symbol of symbols) {
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
      for (const symbol of symbols) {
        if (gen !== generation.current) return;
        await load(symbol);
      }
    })();

    return () => {
      generation.current += 1;
      controllers.forEach((c) => c.abort());
    };
  }, [symbols]);

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

function WatchlistRow({ symbol, row, formatPrice, onOpen, onRemove }) {
  if (!row || row.status === 'loading') {
    return (
      <tr>
        <td><span className="symbol-badge symbol-badge--light">{symbol}</span></td>
        <td colSpan={5} className="watchlist-note">Memuat…</td>
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
        <td colSpan={5} className="watchlist-note watchlist-note--error">{row.message}</td>
        <td className="watchlist-actions">
          <button type="button" className="watchlist-remove" title={`Hapus ${symbol}`} aria-label={`Hapus ${symbol} dari daftar`} onClick={() => onRemove(symbol)}>×</button>
        </td>
      </tr>
    );
  }

  const { quote } = row;
  const up = quote.close >= quote.open;
  const volumePass = quote.buyTrigger?.volumeChecks?.[0]?.meetsThreshold ?? null;

  return (
    <tr className="watchlist-row" onClick={() => onOpen(symbol)} tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(symbol); } }}
      aria-label={`Buka detail ${symbol}`}>
      <td><span className="symbol-badge symbol-badge--light">{symbol}</span></td>
      <td className="watchlist-name">{quote.name}</td>
      <td className={`num ${up ? 'trend--up' : 'trend--down'}`}>{formatPrice(quote.close, quote.currency)}</td>
      <td className="num">{formatPrice(quote.buyTrigger?.level, quote.currency)}</td>
      <td className="num">{formatPrice(quote.buyTrigger?.sellLevel, quote.currency)}</td>
      <td><CheckBadgeMini passed={volumePass} /></td>
      <td className="watchlist-actions">
        <button type="button" className="watchlist-remove" title={`Hapus ${symbol}`} aria-label={`Hapus ${symbol} dari daftar`}
          onClick={(e) => { e.stopPropagation(); onRemove(symbol); }}>×</button>
      </td>
    </tr>
  );
}

export default function WatchlistTable({ symbols, formatPrice, onOpen, onRemove }) {
  const rows = useWatchlistData(symbols, formatPrice);

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
            <th>Volume</th>
            <th aria-label="Aksi" />
          </tr>
        </thead>
        <tbody>
          {symbols.map((symbol) => (
            <WatchlistRow
              key={symbol}
              symbol={symbol}
              row={rows[symbol]}
              formatPrice={formatPrice}
              onOpen={onOpen}
              onRemove={onRemove}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
