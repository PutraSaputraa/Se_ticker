import { getLocale } from '../i18n.js';
import useTranslation from '../useTranslation.js';
import { useState } from 'react';
import { formatPct, formatPrice } from '../format.js';
import { getStage2Score } from '../stage2Score.js';

const statusMeta = {
  NOT_ELIGIBLE: { label: 'Belum memenuhi syarat', className: 'status--wait' },
  WATCHLIST: { label: 'Pantauan', className: 'status--wait' },
  VCP_FORMING: { label: 'VCP terbentuk', className: 'status--near' },
  PIVOT_READY: { label: 'Siap pivot', className: 'status--near' },
  BREAKOUT_TRIGGERED: { label: 'Breakout terpicu', className: 'status--breakout' },
  BREAKOUT_LOW_VOLUME: { label: 'Breakout volume rendah', className: 'status--near' },
};

const ruleFields = {
  'above-ma150-200': ['close', 'ma150', 'ma200'],
  'ma150-above-ma200': ['ma150', 'ma200'],
  'ma200-rising': ['ma200', 'ma200Prev'],
  'ma50-above': ['ma50', 'ma150', 'ma200'],
  'above-ma50': ['close', 'ma50'],
  'above-low52': ['aboveLow52Pct', 'low52'],
  'below-high52': ['belowHigh52Pct', 'high52'],
  'rs-rating': ['rsRating'],
};

const trendValueLabels = {
  close: 'Tutup', ma50: 'MA50', ma150: 'MA150', ma200: 'MA200', ma200Prev: 'MA200 pembanding',
  low52: 'Terendah 52 minggu', high52: 'Tertinggi 52 minggu',
  aboveLow52Pct: 'Jarak dari terendah', belowHigh52Pct: 'Jarak dari tertinggi', rsRating: 'RS Rating',
};

const ruleStatus = { pass: 'Lolos', fail: 'Gagal', missing: 'Belum tersedia' };

function formatTrendValue(field, value, currency) {
  if (field === 'rsRating') return value.toLocaleString(getLocale());
  if (field.endsWith('Pct')) return `${value.toLocaleString(getLocale(), { maximumFractionDigits: 2 })}%`;
  return formatPrice(value, currency);
}

function TrendCriteriaMeter({ passed, total }) {
  const { t } = useTranslation();
  const score = getStage2Score(passed, total);
  if (!score) return <span className="stock-rule-status">{t('Belum tersedia')}</span>;

  const { ratio, tone } = score;
  return (
    <div className={`stock-criteria-score stock-criteria-score--${tone}`}>
      <span className="stock-criteria-count">{passed}/{total} {t('kriteria lolos')}</span>
      <div className="stock-criteria-track" role="meter" aria-labelledby="stock-stage-title"
        aria-valuemin={0} aria-valuemax={total} aria-valuenow={passed}
        aria-valuetext={t('{0} dari {1} kriteria Stage 2 lolos', passed, total)}>
        <span className="stock-criteria-fill" style={{ transform: `scaleX(${ratio})` }} />
      </div>
    </div>
  );
}

function TrendRules({ trendTemplate, currency }) {
  const { t } = useTranslation();
  const { passed, total, rules = [], values = {} } = trendTemplate;
  return (
    <section className="stock-trend-module" aria-labelledby="stock-stage-title">
      <div className="stock-section-heading">
        <h3 id="stock-stage-title">{t("Tren Stage 2")}</h3>
        <TrendCriteriaMeter passed={passed} total={total} />
      </div>
      {rules.length > 0 ? (
        <ul className="stock-trend-rules">
          {rules.map((rule) => {
            const fields = ruleFields[rule.key] ?? [];
            const available = fields.filter((field) => Number.isFinite(values[field]));
            const status = rule.passed ? 'pass' : available.length < fields.length ? 'missing' : 'fail';
            const evidence = available.map((field) => `${t(trendValueLabels[field])} ${formatTrendValue(field, values[field], currency)}`).join(' · ');
            return (
              <li key={rule.key}>
                <div>
                  <strong>{t(rule.label)}</strong>
                  {evidence && <small>{evidence}</small>}
                </div>
                <span className={`stock-rule-status stock-rule-status--${status}`}>{t(ruleStatus[status])}</span>
              </li>
            );
          })}
        </ul>
      ) : <p className="stock-muted">{t("Rincian kriteria belum tersedia.")}</p>}
    </section>
  );
}

