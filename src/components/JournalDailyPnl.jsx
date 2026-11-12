import { useState } from 'react';
import { formatCompactNumber, formatDate, formatPnl, priceDecimals } from '../format.js';

const axisDateFormat = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC',
});

function DailyBars({ days, currency }) {
  const amounts = days.map(({ pnl }) => pnl);
  const min = Math.min(0, ...amounts);
  const max = Math.max(0, ...amounts);
  const extent = Math.max(-min, max);
  const limit = extent > 0 ? Math.max(extent, 2 * 10 ** -priceDecimals(currency)) : 1;
  const top = max === 0 && min < 0 ? 0 : limit;
  const bottom = min === 0 && max > 0 ? 0 : -limit;
  const ticks = [top, (top + bottom) / 2, bottom];
  const y = (amount) => 100 * ((top - amount) / (top - bottom));
  const baseline = y(0);
  const step = 100 / days.length;
  const barWidth = Math.min(step * 0.7, 12);
  const dateLabels = days.length === 1 ? [days[0].date] : [days[0].date, days.at(-1).date];

  return (
    <div className="journal-pnl-plot">
      <div className="journal-pnl-axis-y" aria-hidden="true">
        {ticks.map((tick) => <span key={tick}>{formatCompactNumber(tick)}</span>)}
      </div>
      <svg
        className="journal-pnl-bars"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Grafik batang PnL harian ${currency} untuk ${days.length} tanggal. Rincian angka tersedia di bawah grafik.`}
      >
        {ticks.filter((tick) => tick !== 0).map((tick) => (
          <line key={tick} className="journal-pnl-gridline" x1="0" x2="100" y1={y(tick)} y2={y(tick)} vectorEffect="non-scaling-stroke" />
        ))}
        <line className="journal-pnl-baseline" x1="0" x2="100" y1={baseline} y2={baseline} vectorEffect="non-scaling-stroke" />
        {days.map(({ date, pnl }, index) => {
          const x = (index + 0.5) * step - barWidth / 2;
          const amountY = y(pnl);
          const title = `${formatDate(date)} · ${formatPnl(pnl, currency)}`;
          return pnl === 0 ? (
            <line key={date} className="journal-pnl-flat" x1={x} x2={x + barWidth} y1={baseline} y2={baseline} vectorEffect="non-scaling-stroke">
              <title>{title}</title>
            </line>
          ) : (
            <rect
              key={date}
              className={pnl > 0 ? 'journal-pnl-up' : 'journal-pnl-down'}
              x={x}
              y={Math.min(baseline, amountY)}
              width={barWidth}
              height={Math.abs(baseline - amountY)}
            >
              <title>{title}</title>
            </rect>
          );
        })}
      </svg>
      <div className={`journal-pnl-axis-x${dateLabels.length === 1 ? ' journal-pnl-axis-x--single' : ''}`} aria-hidden="true">
        {dateLabels.map((date) => <time key={date} dateTime={date}>{axisDateFormat.format(new Date(`${date}T00:00:00Z`))}</time>)}
      </div>
    </div>
  );
}

export default function JournalDailyPnl({ series, preferredCurrency }) {
  const [currency, setCurrency] = useState(null);
  const selected = series.find((item) => item.currency === currency)
    ?? series.find((item) => item.currency === preferredCurrency && item.daily.length > 0)
    ?? series.find((item) => item.daily.length > 0)
    ?? series[0];
  const days = selected?.daily ?? [];

  return (
    <section className="journal-daily-pnl" aria-labelledby="journal-daily-pnl-title">
      <div className="journal-section-header">
        <div>
          <h3 id="journal-daily-pnl-title">PnL harian{selected ? ` (${selected.currency})` : ''}</h3>
          <p className="journal-help">Satu batang per tanggal keluar. Catatan manual mengikuti tanggal yang dicatat.</p>
        </div>
        {series.length > 1 && (
          <label className="journal-chart-currency">
            Mata uang grafik
            <select value={selected.currency} onChange={(event) => setCurrency(event.target.value)}>
              {series.map((item) => <option key={item.currency} value={item.currency}>{item.currency}</option>)}
            </select>
          </label>
        )}
      </div>
      {days.length > 0 ? (
        <>
          <DailyBars days={days} currency={selected.currency} />
          <details className="journal-pnl-days">
            <summary>Lihat PnL per tanggal</summary>
            <table className="fund-table" aria-label={`Rincian PnL harian ${selected.currency}`}>
              <thead>
                <tr><th scope="col">Tanggal</th><th scope="col" className="num">Posisi</th><th scope="col" className="num">PnL bersih</th></tr>
              </thead>
              <tbody>
                {[...days].reverse().map(({ date, count, pnl }) => (
                  <tr key={date}>
                    <th scope="row"><time dateTime={date}>{formatDate(date)}</time></th>
                    <td className="num">{count}</td>
                    <td className={`num${pnl > 0 ? ' trend--up' : pnl < 0 ? ' trend--down' : ''}`}>{formatPnl(pnl, selected.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      ) : <p className="journal-help">Belum ada PnL bertanggal untuk ditampilkan.</p>}
      {selected?.undatedCount > 0 && <p className="journal-help">Tanggal penutupan belum tersedia untuk {selected.undatedCount} posisi dengan PnL {selected.currency}.</p>}
    </section>
  );
}
