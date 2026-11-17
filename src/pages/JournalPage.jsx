import { useEffect, useId, useMemo, useRef, useState } from 'react';
import JournalCharts from '../components/JournalCharts.jsx';
import { ExitPlanFields, LeverageFields, PriceField } from '../components/JournalOrderFields.jsx';
import { JournalScreenshotDialog, JournalScreenshotField } from '../components/JournalScreenshot.jsx';
import JournalTradeSetups from '../components/JournalTradeSetups.jsx';
import TickerField from '../components/TickerField.jsx';
import JournalWallet from '../components/JournalWallet.jsx';
import TableScroll from '../components/TableScroll.jsx';
import { accountTickerSymbols, normalizeTicker } from '../tickers.js';
import {
  calculateTradePnl,
  interpretProfitFactor,
  journalCurrencies,
  journalSetupOptions,
  journalSides,
  journalStatuses,
  journalTypes,
  normalizeTrade,
  parseJournalLeverage,
  positionPnlUsd,
  realizedTradePnl,
  summarizeJournal,
  summarizeRealizedPnl,
  tradeQuoteError,
} from '../journal.js';
import { formatDate, formatPct, formatPnl, formatPrice, priceDecimals } from '../format.js';
import { calculateLevels, levelPrecision, validateLevels } from '../journalLevels.js';
import { journalSetupMarkets } from '../journalSetups.js';
import { deleteJournalScreenshot, uploadJournalScreenshot } from '../journalScreenshot.js';
import useJournalQuotes, { fetchJournalInstrument, fetchJournalQuote } from '../useJournalQuotes.js';
import {
  closeWalletPosition,
  openWalletPosition,
  parseWalletUsd,
  recordInitialPositionValue,
  recordWalletCash,
  removeWalletPosition,
  summarizeWallet,
} from '../wallet.js';
import '../styles/journal.css';

const quoteTimeFormat = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
});

function emptyForm() {
  return {
    date: new Date().toLocaleDateString('sv-SE'),
    ticker: '',
    tickerSymbol: null,
    setup: '',
    notes: '',
    screenshot: null,
    positionUsd: '',
    leverage: '1',
    side: 'long',
    type: 'spot',
    entryPrice: '',
    stopLossPct: '',
    stopLoss: '',
    rewardMultiple: '',
    takeProfit: '',
  };
}

function formatJournalPrice(value, currency, precision) {
  return Number.isFinite(value) ? formatPrice(value, currency, precision) : '–';
}

function pnlTone(value) {
  return value > 0 ? 'trend--up' : value < 0 ? 'trend--down' : '';
}

function hasManualPnl(trades) {
  return trades.some((trade) => trade.status !== 'open' && !trade.quoteCurrency && Number.isFinite(trade.pnl));
}

