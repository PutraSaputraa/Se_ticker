import { localizedDateFormat } from './i18n.js';
import useTranslation from './useTranslation.js';
import { useEffect, useId, useRef, useState } from 'react';
import { formatCompactNumber, formatDateCompact } from './format.js';

const axisDateFormat = localizedDateFormat({
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
});

const defaultRanges = [
  { value: '1d', label: 'Harian' },
  { value: '1wk', label: 'Mingguan' },
];

function CandleReadout({ id, session, active, isReference, referenceLabel, averages, formatDate, formatPrice, formatVolume }) {
  const { t } = useTranslation();
  return (
    <div className={active ? 'candle-readout candle-tooltip' : 'candle-readout'} id={id} role={active ? 'tooltip' : undefined}>
      <div className="candle-readout-date">
        <time dateTime={session.date}>{formatDate(session.date)}</time>
        {isReference && <span>{t(referenceLabel)}</span>}
      </div>
      <dl>
        <div><dt>{t("Buka")}</dt><dd>{formatPrice(session.open)}</dd></div>
        <div><dt>{t("Tertinggi")}</dt><dd>{formatPrice(session.high)}</dd></div>
        <div><dt>{t("Terendah")}</dt><dd>{formatPrice(session.low)}</dd></div>
        <div><dt>{t("Tutup")}</dt><dd>{formatPrice(session.close)}</dd></div>
        <div><dt>{t("Volume")}</dt><dd>{formatVolume(session.volume)}</dd></div>
        {averages.map(({ kind, label, value }) => <div key={kind}><dt>{label}</dt><dd>{formatPrice(value)}</dd></div>)}
      </dl>
    </div>
  );
}

function ChartHeader({ id, count, timeframe, selectedRange, ranges, onTimeframeChange, latestDate, loading, error, onRetry }) {
  const { t } = useTranslation();
  const isWeekly = ['1wk', '1y', '2y'].includes(timeframe);
  const loadedRange = t(ranges.find(({ value }) => value === timeframe)?.label);
  const requestedRange = t(ranges.find(({ value }) => value === selectedRange)?.label);
  return (
    <>
      <div className="candle-chart-head">
        <div>
          <h2 id={id}>{t("Grafik harga")}</h2>
          {latestDate && (
            <p className="stock-muted">
              {loadedRange && `${loadedRange} · `}{count} {t("candle")} {isWeekly ? t("mingguan") : t("harian")} {t("hingga")}{' '}
              <time dateTime={latestDate}>{formatDateCompact(latestDate)}</time>
            </p>
          )}
        </div>
        {typeof onTimeframeChange === 'function' && (
          <div className="candle-timeframe stock-chart-ranges" role="group" aria-label={t("Rentang waktu grafik")}>
            {ranges.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`candle-timeframe-btn${selectedRange === value ? ' candle-timeframe-btn--active' : ''}`}
                onClick={() => onTimeframeChange(value)}
                aria-pressed={selectedRange === value}
              >
                {t(label)}
              </button>
            ))}
          </div>
        )}
      </div>
      {loading && (
        <div className="candle-request-status candle-request-status--loading" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>{t("Memuat grafik")}{requestedRange ? ` ${requestedRange}` : ''}…</span>
        </div>
      )}
      {error && (
        <div className="candle-request-status candle-request-status--error" role="alert">
          <span>{t("Grafik")}{requestedRange ? ` ${requestedRange}` : ''} {t("gagal dimuat.")} {t(error)}</span>
          {onRetry && <button className="watch-toggle" type="button" onClick={onRetry}>{t("Coba lagi")}</button>}
        </div>
      )}
    </>
  );
}

