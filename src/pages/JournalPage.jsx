import { useRef, useState } from 'react';
import { normalizeTicker } from '../components/SearchForm.jsx';
import {
  addTrade,
  calculateTradePnl,
  closeTrade,
  journalSides,
  journalStatuses,
  normalizeTrade,
  positionPnlUsd,
  removeTrade,
  summarizeJournal,
  tradeQuoteError,
} from '../journal.js';
import { formatPct, formatPrice, priceDecimals } from '../format.js';
import useJournalQuotes, { fetchJournalQuote } from '../useJournalQuotes.js';

const levelPrecision = 16;
const levelPattern = new RegExp(`^\\d*(?:[.,]\\d{1,${levelPrecision}})?$`);
const levelFields = [
  ['entryPrice', 'Harga masuk'],
  ['stopLoss', 'Stop Loss'],
  ['takeProfit', 'Take Profit (TP)'],
];
const quoteTimeFormat = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
});

function emptyForm() {
  return {
    date: new Date().toLocaleDateString('sv-SE'),
    ticker: '',
    setup: '',
    positionUsd: '',
    entryPrice: '',
    stopLoss: '',
    takeProfit: '',
  };
}

function parseLevel(input) {
  const text = input.trim();
  const price = Number(text.replace(',', '.'));
  return levelPattern.test(text) && Number.isFinite(price) && price > 0 ? price : null;
}

function formatJournalPrice(value, currency, precision) {
  return Number.isFinite(value) ? formatPrice(value, currency, precision) : '–';
}

