import { useEffect, useRef, useState } from 'react';
import TickerLink from '../components/TickerLink.jsx';
import TableScroll from '../components/TableScroll.jsx';
import { formatDateCompact, formatPct, formatPrice } from '../format.js';
import { localizedNumberFormat } from '../i18n.js';
import { requestScanResult } from '../scanRequest.js';
import { categories, filterLocalRows, finvizFields, finvizUrl, localMetrics, providerEditors } from '../screenerFilters.js';
import useTranslation from '../useTranslation.js';
import '../styles/research.css';
import '../styles/screener.css';

const blankScreen = { selected: {}, tickers: '', sort: '', descending: false, signal: '' };
const markets = { us: 'AS', id: 'Indonesia', jp: 'Jepang', hk: 'Hong Kong', ks: 'KOSPI', kq: 'KOSDAQ', ss: 'Shanghai', sz: 'Shenzhen', auto: 'Semua bursa' };
const numberFormat = localizedNumberFormat({ maximumFractionDigits: 2 });

function metricValue(row, key, t) {
  if (key === 'quarterEps') return t(row[key] > 0 ? 'Positif' : 'Negatif');
  if (key === 'rsi') return numberFormat.format(row[key]);
  if (key === 'volumeRatio') return numberFormat.format(row[key]) + '×';
  return formatPct(row[key]);
}

function Presets({ screen, apply, userId }) {
  const { t } = useTranslation();
  const key = 'seticker:screener-presets:' + userId;
  const [items, setItems] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(saved) ? saved.filter(p => typeof p?.name === 'string' && p.screen?.selected && typeof p.screen.tickers === 'string') : [];
    } catch { return []; }
  });
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  function update(next, message) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setItems(next);
      setStatus(message);
    } catch { setStatus('Gagal menyimpan preset di perangkat ini.'); }
  }
  return <details className="screen-presets">
    <summary>{t('Preset saya')}</summary>
    <form onSubmit={event => {
      event.preventDefault();
      const label = name.trim();
      if (label) update([...items.filter(item => item.name !== label), { name: label, screen }], 'Preset tersimpan di perangkat ini.');
    }}>
      <label className="research-field">{t('Nama preset')}<input value={name} required maxLength={70} onChange={e => setName(e.target.value)} /></label>
      <button className="watch-toggle">{t('Simpan preset')}</button>
    </form>
    {items.map(item => <div className="screen-preset-row" key={item.name}>
      <button className="text-button" onClick={() => { apply({ ...blankScreen, ...item.screen }); setName(item.name); setStatus('Preset diterapkan.'); }}>{item.name}</button>
      <button className="text-button" aria-label={t('Hapus preset {0}', item.name)} onClick={() => update(items.filter(p => p.name !== item.name), 'Preset dihapus.')}>{t('Hapus')}</button>
    </div>)}
    <span role="status">{t(status)}</span>
  </details>;
}

