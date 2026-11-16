import { useRef, useState } from 'react';
import { formatDate, formatPrice } from '../format.js';
import { journalSetupOptions, journalSides, journalTypes, parseJournalLeverage } from '../journal.js';
import { calculateLevels, levelPrecision, validateLevels } from '../journalLevels.js';
import { journalSetupMarkets, journalSetupTimeframes } from '../journalSetups.js';
import { normalizeTicker } from '../tickers.js';
import { fetchJournalQuote } from '../useJournalQuotes.js';
import useJournalSetups from '../useJournalSetups.js';
import { parseWalletUsd } from '../wallet.js';
import { ExitPlanFields, LeverageFields, PriceField } from './JournalOrderFields.jsx';
import TickerField from './TickerField.jsx';

function emptySetup() {
  return {
    ticker: '',
    market: '',
    date: new Date().toLocaleDateString('sv-SE'),
    side: 'long',
    type: 'spot',
    timeframe: 'Daily',
    setup: '',
    thesis: '',
    positionUsd: '',
    leverage: '1',
    entryPrice: '',
    stopLossPct: '',
    stopLoss: '',
    rewardMultiple: '',
    takeProfit: '',
  };
}

function PendingSetup({ item, availableCents, disabled, onCancel }) {
  const { pair, market, date, side, type, timeframe, setup, thesis, positionCents, quoteCurrency, triggerAbove,
    limitPrice, stopLoss, takeProfit, leverage = 1 } = item;
  const marginUsd = positionCents / 100;
  const waitingForBalance = availableCents != null && positionCents > availableCents;
  const formatLevel = (value) => formatPrice(value, quoteCurrency, levelPrecision);
  return (
    <li className="journal-pending-setup">
      <div className="journal-section-header">
        <div>
          <h3>{pair} <span className={`journal-badge journal-badge--${side}`}>{journalSides[side].label}</span></h3>
          <p className="journal-help">{journalSetupMarkets[market]} · {journalTypes[type]} · {timeframe} · {formatDate(date)}</p>
        </div>
        <span className={`journal-badge journal-badge--${waitingForBalance ? 'loss' : 'be'}`}>
          {waitingForBalance ? 'Menunggu saldo' : 'Menunggu harga'}
        </span>
      </div>
      <dl className="journal-pending-levels">
        <div><dt>Limit Price</dt><dd>{triggerAbove ? '≥ ' : '≤ '}{formatLevel(limitPrice)}</dd></div>
        <div><dt>Stop Loss</dt><dd>{formatLevel(stopLoss)}</dd></div>
        <div><dt>Take Profit</dt><dd>{formatLevel(takeProfit)}</dd></div>
        <div>
          <dt>Nilai posisi</dt>
          <dd>{formatPrice(marginUsd * leverage, 'USD')}</dd>
          {leverage > 1 && <small className="journal-trade-note">Margin {formatPrice(marginUsd, 'USD')} · {leverage}×</small>}
        </div>
      </dl>
      <div className="journal-section-header">
        <div>
          <strong>{setup}</strong>
          {thesis && <p className="journal-help journal-position-notes">{thesis}</p>}
        </div>
        <button type="button" className="journal-secondary-button" disabled={disabled}
          aria-label={`Batalkan setup ${pair}`} onClick={onCancel}>
          Batalkan setup
        </button>
      </div>
    </li>
  );
}