function formatProfitFactor(value) {
  if (value == null) return '–';
  if (value === Infinity) return '∞';
  const rounded = Math.round(value * 100) / 100;
  const text = rounded.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (interpretProfitFactor(rounded) === interpretProfitFactor(value)) return text;
  return `${value < rounded ? '<' : '>'}${text}`;
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

function RunningPnlCells({ value, currency, children }) {
  const { quote, pnl, pnlPct, pnlUsd, message } = value;
  const quoteTime = quote?.timestamp ? new Date(quote.timestamp * 1000) : null;
  return (
    <>
      <td className={`num ${pnlTone(pnl)}`}>
        <strong>{formatPnl(pnlUsd, 'USD')}</strong>
        {quote && <small className="journal-trade-note">{formatPct(pnlPct)}</small>}
        {quote && !Number.isFinite(pnlUsd) && (
          <small className="journal-trade-note">{formatPnl(pnl, currency, quotePrecision(pnl, currency))} per unit</small>
        )}
        {children}
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

function RealizedTotals({ series, closedCount }) {
  return (
    <div className="journal-realized-totals">
      <h3>PnL terealisasi</h3>
      {series.length > 0 ? (
        series.map(({ currency, count, grossProfit, grossLoss, netProfit, profitFactor }) => (
          <section key={currency} className="journal-pnl-currency" aria-label={`PnL terealisasi ${currency}`}>
            <div className="journal-pnl-currency-heading">
              <h4>{currency}</h4>
              <span className="journal-help">{count} dari {closedCount} posisi</span>
            </div>
            <dl className="journal-pnl-values">
              <div><dt>Net profit</dt><dd className={pnlTone(netProfit)}>{formatPnl(netProfit, currency)}</dd></div>
              <div><dt>Total untung</dt><dd className={pnlTone(grossProfit)}>{formatPnl(grossProfit, currency)}</dd></div>
              <div><dt>Total rugi</dt><dd className={pnlTone(-grossLoss)}>{formatPnl(-grossLoss, currency)}</dd></div>
              <div>
                <dt>Profit Factor</dt>
                <dd>{formatProfitFactor(profitFactor)}</dd>
                <small className="journal-trade-note">{interpretProfitFactor(profitFactor)}</small>
              </div>
            </dl>
          </section>
        ))
      ) : <p className="journal-help">Total PnL dan Profit Factor tersedia setelah ada PnL nominal yang tercatat.</p>}
    </div>
  );
}

function JournalFeedback({ feedback, section }) {
  if (feedback?.section !== section) return null;
  return (
    <p className={`journal-feedback journal-feedback--${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'}>
      {feedback.message}
    </p>
  );
}

function PositionValueDialog({ trade, disabled, saving, feedback, onSave, onClose }) {
  const dialog = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!dialog.current.open) dialog.current.showModal();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    const amount = new FormData(event.currentTarget).get('amount');
    if (await onSave(trade, amount)) dialog.current?.close();
  }

  return (
    <dialog ref={dialog} className="journal-position-value-dialog" aria-labelledby={titleId} onClose={onClose}
      onCancel={(event) => { if (saving) event.preventDefault(); }}>
      <form className="journal-form" onSubmit={handleSubmit}>
        <h2 id={titleId}>Isi nilai awal {trade.pair}</h2>
        <label>
          {trade.type === 'futures' ? 'Margin awal (USD)' : 'Nilai awal posisi (USD)'}
          <input name="amount" type="text" inputMode="decimal" placeholder="125,50" disabled={disabled} required />
        </label>
        <p className="journal-help">Nilai ini dipakai untuk menghitung PnL posisi di jurnal.</p>
        <JournalFeedback feedback={feedback} section="open" />
        <div className="journal-position-value-actions">
          <button type="submit" className="scan-button" disabled={disabled}>{saving ? 'Menyimpan…' : 'Simpan'}</button>
          <button type="button" className="journal-secondary-button" disabled={saving} onClick={() => dialog.current.close()}>
            Batal
          </button>
        </div>
      </form>
    </dialog>
  );
}

function TradeTable({
  trades, closed = false, manualCurrency, runningValues, ready, readError, disabled, activeAction, onClose, onRemove, onViewScreenshot,
  onFillPositionValue,
}) {
  if (trades.length === 0) {
    return (
      <p className="journal-empty" role="status">
        {readError
          ? 'Daftar posisi gagal dimuat.'
          : !ready
            ? 'Memuat posisi akun…'
            : closed ? 'Belum ada posisi yang ditutup.' : 'Belum ada posisi terbuka.'}
      </p>
    );
  }

  return (
    <TableScroll className="journal-table-wrap journal-trades-scroll" label={closed ? 'Tabel posisi ditutup' : 'Tabel posisi terbuka'}>
      <table className="fund-table journal-table">
        <thead>
          <tr>
            <th scope="col" className="journal-ticker">Ticker</th>
            <th scope="col">Posisi</th>
            {closed ? (
              <>
                <th scope="col" className="num">PnL posisi</th>
                <th scope="col" className="num">PnL %</th>
                <th scope="col">Status</th>
              </>
            ) : (
              <>
                <th scope="col" className="num">PnL berjalan (USD)</th>
                <th scope="col" className="num">Harga terbaru</th>
                <th scope="col" className="num">Aksi</th>
              </>
            )}
            <th scope="col">Setup</th>
            <th scope="col">Tanggal masuk</th>
            <th scope="col" className="num">Harga masuk</th>
            <th scope="col" className="num">Stop loss</th>
            <th scope="col" className="num">Risk reward ratio</th>
            <th scope="col" className="num">Take profit</th>
            <th scope="col" className="num">Nilai posisi (USD)</th>
            {closed && (
              <>
                <th scope="col">Tanggal keluar</th>
                <th scope="col" className="num">Harga keluar</th>
                <th scope="col" className="num">PnL acuan</th>
                <th scope="col" className="num">Aksi</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => {
            const side = journalSides[trade.side];
            const currency = trade.quoteCurrency ?? manualCurrency;
            const realized = closed ? realizedTradePnl(trade, manualCurrency) : null;
            const entryPrecision = trade.stopLoss != null ? levelPrecision : undefined;
            const actions = (
              <td className="num">
                <div className="journal-row-actions">
                  {!closed && (
                    <button
                      type="button"
                      className="journal-secondary-button"
                      disabled={disabled}
                      aria-label={`Tutup posisi ${side.label} ${trade.pair}`}
                      onClick={() => onClose(trade)}
                    >
                      {activeAction === trade.id ? 'Mengambil harga…' : 'Tutup'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="journal-remove"
                    disabled={disabled}
                    title="Hapus posisi"
                    aria-label={`Hapus posisi ${trade.pair}`}
                    onClick={() => onRemove(trade)}
                  >
                    {activeAction === `remove:${trade.id}` ? '…' : '×'}
                  </button>
                </div>
              </td>
            );

            return (
              <tr key={trade.id}>
                <th scope="row" className="journal-ticker">{trade.pair}</th>
                <td>
                  <Badge meta={side} />
                  <small className="journal-trade-note">{journalTypes[trade.type]}</small>
                </td>
                {closed ? (
                  <>
                    <td className={`num ${pnlTone(realized?.amount)}`}>
                      {realized ? formatPnl(realized.amount, realized.currency) : '–'}
                      {realized && <small className="journal-trade-note">{realized.currency}</small>}
                    </td>
                    <td className={`num ${pnlTone(trade.pnlPct)}`}>{trade.pnlPct == null ? '–' : formatPct(trade.pnlPct)}</td>
                    <td>{trade.status ? <Badge meta={journalStatuses[trade.status]} /> : '–'}</td>
                  </>
                ) : (
                  <>
                    <RunningPnlCells value={runningValues.get(trade.id)} currency={currency}>
                      {trade.positionUsd == null && (
                        <button type="button" className="text-button journal-position-value-button" disabled={disabled}
                          aria-label={`Isi nilai awal ${side.label} ${trade.pair}`} aria-haspopup="dialog"
                          onClick={() => onFillPositionValue(trade)}>
                          Isi nilai awal
                        </button>
                      )}
                    </RunningPnlCells>
                    {actions}
                  </>
                )}
                <td className="journal-setup">
                  {trade.setup || '–'}
                  {trade.setupPlan && (
                    <small className="journal-trade-note">
                      {journalSetupMarkets[trade.setupPlan.market]} · {trade.setupPlan.timeframe} · {formatDate(trade.setupPlan.date)}<br />
                      Limit {formatJournalPrice(trade.setupPlan.limitPrice, currency, levelPrecision)}
                    </small>
                  )}
                  {trade.riskPct != null && <small className="journal-trade-note">Risiko {trade.riskPct}%</small>}
                  {trade.notes && <small className="journal-trade-note journal-position-notes">{trade.notes}</small>}
                  {trade.chartScreenshot && (
                    <button type="button" className="text-button journal-screenshot-button"
                      aria-label={`Lihat screenshot chart ${trade.pair}`} onClick={() => onViewScreenshot(trade)}>
                      Lihat screenshot
                    </button>
                  )}
                </td>
                <td><time dateTime={trade.date}>{trade.date}</time></td>
                <td className="num">{formatJournalPrice(trade.entryPrice, currency, entryPrecision)}</td>
                <td className="num">{formatJournalPrice(trade.stopLoss, currency, levelPrecision)}</td>
                <td className="num">{trade.rewardMultiple == null ? '–' : `1:${trade.rewardMultiple}`}</td>
                <td className="num">{formatJournalPrice(trade.takeProfit, currency, levelPrecision)}</td>
                <td className="num">
                  {formatJournalPrice(trade.positionUsd * (trade.leverage ?? 1), 'USD')}
                  {trade.leverage > 1 && (
                    <small className="journal-trade-note">Margin {formatPrice(trade.positionUsd, 'USD')} · {trade.leverage}×</small>
                  )}
                </td>
                {closed && (
                  <>
                    <td>{trade.exitDate ? <time dateTime={trade.exitDate}>{trade.exitDate}</time> : '–'}</td>
                    <td className="num">{formatJournalPrice(trade.exitPrice, currency)}</td>
                    <td className={`num ${pnlTone(trade.pnl)}`}>
                      {formatPnl(trade.pnl, currency)}
                      {trade.pnl != null && <small className="journal-trade-note">{trade.quoteCurrency ? 'Per saham' : 'Manual'}</small>}
                    </td>
                    {actions}
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableScroll>
  );
}

export default function JournalPage({ account, uid }) {
  const { journal, currency, capital, ready, readError } = account;
  const [form, setForm] = useState(emptyForm);
  const [capitalDraft, setCapitalDraft] = useState(null);
  const [activeAction, setActiveAction] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [viewingScreenshot, setViewingScreenshot] = useState(null);
  const [positionValueTrade, setPositionValueTrade] = useState(null);
  const running = useRef(false);
  const disabled = !account.ready || account.pending || activeAction !== null;
  const { side, type, rewardMultiple } = form;
  const levels = calculateLevels(form);
  const wallet = useMemo(() => summarizeWallet(account.wallet), [account.wallet]);
  const knownTickers = accountTickerSymbols(account);

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
  const wins = quoted.wins + manual.wins;
  const losses = quoted.losses + manual.losses;
  const decided = quoted.closedTrades + manual.closedTrades;
  const winRate = decided ? (wins / decided) * 100 : null;
  const manualStats = !quoted.totalTrades && manual.totalTrades > 0;
  const stats = manualStats ? manual : quoted;
  const realizedPnl = summarizeRealizedPnl(closedTrades, currency);
  const currencyLocked = hasManualPnl(closedTrades);

  function statValue(value) {
    if (value == null) return '–';
    return manualStats ? formatPrice(value, currency) : formatPct(value);
  }

  function setField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
    if (field === 'leverage' || field === 'positionUsd') {
      setFeedback((current) => current?.section === 'entry' && current.type === 'error' ? null : current);
    }
  }

  function setTicker(ticker, tickerSymbol = null) {
    setForm((previous) => ({ ...previous, ticker, tickerSymbol }));
  }

  async function runAction(action, section, operation) {
    if (disabled || running.current) return false;
    running.current = true;
    setActiveAction(action);
    setFeedback(null);
    try {
      const message = await operation();
      setFeedback({ section, type: 'success', message });
      return true;
    } catch (failure) {
      setFeedback({ section, type: 'error', message: failure.message || 'Jurnal gagal diperbarui. Coba lagi.' });
      return false;
    } finally {
      running.current = false;
      setActiveAction(null);
    }
  }

  function handleWalletMove(kind, amount) {
    return runAction('wallet', 'wallet', async () => {
      const cents = parseWalletUsd(amount);
      if (cents == null) throw new Error('Isi jumlah USD lebih dari nol dengan maksimal dua desimal.');
      const movement = { id: crypto.randomUUID(), kind, cents, at: Date.now() };
      const saved = await account.update((current) => recordWalletCash(current, movement));
      if (!saved) throw new Error('Perubahan saldo gagal disimpan. Coba lagi.');
      return kind === 'deposit' ? 'Saldo ditambahkan.' : 'Penarikan saldo tercatat.';
    });
  }

  function handleCapital(event) {
    event.preventDefault();
    return runAction('capital', 'capital', async () => {
      const amount = capitalDraft.amount.trim();
      const nextCapital = Number(amount.replace(',', '.'));
      const nextCurrency = capitalDraft.currency;
      if (!/^\d+(?:[.,]\d+)?$/.test(amount) || !Number.isFinite(nextCapital)) {
        throw new Error('Isi modal dengan angka nol atau lebih, misalnya 1000000 atau 125,50.');
      }
      const saved = await account.update((current) => {
        if (nextCurrency !== current.currency && hasManualPnl(current.journal)) {
          throw new Error('Mata uang akun digunakan oleh PnL manual.');
        }
        return { ...current, capital: nextCapital, currency: nextCurrency };
      });
      if (!saved) throw new Error('Modal gagal disimpan. Coba lagi.');
      setCapitalDraft(null);
      return 'Modal trading tersimpan.';
    });
  }

  function handleOpen(event) {
    event.preventDefault();

    return runAction(side, 'entry', async () => {
      const input = form.ticker.trim().toUpperCase();
      const symbol = form.tickerSymbol ?? normalizeTicker(input);
      const fallback = symbol !== input && /^[A-Z0-9]+$/.test(input) ? input : null;
      const { setup, notes, screenshot } = form;
      if (!symbol || !journalSetupOptions.includes(setup)) throw new Error('Isi kode ticker dan pilih setup posisi.');

      const positionCents = parseWalletUsd(form.positionUsd);
      if (positionCents == null) {
        throw new Error('Isi nilai posisi USD lebih dari 0, misalnya 500 atau 125,50.');
      }
      if (positionCents > wallet.availableCents) throw new Error('Saldo wallet tidak cukup untuk nilai posisi ini.');
      const positionUsd = positionCents / 100;

      const { entryPrice, stopLoss, takeProfit } = validateLevels(levels, form);

      const futures = type === 'futures';
      const leverage = futures ? parseJournalLeverage(form.leverage, positionCents) : 1;
      if (leverage == null) throw new Error('Gunakan leverage minimal 1× dengan nilai posisi yang valid.');
      if (futures && form.date > new Date().toLocaleDateString('sv-SE')) {
        throw new Error('Tanggal masuk belum tiba di zona waktu perangkat.');
      }
      const reference = futures
        ? await fetchJournalInstrument(symbol, fallback)
        : await fetchJournalQuote(symbol, { date: form.date, fallback });
      const trade = normalizeTrade({
        date: futures ? form.date : reference.date,
        pair: reference.symbol ?? symbol,
        side,
        type,
        ...(futures && { entryTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
        setup,
        notes,
        chartScreenshot: Boolean(screenshot),
        positionUsd,
        leverage,
        status: 'open',
        entryPrice,
        stopLoss,
        rewardMultiple,
        takeProfit,
        quoteCurrency: reference.currency,
      });
      const at = Date.now();
      let saved;
      let uploaded = false;
      try {
        if (screenshot) {
          await uploadJournalScreenshot(uid, trade.id, screenshot);
          uploaded = true;
        }
        saved = await account.update((current) => openWalletPosition(current, trade, at));
      } catch (error) {
        if (uploaded) await deleteJournalScreenshot(uid, trade.id);
        throw error;
      }
      if (!saved && screenshot) {
        // Pastikan hasil di server sebelum menghapus file ketika Firestore gagal mengonfirmasi simpan.
        const recorded = await account.hasJournalTrade(trade.id).catch(() => null);
        if (recorded === false) await deleteJournalScreenshot(uid, trade.id);
        saved = recorded === true;
      }
      if (!saved) throw new Error('Posisi gagal disimpan. Coba lagi.');
      setForm(emptyForm());
      return `Posisi ${trade.pair} tersimpan.`;
    });
  }

  function handleClose(trade) {
    return runAction(trade.id, 'open', async () => {
      const quote = await fetchJournalQuote(trade.pair);
      const at = Date.now();
      const saved = await account.update((current) => closeWalletPosition(current, trade.id, quote, at));
      if (!saved) throw new Error('Posisi gagal ditutup. Coba lagi.');
      return `Posisi ${trade.pair} ditutup.`;
    });
  }

  function handleSavePositionValue(trade, amount) {
    return runAction('position-value', 'open', async () => {
      const saved = await account.update((current) => recordInitialPositionValue(current, trade.id, amount));
      if (!saved) throw new Error('Nilai awal posisi gagal disimpan. Coba lagi.');
      return `Nilai awal ${trade.pair} tersimpan.`;
    });
  }

  function handleRemove({ id, chartScreenshot }, section) {
    return runAction(`remove:${id}`, section, async () => {
      const at = Date.now();
      const saved = await account.update((current) => removeWalletPosition(current, id, at));
      if (!saved) throw new Error('Posisi gagal dihapus. Coba lagi.');
      const message = section === 'open' && wallet.positions.has(id)
        ? 'Posisi dibatalkan dan dana dikembalikan ke wallet.'
        : 'Posisi dihapus dari jurnal.';
      if (chartScreenshot && !await deleteJournalScreenshot(uid, id)) {
        throw new Error(`${message} Screenshot chart gagal dihapus.`);
      }
      return message;
    });
  }

  return (
    <div className="journal-page">
      <header className="journal-page-header">
        <div>
          <h1>Jurnal trading</h1>
          <p className="journal-help">Catat posisi dan evaluasi hasil trading.</p>
        </div>
        <nav className="journal-jump-links" aria-label="Bagian jurnal">
          <a href="#journal-wallet">Wallet</a>
          <a href="#journal-setups">Trade Setup</a>
          <a href="#journal-entry">Catat posisi</a>
          <a href="#journal-open">Posisi terbuka</a>
          <a href="#journal-closed">Posisi ditutup</a>
        </nav>
      </header>

      <JournalWallet wallet={wallet} ready={ready} readError={readError} disabled={disabled}
        saving={activeAction === 'wallet'} onMove={handleWalletMove}>
        <JournalFeedback feedback={feedback} section="wallet" />
      </JournalWallet>

      <JournalTradeSetups uid={uid} knownTickers={knownTickers}
        availableCents={ready ? wallet.availableCents : null} disabled={disabled} />

      <section id="journal-entry" className="journal-section journal-entry" aria-labelledby="journal-entry-title">
        <div className="journal-entry-header">
          <h2 id="journal-entry-title">Catat posisi</h2>
          {ready && (
            <dl className="journal-account-context">
              <div><dt>Mata uang akun</dt><dd>{currency}</dd></div>
              <div><dt>Saldo wallet</dt><dd>{formatPrice(wallet.availableCents / 100, 'USD')}</dd></div>
            </dl>
          )}
        </div>
        <form className="journal-form" onSubmit={handleOpen}>
          <div className="journal-form-groups">
            <fieldset className="journal-form-group">
              <legend>Rincian posisi</legend>
              <div className="journal-form-grid">
                <TickerField
                  className="journal-ticker-field"
                  placeholder="BBCA, NVDA, BTC-USD"
                  describedBy="journal-ticker-note"
                  value={form.ticker}
                  onChange={setTicker}
                  onSelect={(symbol) => setTicker(symbol, symbol)}
                  knownSymbols={knownTickers}
                  maxLength={39}
                  disabled={disabled}
                />
                <label className="journal-date-field">
                  Tanggal masuk
                  <input type="date" value={form.date} onChange={(event) => setField('date', event.target.value)} disabled={disabled} required />
                </label>
                <label>
                  Posisi
                  <select value={side} onChange={(event) => setField('side', event.target.value)} disabled={disabled}>
                    {Object.entries(journalSides).map(([value, { label }]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Type
                  <select value={type} onChange={(event) => {
                    setField('type', event.target.value);
                    setFeedback((current) => current?.section === 'entry' ? null : current);
                  }} disabled={disabled}>
                    {Object.entries(journalTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  Nilai posisi (USD)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.positionUsd}
                    onChange={(event) => setField('positionUsd', event.target.value)}
                    placeholder="500 atau 125,50"
                    maxLength={13}
                    aria-describedby="journal-wallet-note"
                    disabled={disabled}
                    required
                  />
                </label>
                <PriceField label="Harga masuk" value={form.entryPrice} onChange={(value) => setField('entryPrice', value)}
                  describedBy="journal-level-note" disabled={disabled} />
                <label className="journal-setup-field">
                  Setup
                  <select
                    value={form.setup}
                    onChange={(event) => setField('setup', event.target.value)}
                    disabled={disabled}
                    required
                  >
                    <option value="" disabled>Pilih setup</option>
                    {journalSetupOptions.map((setup) => <option key={setup} value={setup}>{setup}</option>)}
                  </select>
                </label>
                <label className="journal-notes-field">
                  Notes (opsional)
                  <textarea
                    rows={2}
                    value={form.notes}
                    onChange={(event) => setField('notes', event.target.value)}
                    placeholder="Mis. alasan membuka posisi"
                    disabled={disabled}
                  />
                </label>
              </div>
              <p className="journal-help" id="journal-wallet-note">Nilai posisi diambil dari <a href="#journal-wallet">saldo wallet USD</a>.</p>
              <p className="journal-help" id="journal-ticker-note">
                Untuk kripto, gunakan <code>BTC-USD</code> atau <code>CRYPTO:BTC</code>. Awali dengan <code>US:</code> untuk memilih ticker AS jika kodenya sama.{' '}
                {type === 'futures'
                  ? 'Tanggal masuk mengikuti zona waktu perangkat. Gunakan kode kontrak untuk kuotasi futures.'
                  : 'Tanggal masuk mengikuti zona waktu bursa.'}
              </p>
            </fieldset>
            <fieldset className="journal-form-group">
              <legend>Rencana keluar</legend>
              <div className="journal-form-grid">
                <ExitPlanFields form={form} levels={levels} setField={setField} disabled={disabled} describedBy="journal-level-note" />
              </div>
              {type === 'futures' && <LeverageFields form={form} setField={setField} disabled={disabled} />}
              <p className="journal-help" id="journal-level-note">
                Stop loss otomatis dihitung dari harga masuk. Pilih rasio untuk menghitung take profit.
                Gunakan mata uang ticker. Tulis desimal dengan titik atau koma tanpa pemisah ribuan.
              </p>
              <JournalScreenshotField file={form.screenshot} disabled={disabled} onChange={(file) => {
                setField('screenshot', file);
                setFeedback((current) => current?.section === 'entry' ? null : current);
              }} />
            </fieldset>
          </div>
          <div className="journal-actions">
            <button type="submit" className="scan-button" disabled={disabled}>
              {activeAction === side ? 'Menyimpan…' : `Buka ${journalSides[side].label}`}
            </button>
            <JournalFeedback feedback={feedback} section="entry" />
            {!ready && <span className="journal-help" role="status">{readError ? 'Data akun belum bisa dimuat.' : 'Menyiapkan data akun…'}</span>}
            {ready && account.pending && activeAction === null && <span className="journal-help" role="status">Menyinkronkan data akun…</span>}
          </div>
        </form>
      </section>

      <section id="journal-open" className="journal-section" aria-labelledby="journal-open-title">
        <div className="journal-section-header">
          <div>
            <h2 id="journal-open-title">Posisi terbuka</h2>
            <p className="journal-help">Harga keluar memakai kuotasi terakhir Yahoo Finance saat posisi ditutup.</p>
          </div>
          {openTrades.length > 0 && (
            <button type="button" className="journal-secondary-button" onClick={refresh} disabled={refreshing}>
              {refreshing ? 'Memperbarui harga…' : 'Perbarui harga'}
            </button>
          )}
        </div>
        {!positionValueTrade && <JournalFeedback feedback={feedback} section="open" />}
        {openTrades.length > 0 && (
          <div className="journal-running">
            <StatCard
              label="Total PnL berjalan (USD)"
              value={formatPnl(totalRunningPnl, 'USD')}
              tone={totalRunningPnl > 0 ? 'gain' : totalRunningPnl < 0 ? 'risk' : undefined}
            />
            <p className="journal-help">
              PnL dari harga masuk ke kuotasi terakhir Yahoo Finance. {runningAmounts.length} dari {openTrades.length} posisi dihitung dalam USD.
              Perhitungan memakai kurs tetap untuk ticker non-USD.
            </p>
          </div>
        )}
        <TradeTable
          trades={openTrades}
          runningValues={runningValues}
          manualCurrency={currency}
          ready={ready}
          readError={readError}
          disabled={disabled}
          activeAction={activeAction}
          onClose={handleClose}
          onRemove={(trade) => handleRemove(trade, 'open')}
          onViewScreenshot={setViewingScreenshot}
          onFillPositionValue={(trade) => {
            setFeedback(null);
            setPositionValueTrade(trade);
          }}
        />
        {positionValueTrade && (
          <PositionValueDialog trade={positionValueTrade} disabled={disabled} saving={activeAction === 'position-value'}
            feedback={feedback} onSave={handleSavePositionValue} onClose={() => {
              setPositionValueTrade(null);
              setFeedback((current) => current?.type === 'error' ? null : current);
            }} />
        )}
      </section>

      <section id="journal-closed" className="journal-section journal-closed" aria-labelledby="journal-closed-title">
        <div className="journal-section-header">
          <div>
            <h2 id="journal-closed-title">Posisi ditutup</h2>
            <p className="journal-help">PnL terealisasi dan statistik hasil trading.</p>
          </div>
        </div>
        <JournalFeedback feedback={feedback} section="closed" />
        {(ready || closedTrades.length > 0) && <div className="journal-performance">
          <div className="journal-capital">
            <div className="journal-section-header">
              <StatCard label={`Modal acuan (${currency})`} value={formatJournalPrice(capital, currency)} />
              {!capitalDraft && (
                <button type="button" className="journal-secondary-button" disabled={disabled}
                  onClick={() => {
                    setFeedback(null);
                    setCapitalDraft({ amount: String(capital), currency });
                  }}>
                  Atur modal
                </button>
              )}
            </div>
            {capitalDraft && (
              <form className="journal-form journal-capital-form" onSubmit={handleCapital}>
                <label>
                  Jumlah modal
                  <input type="text" inputMode="decimal" value={capitalDraft.amount} disabled={disabled} required
                    onChange={(event) => setCapitalDraft({ ...capitalDraft, amount: event.target.value })} />
                </label>
                <label>
                  Mata uang modal
                  <select value={capitalDraft.currency} disabled={disabled || currencyLocked}
                    onChange={(event) => setCapitalDraft({ ...capitalDraft, currency: event.target.value })}>
                    {journalCurrencies.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <div className="journal-capital-actions">
                  <button type="submit" className="scan-button" disabled={disabled}>
                    {activeAction === 'capital' ? 'Menyimpan…' : 'Simpan modal'}
                  </button>
                  <button type="button" className="journal-secondary-button" disabled={disabled}
                    onClick={() => {
                      setCapitalDraft(null);
                      setFeedback(null);
                    }}>
                    Batal
                  </button>
                </div>
                {currencyLocked && <p className="journal-help">Mata uang akun digunakan oleh PnL manual yang sudah tercatat.</p>}
              </form>
            )}
            <JournalFeedback feedback={feedback} section="capital" />
          </div>
          <div className="journal-stat-grid">
            <StatCard label="Jumlah posisi" value={closedTrades.length} />
            <StatCard label="Win" value={wins} tone={wins > 0 ? 'gain' : undefined} />
            <StatCard label="Loss" value={losses} tone={losses > 0 ? 'risk' : undefined} />
            <StatCard label="Break-even" value={quoted.be + manual.be} />
            <StatCard label="Win rate" value={winRate == null ? '–' : `${winRate.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`} />
          </div>
          <RealizedTotals series={realizedPnl} closedCount={closedTrades.length} />
          <div className="journal-stat-grid journal-stat-grid--secondary">
            <StatCard label="Rata-rata untung" value={statValue(stats.avgWin)} tone="gain" />
            <StatCard label="Rata-rata rugi" value={statValue(stats.avgLoss == null ? null : -stats.avgLoss)} tone="risk" />
            <StatCard label="Expectancy ratio" value={stats.expectancyRatio ?? '–'} />
            <StatCard label="Net expectancy" value={statValue(stats.netExpectancy)} />
            {manual.totalTrades > 0 && <StatCard label="Total PnL manual" value={formatPnl(manual.totalPnl, currency)} />}
          </div>
          <p className="journal-help">
            PnL posisi USD adalah nilai posisi dikali PnL %. Perhitungan memakai kurs tetap untuk ticker non-USD.
            Profit Factor membagi total untung dengan nilai absolut total rugi.
          </p>
        </div>}
        {(ready || closedTrades.length > 0) && <JournalCharts series={realizedPnl} preferredCurrency={currency} walletHistory={wallet.history} />}
        <TradeTable
          trades={closedTrades}
          closed
          manualCurrency={currency}
          ready={ready}
          readError={readError}
          disabled={disabled}
          activeAction={activeAction}
          onRemove={(trade) => handleRemove(trade, 'closed')}
          onViewScreenshot={setViewingScreenshot}
        />
      </section>
      {viewingScreenshot && (
        <JournalScreenshotDialog uid={uid} trade={viewingScreenshot} onClose={() => setViewingScreenshot(null)} />
      )}
    </div>
  );
}
