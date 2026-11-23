import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  consolidationPrice,
  consolidationSessionLabel,
  consolidationTimeframes,
  positionFormat,
  readConsolidationCloses,
} from '../consolidationView.js';
import useTranslation from '../useTranslation.js';
import {
  ConsolidationHelp, ConsolidationZones, LocationBadge, SessionTime,
  consolidationDuration, consolidationExplanation, pricePositionText,
} from './ConsolidationInfo.jsx';

const plotStart = 1.5;
const plotEnd = 98.5;

function chartGeometry(closes, zones, reference) {
  const prices = [reference, ...zones.flatMap(zone => [zone.low, zone.high]), ...closes.map(([, close]) => close)];
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const padding = (high - low) * 0.1 || low * 0.02;
  const floor = Math.max(low - padding, low / 2);
  const ceiling = high + padding;
  const x = index => plotStart + index / (closes.length - 1) * (plotEnd - plotStart);
  const y = price => 100 * (ceiling - price) / (ceiling - floor);
  const ticks = [ceiling, (ceiling + floor) / 2, floor];
  const points = closes.map(([, close], index) => x(index) + ',' + y(close)).join(' ');
  return { x, y, ticks, points };
}

function ChartZone({ zone, tone, y }) {
  if (zone.low === zone.high) {
    return <line className="consolidation-chart-zone-edge" data-zone={tone} x1="0" x2="100"
      y1={y(zone.low)} y2={y(zone.low)} vectorEffect="non-scaling-stroke" />;
  }
  return <rect className="consolidation-chart-zone" data-zone={tone} x="0" width="100"
    y={y(zone.high)} height={y(zone.low) - y(zone.high)} />;
}

function ConsolidationChart({ pick, closes, timeframe, hasZones }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(null);
  const lastIndex = closes.length - 1;
  const activeIndex = selected ?? lastIndex;
  const [activeDate, activeClose] = closes[activeIndex];
  const activeLabel = consolidationSessionLabel(activeDate, timeframe);
  const activePrice = consolidationPrice(activeClose, pick.currency);
  const { x, y, ticks, points } = useMemo(
    () => chartGeometry(closes, hasZones ? [pick.support, pick.resistance] : [], pick.close), [closes, hasZones, pick],
  );

  function inspectPointer(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width) return;
    const position = (event.clientX - bounds.left) / bounds.width * 100;
    const index = Math.round((position - plotStart) / (plotEnd - plotStart) * lastIndex);
    setSelected(Math.min(lastIndex, Math.max(0, index)));
  }

  return (
    <div className="consolidation-chart">
      <div className="consolidation-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img"
          aria-label={t('Grafik penutupan {0}', pick.symbol)}
          onPointerMove={event => { if (event.pointerType === 'mouse') inspectPointer(event); }}
          onClick={inspectPointer}>
          {ticks.map(price => <line key={price} x1="0" x2="100" y1={y(price)} y2={y(price)}
            className="consolidation-chart-gridline" vectorEffect="non-scaling-stroke" />)}
          {hasZones && <>
            <ChartZone zone={pick.support} y={y} tone="support" />
            <ChartZone zone={pick.resistance} y={y} tone="resistance" />
          </>}
          <line x1="0" x2="100" y1={y(pick.close)} y2={y(pick.close)}
            className="consolidation-chart-reference" vectorEffect="non-scaling-stroke" />
          <polyline points={points} className="consolidation-chart-line" vectorEffect="non-scaling-stroke" />
          <line className="consolidation-chart-cursor" x1={x(activeIndex)} x2={x(activeIndex)}
            y1="0" y2="100" vectorEffect="non-scaling-stroke" />
          <line className="consolidation-chart-point" x1={x(activeIndex)} x2={x(activeIndex) + 0.001}
            y1={y(activeClose)} y2={y(activeClose)} vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="consolidation-axis-y" aria-hidden="true">
          {ticks.map(price => <span key={price}>{consolidationPrice(price, pick.currency)}</span>)}
        </div>
        <div className="consolidation-axis-x" aria-hidden="true">
          <SessionTime date={closes[0][0]} timeframe={timeframe} compact />
          <SessionTime date={pick.date} timeframe={timeframe} compact />
        </div>
      </div>
      <ul className="consolidation-chart-legend">
        <li data-series="close">{t('Harga tutup')}</li>
        <li data-series="reference">{t('Harga tutup acuan')}</li>
        {hasZones && <>
          <li data-series="support">{t('Zona support')}</li>
          <li data-series="resistance">{t('Zona resistance')}</li>
        </>}
      </ul>
      <div className="consolidation-chart-reading">
        <span><time dateTime={activeDate}>{activeLabel}</time>{activeIndex === lastIndex && <small>{t('Sesi acuan')}</small>}</span>
        <strong>{activePrice}</strong>
        <input type="range" min="0" max={lastIndex} step="1" value={activeIndex}
          aria-label={t('Jelajahi harga penutupan')} aria-valuetext={t('{0}, harga tutup {1}', activeLabel, activePrice)}
          onChange={event => setSelected(event.target.valueAsNumber)} />
      </div>
    </div>
  );
}

