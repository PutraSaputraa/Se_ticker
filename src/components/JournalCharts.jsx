import { localizedDateFormat, localizedNumberFormat } from '../i18n.js';
import useTranslation from '../useTranslation.js';
import { useMemo, useState } from 'react';
import { formatCompactNumber, formatDate, formatPnl, formatPrice, priceDecimals } from '../format.js';
import { walletMovementLabels } from '../wallet.js';
import TableScroll from './TableScroll.jsx';

const sources = {
  daily: { label: 'PnL harian', detail: 'PnL per tanggal keluar. Catatan manual mengikuti tanggal yang dicatat.' },
  cumulative: { label: 'PnL terealisasi kumulatif', detail: 'Akumulasi hasil posisi yang sudah ditutup. Setoran dan penarikan tidak masuk ke PnL.' },
  availableCents: { label: 'Saldo tersedia', detail: 'Saldo likuid wallet setelah setiap aktivitas, termasuk alokasi dana saat posisi dibuka.' },
  equityCents: { label: 'Ekuitas tercatat', detail: 'Saldo tersedia dan dana di posisi setelah setiap aktivitas wallet. Ekuitas ini mengikuti pembukuan jurnal.' },
};
const chartTypes = { bar: 'Batang', line: 'Garis waktu', area: 'Area' };
const axisDateFormat = localizedDateFormat({
  day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC',
});
const walletAxisFormat = localizedDateFormat({
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
});
const walletDateFormat = localizedDateFormat({ dateStyle: 'medium', timeStyle: 'medium' });
const tickFormatOptions = { style: 'currency', currencyDisplay: 'narrowSymbol', notation: 'compact', maximumFractionDigits: 2 };

function plotGeometry(points, currency, source, type) {
  let min = 0;
  let max = 0;
  for (const { value } of points) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
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
    return source === 'daily' ? `L ${point.x} ${point.y}` : `H ${point.x} V ${point.y}`;
  }).join(' ');
  const area = `${path} L ${plotted.at(-1).x} ${baseline} L ${plotted[0].x} ${baseline} Z`;
  const labels = points.length === 1 ? [points[0]] : [points[0], points.at(-1)];
  return { ticks, y, baseline, barWidth, plotted, path, area, labels };
}

function closestPoint(points, x) {
  let left = 0;
  let right = points.length - 1;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (points[middle].x < x) left = middle + 1;
    else right = middle;
  }
  return left > 0 && x - points[left - 1].x < points[left].x - x ? left - 1 : left;
}

function pointLabel(point, isWallet) {
  return isWallet ? walletDateFormat.format(point.time) : formatDate(point.date);
}

