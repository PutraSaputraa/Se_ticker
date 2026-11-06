const axisDateFormat = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
});
const candleDirections = { 1: 'up', 0: 'flat', '-1': 'down' };

export default function CandlestickChart({ sessions, formatPrice, formatDate }) {
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

  return (
    <section className="candle-chart" aria-labelledby="candle-title">
      <h3 id="candle-title">Grafik candlestick</h3>
      <p>{sessions.length} sesi perdagangan hingga {formatDate(latest.date)}.</p>
      <div className="candle-grid">
        <div className="candle-axis-y" aria-hidden="true">
          {[ceiling, (ceiling + floor) / 2, floor].map((price) => (
            <span key={price}>{formatPrice(price)}</span>
          ))}
        </div>
        <svg
          className="candle-plot"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Grafik OHLC ${sessions.length} sesi. Harga tutup terakhir ${formatPrice(latest.close)}.`}
        >
          <path className="candle-guide" d="M0 0H100 M0 50H100 M0 100H100" vectorEffect="non-scaling-stroke" />
          {sessions.map(({ date, open, high, low, close }, index) => {
            const x = (index + 0.5) * step;
            const direction = candleDirections[Math.sign(close - open)];
            const detail = `${formatDate(date)} · Buka ${formatPrice(open)} · Tertinggi ${formatPrice(high)} · Terendah ${formatPrice(low)} · Tutup ${formatPrice(close)}`;
            return (
              <g className={`candle candle--${direction}`} key={date}>
                <title>{detail}</title>
                <rect x={index * step} y="0" width={step} height="100" fill="transparent" />
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
    </section>
  );
}
