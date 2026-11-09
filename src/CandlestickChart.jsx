import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const axisDateFormat = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
});

function CandleTooltip({ session, point, isReference, formatDate, formatPrice, formatVolume }) {
  const tooltipRef = useRef(null);

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    const { clientWidth, clientHeight } = document.documentElement;
    const margin = 8;
    const gap = 8;
    const right = Math.max(point.x, point.candleRight) + gap;
    const left = Math.min(point.x, point.candleLeft) - gap;
    const rightSpace = clientWidth - margin - right;
    const leftSpace = left - margin;

    tooltip.style.setProperty('--tooltip-room', `${Math.max(leftSpace, rightSpace, 0)}px`);
    const { width, height } = tooltip.getBoundingClientRect();
    const onRight = rightSpace >= leftSpace || width <= rightSpace;
    const maxTop = Math.max(margin, clientHeight - height - margin);

    tooltip.style.left = `${onRight ? right : left - width}px`;
    tooltip.style.top = `${Math.min(maxTop, Math.max(margin, point.y - height / 2))}px`;
  }, [point, session]);

  return createPortal(
    <div className="candle-tooltip" id="candle-tooltip" role="tooltip" ref={tooltipRef}>
      <p><time dateTime={session.date}>{formatDate(session.date)}</time></p>
      {isReference && <small>Sesi acuan</small>}
      <dl>
        <div><dt>Open</dt><dd>{formatPrice(session.open)}</dd></div>
        <div><dt>High</dt><dd>{formatPrice(session.high)}</dd></div>
        <div><dt>Low</dt><dd>{formatPrice(session.low)}</dd></div>
        <div><dt>Close</dt><dd>{formatPrice(session.close)}</dd></div>
        <div><dt>Volume</dt><dd>{formatVolume(session.volume)}</dd></div>
      </dl>
    </div>,
    document.body,
  );
}

