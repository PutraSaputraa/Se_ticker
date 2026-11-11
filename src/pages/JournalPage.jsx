import { useRef, useState } from 'react';
import { normalizeTicker } from '../components/SearchForm.jsx';
import TableScroll from '../components/TableScroll.jsx';
import {
  addTrade,
  calculateTradePnl,
  closeTrade,
  interpretProfitFactor,
  journalRewardMultiples,
  journalSides,
  journalStatuses,
  normalizeTrade,
  positionPnlUsd,
  removeTrade,
  summarizeJournal,
  summarizeProfitFactors,
  tradeQuoteError,
} from '../journal.js';
import { formatPct, formatPrice, priceDecimals } from '../format.js';
import useJournalQuotes, { fetchJournalQuote } from '../useJournalQuotes.js';
import '../styles/journal.css';

const levelPrecision = 16;
const levelPattern = new RegExp(`^\\d*(?:[.,]\\d{1,${levelPrecision}})?$`);
const setupOptions = [
  'Consolidation',
  'Cup & Handle',
  'Earning Report',
  'Falling Wedge',
  'Fundamental Long Term',
  'HH-HL',
  'HNS',
  'Inverse HNS',
  'LL-LH',
  'News',
  'Resistence',
  'Retrace Fibo 0.618',
  'Retrace Fibo 0.786',
  'Support',
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
    side: 'long',
    entryPrice: '',
    stopLossPct: '',
    stopLoss: '',
    rewardMultiple: '',
    takeProfit: '',
  };
}

function parseLevelUnits(input) {
  const text = input.trim();
  if (!levelPattern.test(text)) return null;

  const [whole, fraction = ''] = text.split(/[.,]/);
  const units = BigInt(whole + fraction.padEnd(levelPrecision, '0'));
  return units > 0n ? units : null;
}