export default function JournalTradeSetups({ uid, knownTickers, availableCents, disabled }) {
  const { setups, loading, failed, save, cancel } = useJournalSetups(uid);
  const [draft, setDraft] = useState(emptySetup);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const action = useRef(false);
  const levels = calculateLevels(draft);
  const locked = busy || disabled;

  function setField(field, value) {
    setDraft((previous) => ({ ...previous, [field]: value }));
    if (field === 'leverage' || field === 'positionUsd' || field === 'type') {
      setFeedback((current) => current?.error ? null : current);
    }
  }

  async function run(operation) {
    if (locked || action.current) return;
    action.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      setFeedback({ message: await operation() });
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Setup gagal diperbarui.', error: true });
    } finally {
      action.current = false;
      setBusy(false);
    }
  }

  function handleSave(event) {
    event.preventDefault();
    return run(async () => {
      const { market, date, side, type, timeframe, setup, thesis, rewardMultiple } = draft;
      const symbol = normalizeTicker(draft.ticker, market);
      const positionCents = parseWalletUsd(draft.positionUsd);
      if (!Object.hasOwn(journalSetupMarkets, market) || !symbol || !journalSetupOptions.includes(setup)) {
        throw new Error('Pilih market, kode ticker, dan identitas setup.');
      }
      if (positionCents == null) throw new Error('Isi nilai posisi USD lebih dari 0, misalnya 500 atau 125,50.');
      const leverage = type === 'futures' ? parseJournalLeverage(draft.leverage, positionCents) : 1;
      if (leverage == null) throw new Error('Gunakan leverage minimal 1× dengan nilai posisi yang valid.');
      const { entryPrice: limitPrice, stopLoss, takeProfit } = validateLevels(levels, draft, 'Limit Price');
      const quote = await fetchJournalQuote(symbol);

      try {
        await save({
          pair: quote.symbol ?? symbol,
          market,
          date,
          side,
          type,
          timeframe,
          setup,
          thesis: thesis.trim(),
          positionCents,
          ...(leverage > 1 && { leverage }),
          limitPrice,
          stopLoss,
          takeProfit,
          rewardMultiple: Number(rewardMultiple) || null,
          quoteCurrency: quote.currency,
          triggerAbove: quote.price <= limitPrice,
          entryTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      } catch {
        throw new Error('Setup gagal disimpan. Periksa koneksi atau coba lagi.');
      }
      setDraft(emptySetup());
      setEditing(false);
      return 'Setup sudah disimpan.';
    });
  }

  function handleCancel(item) {
    return run(async () => {
      try {
        await cancel(item.id);
        return `Setup ${item.pair} dibatalkan.`;
      } catch {
        throw new Error('Setup gagal dibatalkan. Muat ulang Jurnal untuk melihat statusnya.');
      }
    });
  }

  return (
    <section id="journal-setups" className="journal-section" aria-labelledby="journal-setups-title">
      <div className="journal-section-header">
        <div>
          <h2 id="journal-setups-title">Trade Setup / Pending Order</h2>
          <p className="journal-help">Kuotasi Yahoo Finance diperiksa di latar belakang. Posisi tercatat otomatis saat harga mencapai atau melewati batas dan saldo wallet cukup.</p>
        </div>
        <button type="button" className={editing ? 'journal-secondary-button' : 'scan-button'} disabled={locked}
          aria-expanded={editing} aria-controls={editing ? 'journal-setup-form' : undefined}
          onClick={() => { setEditing(!editing); setFeedback(null); }}>
          {editing ? 'Tutup form' : 'Tambah setup'}
        </button>
      </div>

      {editing && (
        <form id="journal-setup-form" className="journal-form journal-setup-form" onSubmit={handleSave}>
          <div className="journal-form-groups">
            <fieldset className="journal-form-group">
              <legend>Rincian setup</legend>
              <div className="journal-form-grid">
                <label>
                  Ticker Market
                  <select value={draft.market} onChange={(event) => setField('market', event.target.value)} disabled={locked} required>
                    <option value="" disabled>Pilih market</option>
                    {Object.entries(journalSetupMarkets).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <TickerField className="journal-ticker-field" placeholder="MSFT, 2330, BTC"
                  value={draft.ticker} onChange={(value) => setField('ticker', value)} onSelect={(value) => setField('ticker', value)}
                  knownSymbols={knownTickers} market={draft.market || 'auto'} maxLength={39} disabled={locked} />
                <label className="journal-date-field">
                  Setup Date
                  <input type="date" value={draft.date} onChange={(event) => setField('date', event.target.value)} disabled={locked} required />
                </label>
                <label>
                  Timeframe
                  <select value={draft.timeframe} onChange={(event) => setField('timeframe', event.target.value)} disabled={locked}>
                    {journalSetupTimeframes.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label>
                  Direction
                  <select value={draft.side} onChange={(event) => setField('side', event.target.value)} disabled={locked}>
                    {Object.entries(journalSides).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  Type
                  <select value={draft.type} onChange={(event) => setField('type', event.target.value)} disabled={locked}>
                    {Object.entries(journalTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="journal-setup-field">
                  Identitas setup
                  <select value={draft.setup} onChange={(event) => setField('setup', event.target.value)} disabled={locked} required>
                    <option value="" disabled>Pilih setup</option>
                    {journalSetupOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label className="journal-setup-position">
                  Nilai posisi (USD)
                  <input type="text" inputMode="decimal" value={draft.positionUsd}
                    onChange={(event) => setField('positionUsd', event.target.value)} placeholder="500 atau 125,50"
                    maxLength={13} disabled={locked} required />
                </label>
                <label className="journal-setup-thesis">
                  Investment Thesis / Alasan masuk
                  <textarea rows={2} value={draft.thesis} onChange={(event) => setField('thesis', event.target.value)}
                    maxLength={2000} disabled={locked} />
                </label>
              </div>
            </fieldset>
            <fieldset className="journal-form-group">
              <legend>Harga pemicu dan rencana keluar</legend>
              <div className="journal-form-grid">
                <div className="journal-setup-limit">
                  <PriceField label="Limit Price" value={draft.entryPrice} onChange={(value) => setField('entryPrice', value)}
                    describedBy="journal-setup-level-note" disabled={locked} />
                </div>
                <ExitPlanFields form={draft} levels={levels} setField={setField} disabled={locked} describedBy="journal-setup-level-note" />
              </div>
              {draft.type === 'futures' && <LeverageFields form={draft} setField={setField} disabled={locked} />}
              <p id="journal-setup-level-note" className="journal-help">
                Limit Price menjadi batas harga turun atau naik, tergantung kuotasi saat setup disimpan.
                SL otomatis memakai Limit Price sebagai dasar. Semua level memakai mata uang ticker.
              </p>
            </fieldset>
          </div>
          <div className="journal-actions">
            <button type="submit" className="scan-button" disabled={locked}>{busy ? 'Menyimpan…' : 'Simpan setup'}</button>
          </div>
        </form>
      )}

      {feedback && <p className={`journal-feedback journal-feedback--${feedback.error ? 'error' : 'success'}`}
        role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
      {failed && <p className="journal-feedback journal-feedback--error" role="alert">Daftar setup gagal dimuat. Muat ulang Jurnal.</p>}
      {loading && <p className="journal-help" role="status">Memuat setup…</p>}
      {!failed && !loading && setups.length === 0 && <p className="journal-empty">Belum ada setup yang menunggu.</p>}
      {setups.length > 0 && (
        <ul className="journal-pending-setups">
          {setups.map((item) => <PendingSetup key={item.id} item={item} availableCents={availableCents}
            disabled={locked} onCancel={() => handleCancel(item)} />)}
        </ul>
      )}
    </section>
  );
}
