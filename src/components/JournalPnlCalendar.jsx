import { useState } from 'react';
import useTranslation from '../useTranslation.js';
import { localizedDateFormat } from '../i18n.js';
import { formatCompactNumber, formatDate, formatPnl } from '../format.js';
import { buildPnlCalendar, shiftCalendarMonth } from '../journalCalendar.js';
import './JournalPnlCalendar.css';

const monthFormat = localizedDateFormat({ month: 'long', year: 'numeric', timeZone: 'UTC' });
const weekdayFormat = localizedDateFormat({ weekday: 'short', timeZone: 'UTC' });
const tone = (pnl) => pnl > 0 ? 'gain' : pnl < 0 ? 'loss' : 'flat';

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function JournalPnlCalendar({ series, preferredCurrency }) {
  const { t } = useTranslation();
  const [month, setMonth] = useState(currentMonth);
  const [selectedCurrency, setCurrency] = useState(null);
  const [activeDate, setActiveDate] = useState(null);
  const selected = series.find((item) => item.currency === selectedCurrency)
    ?? series.find((item) => item.currency === preferredCurrency && item.daily.length > 0)
    ?? series.find((item) => item.daily.length > 0)
    ?? series.find((item) => item.currency === preferredCurrency)
    ?? series[0];
  const currency = selected?.currency ?? preferredCurrency;
  const { weeks, count, pnl } = buildPnlCalendar(month, selected?.daily ?? []);
  const active = weeks.flat().find((cell) => cell?.date === activeDate);
  const monthLabel = monthFormat.format(Date.parse(`${month}-01T00:00:00Z`));

  function changeMonth(offset) {
    setActiveDate(null);
    setMonth((previous) => offset ? shiftCalendarMonth(previous, offset) : currentMonth());
  }

  return (
    <section className="journal-section journal-calendar" aria-labelledby="journal-calendar-title">
      <h3 id="journal-calendar-title">{t('Kalender PnL')}</h3>
      <p className="journal-help">{t('PnL terealisasi per tanggal keluar.')}</p>
      <div className="journal-calendar-toolbar">
        <div className="journal-calendar-nav">
          <button type="button" aria-label={t('Bulan sebelumnya')} onClick={() => changeMonth(-1)}>‹</button>
          <strong aria-live="polite">{monthLabel}</strong>
          <button type="button" aria-label={t('Bulan berikutnya')} onClick={() => changeMonth(1)}>›</button>
          <button type="button" onClick={() => changeMonth(0)}>{t('Bulan ini')}</button>
        </div>
        <div className="journal-chart-controls">
          {series.length > 1 && <label>{t('Mata uang kalender')}
            <select value={currency} onChange={(event) => { setCurrency(event.target.value); setActiveDate(null); }}>
              {series.map((item) => <option key={item.currency}>{item.currency}</option>)}
            </select>
          </label>}
        </div>
      </div>
      <p className="journal-calendar-total" aria-live="polite">
        {t('Total bulan ini')}{currency ? ` (${currency})` : ''}: <strong data-tone={count ? tone(pnl) : undefined}>{count ? formatPnl(pnl, currency) : '—'}</strong>
        {' · '}{t('{0} posisi tertutup', count)}
      </p>
      <table className="journal-calendar-grid" aria-label={`${t('Kalender PnL')} · ${monthLabel}`}>
        <thead><tr>{Array.from({ length: 7 }, (_, index) => (
          <th key={index} scope="col">{weekdayFormat.format(Date.UTC(2024, 0, index + 1))}</th>
        ))}</tr></thead>
        <tbody>{weeks.map((week, index) => (
          <tr key={index}>{week.map((cell, weekday) => {
            if (!cell) return <td key={weekday} className="journal-calendar-pad" />;
            const { day, date, entry } = cell;
            return (
              <td key={date} data-tone={entry ? tone(entry.pnl) : undefined}>
                {entry ? (
                  <button type="button" className="journal-calendar-day" aria-pressed={activeDate === date}
                    aria-label={`${formatDate(date)} · ${formatPnl(entry.pnl, currency)} · ${t('{0} posisi tertutup', entry.count)}`}
                    onClick={() => setActiveDate(activeDate === date ? null : date)}>
                    <time dateTime={date}>{day}</time>
                    <span>{entry.pnl > 0 ? '+' : entry.pnl < 0 ? '−' : ''}{formatCompactNumber(Math.abs(entry.pnl))}</span>
                  </button>
                ) : <div className="journal-calendar-day"><time dateTime={date}>{day}</time><span aria-label={t('Tidak ada posisi tertutup')}>—</span></div>}
              </td>
            );
          })}</tr>
        ))}</tbody>
      </table>
      <p className="journal-help" aria-live="polite">
        {active?.entry ? `${formatDate(active.date)} · ${formatPnl(active.entry.pnl, currency)} · ${t('{0} posisi tertutup', active.entry.count)}`
          : count ? t('Pilih tanggal untuk melihat nilai PnL lengkap.') : t('Tidak ada posisi tertutup bertanggal pada bulan ini.')}
      </p>
      {selected?.undatedCount > 0 && <p className="journal-help">{t('Tanggal penutupan belum tersedia untuk {0} posisi dengan PnL {1}.', selected.undatedCount, currency)}</p>}
    </section>
  );
}
