import fields from './data/finvizFilters.json' with { type: 'json' };

export const finvizFields = fields;
export const categories = {
  descriptive: 'Deskriptif', fundamental: 'Fundamental', technical: 'Teknikal', news: 'Berita', etf: 'ETF', all: 'Semua filter',
};
const tabs = { descriptive: 1, fundamental: 2, technical: 3, all: 4, etf: 5, news: 6 };
export const providerEditors = new Set(['modal', 'modal_intraday', 'frange']);

export function finvizUrl(selected, category, tickers, sort, descending, signal) {
  const params = new URLSearchParams({ v: '111', ft: String(tabs[category] ?? 4) });
  const filters = [];
  for (const field of fields) {
    const value = selected[field.key];
    if (value && !providerEditors.has(value) && field.options.some(([code]) => code === value)) {
      filters.push(`${field.key}_${value}`);
    }
  }
  if (filters.length) params.set('f', filters.join(','));
  const symbols = tickers.trim().toUpperCase().split(/[\s,]+/).filter(Boolean);
  if (symbols.length) params.set('t', [...new Set(symbols)].join(','));
  if (sort) params.set('o', (descending ? '-' : '') + sort);
  if (signal) params.set('s', signal);
  return 'https://finviz.com/screener/stocks?' + params;
}

const aboveBelow = [['gt0', 'Harga di atas SMA'], ['lt0', 'Harga di bawah SMA']];
const change = [['gt0', 'Naik'], ['lt0', 'Turun'], ['gt5', '> 5%'], ['lt-5', '< -5%']];
const growth = [['gt0', '> 0%'], ['gt10', '> 10%'], ['gt25', '> 25%'], ['lt0', '< 0%']];
export const localMetrics = [
  ...[20, 50, 200].map(days => ({ key: 'sma' + days, label: 'SMA ' + days, options: aboveBelow })),
  { key: 'rsi', label: 'RSI (14)', options: [['lt30', '< 30'], ['gt50', '> 50'], ['gt70', '> 70']] },
  { key: 'volumeRatio', label: 'Volume relatif (50 sesi)', options: [['gt1', '> 1×'], ['gt1.5', '> 1,5×'], ['gt2', '> 2×'], ['lt1', '< 1×']] },
  ...Object.entries({ changePct: 'Perubahan harian', gap: 'Gap pembukaan', openChange: 'Perubahan dari harga buka',
    weekReturn: 'Kinerja 5 sesi', monthReturn: 'Kinerja 20 sesi' }).map(([key, label]) => ({ key, label, options: change })),
  { key: 'quarterEps', label: 'EPS kuartal terakhir', options: [['gt0', '> 0'], ['lt0', '< 0']] },
  ...Object.entries({ epsGrowth: 'Pertumbuhan EPS kuartalan (YoY)', revenueGrowth: 'Pertumbuhan penjualan kuartalan (YoY)',
    annualEpsGrowth: 'Pertumbuhan EPS tahunan', annualRevenueGrowth: 'Pertumbuhan pendapatan tahunan',
    netMargin: 'Margin laba bersih tahunan' }).map(([key, label]) => ({ key, label, options: growth })),
];

export function filterLocalRows(rows, selected, query) {
  const needle = query.trim().toLowerCase();
  const active = Object.entries(selected).filter(([, rule]) => rule);
  const matches = [];
  let missing = 0;
  for (const row of rows) {
    if (!`${row.symbol} ${row.name ?? ''}`.toLowerCase().includes(needle)) continue;
    let incomplete = false;
    const possible = active.every(([key, rule]) => {
      if (!Number.isFinite(row[key])) {
        incomplete = true;
        return true;
      }
      const threshold = Number(rule.slice(2));
      return rule.startsWith('gt') ? row[key] > threshold : row[key] < threshold;
    });
    if (!possible) continue;
    if (incomplete) missing += 1;
    else matches.push(row);
  }
  return { matches, missing };
}
