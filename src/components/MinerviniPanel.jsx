import { useState } from 'react';
import { formatPct, formatPrice } from '../format.js';

const statusMeta = {
  NOT_ELIGIBLE: { label: 'Tidak eligible', className: 'status--wait' },
  WATCHLIST: { label: 'Watchlist', className: 'status--wait' },
  VCP_FORMING: { label: 'VCP terbentuk', className: 'status--near' },
  PIVOT_READY: { label: 'Siap pivot', className: 'status--near' },
  BREAKOUT_TRIGGERED: { label: 'Breakout terpicu', className: 'status--breakout' },
  BREAKOUT_LOW_VOLUME: { label: 'Breakout volume rendah', className: 'status--near' },
};

function TrendRules({ trendTemplate }) {
  const { passed, total, eligible, rules } = trendTemplate;
  return (
    <div className="trend-template">
      <div className="trend-head">
        <strong>Stage 2 Trend Filter</strong>
        <span className={`trend-score ${eligible ? 'trend-score--pass' : 'trend-score--fail'}`}>
          {passed}/{total} Passed
        </span>
      </div>
      <ul className="trend-rules">
        {rules.map((rule) => (
          <li key={rule.key} className={rule.passed ? 'rule-pass' : 'rule-fail'}>
            <span className="rule-mark" aria-hidden="true">{rule.passed ? '✓' : '×'}</span>
            {rule.label}
          </li>
        ))}
      </ul>
      <p className="trend-verdict">
        {eligible ? 'Eligible for Breakout Scan' : 'Belum memenuhi seluruh kriteria Stage 2.'}
      </p>
    </div>
  );
}

function VcpBlock({ vcp, currency }) {
  if (!vcp) return null;
  const depths = vcp.depths ?? [];
  return (
    <div className="vcp-block">
      <div className="trend-head">
        <strong>VCP (Volatility Contraction)</strong>
        <span className={`trend-score ${vcp.forming ? 'trend-score--pass' : 'trend-score--fail'}`}>
          {vcp.forming ? 'Forming' : 'Tidak'}
        </span>
      </div>
      {depths.length > 0 && (
        <div className="vcp-depths">
          {depths.map((depth, i) => (
            <div key={i} className="vcp-depth">
              <span className="vcp-t">T{i + 1}</span>
              <span className="vcp-val">{depth}%</span>
              {vcp.ratios?.[i] != null && <span className="vcp-ratio">{vcp.ratios[i]}×</span>}
            </div>
          ))}
        </div>
      )}
      <p className="vcp-note">
        {vcp.contractionCount} kontraksi
        {vcp.vdu != null && ` · VDU ${vcp.vdu} ${vcp.vduStrong ? '(kuat)' : vcp.vduOk ? '(cukup)' : '(lemah)'}`}
      </p>
    </div>
  );
}

function PivotBlock({ pivot, currency }) {
  if (!pivot) return null;
  return (
    <div className="pivot-block">
      <div className="trend-head">
        <strong>Pivot & Breakout</strong>
        <span className={`trend-score ${pivot.breakout ? 'trend-score--pass' : 'trend-score--fail'}`}>
          {pivot.breakout ? 'Breakout' : 'Belum'}
        </span>
      </div>
      <dl className="pivot-stats">
        <div><dt>Pivot</dt><dd>{formatPrice(pivot.pivot, currency)}</dd></div>
        <div><dt>Extension</dt><dd className={pivot.chaseOk ? 'trend--up' : 'trend--down'}>{pivot.extension == null ? '—' : formatPct(pivot.extension)}</dd></div>
        <div><dt>RVOL</dt><dd className={pivot.rvolOk ? 'trend--up' : ''}>{pivot.rvol == null ? '—' : `${pivot.rvol}×`}</dd></div>
      </dl>
    </div>
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
      <div className="risk-calc">
        <strong>Kalkulator risiko</strong>
        <p className="risk-note">Level entry & stop belum tersedia untuk dihitung.</p>
      </div>
    );
  }

  return (
    <div className="risk-calc">
      <strong>Kalkulator risiko</strong>
      <div className="risk-inputs">
        <label>
          Modal (Rp)
          <input type="text" inputMode="numeric" value={equityInput} onChange={(e) => setEquityInput(e.target.value)} />
        </label>
        <label>
          Risiko per trade (%)
          <input type="text" inputMode="decimal" value={riskPctInput} onChange={(e) => setRiskPctInput(e.target.value)} />
        </label>
      </div>
      <dl className="risk-results">
        <div><dt>Maks. pembelian</dt><dd><strong>{lots.toLocaleString('id-ID')} lot</strong></dd></div>
        <div><dt>Nilai posisi</dt><dd>{formatPrice(positionValue, 'IDR')}</dd></div>
        <div><dt>Risiko rencana</dt><dd>{formatPrice(lots * 100 * riskPerShare, 'IDR')}</dd></div>
        <div><dt>Alokasi modal</dt><dd>{formatPct(allocation)}</dd></div>
        <div><dt>Jarak stop</dt><dd>{formatPct(stopDistance)}</dd></div>
      </dl>
      <p className="risk-note">Simulasi long-only, 1 lot = 100 saham. Belum termasuk fee & slippage.</p>
    </div>
  );
}

export default function MinerviniPanel({ analysis, currency }) {
  if (!analysis) return null;
  const { status, trendTemplate, vcp, pivot, rs } = analysis;
  const meta = statusMeta[status] ?? statusMeta.WATCHLIST;

  return (
    <section className="minervini-panel" aria-labelledby="minervini-title">
      <div className="minervini-head">
        <h3 id="minervini-title">Analisis Minervini</h3>
        <span className={`detail-status ${meta.className}`}>{meta.label}</span>
      </div>
      {rs?.rating != null && (
        <p className="minervini-rs">RS Rating: <strong>{rs.rating}</strong> (return 12 bln {formatPct(rs.return12m)} vs {rs.sample} saham)</p>
      )}
      <div className="minervini-grid">
        {trendTemplate && <TrendRules trendTemplate={trendTemplate} />}
        <VcpBlock vcp={vcp} currency={currency} />
        <PivotBlock pivot={pivot} currency={currency} />
        <RiskCalculator entry={analysis.close} stop={analysis.stop ?? pivot?.pivot} currency={currency} />
      </div>
    </section>
  );
}
