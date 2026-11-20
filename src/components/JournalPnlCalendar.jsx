import { useMemo, useState } from 'react';
import useTranslation from '../useTranslation.js';
import { localizedDateFormat } from '../i18n.js';
import { formatCompactNumber, formatDate, formatDateCompact, formatPnl } from '../format.js';
import { journalSides, journalTypes, realizedTradeDate, realizedTradePnl } from '../journal.js';
import { buildPnlCalendar, buildPnlWeek, shiftCalendarDate, shiftCalendarMonth } from '../journalCalendar.js';
import './JournalPnlCalendar.css';

const monthFormat = localizedDateFormat({ month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthDayYearFormat = localizedDateFormat({ day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const weekdayFormat = localizedDateFormat({ weekday: 'short', timeZone: 'UTC' });
const tone = (pnl) => pnl > 0 ? 'gain' : pnl < 0 ? 'loss' : 'flat';

function todayDate() {
  return new Date().toLocaleDateString('sv-SE');
}

function tradesByDate(trades, preferredCurrency, currency) {
  const byDate = new Map();
  for (const trade of trades) {
    const date = realizedTradeDate(trade);
    const value = realizedTradePnl(trade, preferredCurrency);
    if (!date || value?.currency !== currency) continue;
    const records = byDate.get(date) ?? [];
    records.push({ trade, amount: value.amount });
    byDate.set(date, records);
  }
  return byDate;
}

export default function JournalPnlCalendar({ series, preferredCurrency, trades }) {
  const { t } = useTranslation();
  const [periodDate, setPeriodDate] = useState(todayDate);
  const [weekly, setWeekly] = useState(false);
  const [selectedCurrency, setCurrency] = useState(null);
  const [activeDate, setActiveDate] = useState(null);
  const [inspectedDate, setInspectedDate] = useState(null);
  const today = todayDate();
  const month = periodDate.slice(0, 7);
  const selected = series.find((item) => item.currency === selectedCurrency)
    ?? series.find((item) => item.currency === preferredCurrency && item.daily.length > 0)
    ?? series.find((item) => item.daily.length > 0)
    ?? series.find((item) => item.currency === preferredCurrency)
    ?? series[0];
  const currency = selected?.currency ?? preferredCurrency;
  const { weeks, count, pnl, start, end } = useMemo(
    () => weekly ? buildPnlWeek(periodDate, selected?.daily ?? []) : buildPnlCalendar(periodDate.slice(0, 7), selected?.daily ?? []),
    [weekly, periodDate, selected],
  );
  const byDate = useMemo(() => tradesByDate(trades, preferredCurrency, currency), [trades, preferredCurrency, currency]);
  const days = weeks.flat().filter(Boolean);
  const inspected = days.find((cell) => cell.date === inspectedDate);
  const records = byDate.get(activeDate) ?? [];
  const startLabel = weekly && (start.slice(0, 4) === end.slice(0, 4)
    ? formatDateCompact(start) : monthDayYearFormat.format(Date.parse(start)));
  const periodLabel = weekly ? startLabel + ' – ' + monthDayYearFormat.format(Date.parse(end))
    : monthFormat.format(Date.parse(month + '-01'));

  function changePeriod(offset) {
    setActiveDate(null);
    setInspectedDate(null);
    setPeriodDate(!offset ? today : weekly ? shiftCalendarDate(periodDate, offset * 7) : shiftCalendarMonth(month, offset) + '-01');
  }

  function changeView(next) {
    if (next === weekly) return;
    if (activeDate) setPeriodDate(activeDate);
    setInspectedDate(activeDate);
    setWeekly(next);
  }

  function daySummary({ date, entry }) {
    if (!entry) return formatDate(date) + ' · ' + t('Tidak ada posisi tertutup');
    const trades = byDate.get(date) ?? [];
    const won = trades.filter(({ trade }) => trade.status === 'win').length;
    const lost = trades.filter(({ trade }) => trade.status === 'loss').length;
    const outcomes = trades.some(({ trade }) => trade.status)
      ? ' · ' + t('{0} menang, {1} rugi', won, lost) : '';
    return formatDate(date) + ' · ' + formatPnl(entry.pnl, currency)
      + ' · ' + t('{0} posisi tertutup', entry.count) + outcomes;
  }

  return (
    <section className="journal-section journal-calendar" aria-labelledby="journal-calendar-title">
      <div className="journal-section-header">
        <div>
          <h3 id="journal-calendar-title">{t('Kalender PnL')}</h3>
          <p className="journal-help">{t('PnL terealisasi per tanggal keluar.')}</p>
        </div>
        <div className="journal-calendar-view" role="group" aria-label={t('Tampilan kalender')}>
          <button type="button" aria-pressed={!weekly} onClick={() => changeView(false)}>{t('Bulanan')}</button>
          <button type="button" aria-pressed={weekly} onClick={() => changeView(true)}>{t('Mingguan')}</button>
        </div>
      </div>
      <div className="journal-calendar-toolbar">
        <div className="journal-calendar-nav">
          <button type="button" aria-label={t(weekly ? 'Minggu sebelumnya' : 'Bulan sebelumnya')} onClick={() => changePeriod(-1)}>‹</button>
          <strong aria-live="polite">{periodLabel}</strong>
          <button type="button" aria-label={t(weekly ? 'Minggu berikutnya' : 'Bulan berikutnya')} onClick={() => changePeriod(1)}>›</button>
          <button type="button" onClick={() => changePeriod(0)}>{t(weekly ? 'Minggu ini' : 'Bulan ini')}</button>
        </div>
        {series.length > 1 && <div className="journal-chart-controls">
          <label>{t('Mata uang kalender')}
            <select value={currency} onChange={(event) => { setCurrency(event.target.value); setActiveDate(null); setInspectedDate(null); }}>
              {series.map((item) => <option key={item.currency}>{item.currency}</option>)}
            </select>
          </label>
        </div>}
      </div>
      <p className="journal-calendar-total" aria-live="polite">
        {t(weekly ? 'Total mingguan' : 'Total bulanan')}{currency ? ` (${currency})` : ''} <strong data-tone={count ? tone(pnl) : undefined}>{count ? formatPnl(pnl, currency) : '—'}</strong>
        {' · '}{t('{0} posisi tertutup', count)}
      </p>
      <table className="journal-calendar-grid" aria-label={t('Kalender PnL') + ' · ' + periodLabel}
        onKeyDown={(event) => {
          const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
          if (offset == null || !event.target.dataset.date) return;
          event.preventDefault();
          const date = shiftCalendarDate(event.target.dataset.date, offset);
          event.currentTarget.querySelector('[data-date="' + date + '"]')?.focus();
        }}>
        <thead><tr>{Array.from({ length: 7 }, (_, index) => (
          <th key={index} scope="col">{weekdayFormat.format(Date.UTC(2024, 0, index + 1))}</th>
        ))}</tr></thead>
        <tbody>{weeks.map((week, index) => (
          <tr key={index}>{week.map((cell, weekday) => {
            if (!cell) return <td key={weekday} className="journal-calendar-pad" />;
            const { day, date, entry } = cell;
            return (
              <td key={date} data-tone={entry ? tone(entry.pnl) : undefined}>
                <button type="button" className="journal-calendar-day" data-date={date} data-activity={Boolean(entry)}
                  tabIndex={(inspectedDate ?? activeDate ?? (days.some((cell) => cell.date === today) ? today : days[0]?.date)) === date ? 0 : -1}
                  aria-pressed={activeDate === date} aria-current={date === today ? 'date' : undefined}
                  aria-controls="journal-calendar-records" aria-label={daySummary(cell)}
                  onFocus={() => setInspectedDate(date)}
                  onPointerEnter={(event) => { if (event.pointerType === 'mouse') setInspectedDate(date); }}
                  onClick={() => { setActiveDate(activeDate === date ? null : date); setInspectedDate(date); }}>
                  <time dateTime={date}>{day}</time>
                  <span>{entry ? (entry.pnl > 0 ? '+' : entry.pnl < 0 ? '−' : '') + formatCompactNumber(Math.abs(entry.pnl)) : '—'}</span>
                </button>
              </td>
            );
          })}</tr>
        ))}</tbody>
      </table>
      <p className="journal-help journal-calendar-inspect">
        {inspected ? daySummary(inspected)
          : count ? t('Pilih tanggal untuk melihat posisi dan PnL.') : t('Tidak ada posisi tertutup bertanggal pada periode ini.')}
      </p>
      <div id="journal-calendar-records" className="journal-calendar-records" hidden={!activeDate}>
        {activeDate && <h4>{formatDate(activeDate)}</h4>}
        {records.length > 0 ? <ul>{records.map(({ trade, amount }) => (
          <li key={trade.id}>
            <div>
              <strong>{trade.pair}</strong>
              <span>{[t(journalSides[trade.side].label), t(journalTypes[trade.type]), trade.setup].filter(Boolean).join(' · ')}</span>
            </div>
            <strong data-tone={tone(amount)}>{formatPnl(amount, currency)}</strong>
          </li>
        ))}</ul> : <p className="journal-help">{t('Tidak ada posisi dengan PnL tercatat untuk tanggal dan mata uang ini.')}</p>}
      </div>
      {selected?.undatedCount > 0 && <p className="journal-help">{t('Tanggal penutupan belum tersedia untuk {0} posisi dengan PnL {1}.', selected.undatedCount, currency)}</p>}
    </section>
  );
}
