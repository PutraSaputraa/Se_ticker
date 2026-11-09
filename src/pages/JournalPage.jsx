import { useState } from 'react';
import {
  addTrade,
  journalCurrencies,
  journalSides,
  journalStatuses,
  removeTrade,
  summarizeJournal,
} from '../journal.js';
import { formatPct } from '../format.js';

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  pair: '',
  side: 'long',
  setup: '',
  riskPct: '',
  pnl: '',
  status: 'win',
  notes: '',
};

function StatusBadge({ status }) {
  const meta = journalStatuses[status] ?? { label: status ?? '—', className: 'be' };
  return <span className={`journal-badge journal-badge--${meta.className}`}>{meta.label}</span>;
}

function SideBadge({ side }) {
  const meta = journalSides[side] ?? journalSides.long;
  return <span className={`journal-badge journal-badge--${meta.className}`}>{meta.label}</span>;
}

function weekOf(dateStr) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '—';
  const firstDay = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const days = Math.floor((date - firstDay) / 86400000);
  return `${Math.ceil((days + firstDay.getUTCDay() + 1) / 7)}`;
}

function StatCard({ label, value, tone }) {
  return (
    <div className={`metric-card${tone ? ` metric-card--${tone}` : ''}`}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
    </div>
  );
}

export default function JournalPage({ account }) {
  const { journal, capital, currency } = account;
  const [form, setForm] = useState(emptyForm);
  const [capitalInput, setCapitalInput] = useState(String(capital || ''));
  const [currencySel, setCurrencySel] = useState(currency);
  const [showForm, setShowForm] = useState(false);

  const disabled = !account.ready || account.pending;
  const stats = summarizeJournal(journal);

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function saveSettings() {
    account.update((current) => ({
      ...current,
      capital: Number(capitalInput.replace(/[^\d.,-]/g, '').replace(',', '.')) || 0,
      currency: currencySel,
    }));
  }

  function submit(event) {
    event.preventDefault();
    const capitalNum = Number(capitalInput.replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
    const pnl = Number(form.pnl.replace(',', '.'));
    const pnlPct = capitalNum > 0 && Number.isFinite(pnl) ? (pnl / capitalNum) * 100 : null;

    account.update((current) => ({
      ...current,
      journal: addTrade(current.journal, { ...form, pnl, pnlPct }),
    }));
    setForm(emptyForm);
    setShowForm(false);
  }

  return (
    <div className="journal-page">
      <div className="intro">
        <p className="eyebrow">Jurnal Trading</p>
        <h1>Catat & evaluasi trade</h1>
        <p>Catat setiap trade untuk melihat win rate, expectancy, dan total PnL — konsisten dengan prinsip evaluasi Minervini.</p>
      </div>

      <div className="journal-settings">
        <div className="journal-field">
          <label htmlFor="capital">Jumlah modal trading</label>
          <input
            id="capital"
            type="text"
            inputMode="decimal"
            value={capitalInput}
            onChange={(e) => setCapitalInput(e.target.value)}
            placeholder="Mis. 100000000"
          />
        </div>
        <div className="journal-field">
          <label htmlFor="currency">Currency utama</label>
          <select id="currency" value={currencySel} onChange={(e) => setCurrencySel(e.target.value)}>
            {journalCurrencies.map((cur) => <option key={cur} value={cur}>{cur}</option>)}
          </select>
        </div>
        <button type="button" className="scan-button" disabled={disabled} onClick={saveSettings}>
          Simpan
        </button>
        <span className="journal-currency-note">PnL% dihitung dari modal ini.</span>
      </div>

      <div className="detail-metrics">
        <StatCard label="Total trade" value={stats.totalTrades} />
        <StatCard label="Win rate" value={stats.winRate == null ? '—' : formatPct(stats.winRate)} tone={stats.winRate >= 50 ? 'gain' : 'risk'} />
        <StatCard label="Avg win" value={stats.avgWin == null ? '—' : `${currency} ${stats.avgWin.toLocaleString('id-ID')}`} tone="gain" />
        <StatCard label="Avg loss" value={stats.avgLoss == null ? '—' : `${currency} ${stats.avgLoss.toLocaleString('id-ID')}`} tone="risk" />
        <StatCard label="Expectancy ratio" value={stats.expectancyRatio == null ? '—' : `${stats.expectancyRatio}`} tone={stats.expectancyRatio >= 1 ? 'gain' : 'risk'} />
        <StatCard label="Net expectancy" value={stats.netExpectancy == null ? '—' : `${currency} ${stats.netExpectancy.toLocaleString('id-ID')}`} tone={stats.netExpectancy > 0 ? 'gain' : 'risk'} />
        <StatCard label="Total PnL" value={`${currency} ${stats.totalPnl.toLocaleString('id-ID')}`} tone={stats.totalPnl >= 0 ? 'gain' : 'risk'} />
      </div>

      <div className="journal-actions">
        <button type="button" className="scan-button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Tutup form' : '+ Catat trade'}
        </button>
      </div>

      {showForm && (
        <form className="journal-form" onSubmit={submit}>
          <div className="journal-form-grid">
            <label>
              Tanggal
              <input type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} required />
            </label>
            <label>
              Pair / Ticker
              <input type="text" value={form.pair} onChange={(e) => setField('pair', e.target.value)} placeholder="BBCA.JK" required />
            </label>
            <label>
              Side
              <select value={form.side} onChange={(e) => setField('side', e.target.value)}>
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </label>
            <label>
              Setup
              <input type="text" value={form.setup} onChange={(e) => setField('setup', e.target.value)} placeholder="Breakout / VCP / Resistance" />
            </label>
            <label>
              Risk %
              <input type="text" inputMode="decimal" value={form.riskPct} onChange={(e) => setField('riskPct', e.target.value)} placeholder="1.25" />
            </label>
            <label>
              PnL ({currencySel})
              <input type="text" inputMode="decimal" value={form.pnl} onChange={(e) => setField('pnl', e.target.value)} placeholder="1500000 atau -500000" required />
            </label>
            <label>
              Status
              <select value={form.status} onChange={(e) => setField('status', e.target.value)}>
                <option value="win">Win</option>
                <option value="loss">Loss</option>
                <option value="be">Breakeven</option>
              </select>
            </label>
            <label className="journal-form-wide">
              Notes
              <input type="text" value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="Catatan trade (opsional)" />
            </label>
          </div>
          <button type="submit" className="scan-button" disabled={disabled}>Simpan trade</button>
        </form>
      )}

      <div className="journal-table-wrap">
        {journal.length === 0 ? (
          <p className="watchlist-empty">Belum ada trade dicatat. Tekan "+ Catat trade" untuk mulai.</p>
        ) : (
          <table className="fund-table journal-table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Minggu</th>
                <th>Pair</th>
                <th>Side</th>
                <th>Setup</th>
                <th className="num">Risk%</th>
                <th className="num">PnL ({currency})</th>
                <th className="num">PnL%</th>
                <th>Status</th>
                <th>Notes</th>
                <th aria-label="Aksi" />
              </tr>
            </thead>
            <tbody>
              {journal.map((trade) => (
                <tr key={trade.id}>
                  <td>{trade.date}</td>
                  <td className="journal-week">{weekOf(trade.date)}</td>
                  <td><span className="symbol-badge symbol-badge--light">{trade.pair}</span></td>
                  <td><SideBadge side={trade.side} /></td>
                  <td className="journal-setup">{trade.setup || '—'}</td>
                  <td className="num">{trade.riskPct == null ? '—' : `${trade.riskPct}%`}</td>
                  <td className={`num ${trade.pnl >= 0 ? 'trend--up' : 'trend--down'}`}>
                    {trade.pnl == null ? '—' : trade.pnl.toLocaleString('id-ID')}
                  </td>
                  <td className={`num ${trade.pnlPct >= 0 ? 'trend--up' : 'trend--down'}`}>
                    {trade.pnlPct == null ? '—' : formatPct(trade.pnlPct)}
                  </td>
                  <td><StatusBadge status={trade.status} /></td>
                  <td className="journal-notes">{trade.notes || '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="watchlist-remove"
                      disabled={disabled}
                      title="Hapus trade"
                      aria-label={`Hapus trade ${trade.pair}`}
                      onClick={() => account.update((current) => ({ ...current, journal: removeTrade(current.journal, trade.id) }))}
                    >×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