function formatLevel(units) {
  if (units === null || units <= 0n) return '';
  const digits = String(units).padStart(levelPrecision + 1, '0');
  const whole = digits.slice(0, -levelPrecision);
  const fraction = digits.slice(-levelPrecision).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

function calculateLevels(form) {
  const entry = parseLevelUnits(form.entryPrice);
  const direction = form.side === 'long' ? 1n : -1n;
  let stop = parseLevelUnits(form.stopLoss);
  if (form.stopLossPct) {
    const percent = 100n - direction * BigInt(form.stopLossPct);
    // Round to the nearest unit at the form's decimal precision.
    stop = entry === null ? null : (entry * percent + 50n) / 100n;
  }

  let target = parseLevelUnits(form.takeProfit);
  if (form.rewardMultiple) {
    const risk = entry !== null && stop !== null ? (entry - stop) * direction : 0n;
    target = risk > 0n ? entry + direction * risk * BigInt(form.rewardMultiple) : null;
  }

  return { entryPrice: formatLevel(entry), stopLoss: formatLevel(stop), takeProfit: formatLevel(target) };
}

function PriceField({ label, value, onChange, disabled, readOnly = false }) {
  return (
    <label>
      {label}
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby="journal-level-note"
        maxLength={25}
        disabled={disabled}
        readOnly={readOnly}
        required={!readOnly}
      />
    </label>
  );
}

function formatJournalPrice(value, currency, precision) {
  return Number.isFinite(value) ? formatPrice(value, currency, precision) : '–';
}

function formatPnl(value, currency, precision) {
  if (!Number.isFinite(value)) return '–';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatPrice(Math.abs(value), currency, precision)}`;
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

function StatCard({ label, value, hint, tone }) {
  return (
    <div className={`metric-card${tone ? ` metric-card--${tone}` : ''}`}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      {hint && <span className="metric-hint">{hint}</span>}
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

function TradeTable({ trades, closed = false, manualCurrency, runningValues, ready, readError, disabled, activeAction, onClose, onRemove }) {
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
    <TableScroll className="journal-table-wrap" label={closed ? 'Tabel posisi ditutup' : 'Tabel posisi terbuka'}>
      <table className="fund-table journal-table">
        <thead>
          <tr>
            <th scope="col" className="journal-ticker">Ticker</th>
            <th scope="col">Posisi</th>
            {closed ? (
              <>
                <th scope="col" className="num">PnL posisi (USD)</th>
                <th scope="col" className="num">PnL %</th>
                <th scope="col">Status</th>
              </>
            ) : (
              <>
                <th scope="col" className="num">PnL berjalan</th>
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
            const pnlTone = trade.pnl > 0 ? 'trend--up' : trade.pnl < 0 ? 'trend--down' : '';
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
                    onClick={() => onRemove(trade.id)}
                  >
                    {activeAction === `remove:${trade.id}` ? '…' : '×'}
                  </button>
                </div>
              </td>
            );

            return (
              <tr key={trade.id}>
                <th scope="row" className="journal-ticker">{trade.pair}</th>
                <td><Badge meta={side} /></td>
                {closed ? (
                  <>
                    <td className={`num ${pnlTone}`}>{formatPnl(positionPnlUsd(trade), 'USD')}</td>
                    <td className={`num ${pnlTone}`}>{trade.pnlPct == null ? '–' : formatPct(trade.pnlPct)}</td>
                    <td>{trade.status ? <Badge meta={journalStatuses[trade.status]} /> : '–'}</td>
                  </>
                ) : (
                  <>
                    <RunningPnlCells value={runningValues.get(trade.id)} currency={currency} />
                    {actions}
                  </>
                )}
                <td className="journal-setup">
                  {trade.setup || '–'}
                  {trade.riskPct != null && <small className="journal-trade-note">Risiko {trade.riskPct}%</small>}
                  {trade.notes && <small className="journal-trade-note">{trade.notes}</small>}
                </td>
                <td><time dateTime={trade.date}>{trade.date}</time></td>
                <td className="num">{formatJournalPrice(trade.entryPrice, currency, entryPrecision)}</td>
                <td className="num">{formatJournalPrice(trade.stopLoss, currency, levelPrecision)}</td>
                <td className="num">{trade.rewardMultiple == null ? '–' : `1:${trade.rewardMultiple}`}</td>
                <td className="num">{formatJournalPrice(trade.takeProfit, currency, levelPrecision)}</td>
                <td className="num">{formatJournalPrice(trade.positionUsd, 'USD')}</td>
                {closed && (
                  <>
                    <td>{trade.exitDate ? <time dateTime={trade.exitDate}>{trade.exitDate}</time> : '–'}</td>
                    <td className="num">{formatJournalPrice(trade.exitPrice, currency)}</td>
                    <td className={`num ${pnlTone}`}>
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

export default function JournalPage({ account }) {
  const { journal, currency, capital, ready, readError } = account;
  const [form, setForm] = useState(emptyForm);
  const [activeAction, setActiveAction] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const running = useRef(false);
  const disabled = !account.ready || account.pending || activeAction !== null;
  const { side, stopLossPct, rewardMultiple } = form;
  const levels = calculateLevels(form);

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
  const profitFactors = summarizeProfitFactors(journal, currency);

  function statValue(value) {
    if (value == null) return '–';
    return manualStats ? formatPrice(value, currency) : formatPct(value);
  }

  function setField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function runAction(action, section, operation) {
    if (disabled || running.current) return;
    running.current = true;
    setActiveAction(action);
    setFeedback(null);
    try {
      const message = await operation();
      setFeedback({ section, type: 'success', message });
    } catch (failure) {
      setFeedback({ section, type: 'error', message: failure.message || 'Jurnal gagal diperbarui. Coba lagi.' });
    } finally {
      running.current = false;
      setActiveAction(null);
    }
  }

  function handleOpen(event) {
    event.preventDefault();

    return runAction(side, 'entry', async () => {
      const input = form.ticker.trim().toUpperCase();
      const symbol = normalizeTicker(input);
      const fallback = symbol !== input && /^[A-Z0-9]+$/.test(input) ? input : null;
      const { setup } = form;
      if (!symbol || !setupOptions.includes(setup)) throw new Error('Isi kode ticker dan pilih setup posisi.');

      const amount = form.positionUsd.trim();
      const positionUsd = Number(amount.replace(',', '.'));
      if (!/^\d+(?:[.,]\d{1,2})?$/.test(amount) || positionUsd <= 0) {
        throw new Error('Isi nilai posisi USD lebih dari 0, misalnya 500 atau 125,50.');
      }

      const entryPrice = Number(levels.entryPrice);
      const stopLoss = Number(levels.stopLoss);
      const takeProfit = Number(levels.takeProfit);
      const prices = rewardMultiple ? [entryPrice, stopLoss] : [entryPrice, stopLoss, takeProfit];
      if (!prices.every((price) => Number.isFinite(price) && price > 0)) {
        throw new Error(`Gunakan angka positif hingga ${levelPrecision} desimal untuk harga yang diisi manual.`);
      }
      if (side === 'long' ? stopLoss >= entryPrice : stopLoss <= entryPrice) {
        throw new Error(side === 'long'
          ? 'Untuk Long, Stop Loss harus di bawah harga masuk.'
          : 'Untuk Short, Stop Loss harus di atas harga masuk.');
      }
      if (rewardMultiple && (!Number.isFinite(takeProfit) || takeProfit <= 0)) {
        throw new Error('Take Profit otomatis harus lebih dari 0. Sesuaikan Stop Loss atau Risk Reward Ratio.');
      }
      if (side === 'long' ? takeProfit <= entryPrice : takeProfit >= entryPrice) {
        throw new Error(side === 'long'
          ? 'Untuk Long, Take Profit harus di atas harga masuk.'
          : 'Untuk Short, Take Profit harus di bawah harga masuk.');
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
        rewardMultiple,
        takeProfit,
        quoteCurrency: quote.currency,
      });
      const saved = await account.update((current) => ({
        ...current,
        journal: addTrade(current.journal, trade),
      }));
      if (!saved) throw new Error('Posisi gagal disimpan. Coba lagi.');
      setForm(emptyForm());
      return `Posisi ${trade.pair} tersimpan.`;
    });
  }

  function handleClose(trade) {
    return runAction(trade.id, 'open', async () => {
      const quote = await fetchJournalQuote(trade.pair);
      const quoteError = tradeQuoteError(trade, quote);
      if (quoteError) throw new Error(quoteError);
      const saved = await account.update((current) => ({
        ...current,
        journal: closeTrade(current.journal, trade.id, quote),
      }));
      if (!saved) throw new Error('Posisi gagal ditutup. Coba lagi.');
      return `Posisi ${trade.pair} ditutup.`;
    });
  }

  function handleRemove(id, section) {
    return runAction(`remove:${id}`, section, async () => {
      const saved = await account.update((current) => ({ ...current, journal: removeTrade(current.journal, id) }));
      if (!saved) throw new Error('Posisi gagal dihapus. Coba lagi.');
      return 'Posisi dihapus dari jurnal.';
    });
  }

  return (
    <div className="journal-page">
      <header className="intro journal-page-header">
        <div>
          <h1>Jurnal trading</h1>
          <p>Catat rencana posisi dan evaluasi hasil setelah ditutup.</p>
        </div>
        <nav className="journal-jump-links" aria-label="Bagian jurnal">
          <a href="#journal-entry">Catat posisi</a>
          <a href="#journal-open">Posisi terbuka</a>
          <a href="#journal-closed">Posisi ditutup</a>
        </nav>
      </header>

      <section id="journal-entry" className="journal-section journal-entry" aria-labelledby="journal-entry-title">
        <div className="journal-entry-header">
          <h2 id="journal-entry-title">Catat posisi</h2>
          {ready && (
            <dl className="journal-account-context">
              <div><dt>Mata uang akun</dt><dd>{currency}</dd></div>
              {capital > 0 && <div><dt>Modal tercatat</dt><dd>{formatJournalPrice(capital, currency)}</dd></div>}
            </dl>
          )}
        </div>
        <form className="journal-form" onSubmit={handleOpen}>
          <div className="journal-form-groups">
            <fieldset className="journal-form-group">
              <legend>Rincian posisi</legend>
              <div className="journal-form-grid">
                <label className="journal-ticker-field">
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
                  Nilai posisi (USD)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.positionUsd}
                    onChange={(event) => setField('positionUsd', event.target.value)}
                    placeholder="500 atau 125,50"
                    maxLength={13}
                    disabled={disabled}
                    required
                  />
                </label>
                <PriceField label="Harga masuk" value={form.entryPrice} onChange={(value) => setField('entryPrice', value)} disabled={disabled} />
                <label className="journal-setup-field">
                  Setup
                  <select
                    value={form.setup}
                    onChange={(event) => setField('setup', event.target.value)}
                    disabled={disabled}
                    required
                  >
                    <option value="" disabled>Pilih setup</option>
                    {setupOptions.map((setup) => <option key={setup} value={setup}>{setup}</option>)}
                  </select>
                </label>
              </div>
              <p className="journal-help" id="journal-ticker-note">
                Untuk kripto, gunakan <code>BTC-USD</code> atau <code>CRYPTO:BTC</code>. Awali dengan <code>US:</code> untuk memilih ticker AS jika kodenya sama.
                Tanggal masuk mengikuti zona waktu bursa.
              </p>
            </fieldset>
            <fieldset className="journal-form-group">
              <legend>Rencana keluar</legend>
              <div className="journal-form-grid">
                <label>
                  Metode Stop Loss
                  <select value={stopLossPct} onChange={(event) => setField('stopLossPct', event.target.value)} aria-describedby="journal-level-note" disabled={disabled}>
                    <option value="">Isi sendiri</option>
                    <option value="5">5% otomatis</option>
                    <option value="7">7% otomatis</option>
                  </select>
                </label>
                <PriceField
                  label="Stop Loss"
                  value={stopLossPct ? levels.stopLoss : form.stopLoss}
                  onChange={(value) => setField('stopLoss', value)}
                  disabled={disabled}
                  readOnly={Boolean(stopLossPct)}
                />
                <label>
                  Risk Reward Ratio
                  <select value={rewardMultiple} onChange={(event) => setField('rewardMultiple', event.target.value)} disabled={disabled}>
                    <option value="">Isi TP sendiri</option>
                    {journalRewardMultiples.map((multiple) => (
                      <option key={multiple} value={multiple}>1:{multiple}</option>
                    ))}
                  </select>
                </label>
                <PriceField
                  label="Take Profit (TP)"
                  value={rewardMultiple ? levels.takeProfit : form.takeProfit}
                  onChange={(value) => setField('takeProfit', value)}
                  disabled={disabled}
                  readOnly={Boolean(rewardMultiple)}
                />
              </div>
              <p className="journal-help" id="journal-level-note">
                Stop loss otomatis dihitung dari harga masuk. Pilih rasio untuk menghitung take profit.
                Gunakan mata uang ticker. Tulis desimal dengan titik atau koma tanpa pemisah ribuan.
              </p>
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
        <JournalFeedback feedback={feedback} section="open" />
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
          onRemove={(id) => handleRemove(id, 'open')}
        />
      </section>

      <section id="journal-closed" className="journal-section" aria-labelledby="journal-closed-title">
        <div className="journal-section-header">
          <div>
            <h2 id="journal-closed-title">Posisi ditutup</h2>
            <p className="journal-help">PnL terealisasi dan statistik hasil trading.</p>
          </div>
        </div>
        <JournalFeedback feedback={feedback} section="closed" />
        {(ready || closedTrades.length > 0) && <div className="journal-performance">
          <div className="journal-stat-grid">
            <StatCard label="Jumlah posisi" value={closedTrades.length} />
            <StatCard label="Win rate" value={winRate == null ? '–' : `${winRate.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`} />
            {profitFactors.length > 0 ? profitFactors.map((factor) => (
              <StatCard
                key={factor.currency}
                label="Profit Factor"
                value={formatProfitFactor(factor.value)}
                hint={<>{interpretProfitFactor(factor.value)}<br />{factor.count} dari {closedTrades.length} posisi · PnL {factor.currency}</>}
              />
            )) : <StatCard label="Profit Factor" value="–" hint="Belum ada PnL posisi yang dapat dihitung" />}
          </div>
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
        <TradeTable
          trades={closedTrades}
          closed
          manualCurrency={currency}
          ready={ready}
          readError={readError}
          disabled={disabled}
          activeAction={activeAction}
          onRemove={(id) => handleRemove(id, 'closed')}
        />
      </section>
    </div>
  );
}