export default function ConsolidationAnalysis({ row, timeframe, onClose }) {
  const { t } = useTranslation();
  const { pick, position } = row;
  const dialog = useRef(null);
  const titleId = useId();
  const chartId = useId();
  const closes = useMemo(() => readConsolidationCloses(pick, timeframe), [pick, timeframe]);
  const duration = consolidationDuration(pick, timeframe, t);
  const inside = Number.isFinite(pick.insideRatio) && pick.insideRatio >= 0 && pick.insideRatio <= 1
    ? t('{0}%', positionFormat.format(pick.insideRatio * 100)) : null;

  useEffect(() => {
    if (!dialog.current.open) dialog.current.showModal();
  }, []);

  return (
    <dialog ref={dialog} className="consolidation-analysis" aria-labelledby={titleId} onClose={onClose}>
      <header className="consolidation-analysis-heading">
        <div>
          <h2 id={titleId}>{t('Analisis konsolidasi {0}', pick.symbol)}</h2>
          {pick.name && <p className="research-company">{pick.name}</p>}
        </div>
        <button type="button" className="research-watch" autoFocus onClick={() => dialog.current.close()}>{t('Tutup')}</button>
      </header>
      <div className="consolidation-analysis-body">
        <section className="consolidation-analysis-history" aria-labelledby={chartId}>
          <div className="consolidation-section-heading">
            <div>
              <h3 id={chartId}>{t('Riwayat penutupan')}</h3>
              {closes && <p className="consolidation-muted">
                {t('Periode analisis {0} sampai {1}', consolidationSessionLabel(closes[0][0], timeframe), consolidationSessionLabel(pick.date, timeframe))}
              </p>}
            </div>
            <ConsolidationHelp label="Istilah konsolidasi" topics={['consolidation', 'close', 'duration', 'reactions']} />
          </div>
          {closes ? <ConsolidationChart pick={pick} closes={closes} timeframe={timeframe} hasZones={position.pct != null} />
            : <p className="research-empty">{t('Riwayat harga belum tersedia untuk hasil ini. Pindai ulang untuk mendapatkan hasil baru beserta riwayatnya.')}</p>}
          <p className="consolidation-muted">{t('Hasil scan mencatat jumlah reaksi per zona. Titik reaksi individual belum tersedia.')}</p>
        </section>
        <section className="consolidation-analysis-facts" aria-label={t('Rincian konsolidasi')}>
          <h3>{t('Rincian konsolidasi')}</h3>
          <div className="consolidation-price">
            <span>{t('Harga tutup acuan')}</span>
            <strong>{consolidationPrice(pick.close, pick.currency)}</strong>
            <LocationBadge location={position.location} />
          </div>
          <dl className="consolidation-facts">
            <div><dt>{t('Bursa')}</dt><dd>{pick.universe ? t(pick.universe) : t('Tidak tersedia')}</dd></div>
            <div><dt>{t('Timeframe')}</dt><dd>{t(consolidationTimeframes[timeframe]) ?? t('Tidak tersedia')}</dd></div>
            <div><dt>{t('Sesi acuan')}</dt><dd><SessionTime date={pick.date} timeframe={timeframe} /></dd></div>
            <div><dt>{t('Durasi rentang')}</dt><dd>{duration}</dd></div>
            <div><dt>{t('Posisi harga')}</dt><dd>{pricePositionText(position, t)}</dd></div>
            <div><dt>{t('Penutupan dalam rentang')}</dt><dd>{inside ?? t('Tidak tersedia')}</dd></div>
          </dl>
          <ConsolidationZones pick={pick} />
          <p className="consolidation-explanation">{consolidationExplanation(position, t)}</p>
          <p className="consolidation-muted">{t('Hasil ini merangkum pola konsolidasi sampai sesi acuan. Konfirmasi breakout perlu evaluasi lanjutan setelah zona resistance ditembus.')}</p>
        </section>
      </div>
    </dialog>
  );
}
