import { useState } from 'react';
import { formatCompactNumber, formatDate, formatPnl, formatPrice, priceDecimals } from '../format.js';
import { walletMovementLabels } from '../wallet.js';

const sources = {
  daily: { label: 'PnL harian', detail: 'PnL per tanggal keluar. Catatan manual mengikuti tanggal yang dicatat.' },
  cumulative: { label: 'PnL kumulatif', detail: 'Akumulasi PnL sampai setiap tanggal yang tercatat.' },
  availableCents: { label: 'Saldo tersedia', detail: 'Saldo wallet setelah setiap aktivitas.' },
  equityCents: { label: 'Ekuitas wallet', detail: 'Saldo tersedia ditambah dana yang dipakai posisi, berdasarkan PnL terealisasi.' },
};
const chartTypes = { bar: 'Batang', line: 'Garis waktu', area: 'Area' };
const axisDateFormat = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC',
});
const walletAxisFormat = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
});
const walletDateFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'medium' });

function ChartPlot({ points, currency, source, type, isWallet }) {
  const values = points.map(({ value }) => value);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const extent = Math.max(-min, max);
  const limit = extent > 0 ? Math.max(extent, 2 * 10 ** -priceDecimals(currency)) : 1;
  const top = max === 0 && min < 0 ? 0 : limit;
  const bottom = min === 0 && max > 0 ? 0 : -limit;
  const ticks = [top, (top + bottom) / 2, bottom];
  const y = (value) => 100 * ((top - value) / (top - bottom));
  const baseline = y(0);
  const step = 100 / points.length;
  const barWidth = Math.min(step * 0.7, 12);
  const firstTime = points[0].time;
  const duration = points.at(-1).time - firstTime;
  const plotted = points.map((point, index) => ({
    ...point,
    x: type === 'bar' || duration <= 0 ? (index + 0.5) * step : 2 + 96 * ((point.time - firstTime) / duration),
    y: y(point.value),
  }));
  const path = plotted.map((point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    return isWallet ? `H ${point.x} V ${point.y}` : `L ${point.x} ${point.y}`;
  }).join(' ');
  const area = `${path} L ${plotted.at(-1).x} ${baseline} L ${plotted[0].x} ${baseline} Z`;
  const labels = points.length === 1 ? [points[0]] : [points[0], points.at(-1)];

  return (
    <div className="journal-pnl-plot">
      <div className="journal-pnl-axis-y" aria-hidden="true">
        {ticks.map((tick) => <span key={tick}>{formatCompactNumber(tick)}</span>)}
      </div>
      <svg className="journal-pnl-bars" viewBox="0 0 100 100" preserveAspectRatio="none" role="img"
        aria-label={`Grafik ${chartTypes[type].toLowerCase()} ${sources[source].label.toLowerCase()} ${currency}`}>
        {ticks.filter((tick) => tick !== 0).map((tick) => (
          <line key={tick} className="journal-pnl-gridline" x1="0" x2="100" y1={y(tick)} y2={y(tick)} vectorEffect="non-scaling-stroke" />
        ))}
        <line className="journal-pnl-baseline" x1="0" x2="100" y1={baseline} y2={baseline} vectorEffect="non-scaling-stroke" />
        {type === 'bar' ? plotted.map((point) => (
          point.value === 0 ? (
            <line key={point.key} className="journal-pnl-flat" x1={point.x - barWidth / 2} x2={point.x + barWidth / 2}
              y1={baseline} y2={baseline} vectorEffect="non-scaling-stroke"><title>{point.title}</title></line>
          ) : (
            <rect key={point.key} className={isWallet ? 'journal-pnl-value' : point.value > 0 ? 'journal-pnl-up' : 'journal-pnl-down'}
              x={point.x - barWidth / 2} y={Math.min(baseline, point.y)} width={barWidth} height={Math.abs(baseline - point.y)}>
              <title>{point.title}</title>
            </rect>
          )
        )) : (
          <>
            {type === 'area' && <path className="journal-pnl-area" d={area} />}
            <path className="journal-pnl-line" d={path} vectorEffect="non-scaling-stroke" />
            {plotted.length <= 50 && plotted.map((point) => (
              <line key={point.key} className="journal-pnl-point" x1={point.x} x2={point.x + 0.01} y1={point.y} y2={point.y}
                vectorEffect="non-scaling-stroke"><title>{point.title}</title></line>
            ))}
          </>
        )}
      </svg>
      <div className={`journal-pnl-axis-x${labels.length === 1 ? ' journal-pnl-axis-x--single' : ''}`} aria-hidden="true">
        {labels.map((point) => (
          <time key={point.key} dateTime={point.date}>{(isWallet ? walletAxisFormat : axisDateFormat).format(point.time)}</time>
        ))}
      </div>
    </div>
  );
}