export default function CandlestickChart({
  sessions, referenceDate, buyLevel, sellLevel, averageVolume, formatPrice, formatDate, formatVolume,
  timeframe = '1d', onTimeframeChange,
}) {
  const plotRef = useRef(null);
  const [active, setActive] = useState(null);
  const tooltipOpen = active !== null;

  useEffect(() => {
    if (!tooltipOpen) return;
    const dismiss = () => setActive(null);
    const dismissOutside = (event) => {
      if (!plotRef.current?.contains(event.target)) dismiss();
    };
    document.addEventListener('pointerdown', dismissOutside);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [tooltipOpen]);

  const latest = sessions.at(-1);
  if (!latest) {
    return (
      <section className="candle-chart" aria-labelledby="candle-title">
        <h3 id="candle-title">Grafik candlestick</h3>
        <p>Riwayat harga belum tersedia.</p>
      </section>
    );
  }

  const high = Math.max(...sessions.map((session) => session.high));
  const low = Math.min(...sessions.map((session) => session.low));
  const padding = (high - low) * 0.08 || Math.max(Math.abs(high) * 0.01, 0.01);
  const ceiling = high + padding;
  const floor = low >= 0 ? Math.max(0, low - padding) : low - padding;
  const y = (price) => 100 * (ceiling - price) / (ceiling - floor);
  const step = 100 / sessions.length;
  const bodyWidth = Math.min(7, step * 0.56);
  const dateTicks = new Set([0, Math.floor((sessions.length - 1) / 2), sessions.length - 1]);
  const triggers = [
    { label: 'Buy', type: 'buy', level: buyLevel },
    { label: 'Sell', type: 'sell', level: sellLevel },
  ].filter(({ level }) => Number.isFinite(level) && level >= floor && level <= ceiling);
  const triggerMidpoint = triggers.length === 2 ? `${(y(buyLevel) + y(sellLevel)) / 2}%` : undefined;
  const hasAverage = Number.isFinite(averageVolume);
  const maxVolume = Math.max(...sessions.map(({ volume }) => volume ?? 0), hasAverage ? averageVolume : 0) || 1;
  const volumeY = (volume) => 100 * (1 - volume / (maxVolume * 1.06));

  function inspectSession(index, x, y, bounds) {
    const center = bounds.left + (index + 0.5) * step * bounds.width / 100;
    const halfBody = bodyWidth * bounds.width / 200;
    setActive({ index, x, y, candleLeft: center - halfBody, candleRight: center + halfBody });
  }

  function inspectPointer(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width === 0) return;
    const slot = Math.floor((event.clientX - bounds.left) * sessions.length / bounds.width);
    const index = Math.max(0, Math.min(sessions.length - 1, slot));
    inspectSession(index, event.clientX, event.clientY, bounds);
  }

  function inspectKey(event) {
    if (event.key === 'Escape') {
      setActive(null);
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const shift = event.key === 'ArrowLeft' ? -1 : 1;
    const index = active
      ? Math.max(0, Math.min(sessions.length - 1, active.index + shift))
      : sessions.length - 1;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = bounds.left + (index + 0.5) * step * bounds.width / 100;
    const cursorY = bounds.top + y(sessions[index].close) * bounds.height / 100;
    inspectSession(index, x, cursorY, bounds);
  }

  return (
    <section className="candle-chart" aria-labelledby="candle-title">
      <div className="candle-chart-head">
        <h3 id="candle-title">Grafik candlestick</h3>
        {typeof onTimeframeChange === 'function' && (
          <div className="candle-timeframe" role="group" aria-label="Rentang waktu grafik">
            {['1d', '1wk'].map((tf) => (
              <button
                key={tf}
                type="button"
                className={`candle-timeframe-btn${timeframe === tf ? ' candle-timeframe-btn--active' : ''}`}
                onClick={() => onTimeframeChange(tf)}
                aria-pressed={timeframe === tf}
              >
                {tf === '1d' ? 'Harian' : 'Mingguan'}
              </button>
            ))}
          </div>
        )}
      </div>
      <p>{sessions.length} {timeframe === '1wk' ? 'minggu' : 'sesi'} perdagangan hingga {formatDate(latest.date)}.</p>
      <div className="candle-grid">
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
          aria-label="Grafik harga. Gunakan panah kiri atau kanan untuk melihat data sesi."
          aria-describedby={tooltipOpen ? 'candle-tooltip' : undefined}
          onPointerMove={(event) => {
            if (event.pointerType !== 'touch') inspectPointer(event);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== 'touch') setActive(null);
          }}
          onClick={inspectPointer}
          onKeyDown={inspectKey}
          onBlur={() => setActive(null)}
        >
          <svg
            className="candle-plot"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="img"
            aria-label={`Grafik OHLC ${sessions.length} sesi. Harga tutup terakhir ${formatPrice(latest.close)}.`}
          >
            {latest.date === referenceDate && (
              <rect className="candle-reference" x={100 - step} y="0" width={step} height="100" />
            )}
            <path className="candle-guide" d="M0 0H100 M0 50H100 M0 100H100" vectorEffect="non-scaling-stroke" />
            {triggers.map(({ type, level }) => (
              <line
                className={`candle-trigger candle-trigger--${type}`}
                key={type}
                x1="0" x2="100" y1={y(level)} y2={y(level)}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {sessions.map(({ date, open, high, low, close }, index) => {
              const x = (index + 0.5) * step;
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
          </svg>
        </div>
        {triggers.length > 0 && (
          <div className="candle-trigger-labels" style={{ '--trigger-midpoint': triggerMidpoint }}>
            {triggers.map(({ label, type, level }) => (
              <span
                className={`candle-trigger-label candle-trigger-label--${type}`}
                style={{ '--level-y': `${y(level)}%` }}
                key={type}
              >
                {label} {formatPrice(level)}
              </span>
            ))}
          </div>
        )}
        <svg
          className="candle-plot candle-volume"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={hasAverage ? `Volume per sesi. Rata-rata 50 sesi ${formatVolume(averageVolume)}.` : 'Volume per sesi.'}
        >
          {sessions.map(({ date, open, close, volume }, index) => {
            if (!Number.isFinite(volume)) return null;
            const top = volumeY(volume);
            const direction = close >= open ? 'up' : 'down';
            return (
              <rect
                className={`candle-volume-bar candle--${direction}`}
                key={date}
                x={(index + 0.5) * step - bodyWidth / 2}
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
      {active && (
        <CandleTooltip
          session={sessions[active.index]}
          point={active}
          isReference={sessions[active.index].date === referenceDate}
          formatDate={formatDate}
          formatPrice={formatPrice}
          formatVolume={formatVolume}
        />
      )}
    </section>
  );
}
