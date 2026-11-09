import { useRef, useState } from 'react';
import { normalizeTicker } from '../components/SearchForm.jsx';
import {
  addTrade,
  closeTrade,
  journalSides,
  journalStatuses,
  normalizeTrade,
  removeTrade,
  summarizeJournal,
} from '../journal.js';
import { formatPct, formatPrice } from '../format.js';

function emptyForm() {
  return { date: new Date().toLocaleDateString('sv-SE'), ticker: '', setup: '' };
}

async function fetchJournalQuote(symbol, date, fallback) {
  const params = new URLSearchParams({ symbol, mode: 'journal' });
  if (date) params.set('date', date);
  if (fallback) params.set('fallback', fallback);
  const response = await fetch(`/.netlify/functions/price?${params}`, { cache: 'no-store' }).catch(() => null);
  const quote = await response?.json().catch(() => null);
  if (!response?.ok || !Number.isFinite(quote?.price) || quote.price <= 0 || !quote.date || !quote.currency) {
    throw new Error(quote?.error ?? 'Harga dari Yahoo Finance belum tersedia. Coba lagi.');
  }
  return quote;
}

function formatJournalPrice(value, currency) {
  return Number.isFinite(value) ? formatPrice(value, currency) : '–';
}

function formatPnl(value, currency) {
  if (!Number.isFinite(value)) return '–';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatPrice(Math.abs(value), currency)}`;
}

function Badge({ meta }) {
  return <span className={`journal-badge journal-badge--${meta.className}`}>{meta.label}</span>;
}

function StatCard({ label, value, tone }) {
  return (
    <div className={`metric-card${tone ? ` metric-card--${tone}` : ''}`}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
    </div>
  );
}

function TradeTable({ trades, closed = false, manualCurrency, disabled, activeAction, onClose, onRemove }) {
  return (
    <div className="journal-table-wrap">
      {trades.length === 0 ? (
        <p className="watchlist-empty">{closed ? 'Belum ada posisi yang ditutup.' : 'Belum ada posisi terbuka.'}</p>
      ) : (
        <table className="fund-table journal-table">
          <thead>
            <tr>
              <th>Tanggal masuk</th>
              <th>Ticker</th>
              <th>Posisi</th>
              <th>Setup</th>
              <th className="num">Harga masuk</th>
              {closed && (
                <>
                  <th>Tanggal keluar</th>
                  <th className="num">Harga keluar</th>
                  <th className="num">PnL</th>
                  <th className="num">PnL %</th>
                  <th>Status</th>
                </>
              )}
              <th className="num">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => {
              const side = journalSides[trade.side];
              const currency = trade.quoteCurrency ?? manualCurrency;
              const pnlTone = trade.pnl > 0 ? 'trend--up' : trade.pnl < 0 ? 'trend--down' : '';
              return (
                <tr key={trade.id}>
                  <td>{trade.date}</td>
                  <td><span className="symbol-badge symbol-badge--light">{trade.pair}</span></td>
                  <td><Badge meta={side} /></td>
                  <td className="journal-setup">
                    {trade.setup || '–'}
                    {trade.riskPct != null && <small className="journal-trade-note">Risiko {trade.riskPct}%</small>}
                    {trade.notes && <small className="journal-trade-note">{trade.notes}</small>}
                  </td>
                  <td className="num">{formatJournalPrice(trade.entryPrice, currency)}</td>
                  {closed && (
                    <>
                      <td>{trade.exitDate ?? '–'}</td>
                      <td className="num">{formatJournalPrice(trade.exitPrice, currency)}</td>
                      <td className={`num ${pnlTone}`}>
                        {formatPnl(trade.pnl, currency)}
                        {!trade.quoteCurrency && trade.pnl != null && <small className="journal-trade-note">Manual</small>}
                      </td>
                      <td className={`num ${pnlTone}`}>{trade.pnlPct == null ? '–' : formatPct(trade.pnlPct)}</td>
                      <td>{trade.status ? <Badge meta={journalStatuses[trade.status]} /> : '–'}</td>
                    </>
                  )}
                  <td className="num">
                    <div className="journal-row-actions">
                      {!closed && (
                        <button
                          type="button"
                          className="scan-button"
                          disabled={disabled}
                          aria-label={`Close ${side.label} ${trade.pair}`}
                          onClick={() => onClose(trade)}
                        >
                          {activeAction === trade.id ? 'Mengambil harga…' : 'Close'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="watchlist-remove"
                        disabled={disabled}
                        title="Hapus trade"
                        aria-label={`Hapus trade ${trade.pair}`}
                        onClick={() => onRemove(trade.id)}
                      >×</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function JournalPage({ account }) {
  const { journal, currency } = account;
  const [form, setForm] = useState(emptyForm);
  const [activeAction, setActiveAction] = useState(null);
  const [error, setError] = useState('');
  const running = useRef(false);
  const disabled = !account.ready || account.pending || activeAction !== null;

  const openTrades = journal.filter((trade) => trade.status === 'open');
  const closedTrades = journal.filter((trade) => trade.status !== 'open')
    .sort((a, b) => (b.exitDate ?? b.date).localeCompare(a.exitDate ?? a.date));
  const quoted = summarizeJournal(closedTrades.filter((trade) => trade.quoteCurrency), 'pnlPct');
  const manual = summarizeJournal(closedTrades.filter((trade) => !trade.quoteCurrency));
  const decided = quoted.closedTrades + manual.closedTrades;
  const winRate = decided ? ((quoted.wins + manual.wins) / decided) * 100 : null;
  const manualStats = !quoted.totalTrades && manual.totalTrades > 0;
  const stats = manualStats ? manual : quoted;

  function statValue(value) {
    if (value == null) return '–';
    return manualStats ? formatPrice(value, currency) : formatPct(value);
  }

  function setField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function runAction(action, operation) {
    if (disabled || running.current) return;
    running.current = true;
    setActiveAction(action);
    setError('');
    try {
      await operation();
    } catch (failure) {
      setError(failure.message || 'Jurnal gagal diperbarui. Coba lagi.');
    } finally {
      running.current = false;
      setActiveAction(null);
    }
  }

  function handleOpen(event) {
    event.preventDefault();
    const side = event.nativeEvent.submitter?.value;
    if (side !== 'long' && side !== 'short') return;

    return runAction(side, async () => {
      const input = form.ticker.trim().toUpperCase();
      const market = input.startsWith('US:') ? 'us' : 'auto';
      const rawTicker = market === 'us' ? input.slice(3).trim() : input;
      const symbol = normalizeTicker(rawTicker, market);
      const setup = form.setup.trim();
      if (!symbol || !setup) throw new Error('Isi kode saham dan setup posisi.');

      const quote = await fetchJournalQuote(symbol, form.date, symbol === rawTicker ? null : rawTicker);
      const trade = normalizeTrade({
        date: quote.date,
        pair: quote.symbol ?? symbol,
        side,
        setup,
        status: 'open',
        entryPrice: quote.price,
        entryTimestamp: quote.timestamp,
        quoteCurrency: quote.currency,
      });
      const saved = await account.update((current) => ({
        ...current,
        journal: addTrade(current.journal, trade),
      }));
      if (saved) setForm(emptyForm());
    });
  }

  function handleClose(trade) {
    return runAction(trade.id, async () => {
      const quote = await fetchJournalQuote(trade.pair);
      if (quote.currency !== trade.quoteCurrency) {
        throw new Error('Mata uang harga terakhir berbeda dari harga masuk.');
      }
      if (quote.date < trade.date || (trade.entryTimestamp !== null && quote.timestamp < trade.entryTimestamp)) {
        throw new Error('Harga terakhir mendahului harga masuk. Coba lagi setelah kuotasi diperbarui.');
      }
      await account.update((current) => ({
        ...current,
        journal: closeTrade(current.journal, trade.id, quote),
      }));
    });
  }

  function handleRemove(id) {
    return account.update((current) => ({ ...current, journal: removeTrade(current.journal, id) }));
  }

  return (
    <div className="journal-page">
      <div className="intro">
        <p className="eyebrow">Jurnal Trading</p>
        <h1>Catat posisi trading</h1>
        <p>Buka posisi Long atau Short, lalu klik Close untuk menghitung hasilnya.</p>
      </div>

      {error && <p className="account-message account-message--error" role="alert">{error}</p>}

      <section className="journal-section" aria-labelledby="journal-open">
        <h2 id="journal-open">Posisi terbuka</h2>
        <form className="journal-form" onSubmit={handleOpen} aria-describedby="journal-price-note">
          <div className="journal-form-grid">
            <label>
              Tanggal masuk
              <input type="date" value={form.date} onChange={(event) => setField('date', event.target.value)} disabled={disabled} required />
            </label>
            <label>
              Kode saham
              <input
                type="text"
                value={form.ticker}
                onChange={(event) => setField('ticker', event.target.value)}
                placeholder="BBCA, ABBV, 7203.T"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={35}
                aria-describedby="journal-ticker-note"
                disabled={disabled}
                required
              />
            </label>
            <label>
              Setup
              <input
                type="text"
                value={form.setup}
                onChange={(event) => setField('setup', event.target.value)}
                placeholder="Mis. Breakout atau VCP"
                maxLength={160}
                disabled={disabled}
                required
              />
            </label>
          </div>
          <p className="journal-help" id="journal-price-note">
            <span id="journal-ticker-note">Gunakan kode Yahoo Finance. Awali dengan US: untuk memilih ticker AS jika kodenya sama.</span>{' '}
            Tanggal mengikuti zona waktu bursa. Jurnal memakai harga penutupan untuk tanggal lampau dan kuotasi terakhir untuk hari ini serta saat Close.
          </p>
          <div className="journal-actions">
            <button type="submit" value="long" className="scan-button" disabled={disabled}>
              {activeAction === 'long' ? 'Mengambil harga…' : 'Buka Long'}
            </button>
            <button type="submit" value="short" className="scan-button journal-short-button" disabled={disabled}>
              {activeAction === 'short' ? 'Mengambil harga…' : 'Buka Short'}
            </button>
          </div>
        </form>
        <TradeTable trades={openTrades} disabled={disabled} activeAction={activeAction} onClose={handleClose} onRemove={handleRemove} />
      </section>

      <section className="journal-section" aria-labelledby="journal-closed">
        <h2 id="journal-closed">Posisi ditutup</h2>
        <p className="journal-help">PnL otomatis ditampilkan per saham dan dalam persentase terhadap harga masuk.</p>
        <div className="detail-metrics">
          <StatCard label="Posisi ditutup" value={closedTrades.length} />
          <StatCard label="Win rate" value={winRate == null ? '–' : `${winRate.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`} />
          <StatCard label="Rata-rata win" value={statValue(stats.avgWin)} tone="gain" />
          <StatCard label="Rata-rata loss" value={statValue(stats.avgLoss == null ? null : -stats.avgLoss)} tone="risk" />
          <StatCard label="Expectancy ratio" value={stats.expectancyRatio ?? '–'} />
          <StatCard label="Net expectancy" value={statValue(stats.netExpectancy)} />
          {manual.totalTrades > 0 && <StatCard label="Total PnL manual" value={formatPnl(manual.totalPnl, currency)} />}
        </div>
        <TradeTable trades={closedTrades} closed manualCurrency={currency} disabled={disabled} onRemove={handleRemove} />
      </section>
    </div>
  );
}