export default function CandlestickChart({
  sessions, referenceDate, buyLevel, sellLevel, averageVolume, formatPrice, formatDate, formatVolume,
  timeframe = '1d', selectedRange = timeframe, onTimeframeChange, ranges, loading, error, onRetry,
  trendLines = [], movingAverages = [], referenceLabel = 'Sesi acuan', highlightHistoricalReference = false, markReference = false,
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const readoutId = useId();
  const plotRef = useRef(null);
  const [selection, setSelection] = useState(null);
  const activeIndex = selection?.sessions === sessions ? selection.index : null;
  const tooltipOpen = activeIndex !== null;

  useEffect(() => {
    if (!tooltipOpen) return;
    const dismissOutside = (event) => {
      if (!plotRef.current?.contains(event.target)) setSelection(null);
    };
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [tooltipOpen]);

  const latest = sessions.at(-1);
  const header = (
    <ChartHeader
      id={titleId}
      count={sessions.length}
      timeframe={timeframe}
      selectedRange={selectedRange}
      ranges={ranges?.length ? ranges : defaultRanges}
      onTimeframeChange={onTimeframeChange}
      latestDate={latest?.date}
      loading={loading}
      error={error}
      onRetry={onRetry}
    />
  );

  if (!latest) {
    return (
      <section className="candle-chart candle-chart--empty" aria-labelledby={titleId}>
        {header}
        {!loading && !error && <p className="stock-muted">{t("Riwayat harga belum tersedia.")}</p>}
      </section>
    );
  }

  const trends = trendLines.filter(({ from, to, start, end }) =>
    Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to > from && to < sessions.length
    && Number.isFinite(start) && Number.isFinite(end));
  const overlayPrices = [
    ...trends.flatMap(({ start, end }) => [start, end]),
    ...movingAverages.flatMap(({ values }) => values.filter(Number.isFinite)),
  ];
  const high = Math.max(...sessions.map(({ high, close }) => high ?? close).filter(Number.isFinite), ...overlayPrices);
  const low = Math.min(...sessions.map(({ low, close }) => low ?? close).filter(Number.isFinite), ...overlayPrices);
  const padding = (high - low) * 0.08 || Math.max(Math.abs(high) * 0.01, 0.01);
  const ceiling = high + padding;
  const floor = low >= 0 ? Math.max(0, low - padding) : low - padding;
  const y = (price) => 100 * (ceiling - price) / (ceiling - floor);
  const step = 100 / sessions.length;
  const bodyWidth = Math.min(7, step * 0.56);
  const candleCenter = (index) => (index + 0.5) * step;
  const dateTicks = new Set([0, Math.floor((sessions.length - 1) / 2), sessions.length - 1]);
  const triggers = [
    { label: 'Buy Trigger', type: 'buy', level: buyLevel },
    { label: 'Sell Trigger', type: 'sell', level: sellLevel },
  ].filter(({ level }) => Number.isFinite(level));
  const isOnScale = (level) => level >= floor && level <= ceiling;
  const hasAverage = Number.isFinite(averageVolume);
  const maxVolume = Math.max(...sessions.map(({ volume }) => volume ?? 0), hasAverage ? averageVolume : 0) || 1;
  const volumeY = (volume) => 100 * (1 - volume / (maxVolume * 1.06));
  const inspectedIndex = activeIndex ?? sessions.length - 1;
  const inspected = sessions[inspectedIndex];
  const referenceIndex = highlightHistoricalReference
    ? sessions.findIndex(({ date }) => date === referenceDate)
    : latest.date === referenceDate ? sessions.length - 1 : -1;
  const hasReferenceMarker = markReference && referenceIndex >= 0;

  function inspectPointer(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width === 0) return;
    const slot = Math.floor((event.clientX - bounds.left) * sessions.length / bounds.width);
    const index = Math.max(0, Math.min(sessions.length - 1, slot));
    setSelection({ sessions, index });
  }

  function inspectKey(event) {
    if (event.key === 'Escape') {
      setSelection(null);
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const shift = event.key === 'ArrowLeft' ? -1 : 1;
    const index = tooltipOpen
      ? Math.max(0, Math.min(sessions.length - 1, activeIndex + shift))
      : sessions.length - 1;
    setSelection({ sessions, index });
  }

  return (
    <section className="candle-chart" aria-labelledby={titleId}>
      {header}
      <div className="candle-grid" aria-busy={loading}>
        <div className="candle-axis-y" aria-hidden="true">
          {[ceiling, (ceiling + floor) / 2, floor].map((price) => (
            <span key={price}>{formatPrice(price)}</span>
          ))}
        </div>
        <div
          className="candle-price"
          ref={plotRef}
          tabIndex={0}
          role="group"
          aria-label={t("Grafik harga. Gunakan panah kiri atau kanan untuk melihat data sesi.")}
          aria-describedby={tooltipOpen ? readoutId : undefined}
          onPointerMove={(event) => {
            if (event.pointerType !== 'touch') inspectPointer(event);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== 'touch') setSelection(null);
          }}
          onClick={inspectPointer}
          onKeyDown={inspectKey}
          onBlur={() => setSelection(null)}
        >
          <svg
            className="candle-plot"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="img"
            aria-label={t("Grafik OHLC {0} candle. Harga tutup terakhir {1}.", sessions.length, formatPrice(latest.close))}
          >
            {referenceIndex >= 0 && (
              <rect className="candle-reference" x={referenceIndex * step} y="0" width={step} height="100" />
            )}
            <path className="candle-guide" d="M0 0H100 M0 25H100 M0 50H100 M0 75H100 M0 100H100" vectorEffect="non-scaling-stroke" />
            {hasReferenceMarker && (
              <line className="candle-reference-marker" x1={candleCenter(referenceIndex)} x2={candleCenter(referenceIndex)}
                y1="0" y2="100" vectorEffect="non-scaling-stroke" />
            )}
            {triggers.filter(({ level }) => isOnScale(level)).map(({ type, level }) => (
              <line
                className={`candle-trigger candle-trigger--${type}`}
                key={type}
                x1="0" x2="100" y1={y(level)} y2={y(level)}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {sessions.map(({ date, open, high, low, close }, index) => {
              if (![open, high, low, close].every(Number.isFinite)) return null;
              const x = candleCenter(index);
              const direction = close >= open ? 'up' : 'down';
              return (
                <g className={`candle candle--${direction}`} key={date}>
                  <line x1={x} y1={y(high)} x2={x} y2={y(low)} vectorEffect="non-scaling-stroke" />
                  <rect
                    className="candle-body"
                    x={x - bodyWidth / 2}
                    y={y(Math.max(open, close))}
                    width={bodyWidth}
                    height={Math.max(0.6, Math.abs(y(open) - y(close)))}
                  />
                </g>
              );
            })}
            {trends.map(({ kind, from, to, start, end }) => (
              <line className={'candle-trend candle-trend--' + kind} key={kind}
                x1={candleCenter(from)} x2={candleCenter(to)} y1={y(start)} y2={y(end)} vectorEffect="non-scaling-stroke" />
            ))}
            {movingAverages.map(({ kind, values }) => {
              const path = values.map((value, index) => {
                if (!Number.isFinite(value)) return '';
                const command = Number.isFinite(values[index - 1]) ? 'L' : 'M';
                return `${command}${candleCenter(index)} ${y(value)}`;
              }).join(' ');
              return <path key={kind} className={`candle-average-line candle-average-line--${kind}`} d={path}
                fill="none" vectorEffect="non-scaling-stroke" />;
            })}
            {tooltipOpen && !(hasReferenceMarker && activeIndex === referenceIndex) && (
              <line className="candle-crosshair" x1={candleCenter(activeIndex)} x2={candleCenter(activeIndex)} y1="0" y2="100" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
        </div>
        <div className="candle-volume-axis" aria-hidden="true">
          <span>{t("Volume")}</span>
          <span>{formatCompactNumber(maxVolume)}</span>
        </div>
        <svg
          className="candle-plot candle-volume"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={hasAverage ? t("Volume per candle. Rata-rata 50 sesi {0}.", formatVolume(averageVolume)) : t("Volume per candle.")}
        >
          <path className="candle-guide" d="M0 0H100 M0 100H100" vectorEffect="non-scaling-stroke" />
          {sessions.map(({ date, open, close, volume }, index) => {
            if (!Number.isFinite(volume)) return null;
            const top = volumeY(volume);
            const direction = close >= open ? 'up' : 'down';
            return (
              <rect
                className={`candle-volume-bar candle--${direction}`}
                key={date}
                x={candleCenter(index) - bodyWidth / 2}
                y={top}
                width={bodyWidth}
                height={100 - top}
              />
            );
          })}
          {hasAverage && (
            <line
              className="candle-volume-average"
              x1="0" x2="100" y1={volumeY(averageVolume)} y2={volumeY(averageVolume)}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {tooltipOpen && (
            <line className="candle-crosshair" x1={candleCenter(activeIndex)} x2={candleCenter(activeIndex)} y1="0" y2="100" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        <div className="candle-axis-x" aria-hidden="true">
          {[...dateTicks].map((index) => {
            const { date } = sessions[index];
            return (
              <time key={date} dateTime={date}>
                {axisDateFormat.format(new Date(`${date}T00:00:00Z`))}
              </time>
            );
          })}
        </div>
      </div>
      {(triggers.length > 0 || trends.length > 0 || movingAverages.length > 0 || hasAverage || hasReferenceMarker) && (
        <ul className="candle-legend" aria-label={t("Legenda grafik")}>
          {triggers.map(({ type, label, level }) => (
            <li className={`candle-legend--${type}`} key={type}>
              {t(label)} <strong>{formatPrice(level)}</strong>{!isOnScale(level) && t(" · di luar skala")}
            </li>
          ))}
          {trends.map(({ kind, label }) => <li className={'candle-legend--' + kind} key={kind}>{t(label)}</li>)}
          {movingAverages.map(({ kind, label }) => <li className={`candle-legend--ma-${kind}`} key={kind}>{label}</li>)}
          {hasReferenceMarker && <li className="candle-legend--reference">{t(referenceLabel)}</li>}
          {hasAverage && <li className="candle-legend--average">{t("Volume rata-rata 50 sesi")}</li>}
        </ul>
      )}
      <CandleReadout
        id={readoutId}
        session={inspected}
        active={tooltipOpen}
        isReference={inspected.date === referenceDate}
        referenceLabel={referenceLabel}
        averages={movingAverages.map(({ kind, label, values }) => ({ kind, label, value: values[inspectedIndex] }))}
        formatPrice={formatPrice}
        formatDate={formatDate}
        formatVolume={formatVolume}
      />
    </section>
  );
}