function FinvizPanel({ userId }) {
  const { t, language } = useTranslation();
  const [screen, setScreen] = useState(blankScreen);
  const [category, setCategory] = useState('technical');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(true);
  const { selected, tickers, sort, descending, signal } = screen;
  const active = finvizFields.filter(f => selected[f.key]);
  const fieldTitle = f => language === 'en' ? f.en : f.id;
  const group = finvizFields.filter(f => category === 'all' || f.category === category);
  const visible = group.filter(f => (f.id + ' ' + f.en).toLowerCase().includes(query.trim().toLowerCase()));
  const editor = active.find(f => providerEditors.has(selected[f.key]));
  const url = (tab = category) => finvizUrl(selected, tab, tickers, sort, descending, signal);
  function select(key, value) {
    setScreen(s => ({ ...s, selected: { ...s.selected, [key]: value } }));
  }
  const set = (key, value) => setScreen(s => ({ ...s, [key]: value }));

  return <section className="research-panel screen-panel" aria-label={t('Filter Finviz')}>
    <div className="screen-heading"><div><h2>{t('Filter Finviz')}</h2>
      <p>{t('Susun filter saham AS di sini. Hasil dibuka di Finviz. Pilihan dropdown mengikuti istilah Finviz.')}</p></div>
      <Presets screen={screen} apply={setScreen} userId={userId} />
    </div>
    <div className="screen-toolbar">
      <label className="research-field">{t('Simbol saham')}<input value={tickers} placeholder="AAPL, MSFT" onChange={e => set('tickers', e.target.value)} /></label>
      <label className="research-field">{t('Urutkan menurut')}<select value={sort} onChange={e => set('sort', e.target.value)}>
        {Object.entries({ '': 'Default', ticker: 'Ticker', price: 'Harga', change: 'Perubahan', marketcap: 'Kapitalisasi pasar', volume: 'Volume', pe: 'P/E' }).map(([v, l]) => <option value={v} key={v}>{t(l)}</option>)}
      </select></label>
      <label className="research-field">{t('Urutan')}<select disabled={!sort} value={descending ? 'desc' : 'asc'} onChange={e => set('descending', e.target.value === 'desc')}>
        <option value="asc">{t('Menaik')}</option><option value="desc">{t('Menurun')}</option></select></label>
      <label className="research-field">{t('Sinyal')}<select value={signal} onChange={e => set('signal', e.target.value)}>
        {Object.entries({ '': 'Semua saham', ta_topgainers: 'Top Gainers', ta_toplosers: 'Top Losers', ta_newhigh: 'New High', ta_newlow: 'New Low', ta_unusualvolume: 'Unusual Volume' }).map(([v, l]) => <option value={v} key={v}>{t(l)}</option>)}
      </select></label>
    </div>
    <div className="screen-actions">
      <a className="scan-button" href={url(editor?.category)} target="_blank" rel="noopener noreferrer">{t(editor ? 'Lanjutkan pengaturan di Finviz' : 'Lihat hasil di Finviz')} ↗</a>
      <button className="text-button" onClick={() => { setScreen(blankScreen); setQuery(''); }}>{t('Reset filter')}</button>
      <button className="text-button" aria-expanded={expanded} aria-controls="finviz-fields" onClick={() => setExpanded(!expanded)}>{t(expanded ? 'Tutup filter' : 'Tampilkan filter')}</button>
    </div>
    {active.length > 0 && <div className="screen-chips" aria-label={t('Filter aktif')}>
      {active.map(f => {
        const label = f.options.find(([v]) => v === selected[f.key])?.[1];
        return <button key={f.key} className="screen-chip" aria-label={t('Hapus filter {0}', fieldTitle(f))} onClick={() => select(f.key, '')}>{fieldTitle(f)} · {label} ×</button>;
      })}
    </div>}
    <div id="finviz-fields" hidden={!expanded}>
      <div className="screen-tabs" role="group" aria-label={t('Kategori filter')}>
        {Object.entries(categories).map(([key, name]) => {
          const count = active.filter(f => key === 'all' || f.category === key).length;
          return <button key={key} aria-pressed={category === key} onClick={() => { setCategory(key); setQuery(''); }}>{t(name)}{count > 0 && <span> {count}</span>}</button>;
        })}
      </div>
      <label className="research-field screen-search">{t('Cari filter dalam kategori')}<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <div className="screen-fields">{visible.map(field => <div key={field.key} className="research-field">
        {field.editor ? <>
          <span>{fieldTitle(field)} · Elite</span>
          <a className="screen-editor" href={url(field.category)} target="_blank" rel="noopener noreferrer">{t('Atur di Finviz Elite')} ↗</a>
        </> : <><label htmlFor={'finviz-' + field.key}>{fieldTitle(field)}{field.elite && ' · Elite'}</label>
          <select id={'finviz-' + field.key} value={selected[field.key] || ''} onChange={e => select(field.key, e.target.value)}>
            <option value="">{t('Tanpa batasan')}</option>
            {field.options.map(([value, label, elite]) => <option value={value} key={value}>{label}{elite ? ' · Elite' : ''}</option>)}
          </select></>}
      </div>)}</div>
      {!visible.length && <p role="status">{t('Tidak ada filter dengan nama itu.')}</p>}
      {group.some(f => f.elite || f.options.some(o => o[2])) && <p className="screen-note">{t('Pilihan Elite memerlukan akses Finviz Elite. Rentang kustom dan input khusus diselesaikan di Finviz.')}</p>}
    </div>
  </section>;
}

