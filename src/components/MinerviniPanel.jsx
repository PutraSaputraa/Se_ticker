import { useState } from 'react';
import { formatPct, formatPrice } from '../format.js';

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
  if (field === 'rsRating') return value.toLocaleString('id-ID');
  if (field.endsWith('Pct')) return `${value.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`;
  return formatPrice(value, currency);
}

function TrendRules({ trendTemplate, currency }) {
  const { passed, total, eligible, rules = [], values = {} } = trendTemplate;
  return (
    <section className="stock-trend-module" aria-labelledby="stock-stage-title">
      <div className="stock-section-heading">
        <h3 id="stock-stage-title">Tren Stage 2</h3>
        <span className={`stock-rule-status${eligible ? ' stock-rule-status--pass' : ''}`}>{passed}/{total} kriteria lolos</span>
      </div>
      {rules.length > 0 ? (
        <ul className="stock-trend-rules">
          {rules.map((rule) => {
            const fields = ruleFields[rule.key] ?? [];
            const available = fields.filter((field) => Number.isFinite(values[field]));
            const status = rule.passed ? 'pass' : available.length < fields.length ? 'missing' : 'fail';
            const evidence = available.map((field) => `${trendValueLabels[field]} ${formatTrendValue(field, values[field], currency)}`).join(' · ');
            return (
              <li key={rule.key}>
                <div>
                  <strong>{rule.label}</strong>
                  {evidence && <small>{evidence}</small>}
                </div>
                <span className={`stock-rule-status stock-rule-status--${status}`}>{ruleStatus[status]}</span>
              </li>
            );
          })}
        </ul>
      ) : <p className="stock-muted">Rincian kriteria belum tersedia.</p>}
    </section>
  );
}

function VcpBlock({ vcp }) {
  if (!vcp) return <p className="stock-muted">Data VCP dan VDU belum tersedia.</p>;
  const depths = vcp.depths ?? [];
  return (
    <section className="stock-analysis-module" aria-labelledby="stock-vcp-title">
      <div className="stock-section-heading">
        <h3 id="stock-vcp-title">Kontraksi dan volume</h3>
        <span className={`stock-rule-status${vcp.forming ? ' stock-rule-status--pass' : ''}`}>
          {vcp.forming ? 'VCP terbentuk' : 'VCP belum terbentuk'}
        </span>
      </div>
      {depths.length > 0 && (
        <ol className="stock-contractions" aria-label="Kedalaman kontraksi VCP">
          {depths.map((depth, i) => (
            <li key={i}>
              <span>T{i + 1}</span>
              <strong>{depth.toLocaleString('id-ID')}%</strong>
              {vcp.ratios?.[i] != null && <span>{vcp.ratios[i].toLocaleString('id-ID')}×</span>}
            </li>
          ))}
        </ol>
      )}
      <dl className="stock-analysis-values">
        <div><dt>Kontraksi</dt><dd>{vcp.contractionCount}</dd></div>
        <div>
          <dt>Volume dry-up (VDU)</dt>
          <dd>{vcp.vdu == null ? 'Belum tersedia' : `${vcp.vdu.toLocaleString('id-ID')}× · ${vcp.vduStrong ? 'Kuat' : vcp.vduOk ? 'Cukup' : 'Lemah'}`}</dd>
        </div>
      </dl>
    </section>
  );
}

function PivotBlock({ pivot, currency }) {
  if (!pivot) return <p className="stock-muted">Data pivot belum tersedia.</p>;
  return (
    <section className="stock-analysis-module" aria-labelledby="stock-pivot-title">
      <div className="stock-section-heading">
        <h3 id="stock-pivot-title">Pivot dan breakout</h3>
        <span className={`stock-rule-status${pivot.breakout ? ' stock-rule-status--pass' : ''}`}>
          {pivot.pivot == null ? 'Belum tersedia' : pivot.breakout ? 'Breakout' : 'Belum menembus'}
        </span>
      </div>
      <dl className="stock-analysis-values">
        <div><dt>Pivot</dt><dd>{formatPrice(pivot.pivot, currency)}</dd></div>
        <div>
          <dt>Jarak dari pivot (extension)</dt>
          <dd>{pivot.extension == null ? 'Belum tersedia' : `${formatPct(pivot.extension)} · ${pivot.chaseOk ? 'Dalam batas' : 'Di atas batas'}`}</dd>
        </div>
        <div>
          <dt>Volume relatif (RVOL)</dt>
          <dd>{pivot.rvol == null ? 'Belum tersedia' : `${pivot.rvol.toLocaleString('id-ID')}× · ${pivot.rvolOk ? 'Memenuhi ambang' : 'Di bawah ambang'}`}</dd>
        </div>
      </dl>
    </section>
  );
}

function RiskCalculator({ entry, stop, currency }) {
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
        <h3 id="stock-risk-title">Kalkulator risiko</h3>
        <p className="stock-muted">Perhitungan memerlukan level entry di atas stop loss.</p>
      </section>
    );
  }

  return (
    <section className="stock-analysis-module stock-risk-module" aria-labelledby="stock-risk-title">
      <h3 id="stock-risk-title">Kalkulator risiko</h3>
      <div className="stock-risk-grid">
        <div>
          <p className="stock-muted">Simulasi long, 100 saham per lot, sebelum biaya dan slippage.</p>
          {currency && currency !== 'IDR' && <p className="stock-risk-currency">Harga saham dalam {currency}. Kalkulator memakai satuan rupiah.</p>}
          <div className="stock-risk-inputs">
            <label>
              Modal (Rp)
              <input type="text" inputMode="numeric" value={equityInput} onChange={(e) => setEquityInput(e.target.value)} />
            </label>
            <label>
              Risiko per trade (%)
              <input type="text" inputMode="decimal" value={riskPctInput} onChange={(e) => setRiskPctInput(e.target.value)} />
            </label>
          </div>
        </div>
        <dl className="stock-analysis-values">
          <div><dt>Maks. pembelian</dt><dd><strong>{lots.toLocaleString('id-ID')} lot</strong></dd></div>
          <div><dt>Nilai posisi</dt><dd>{formatPrice(positionValue, 'IDR')}</dd></div>
          <div><dt>Risiko rencana</dt><dd>{formatPrice(lots * 100 * riskPerShare, 'IDR')}</dd></div>
          <div><dt>Alokasi modal</dt><dd>{formatPct(allocation)}</dd></div>
          <div><dt>Jarak stop</dt><dd>{formatPct(stopDistance)}</dd></div>
        </dl>
      </div>
    </section>
  );
}

export default function MinerviniPanel({ analysis, currency }) {
  if (!analysis) return null;
  const { status, trendTemplate, vcp, pivot, rs } = analysis;
  const meta = statusMeta[status] ?? statusMeta.WATCHLIST;

  return (
    <section className="stock-data-section stock-minervini" aria-labelledby="minervini-title">
      <div className="stock-section-heading">
        <h2 id="minervini-title">Analisis Minervini</h2>
        <span className={`detail-status ${meta.className}`}>{meta.label}</span>
      </div>
      {rs?.rating != null && (
        <p className="stock-muted">RS Rating <strong>{rs.rating}</strong> · Return 12 bulan {formatPct(rs.return12m)} dibanding {rs.sample} saham</p>
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