function formatPnl(value, currency, precision) {
  if (!Number.isFinite(value)) return '–';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatPrice(Math.abs(value), currency, precision)}`;
}

function quotePrecision(value, currency) {
  return Math.abs(value) < 10 ** -priceDecimals(currency) ? levelPrecision : undefined;
}

function valueOpenTrade(trade, quoteState) {
  const quote = quoteState?.quote;
  if (!quote) return { message: quoteState?.error ?? 'Memuat harga…' };
  const error = tradeQuoteError(trade, quote);
  if (error) return { message: error };
  const result = calculateTradePnl(trade, quote.price);
  return { quote, ...result, pnlUsd: positionPnlUsd(trade, result.pnlPct) };
}

function RunningPnlCells({ value, currency }) {
  const { quote, pnl, pnlPct, pnlUsd, message } = value;
  const tone = pnl > 0 ? 'trend--up' : pnl < 0 ? 'trend--down' : '';
  const quoteTime = quote?.timestamp ? new Date(quote.timestamp * 1000) : null;
  return (
    <>
      <td className={`num ${tone}`}>
        {pnlUsd == null ? formatPnl(pnl, currency, quotePrecision(pnl, currency)) : formatPnl(pnlUsd, 'USD')}
        {quote && <small className="journal-trade-note">{pnlUsd == null ? 'Per unit · ' : ''}{formatPct(pnlPct)}</small>}
      </td>
      <td className="num">
        {quote ? (
          <>
            {formatJournalPrice(quote.price, currency, quotePrecision(quote.price, currency))}
            <small className="journal-trade-note">
              <time dateTime={quoteTime?.toISOString() ?? quote.date}>{quoteTime ? quoteTimeFormat.format(quoteTime) : quote.date}</time>
            </small>
          </>
        ) : <small className="journal-trade-note journal-quote-note">{message}</small>}
      </td>
    </>
  );
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

function TradeTable({ trades, closed = false, manualCurrency, runningValues, disabled, activeAction, onClose, onRemove }) {
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
              {!closed && (
                <>
                  <th className="num">PnL berjalan</th>
                  <th className="num">Harga terbaru</th>
                </>
              )}
              <th>Setup</th>
              <th className="num">Harga masuk</th>
              <th className="num">Stop Loss</th>
              <th className="num">Take Profit (TP)</th>
              <th className="num">Nilai posisi (USD)</th>
              {closed && (
                <>
                  <th>Tanggal keluar</th>
                  <th className="num">Harga keluar</th>
                  <th className="num">PnL posisi (USD)</th>
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
              const entryPrecision = trade.stopLoss != null ? levelPrecision : undefined;
              return (
                <tr key={trade.id}>
                  <td>{trade.date}</td>
                  <td><span className="symbol-badge symbol-badge--light">{trade.pair}</span></td>
                  <td><Badge meta={side} /></td>
                  {!closed && <RunningPnlCells value={runningValues.get(trade.id)} currency={currency} />}
                  <td className="journal-setup">
                    {trade.setup || '–'}
                    {trade.riskPct != null && <small className="journal-trade-note">Risiko {trade.riskPct}%</small>}
                    {trade.notes && <small className="journal-trade-note">{trade.notes}</small>}
                  </td>
                  <td className="num">{formatJournalPrice(trade.entryPrice, currency, entryPrecision)}</td>
                  <td className="num">{formatJournalPrice(trade.stopLoss, currency, levelPrecision)}</td>
                  <td className="num">{formatJournalPrice(trade.takeProfit, currency, levelPrecision)}</td>
                  <td className="num">{formatJournalPrice(trade.positionUsd, 'USD')}</td>
                  {closed && (
                    <>
                      <td>{trade.exitDate ?? '–'}</td>
                      <td className="num">{formatJournalPrice(trade.exitPrice, currency)}</td>
                      <td className={`num ${pnlTone}`}>{formatPnl(positionPnlUsd(trade), 'USD')}</td>
                      <td className={`num ${pnlTone}`}>
                        {formatPnl(trade.pnl, currency)}
                        {trade.pnl != null && <small className="journal-trade-note">{trade.quoteCurrency ? 'Per saham' : 'Manual'}</small>}
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
  const { quotes, refresh } = useJournalQuotes(openTrades);
  const runningValues = new Map(openTrades.map((trade) => [trade.id, valueOpenTrade(trade, quotes[trade.pair])]));
  const runningAmounts = [...runningValues.values()].map(({ pnlUsd }) => pnlUsd).filter(Number.isFinite);
  const totalRunningPnl = runningAmounts.length ? runningAmounts.reduce((total, pnl) => total + pnl, 0) : null;
  const refreshing = openTrades.some(({ pair }) => !quotes[pair] || quotes[pair].loading);
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
      const symbol = normalizeTicker(input);
      const fallback = symbol !== input && /^[A-Z0-9]+$/.test(input) ? input : null;
      const setup = form.setup.trim();
      if (!symbol || !setup) throw new Error('Isi kode ticker dan setup posisi.');

      const amount = form.positionUsd.trim();
      const positionUsd = Number(amount.replace(',', '.'));
      if (!/^\d+(?:[.,]\d{1,2})?$/.test(amount) || positionUsd <= 0) {
        throw new Error('Isi nilai posisi USD lebih dari 0, misalnya 500 atau 125,50.');
      }

      const entryPrice = parseLevel(form.entryPrice);
      const stopLoss = parseLevel(form.stopLoss);
      const takeProfit = parseLevel(form.takeProfit);
      if (entryPrice === null || stopLoss === null || takeProfit === null) {
        throw new Error(`Isi harga masuk, Stop Loss, dan Take Profit dengan angka positif hingga ${levelPrecision} desimal.`);
      }
      const [lower, upper] = side === 'long' ? [stopLoss, takeProfit] : [takeProfit, stopLoss];
      if (!(lower < entryPrice && entryPrice < upper)) {
        throw new Error(side === 'long'
          ? 'Untuk Long, Stop Loss harus di bawah harga masuk dan Take Profit di atasnya.'
          : 'Untuk Short, Take Profit harus di bawah harga masuk dan Stop Loss di atasnya.');
      }

      const quote = await fetchJournalQuote(symbol, { date: form.date, fallback });
      const trade = normalizeTrade({
        date: quote.date,
        pair: quote.symbol ?? symbol,
        side,
        setup,
        positionUsd,
        status: 'open',
        entryPrice,
        stopLoss,
        takeProfit,
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
      const quoteError = tradeQuoteError(trade, quote);
      if (quoteError) throw new Error(quoteError);
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
        <p>Catat posisi Long atau Short dan pantau PnL sejak harga masuk.</p>
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
              Kode ticker
              <input
                type="text"
                value={form.ticker}
                onChange={(event) => setField('ticker', event.target.value)}
                placeholder="BBCA, ABBV, BTC-USD"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={39}
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
            <label>
              Nilai posisi (USD)
              <input
                type="text"
                inputMode="decimal"
                value={form.positionUsd}
                onChange={(event) => setField('positionUsd', event.target.value)}
                placeholder="Mis. 500 atau 125,50"
                maxLength={13}
                disabled={disabled}
                required
              />
            </label>
          </div>
          <div className="journal-form-grid">
            {levelFields.map(([field, label]) => (
              <label key={field}>
                {label}
                <input
                  type="text"
                  inputMode="decimal"
                  value={form[field]}
                  onChange={(event) => setField(field, event.target.value)}
                  aria-describedby="journal-level-note"
                  maxLength={25}
                  disabled={disabled}
                  required
                />
              </label>
            ))}
          </div>
          <p className="journal-help" id="journal-price-note">
            <span id="journal-ticker-note">Pakai <code>BTC-USD</code> atau <code>CRYPTO:BTC</code> untuk crypto. Awali dengan <code>US:</code> untuk memilih ticker AS jika kodenya sama.</span>{' '}
            <span id="journal-level-note">Isi ketiga harga dalam mata uang ticker, misalnya USD untuk BTC-USD atau rupiah untuk BBCA.JK. Tulis tanpa pemisah ribuan. Titik atau koma dipakai untuk desimal.</span>{' '}
            Tanggal masuk mengikuti zona waktu bursa. Saat Close, jurnal memakai kuotasi terakhir Yahoo Finance sebagai harga keluar.
          </p>
          <div className="journal-actions">
            <button type="submit" value="long" className="scan-button" disabled={disabled}>
              {activeAction === 'long' ? 'Menyimpan…' : 'Buka Long'}
            </button>
            <button type="submit" value="short" className="scan-button journal-short-button" disabled={disabled}>
              {activeAction === 'short' ? 'Menyimpan…' : 'Buka Short'}
            </button>
          </div>
        </form>
        {openTrades.length > 0 && (
          <div className="journal-running">
            <StatCard label="Total PnL berjalan (USD)" value={formatPnl(totalRunningPnl, 'USD')} />
            <div>
              <p className="journal-help">
                PnL dari harga masuk ke kuotasi terakhir Yahoo Finance. {runningAmounts.length} dari {openTrades.length} posisi dihitung dalam USD.
                Untuk ticker non-USD, perhitungan mengasumsikan kurs tetap.
              </p>
              <button type="button" className="scan-button" onClick={refresh} disabled={refreshing}>
                {refreshing ? 'Memperbarui harga…' : 'Perbarui harga'}
              </button>
            </div>
          </div>
        )}
        <TradeTable trades={openTrades} runningValues={runningValues} disabled={disabled} activeAction={activeAction} onClose={handleClose} onRemove={handleRemove} />
      </section>

      <section className="journal-section" aria-labelledby="journal-closed">
        <h2 id="journal-closed">Posisi ditutup</h2>
        <p className="journal-help">PnL posisi dalam USD dihitung dari nilai posisi dikali PnL %. Untuk saham non-USD, perhitungan mengasumsikan kurs tetap.</p>
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