function ChartPlot({ points, currency, source, type, isWallet }) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState(null);
  const { ticks, y, baseline, barWidth, plotted, path, area, labels } = useMemo(
    () => plotGeometry(points, currency, source, type), [points, currency, source, type],
  );
  const index = Math.min(selection ?? (plotted.length - 1), plotted.length - 1);
  const point = plotted[index];
  const dateLabel = pointLabel(point, isWallet);
  const amount = isWallet ? formatPrice(point.value, currency) : formatPnl(point.value, currency);
  const description = isWallet
    ? t(walletMovementLabels[point.kind]) + (point.symbol ? ' ' + point.symbol : '')
    : t("{0} posisi ditutup", point.count);
  const tickFormat = /^[A-Z]{3}$/.test(currency) ? localizedNumberFormat({ ...tickFormatOptions, currency }) : null;

  function selectAtPointer(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    setSelection(closestPoint(plotted, (event.clientX - bounds.left) * 100 / bounds.width));
  }

  return (
    <div className="journal-pnl-plot motion-enter">
      <div className="journal-pnl-axis-y" aria-hidden="true">
        {ticks.map((tick) => <span key={tick}>{tickFormat ? tickFormat.format(tick) : formatCompactNumber(tick)}</span>)}
      </div>
      <svg className="journal-pnl-bars" viewBox="0 0 100 100" preserveAspectRatio="none" role="img"
        onPointerMove={(event) => { if (event.pointerType === 'mouse') selectAtPointer(event); }}
        onClick={selectAtPointer}
        aria-label={t("Grafik {0} {1} {2}", t(chartTypes[type]).toLowerCase(), t(sources[source].label).toLowerCase(), currency)}>
        {ticks.filter((tick) => tick !== 0).map((tick) => (
          <line key={tick} className="journal-pnl-gridline" x1="0" x2="100" y1={y(tick)} y2={y(tick)} vectorEffect="non-scaling-stroke" />
        ))}
        <line className="journal-pnl-baseline" x1="0" x2="100" y1={baseline} y2={baseline} vectorEffect="non-scaling-stroke" />
        {type === 'bar' ? plotted.map((point) => (
          point.value === 0 ? (
            <line key={point.key} className="journal-pnl-flat" x1={point.x - barWidth / 2} x2={point.x + barWidth / 2}
              y1={baseline} y2={baseline} vectorEffect="non-scaling-stroke" />
          ) : (
            <rect key={point.key} className={isWallet ? 'journal-pnl-value' : point.value > 0 ? 'journal-pnl-up' : 'journal-pnl-down'}
              x={point.x - barWidth / 2} y={Math.min(baseline, point.y)} width={barWidth} height={Math.abs(baseline - point.y)} />
          )
        )) : (
          <>
            {type === 'area' && <path className="journal-pnl-area" d={area} />}
            <path className="journal-pnl-line" d={path} vectorEffect="non-scaling-stroke" />
            {plotted.length <= 50 && plotted.map((point) => (
              <line key={point.key} className="journal-pnl-point" x1={point.x} x2={point.x + 0.01} y1={point.y} y2={point.y}
                vectorEffect="non-scaling-stroke" />
            ))}
          </>
        )}
        <line className="journal-pnl-cursor" x1={point.x} x2={point.x} y1="0" y2="100" vectorEffect="non-scaling-stroke" />
        <line className="journal-pnl-cursor-dot" x1={point.x} x2={point.x + 0.01} y1={point.y} y2={point.y} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className={`journal-pnl-axis-x${labels.length === 1 ? ' journal-pnl-axis-x--single' : ''}`} aria-hidden="true">
        {labels.map((point) => (
          <time key={point.key} dateTime={point.date}>{(isWallet ? walletAxisFormat : axisDateFormat).format(point.time)}</time>
        ))}
      </div>
      <div className="journal-chart-inspector">
        <strong className={isWallet ? undefined : point.value > 0 ? 'trend--up' : point.value < 0 ? 'trend--down' : undefined}>{amount}</strong>
        <span><time dateTime={point.date}>{dateLabel}</time> · {description}</span>
        {plotted.length > 1 && <input type="range" min={0} max={plotted.length - 1} step={1} value={index}
          aria-label={t("Pilih titik data grafik")} aria-valuetext={dateLabel + ' · ' + amount + ' · ' + description}
          onChange={(event) => setSelection(event.target.valueAsNumber)} />}
      </div>
    </div>
  );
}

function chartPoints(days, history, source, isWallet) {
  if (isWallet) {
    return history.map((movement) => {
      const value = movement[source] / 100;
      return {
        key: movement.id, date: new Date(movement.at).toISOString(), time: movement.at, value,
        kind: movement.kind, symbol: movement.symbol, cashDelta: movement.cashDelta,
        availableCents: movement.availableCents,
      };
    });
  }

  let total = 0;
  return days.map(({ date, count, pnl }) => {
    total += pnl;
    const value = source === 'cumulative' ? total : pnl;
    return { key: date, date, time: Date.parse(date), value, count };
  });
}

