import { useEffect, useRef, useState } from 'react';
import { formatPct } from '../format.js';
import { growthCheck, growthCriteria, growthStatus } from '../growthFilters.js';
import { requestScanResult } from '../scanRequest.js';
import { finvizUrl } from '../screenerFilters.js';
import useTranslation from '../useTranslation.js';
import TableScroll from './TableScroll.jsx';
import TickerLink from './TickerLink.jsx';

const statusLabels = { pass: 'Lolos', fail: 'Tidak lolos', missing: 'Data belum cukup' };

export default function GrowthScreen({ markets }) {
  const { t, language } = useTranslation();
  const [criteria, setCriteria] = useState(growthCriteria);
  const [region, setRegion] = useState('us');
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState('pass');
  const [query, setQuery] = useState('');
  const active = useRef(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);

  async function scan() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setError('');
    try {
      const result = await requestScanResult('growth', region, language, controller);
      if (active.current === controller) setSnapshot(result);
    } catch (err) {
      if (active.current === controller) setError(err.message);
    } finally {
      if (active.current === controller) { active.current = null; setLoading(false); }
    }
  }

  function toggle(rule) {
    setCriteria(current => growthCriteria.filter(item => item === rule ? !current.includes(item) : current.includes(item)));
  }

  const rows = (snapshot?.results ?? []).map(row => ({ row, status: growthStatus(row, criteria) }));
  const counts = { pass: 0, fail: 0, missing: 0 };
  for (const { status } of rows) counts[status] += 1;
  const needle = query.trim().toLowerCase();
  const unavailable = criteria.filter(rule => rows.length > 0 && rows.every(({ row }) => growthCheck(row, rule) === 'missing'));
  const visible = rows.filter(({ row, status }) => (view === 'all' || status === view)
    && (row.symbol + ' ' + (row.name ?? '')).toLowerCase().includes(needle));
  const finviz = Object.fromEntries(criteria.map(rule => [rule.finviz, 'o' + rule.threshold]));

  return <>
    <section className="research-panel screen-panel" aria-labelledby="growth-title">
      <div className="screen-heading"><div><h2 id="growth-title">{t('Filter Growth')}</h2>
        <p>{t('Saham lolos jika pertumbuhannya melebihi setiap ambang yang dipilih.')}</p></div></div>
      <div className="growth-rules" role="group" aria-labelledby="growth-title">
        {growthCriteria.map(rule => <label className="growth-rule" key={rule.key}>
          <input type="checkbox" checked={criteria.includes(rule)} onChange={() => toggle(rule)} />
          <span><strong>{t(rule.label)}</strong><small>{t(rule.detail)}</small></span>
          <b>&gt; {rule.threshold}%</b>
        </label>)}
      </div>
      <div className="screen-actions">
        <label className="research-field">{t('Bursa')}<select value={region} disabled={loading} onChange={e => {
          setRegion(e.target.value); setSnapshot(null); setError(''); setView('pass');
        }}>{Object.entries(markets).map(([key, label]) => <option value={key} key={key}>{t(label)}</option>)}</select></label>
        <button className="scan-button" onClick={scan} disabled={loading || !criteria.length}>{t(loading ? 'Memuat data…' : 'Pindai saham')}</button>
        {region === 'us' && criteria.length > 0 && <a className="growth-external" href={finvizUrl(finviz, 'fundamental', '', '', false, '')}
          target="_blank" rel="noopener noreferrer">{t('Bandingkan di Finviz')} ↗</a>}
      </div>
      {error && <p role="alert" className="screen-note">{t(error)}</p>}
      {!criteria.length && <p role="status" className="screen-note">{t('Pilih minimal satu kriteria Growth.')}</p>}
      {loading && <p role="status" className="screen-note">{t('Mengambil laporan keuangan dan estimasi EPS…')}</p>}
    </section>
    {snapshot && criteria.length > 0 && <section className="research-panel screen-panel" aria-labelledby="growth-results">
      <div className="screen-heading"><div><h2 id="growth-results">{t('Hasil screener')}</h2>
        <p role="status">{t(snapshot.universe)} · {t('{0} saham diperiksa', snapshot.scanned)}</p>
      </div></div>
      {unavailable.length > 0 && <p className="screen-note">{t('Belum ada data untuk {0} pada pemindaian ini. Lepas centangnya untuk menyaring dengan kriteria lain.', unavailable.map(rule => t(rule.label)).join(', '))}</p>}
      <div className="screen-actions growth-views">
        <div className="screen-tabs" role="group" aria-label={t('Status hasil')}>
          {Object.entries({ ...statusLabels, all: 'Semua saham' }).map(([key, label]) =>
            <button key={key} aria-pressed={view === key} onClick={() => setView(key)}>
              {t(label)} <span>{key === 'all' ? rows.length : counts[key]}</span>
            </button>)}
        </div>
        <label className="research-field">{t('Cari kode atau nama')}<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
      </div>
      {visible.length > 0 ? <TableScroll label={t('Hasil screener')} className="stock-table-scroll">
        <table className="fund-table growth-table"><thead><tr><th>{t('Saham')}</th>
          {criteria.map(rule => <th className="num" key={rule.key}>{t(rule.label)}<small>&gt; {rule.threshold}%</small></th>)}
          <th>{t('Status')}</th></tr></thead><tbody>
          {visible.map(({ row, status }) => <tr key={row.symbol}><td><TickerLink symbol={row.symbol} /><span className="research-cell-note">{row.name}</span></td>
            {criteria.map(rule => {
              const check = growthCheck(row, rule);
              let label = t('Tidak tersedia');
              if (Number.isFinite(row[rule.key])) label = formatPct(row[rule.key]);
              else if (check !== 'missing') label = (check === 'pass' ? '> ' : '≤ ') + rule.threshold + '%';
              return <td key={rule.key} className="num" data-check={check}>{label}</td>;
            })}
            <td>{t(statusLabels[status])}</td></tr>)}
        </tbody></table>
      </TableScroll> : <p className="screen-note" role="status">{t(needle ? 'Tidak ada saham yang sesuai dengan pencarian.' :
        view === 'pass' ? 'Belum ada saham yang terkonfirmasi lolos semua kriteria aktif.' : 'Tidak ada saham dalam kelompok ini.')}</p>}
    </section>}
  </>;
}