function chartPoints(days, history, source, currency, isWallet) {
  if (isWallet) {
    return history.map((movement) => {
      const value = movement[source] / 100;
      const label = walletDateFormat.format(movement.at);
      return {
        key: movement.id, date: new Date(movement.at).toISOString(), time: movement.at, value, label,
        activity: walletMovementLabels[movement.kind] + (movement.symbol ? ` ${movement.symbol}` : ''),
        title: `${label} · ${formatPrice(value, currency)}`,
      };
    });
  }

  let total = 0;
  return days.map(({ date, count, pnl }) => {
    total += pnl;
    const value = source === 'cumulative' ? total : pnl;
    const label = formatDate(date);
    return { key: date, date, time: Date.parse(`${date}T00:00:00Z`), value, label, activity: count, title: `${label} · ${formatPnl(value, currency)}` };
  });
}

export default function JournalCharts({ series, preferredCurrency, walletHistory }) {
  const [selectedSource, setSource] = useState(null);
  const [selectedType, setType] = useState(null);
  const [selectedCurrency, setCurrency] = useState(null);
  const source = selectedSource ?? (walletHistory.length > 0 ? 'availableCents' : 'daily');
  const type = selectedType ?? (source === 'daily' ? 'bar' : 'line');
  const isWallet = source === 'availableCents' || source === 'equityCents';
  const selected = series.find((item) => item.currency === selectedCurrency)
    ?? series.find((item) => item.currency === preferredCurrency && item.daily.length > 0)
    ?? series.find((item) => item.daily.length > 0)
    ?? series[0];
  const currency = isWallet ? 'USD' : selected?.currency;
  const points = chartPoints(selected?.daily ?? [], walletHistory, source, currency, isWallet);

  return (
    <section id="journal-charts" className="journal-section journal-charts" aria-labelledby="journal-chart-title">
      <div>
        <h3 id="journal-chart-title">Grafik jurnal{currency ? ` (${currency})` : ''}</h3>
        <p className="journal-help">{sources[source].detail}</p>
      </div>
      <div className="journal-chart-controls">
        <label>
          Data grafik
          <select value={source} onChange={(event) => { setSource(event.target.value); setType(null); }}>
            {Object.entries(sources).map(([key, { label }]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label>
          Tipe grafik
          <select value={type} onChange={(event) => setType(event.target.value)}>
            {Object.entries(chartTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        {!isWallet && series.length > 1 && (
          <label>
            Mata uang grafik
            <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
              {series.map((item) => <option key={item.currency} value={item.currency}>{item.currency}</option>)}
            </select>
          </label>
        )}
      </div>
      {points.length > 0 ? (
        <>
          <ChartPlot points={points} currency={currency} source={source} type={type} isWallet={isWallet} />
          <details className="journal-pnl-days">
            <summary>{isWallet ? 'Lihat nilai per aktivitas' : 'Lihat nilai per tanggal'}</summary>
            <table className="fund-table" aria-label={`Rincian ${sources[source].label.toLowerCase()} ${currency}`}>
              <thead>
                <tr><th scope="col">{isWallet ? 'Waktu' : 'Tanggal'}</th><th scope="col">{isWallet ? 'Aktivitas' : 'Posisi'}</th><th scope="col" className="num">{sources[source].label}</th></tr>
              </thead>
              <tbody>
                {[...points].reverse().map(({ key, date, label, activity, value }) => (
                  <tr key={key}>
                    <th scope="row"><time dateTime={date}>{label}</time></th>
                    <td>{activity}</td>
                    <td className="num">{isWallet ? formatPrice(value, currency) : formatPnl(value, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      ) : <p className="journal-help">{isWallet ? 'Belum ada aktivitas wallet.' : 'Belum ada PnL bertanggal untuk ditampilkan.'}</p>}
      {!isWallet && selected?.undatedCount > 0 && (
        <p className="journal-help">Tanggal penutupan belum tersedia untuk {selected.undatedCount} posisi dengan PnL {currency}.</p>
      )}
    </section>
  );
}