function VcpBlock({ vcp }) {
  const { t } = useTranslation();
  if (!vcp) return <p className="stock-muted">{t("Data VCP dan VDU belum tersedia.")}</p>;
  const depths = vcp.depths ?? [];
  return (
    <section className="stock-analysis-module" aria-labelledby="stock-vcp-title">
      <div className="stock-section-heading">
        <h3 id="stock-vcp-title">{t("Kontraksi dan volume")}</h3>
        <span className={`stock-rule-status${vcp.forming ? ' stock-rule-status--pass' : ''}`}>
          {vcp.forming ? t("VCP terbentuk") : t("VCP belum terbentuk")}
        </span>
      </div>
      {depths.length > 0 && (
        <ol className="stock-contractions" aria-label={t("Kedalaman kontraksi VCP")}>
          {depths.map((depth, i) => (
            <li key={i}>
              <span>{t("T")}{i + 1}</span>
              <strong>{depth.toLocaleString(getLocale())}%</strong>
              {vcp.ratios?.[i] != null && <span>{vcp.ratios[i].toLocaleString(getLocale())}×</span>}
            </li>
          ))}
        </ol>
      )}
      <dl className="stock-analysis-values">
        <div><dt>{t("Kontraksi")}</dt><dd>{vcp.contractionCount}</dd></div>
        <div>
          <dt>{t("Volume dry-up (VDU)")}</dt>
          <dd>{vcp.vdu == null ? t("Belum tersedia") : `${vcp.vdu.toLocaleString(getLocale())}× · ${t(vcp.vduStrong ? 'Kuat' : vcp.vduOk ? 'Cukup' : 'Lemah')}`}</dd>
        </div>
      </dl>
    </section>
  );
}

function PivotBlock({ pivot, currency }) {
  const { t } = useTranslation();
  if (!pivot) return <p className="stock-muted">{t("Data pivot belum tersedia.")}</p>;
  return (
    <section className="stock-analysis-module" aria-labelledby="stock-pivot-title">
      <div className="stock-section-heading">
        <h3 id="stock-pivot-title">{t("Pivot dan breakout")}</h3>
        <span className={`stock-rule-status${pivot.breakout ? ' stock-rule-status--pass' : ''}`}>
          {pivot.pivot == null ? t("Belum tersedia") : pivot.breakout ? t("Breakout") : t("Belum menembus")}
        </span>
      </div>
      <dl className="stock-analysis-values">
        <div><dt>{t("Pivot")}</dt><dd>{formatPrice(pivot.pivot, currency)}</dd></div>
        <div>
          <dt>{t("Jarak dari pivot (extension)")}</dt>
          <dd>{pivot.extension == null ? t("Belum tersedia") : `${formatPct(pivot.extension)} · ${t(pivot.chaseOk ? 'Dalam batas' : 'Di atas batas')}`}</dd>
        </div>
        <div>
          <dt>{t("Volume relatif (RVOL)")}</dt>
          <dd>{pivot.rvol == null ? t("Belum tersedia") : `${pivot.rvol.toLocaleString(getLocale())}× · ${t(pivot.rvolOk ? 'Memenuhi ambang' : 'Di bawah ambang')}`}</dd>
        </div>
      </dl>
    </section>
  );
}