export default function JournalCharts({ series, preferredCurrency, walletHistory, ready, readError }) {
  const { t } = useTranslation();
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
  const points = useMemo(() => chartPoints(selected?.daily ?? [], walletHistory, source, isWallet),
    [selected, walletHistory, source, isWallet]);
  const detailsLabel = t('Rincian {0} {1}', t(sources[source].label), currency ?? '');
  const showAvailable = source === 'equityCents';

  return (
    <section id="journal-charts" className="journal-section journal-charts" aria-labelledby="journal-chart-title">
      <div>
        <h3 id="journal-chart-title" tabIndex={-1}>{t("Grafik jurnal")}{currency ? ` (${currency})` : ''}</h3>
        <p className="journal-help">{t(sources[source].detail)}</p>
      </div>
      <div className="journal-chart-controls">
        <label>{t("Data grafik")}<select value={source} disabled={!ready} onChange={(event) => { setSource(event.target.value); setType(null); }}>
            {Object.entries(sources).map(([key, { label }]) => <option key={key} value={key}>{t(label)}</option>)}
          </select>
        </label>
        <label>{t("Tipe grafik")}<select value={type} disabled={!ready} onChange={(event) => setType(event.target.value)}>
            {Object.entries(chartTypes).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
          </select>
        </label>
        {!isWallet && series.length > 1 && (
          <label>{t("Mata uang grafik")}<select value={currency} onChange={(event) => setCurrency(event.target.value)}>
              {series.map((item) => <option key={item.currency} value={item.currency}>{item.currency}</option>)}
            </select>
          </label>
        )}
      </div>
      {!ready ? (
        <div aria-busy={!readError}>
          {!readError && <div className="journal-chart-placeholder" aria-hidden="true" />}
          <p className="journal-help" role="status">{readError ? t("Grafik jurnal gagal dimuat.") : t("Memuat grafik jurnal…")}</p>
        </div>
      ) : points.length > 0 ? (
        <>
          <ChartPlot key={source + currency} points={points} currency={currency} source={source} type={type} isWallet={isWallet} />
          <details className="journal-pnl-days">
            <summary>{isWallet ? t("Lihat nilai per aktivitas") : t("Lihat nilai per tanggal")}</summary>
            <TableScroll className="journal-table-wrap" label={detailsLabel}>
              <table className="fund-table" aria-label={detailsLabel}>
                <thead>
                  <tr>
                    <th scope="col">{isWallet ? t("Waktu") : t("Tanggal")}</th>
                    <th scope="col">{isWallet ? t("Aktivitas") : t("Posisi")}</th>
                    {isWallet && <th scope="col" className="num">{t("Perubahan saldo")}</th>}
                    <th scope="col" className="num">{t(sources[source].label)}</th>
                    {showAvailable && <th scope="col" className="num">{t("Saldo tersedia")}</th>}
                  </tr>
                </thead>
                <tbody>
                  {[...points].reverse().map((point) => (
                    <tr key={point.key}>
                      <th scope="row"><time dateTime={point.date}>{pointLabel(point, isWallet)}</time></th>
                      <td>{isWallet ? t(walletMovementLabels[point.kind]) + (point.symbol ? ' ' + point.symbol : '') : point.count}</td>
                      {isWallet && <td className="num">{formatPnl(point.cashDelta / 100, currency)}</td>}
                      <td className="num">{isWallet ? formatPrice(point.value, currency) : formatPnl(point.value, currency)}</td>
                      {showAvailable && <td className="num">{formatPrice(point.availableCents / 100, currency)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </details>
        </>
      ) : <p className="journal-help">{isWallet ? t("Belum ada aktivitas wallet.") : t("Belum ada PnL bertanggal untuk ditampilkan.")}</p>}
      {!isWallet && selected?.undatedCount > 0 && (
        <p className="journal-help">{t("Tanggal penutupan belum tersedia untuk")} {selected.undatedCount} {t("posisi dengan PnL")} {currency}.</p>
      )}
    </section>
  );
}