function LocalPanel() {
  const { t, language } = useTranslation();
  const [region, setRegion] = useState('us');
  const [selected, setSelected] = useState({});
  const [query, setQuery] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  async function run() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setError('');
    try {
      const data = await requestScanResult('screener', region, language, controller);
      if (active.current === controller) setSnapshot(data);
    } catch (err) {
      if (active.current === controller) setError(err.message);
    } finally {
      if (active.current === controller) { active.current = null; setLoading(false); }
    }
  }
  const { matches, missing } = filterLocalRows(snapshot?.results ?? [], selected, query);
  const columns = localMetrics.filter(metric => selected[metric.key] && metric.key !== 'changePct');
  return <section className="research-panel screen-panel" aria-label={t('Filter data SETicker')}>
    <div className="screen-heading"><div><h2>{t('Filter data SETicker')}</h2><p>{t('Muat daftar saham bursa pilihan, lalu gabungkan kriteria dari sesi tutup dan laporan keuangan yang tersedia.')}</p></div></div>
    <div className="screen-actions">
      <label className="research-field">{t('Bursa')}<select value={region} disabled={loading} onChange={e => setRegion(e.target.value)}>
        {Object.entries(markets).map(([key, label]) => <option value={key} key={key}>{t(label)}</option>)}</select></label>
      <button className="scan-button" disabled={loading} onClick={run}>{t(loading ? 'Memuat data…' : 'Muat saham')}</button>
      <button className="text-button" onClick={() => { setSelected({}); setQuery(''); }}>{t('Reset filter')}</button>
    </div>
    {error && <p role="alert">{t(error)}</p>}
    <div className="screen-fields">
      <label className="research-field">{t('Cari kode atau nama')}<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
      {localMetrics.map(m => <div key={m.key} className="research-field"><label htmlFor={'local-' + m.key}>{t(m.label)}</label>
        <select id={'local-' + m.key} value={selected[m.key] || ''} onChange={e => setSelected({ ...selected, [m.key]: e.target.value })}>
          <option value="">{t('Tanpa batasan')}</option>
          {m.options.map(([v, label]) => <option value={v} key={v}>{t(label)}</option>)}
        </select></div>)}
    </div>
    {snapshot && <>
      <p className="screen-summary" role="status"><strong>{t('{0} saham cocok', matches.length)}</strong> · {t(snapshot.universe)} · {t('Harga tersedia untuk {0} dari {1} saham.', snapshot.results.length, snapshot.scanned)}</p>
      {missing > 0 && <p className="screen-note">{t('{0} saham kekurangan data untuk kriteria aktif.', missing)}</p>}
      {matches.length ? <TableScroll label={t('Hasil screener')} className="stock-table-scroll"><table className="fund-table">
        <thead><tr><th>{t('Saham')}</th><th className="num">{t('Harga tutup')}</th><th className="num">{t('Perubahan')}</th>
          {columns.map(m => <th className="num" key={m.key}>{m.key.startsWith('sma') ? t('Jarak dari {0}', m.label) : t(m.label)}</th>)}
          <th>{t('Sesi')}</th></tr></thead>
        <tbody>{matches.map(row => <tr key={row.symbol}><td><TickerLink symbol={row.symbol} /><span className="research-cell-note">{row.name}</span></td>
          <td className="num">{row.currency ? formatPrice(row.close, row.currency) : t('Tidak tersedia')}</td>
          <td className="num">{formatPct(row.changePct)}</td>
          {columns.map(m => <td key={m.key} className="num">{metricValue(row, m.key, t)}</td>)}
          <td><time dateTime={row.date}>{formatDateCompact(row.date)}</time></td>
        </tr>)}</tbody>
      </table></TableScroll> : <p>{t('Tidak ada saham yang memenuhi kombinasi filter ini.')}</p>}
    </>}
  </section>;
}

export default function ScreenerPage({ userId }) {
  const { t } = useTranslation();
  const [source, setSource] = useState('finviz');
  return <div className="research-workspace screener-page">
    <header className="page-heading section-accent"><h1>Screener</h1></header>
    <div className="screen-tabs screen-source" role="group" aria-label={t('Sumber screener')}>
      <button aria-pressed={source === 'finviz'} onClick={() => setSource('finviz')}>{t('Katalog Finviz')}</button>
      <button aria-pressed={source === 'local'} onClick={() => setSource('local')}>{t('Data SETicker')}</button>
    </div>
    <div hidden={source !== 'finviz'}><FinvizPanel userId={userId} /></div>
    <div hidden={source !== 'local'}><LocalPanel /></div>
  </div>;
}