function RiskCalculator({ entry, stop, currency }) {
  const { t } = useTranslation();
  const [equityInput, setEquityInput] = useState('100000000');
  const [riskPctInput, setRiskPctInput] = useState('1.25');

  const equity = Number(equityInput.replace(/[^\d]/g, '')) || 0;
  const riskPct = Number(riskPctInput.replace(',', '.')) || 0;
  const riskPerShare = Number.isFinite(entry) && Number.isFinite(stop) ? entry - stop : 0;
  const riskCapital = equity * (riskPct / 100);
  const shares = riskPerShare > 0 ? Math.floor(riskCapital / riskPerShare) : 0;
  const lots = Math.floor(shares / 100);
  const positionValue = lots * 100 * (Number.isFinite(entry) ? entry : 0);
  const allocation = equity > 0 ? (positionValue / equity) * 100 : 0;
  const stopDistance = Number.isFinite(entry) && entry > 0 ? (riskPerShare / entry) * 100 : 0;

  if (!Number.isFinite(entry) || !Number.isFinite(stop) || riskPerShare <= 0) {
    return (
      <section className="stock-analysis-module stock-risk-module" aria-labelledby="stock-risk-title">
        <h3 id="stock-risk-title">{t("Kalkulator risiko")}</h3>
        <p className="stock-muted">{t("Perhitungan memerlukan level entry di atas stop loss.")}</p>
      </section>
    );
  }

  return (
    <section className="stock-analysis-module stock-risk-module" aria-labelledby="stock-risk-title">
      <h3 id="stock-risk-title">{t("Kalkulator risiko")}</h3>
      <div className="stock-risk-grid">
        <div>
          <p className="stock-muted">{t("Simulasi long, 100 saham per lot, sebelum biaya dan slippage.")}</p>
          {currency && currency !== 'IDR' && <p className="stock-risk-currency">{t("Harga saham dalam")} {currency}{t(". Kalkulator memakai satuan rupiah.")}</p>}
          <div className="stock-risk-inputs">
            <label>{t("Modal (Rp)")}<input type="text" inputMode="numeric" value={equityInput} onChange={(e) => setEquityInput(e.target.value)} />
            </label>
            <label>{t("Risiko per trade (%)")}<input type="text" inputMode="decimal" value={riskPctInput} onChange={(e) => setRiskPctInput(e.target.value)} />
            </label>
          </div>
        </div>
        <dl className="stock-analysis-values">
          <div><dt>{t("Maks. pembelian")}</dt><dd><strong>{lots.toLocaleString(getLocale())} {t("lot")}</strong></dd></div>
          <div><dt>{t("Nilai posisi")}</dt><dd>{formatPrice(positionValue, 'IDR')}</dd></div>
          <div><dt>{t("Risiko rencana")}</dt><dd>{formatPrice(lots * 100 * riskPerShare, 'IDR')}</dd></div>
          <div><dt>{t("Alokasi modal")}</dt><dd>{formatPct(allocation)}</dd></div>
          <div><dt>{t("Jarak stop")}</dt><dd>{formatPct(stopDistance)}</dd></div>
        </dl>
      </div>
    </section>
  );
}

export default function MinerviniPanel({ analysis, currency }) {
  const { t } = useTranslation();
  if (!analysis) return null;
  const { status, trendTemplate, vcp, pivot, rs } = analysis;
  const meta = statusMeta[status] ?? statusMeta.WATCHLIST;

  return (
    <section className="stock-data-section stock-minervini motion-enter" aria-labelledby="minervini-title">
      <div className="stock-section-heading">
        <h2 id="minervini-title">{t("Analisis Minervini")}</h2>
        <span className={`detail-status ${meta.className}`}>{t(meta.label)}</span>
      </div>
      {rs?.rating != null && (
        <p className="stock-muted">{t("RS Rating")} <strong>{rs.rating}</strong> {t("· Return 12 bulan")} {formatPct(rs.return12m)} {t("dibanding")} {rs.sample} {t("saham")}</p>
      )}
      <div className="stock-minervini-grid">
        {trendTemplate && <TrendRules trendTemplate={trendTemplate} currency={currency} />}
        <div className="stock-analysis-stack">
          <VcpBlock vcp={vcp} />
          <PivotBlock pivot={pivot} currency={currency} />
        </div>
        <RiskCalculator entry={analysis.close} stop={analysis.stop ?? pivot?.pivot} currency={currency} />
      </div>
    </section>
  );
}
